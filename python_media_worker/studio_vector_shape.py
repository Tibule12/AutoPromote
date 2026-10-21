"""Bounded editable cubic artwork raster, consumed by the existing image compositor."""
import math
import re

import numpy as np
from PIL import Image, ImageDraw, ImageChops


def vector_contours(shape):
    return shape['contours'] if shape['version'] == 2 else [dict(closed=shape['closed'], nodes=shape['nodes'])]


def validate_vector_shape(shape):
    def only(value, fields):
        if not isinstance(value, dict) or set(value)-set(fields):
            raise ValueError('Unknown vector artwork field')
    def number(v, lo, hi):
        if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or not lo <= v <= hi:
            raise ValueError('Invalid vector coordinate')
    def pair(p, lo, hi):
        if not isinstance(p, list) or len(p) != 2:
            raise ValueError('Vector handles require two coordinates')
        for v in p:
            number(v, lo, hi)
    def color(c):
        if not isinstance(c, str) or not re.fullmatch(r'#[a-fA-F0-9]{6}', c):
            raise ValueError('Invalid vector color')
    only(shape, ['version', 'contours', 'fill', 'stroke'] if shape.get('version') == 2 else ['version', 'closed', 'nodes', 'fill', 'stroke'])
    if type(shape.get('version')) is not int or shape['version'] not in (1, 2):
        raise ValueError('Choose vector artwork version 1 or 2')
    contours = shape.get('contours') if shape['version'] == 2 else [dict(closed=shape.get('closed'), nodes=shape.get('nodes'))]
    if not isinstance(contours, list) or not 1 <= len(contours) <= 8:
        raise ValueError('Compound artwork needs one to eight contours')
    total = 0
    for contour in contours:
        only(contour, ['closed', 'nodes'])
        ns = contour.get('nodes')
        if type(contour.get('closed')) is not bool or not isinstance(ns, list) or not (3 if contour['closed'] else 2) <= len(ns) <= 64:
            raise ValueError('Provide a valid vector contour and its points')
        total += len(ns)
        for n in ns:
            only(n, ['x', 'y', 'in', 'out'])
            number(n.get('x'), 0, 100); number(n.get('y'), 0, 100)
            pair(n.get('in'), -200, 200); pair(n.get('out'), -200, 200)
    if total > 256:
        raise ValueError('Compound artwork supports at most 256 points')
    f, s = shape.get('fill'), shape.get('stroke')
    only(f, ['kind', 'color', 'endColor', 'start', 'end'])
    if f.get('kind') not in ('none', 'solid', 'linear'):
        raise ValueError('Invalid vector fill')
    color(f.get('color')); color(f.get('endColor')); pair(f.get('start'), 0, 100); pair(f.get('end'), 0, 100)
    if f['kind'] == 'linear' and f['start'] == f['end']:
        raise ValueError('Gradient endpoints must differ')
    only(s, ['color', 'width']); color(s.get('color')); number(s.get('width'), 0, 20)
    if f['kind'] == 'none' and s['width'] == 0:
        raise ValueError('An unfilled path needs a visible stroke')
    return shape


def vector_points(shape, samples=128):
    validate_vector_shape(shape)
    if shape['version'] != 1:
        raise ValueError('Measure each compound contour independently')
    ns, points = shape['nodes'], []
    for i in range(len(ns) if shape['closed'] else len(ns)-1):
        a, b = ns[i], ns[(i+1) % len(ns)]
        for j in range(samples):
            t, v = j/samples, 1-j/samples
            points.append(tuple(v**3*a[axis]+3*v*v*t*(a[axis]+a['out'][k])
                +3*v*t*t*(b[axis]+b['in'][k])+t**3*b[axis] for k, axis in enumerate(('x', 'y'))))
    points.append(points[0] if shape['closed'] else (ns[-1]['x'], ns[-1]['y']))
    return points


def trim_vector_points(points, start=0, end=100):
    for value in (start, end):
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 <= value <= 100:
            raise ValueError('Stroke trim must be between 0 and 100')
    if start >= end:
        return []
    lengths = [0] + [math.hypot(b[0]-a[0], b[1]-a[1]) for a, b in zip(points, points[1:])]
    total = sum(lengths)
    if not total:
        return []
    lo, hi, at, result = total*start/100, total*end/100, 0, []
    for i in range(1, len(points)):
        length, next_at = lengths[i], at+lengths[i]
        if length and next_at > lo and at < hi:
            def between(distance):
                return tuple(v+(points[i][k]-v)*(distance-at)/length for k, v in enumerate(points[i-1]))
            if not result:
                result.append(between(max(lo, at)))
            result.append(between(min(hi, next_at)))
        at = next_at
    return result


def validate_vector_trim(layer):
    base, keys = layer.get('base_transform') or {}, layer.get('motion_keyframes') or []
    selected = [key for key in keys if key.get('property') in ('strokeStart', 'strokeEnd', 'strokeOffset')]
    if 'vector_shape' not in layer and (selected or any(field in base for field in ('stroke_start','stroke_end','stroke_offset'))):
        raise ValueError('Stroke trim needs editable vector artwork')
    values = [(base.get('stroke_start',0),0,100),(base.get('stroke_end',100),0,100),(base.get('stroke_offset',0),-1000,1000)]
    values += [(key.get('value'),-1000,1000) if key.get('property')=='strokeOffset' else (key.get('value'),0,100) for key in selected]
    for value, lo, hi in values:
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not lo <= value <= hi:
            raise ValueError('Invalid stroke trim or offset value')
    for key in selected:
        time = key.get('time')
        if isinstance(time, bool) or not isinstance(time, (int, float)) or not math.isfinite(time) or time < 0:
            raise ValueError('Stroke trim needs a finite programme time')


def offset_vector_points(points, start=0, end=100, offset=0, closed=False):
    if isinstance(offset,bool) or not isinstance(offset,(int,float)) or not math.isfinite(offset) or not -1000 <= offset <= 1000:
        raise ValueError('Stroke offset must be between -1000 and 1000')
    # Validate the original interval even when offset moves it out of view.
    selected = trim_vector_points(points,start,end)
    if not selected:
        return []
    if not closed:
        return trim_vector_points(points,max(0,min(100,start+offset)),max(0,min(100,end+offset)))
    if end-start == 100:
        return points
    first = (start+offset) % 100
    last = first+end-start
    if last <= 100:
        return trim_vector_points(points,first,last)
    tail, head = trim_vector_points(points,first,100),trim_vector_points(points,0,last-100)
    return tail+head[1:] if tail else head


def rasterize_vector_shape(shape, size=1024, *, stroke_start=0, stroke_end=100, stroke_offset=0):
    validate_vector_shape(shape)
    if type(size) is not int or not 16 <= size <= 2048:
        raise ValueError('Vector raster size must be 16–2048')
    scale, high = 2, size*2
    sources, strokes = [], []
    for contour in vector_contours(shape):
        source_points = vector_points(dict(version=1, **contour, fill=shape['fill'], stroke=shape['stroke']))
        stroke_points = offset_vector_points(source_points, stroke_start, stroke_end, stroke_offset, contour['closed'])
        if stroke_start == 0 and stroke_end == 100 and (contour['closed'] or stroke_offset == 0):
            stroke_points = source_points
        sources.append(source_points); strokes.append(stroke_points)
    fill, stroke = shape['fill'], shape['stroke']
    mask = Image.new('L', (high, high))
    if fill['kind'] != 'none':
        if shape['version'] == 1:
            ImageDraw.Draw(mask).polygon([(x*high/100, y*high/100) for x,y in sources[0]], fill=255)
        else:
            parity = Image.new('1', (high, high))
            for points in sources:
                part = Image.new('1', (high, high))
                ImageDraw.Draw(part).polygon([(x*high/100, y*high/100) for x,y in points], fill=1)
                parity = ImageChops.logical_xor(parity, part)
            mask = parity.convert('L')
    mask = mask.resize((size, size), Image.Resampling.LANCZOS)
    rgb = lambda c: tuple(int(c[i:i+2], 16) for i in (1, 3, 5))
    if fill['kind'] == 'linear':
        yy, xx = np.mgrid[:size, :size].astype(np.float32)
        start, end = np.array(fill['start']), np.array(fill['end'])
        delta = end-start
        t = np.clip((((xx+.5)*100/size-start[0])*delta[0]+((yy+.5)*100/size-start[1])*delta[1])
            /float(delta@delta), 0, 1)
        a, b = np.array(rgb(fill['color'])), np.array(rgb(fill['endColor']))
        image = Image.fromarray(np.rint(a+(b-a)*t[:, :, None]).astype(np.uint8), 'RGB').convert('RGBA')
    else:
        image = Image.new('RGBA', (size, size), (*rgb(fill['color']), 255))
    image.putalpha(mask)
    if stroke['width'] and any(strokes):
        line = Image.new('L', (high, high)); draw = ImageDraw.Draw(line)
        width = max(1, round(stroke['width']*high/100)); radius = width/2
        # Round joins at every sampled vertex, as well as both end caps.
        # Pillow's dense line/joint raster alone can leave radial pinholes.
        for points in strokes:
            if not points:
                continue
            points = [(x*high/100, y*high/100) for x,y in points]
            draw.line(points, fill=255, width=width, joint='curve')
            for x, y in points:
                draw.ellipse((x-radius, y-radius, x+radius, y+radius), fill=255)
        colored = Image.new('RGBA', (size, size), (*rgb(stroke['color']), 255))
        colored.putalpha(line.resize((size, size), Image.Resampling.LANCZOS))
        image = Image.alpha_composite(image, colored)
    return image
