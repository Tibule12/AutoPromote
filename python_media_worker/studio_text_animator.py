"""Native title choreography consumed by the existing image-layer compositor.

Layout advances are generated from the exact browser/worker Inter files. Each
Latin glyph is placed explicitly, with no platform-dependent shaping/kerning.
Progress is an ordinary programme-clock property, not a second animation clock.
"""
import json
import math
import re
from pathlib import Path


GLYPHS = json.loads((Path(__file__).parent / 'assets/studio-title-glyphs.v1.json').read_text())
METRICS = json.loads((Path(__file__).parent / 'assets/studio-text-metrics.v1.json').read_text())
BOUNDS = {'stagger': (0, 95), 'fromX': (-4, 4), 'fromY': (-4, 4), 'fromScale': (0, 2.5),
          'fromRotation': (-360, 360), 'fromOpacity': (0, 1), 'tracking': (-1, 1),
          'rangeStart': (0, 100), 'rangeEnd': (0, 100)}


def validate_text_animator(spec):
    if (not isinstance(spec, dict) or set(spec) - (set(BOUNDS) | {'version', 'unit', 'order', 'easing'})
            or type(spec.get('version')) is not int or spec['version'] != 1
            or spec.get('unit') not in ('character', 'word')
            or spec.get('order') not in ('forward', 'reverse', 'center_out', 'edges_in')
            or spec.get('easing') not in ('linear', 'ease_out', 'ease_in_out', 'back_out')):
        raise ValueError('Invalid text animator settings')
    for field, (low, high) in BOUNDS.items():
        value = spec.get(field)
        if type(value) not in (int, float) or not math.isfinite(value) or not low <= value <= high:
            raise ValueError(f'Text animator {field} must be between {low} and {high}')
    return spec


def validate_text_animation_layer(layer):
    spec = layer.get('text_animator')
    keys = [k for k in layer.get('motion_keyframes', []) if k.get('property') == 'textProgress']
    base = layer.get('base_transform') or {}
    if spec is None:
        if 'text_progress' in base or keys:
            raise ValueError('Text progress needs an enabled text animator')
        return
    if layer.get('type') != 'text':
        raise ValueError('Text animators need an ordinary title')
    validate_text_animator(spec)
    for value in ([base['text_progress']] if 'text_progress' in base else []) + [k.get('value') for k in keys]:
        if type(value) not in (int, float) or not math.isfinite(value) or not 0 <= value <= 100:
            raise ValueError('Text progress must be between zero and 100')


def text_layout(overlay, programme_width, spec):
    weight = str(overlay.get('fontWeight') or 900)
    font, text = METRICS['weights'].get(weight), str(overlay.get('text') or '')
    if (overlay.get('fontFamily') or 'Inter') != 'Inter' or not font:
        raise ValueError('Text animation uses the bundled Inter weights')
    if len(text) > 180 or any(c != '\n' and c not in font['advances'] for c in text):
        raise ValueError('Text animation supports up to 180 Latin letters, numbers and punctuation')
    length = lambda value: sum(font['advances'][c] for c in value)
    maximum = programme_width * max(15, min(90, float(overlay.get('width') or 90))) / 100 - 32
    lines = []
    for paragraph in text.split('\n'):
        line = ''
        for word in paragraph.split(' '):
            candidate = line + (' ' if line else '') + word
            if line and length(candidate) > maximum:
                lines.append(line)
                line = word
            else:
                line = candidate
        lines.append(line)
    if any(length(line) > maximum for line in lines):
        raise ValueError("Widen the title box or add a line break inside the long word")
    if len(lines) > 12:
        raise ValueError('Text animation supports up to twelve wrapped lines; widen or split this title')
    width = min(maximum + 32, max(1, *map(length, lines)) + 32)
    units = []
    for row, line in enumerate(lines):
        align, line_width = overlay.get('textAlign') or 'center', length(line)
        x = 0 if align == 'left' else width - 32 - line_width if align == 'right' else (width - 32 - line_width) / 2
        baseline = row * 50.4 + (50.4 - font['ascent'] - font['descent']) / 2 + font['ascent']
        for token in re.findall(r'\S+|\s+', line):
            token_start, glyphs = x, []
            for char in token:
                if char.strip():
                    glyphs.append({'char': char, 'x': x, 'baseline': baseline, 'width': font['advances'][char], 'row': row})
                x += font['advances'][char]
            if spec['unit'] == 'word' and glyphs:
                units.append({'glyphs': glyphs, 'x': token_start, 'y': row * 50.4, 'width': x - token_start, 'lineCenter': (width - 32) / 2})
            else:
                units.extend({'glyphs': [g], 'x': g['x'], 'y': row * 50.4, 'width': g['width'], 'lineCenter': (width - 32) / 2} for g in glyphs)
    return {'width': width, 'height': len(lines) * 50.4 + 16, 'units': units, 'lines': lines}


def text_poses(spec, progress, layout):
    selected = [i for i in range(len(layout['units'])) if spec['rangeStart'] <= (i + .5) * 100 / len(layout['units']) < spec['rangeEnd']]
    center = (len(selected) - 1) / 2
    order = spec['order']
    ordered = sorted(selected, key=lambda i: (-i if order == 'reverse' else
                     abs(selected.index(i) - center) if order == 'center_out' else
                     -abs(selected.index(i) - center) if order == 'edges_in' else i, i))
    ranks = {i: rank for rank, i in enumerate(ordered)}
    stagger = spec['stagger'] if len(selected) > 1 else 0
    result = []
    for i, unit in enumerate(layout['units']):
        rank = ranks.get(i)
        t = 1 if rank is None else max(0, min(1, (max(0, min(100, progress)) -
                     (rank / (len(selected) - 1) if len(selected) > 1 else 0) * stagger) / (100 - stagger)))
        opacity = spec['fromOpacity'] + (1 - spec['fromOpacity']) * t
        if spec['easing'] == 'ease_out':
            t = 1 - (1 - t) ** 3
        if spec['easing'] == 'ease_in_out':
            t = t * t * (3 - 2 * t)
        if spec['easing'] == 'back_out' and 0 < t < 1:
            t = 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2
        remaining = 1 - t
        result.append({'x': spec['fromX'] * 36 * remaining + (unit['x'] + unit['width'] / 2 - unit['lineCenter']) * spec['tracking'] * remaining,
                       'y': spec['fromY'] * 36 * remaining, 'scale': max(0, spec['fromScale'] + (1 - spec['fromScale']) * t),
                       'rotation': spec['fromRotation'] * remaining, 'opacity': max(0, min(1, opacity))})
    return result


class AnimatedTitle:
    def __init__(self, overlay, width, height, spec):
        try:
            from .studio_text import color, WEIGHTS
        except ImportError:
            from studio_text import color, WEIGHTS
        self.overlay, self.spec, self.color = overlay, validate_text_animator(spec), color
        self.layout = text_layout(overlay, width * 720 / height, spec)
        layout = self.layout
        # Reserve travel outside the title's layout box. It is transparent
        # padding, excluded from the native mask and anchor geometry.
        self.margin = math.ceil(56 + 36 * max(abs(spec['fromX']), abs(spec['fromY'])) +
                                max(layout['width'], layout['height']) * abs(spec['tracking']) / 2 +
                                max((math.hypot(u['width'], 50.4) for u in layout['units']), default=36) * (max(1, spec['fromScale']) + .2) / 2)
        self.logical = (math.ceil(layout['width']) + 2 * self.margin, math.ceil(layout['height']) + 2 * self.margin)
        self.density = min(3, 8192 / max(self.logical))
        self.size = tuple(math.ceil(v * self.density) for v in self.logical)
        self.font = GLYPHS['weights'][str(overlay.get('fontWeight') or 900)]
        m, (lw, lh) = self.margin, self.logical
        output_width, output_height = round(lw * height / 720), round(lh * height / 720)
        self.geometry = {'width': output_width / width * 100, 'height': output_height / height * 100, 'mediaFit': 'stretch',
                         'anchorX': (m + layout['width'] * float(overlay.get('anchorX', 50)) / 100) / lw * 100,
                         'anchorY': (m + layout['height'] * float(overlay.get('anchorY', 50)) / 100) / lh * 100,
                         'clipBox': {'x': m / lw, 'y': m / lh, 'width': layout['width'] / lw, 'height': layout['height'] / lh}, 'lines': layout['lines']}


    @staticmethod
    def can_project(layer, pose):
        effects = (layer or {}).get('effects') or {}
        node = effects.get('node') or {}
        optical = node.get('optical') or {}
        warp = node.get('warp') or {}
        node_pixels = ((node.get('key') or {}).get('enabled')
                       or optical.get('halation') or optical.get('streak')
                       or (warp.get('enabled') and (warp.get('x') or warp.get('y')))
                       or node.get('defocus') or node.get('depth'))
        return not ((layer or {}).get('perspective') or pose.get('mask_path') or pose.get('crop_x') or pose.get('crop_y')
                    or (effects.get('mask') or {}).get('enabled')
                    or (effects.get('shadow') or {}).get('enabled')
                    or (effects.get('glow') or {}).get('enabled')
                    or float(effects.get('blur') or 0) > 0
                    or (effects.get('colorize') or {}).get('enabled')
                    or node_pixels)

    def _paint(self, progress):
        # Paths, explicit advances and per-unit poses are the same browser
        # primitive. No platform font hinting, kerning or glyph bitmap rotation.
        def paint(value, default='transparent'):
            r, g, b, a = self.color(value, default)
            return f'rgba({r},{g},{b},{a / 255})'
        m, layout = self.margin, self.layout
        fill = paint(self.overlay.get('color'), 'white')
        stroke = paint(self.overlay.get('strokeColor'), 'rgba(0,0,0,0.92)')
        glyph_scale = 36 / self.font['unitsPerEm']
        stroke_width = max(0, float(self.overlay.get('strokeWidth') or 0)) / glyph_scale
        shadow = self.overlay.get('shadow') or 'soft'
        definitions = ''
        shadow_ref = ''
        if shadow != 'none':
            shades = [(4, 7, .95), (1, 1, 1)] if shadow == 'strong' else [(3, 5, .72)]
            filters, merge = [], []
            for i, (dy, blur, opacity) in enumerate(shades):
                filters.append(f'<feGaussianBlur in="SourceAlpha" stdDeviation="{blur}" result="blur{i}"/>'
                               f'<feOffset in="blur{i}" dy="{dy}" result="offset{i}"/>'
                               f'<feFlood flood-color="black" flood-opacity="{opacity}" result="ink{i}"/>'
                               f'<feComposite in="ink{i}" in2="offset{i}" operator="in" result="shade{i}"/>')
                merge.append(f'<feMergeNode in="shade{i}"/>')
            definitions = ('<defs><filter id="title-shadow" x="-100%" y="-200%" width="300%" height="500%" '
                           'color-interpolation-filters="sRGB">' + ''.join(filters) + '<feMerge>' +
                           ''.join(merge) + '<feMergeNode in="SourceGraphic"/></feMerge></filter></defs>')
            shadow_ref = ' filter="url(#title-shadow)"'
        parts = [definitions,
                 f'<rect x="{m}" y="{m}" width="{layout["width"]}" height="{layout["height"]}" rx="10" fill="{paint(self.overlay.get("bg"))}"/>',
                 f'<g transform="translate({m + 16} {m + 8})">']
        for unit, pose in zip(layout['units'], text_poses(self.spec, progress, layout)):
            if pose['opacity'] <= 0 or pose['scale'] <= 0:
                continue
            cx, cy = unit['x'] + unit['width'] / 2, unit['y'] + 25.2
            parts.append(f'<g opacity="{pose["opacity"]}" transform="translate({cx + pose["x"]} {cy + pose["y"]}) '
                         f'rotate({pose["rotation"]}) scale({pose["scale"]}) translate({-cx} {-cy})"><g{shadow_ref}>')
            for glyph in unit['glyphs']:
                path = self.font['glyphs'][glyph['char']]['path']
                parts.append(f'<path d="{path}" transform="translate({glyph["x"]} {glyph["baseline"]}) '
                             f'scale({glyph_scale} {-glyph_scale})" fill="{fill}" stroke="{stroke}" '
                             f'stroke-width="{stroke_width}" paint-order="stroke fill"/>')
            parts.append('</g></g>')
        parts.append('</g>')
        return ''.join(parts)

    def _raster(self, body, size):
        try:
            from .studio_image_sources import rasterize_studio_svg
        except ImportError:
            from studio_image_sources import rasterize_studio_svg
        width, height = size
        return rasterize_studio_svg(f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
                                   f'viewBox="0 0 {width} {height}">{body}</svg>')

    def frame(self, progress):
        body = f'<g transform="scale({self.density})">{self._paint(progress)}</g>'
        return self._raster(body, self.size)

    def project(self, progress, layer, pose, size, sample_opacity=1):
        width, height = size
        anchor_x = self.logical[0] * float(layer.get('anchor_x', 50)) / 100
        anchor_y = self.logical[1] * float(layer.get('anchor_y', 50)) / 100
        opacity = max(0, min(1, pose['opacity'] * sample_opacity))
        scale = pose['scale'] * height / 720
        body = (f'<g opacity="{opacity}" transform="translate({width * pose["x"] / 100} {height * pose["y"] / 100}) '
                f'rotate({pose["rotation"]}) scale({scale}) translate({-anchor_x} {-anchor_y})">'
                f'{self._paint(progress)}</g>')
        return self._raster(body, size)
