"""Per-export reuse of identical moving media rasters, before track mattes.

No decoded still-frame cache. The entire moving intermediate is reused only
when source bytes, clocks, geometry, animation and local effects are identical.
"""
import hashlib
import json
from pathlib import Path


def video_preparation_key(source, commands, prefix):
    """Same owned input and exact trim/loop/hold/speed/audio commands only.

    Generated scratch names have no pixel meaning. All other arguments,
    including source seek, audio filters and fractional clock, remain exact.
    This key is used only inside one render, after source authorization/ingest.
    """
    def argument(value):
        value = str(value)
        if value != str(source) and value.startswith(str(prefix) + '_'):
            return '<prepared>' + value[len(str(prefix)):]
        return value
    return json.dumps([str(source), [[argument(value) for value in command] for command in commands]],
                      separators=(',', ':'))


def image_layer_uses_canonical_raster(layer, composition, overlay):
    if not layer:
        return False
    effects = layer.get('effects') or {}
    matte = ((layer.get('track_matte') or {}).get('mode') or 'none') != 'none' or any(
        str(((candidate.get('track_matte') or {}).get('source_layer_id') or '')) == str(overlay.id)
        for candidate in (composition or {}).get('layers') or [])
    return bool(matte or layer.get('vector_shape') is not None or layer.get('perspective') is not None
                or layer.get('motion_keyframes') or (effects.get('mask') or {}).get('enabled')
                or float((layer.get('base_transform') or {}).get('crop_x') or 0) > 0
                or float((layer.get('base_transform') or {}).get('crop_y') or 0) > 0
                or effects.get('node') or float(effects.get('blur') or 0) > 0
                or any((effects.get(name) or {}).get('enabled')
                       for name in ('glow', 'colorize', 'shadow', 'motion_blur', 'scrapbook_frame'))
                or getattr(overlay, 'motionDesign', False))


def video_layer_uses_canonical_raster(identity, layer, composition, overlay=None):
    """Canonical geometry needs its declared canvas even when the pose is held.

    Legacy B-roll sizing does not implement canonical anchors/scale. A static
    video matte or fill cannot use that path merely because it has no keys.
    """
    if not layer:
        return False
    def field(name, default=None):
        return overlay.get(name, default) if isinstance(overlay, dict) else getattr(overlay, name, default)
    # Legacy contain pads with opaque black. Ordinary layers need transparent
    # box-relative letterboxing even when all their transforms are identity.
    transparent_contain = (
        str(field('mediaFit') or field('media_fit') or '').lower() == 'contain'
        and str(field('bRollMode') or field('b_roll_mode') or 'pip').lower() != 'fullscreen'
        and not field('coverMainVideo', False)
    )
    pose = layer.get('base_transform') or {}
    held_geometry = (
        float(pose.get('scale', 1)) != 1
        or float(pose.get('rotation', 0)) != 0
        or float(pose.get('crop_x', 0)) != 0
        or float(pose.get('crop_y', 0)) != 0
        or float(layer.get('anchor_x', 50)) != 50
        or float(layer.get('anchor_y', 50)) != 50
    )
    effects = layer.get('effects') or {}
    node = effects.get('node') or {}
    node_active = bool((node.get('key') or {}).get('enabled') or (node.get('warp') or {}).get('enabled') or node.get('defocus') or any((node.get('optical') or {}).values()))
    participants = any(str((candidate.get('track_matte') or {}).get('source_layer_id') or '') == str(identity)
                       for candidate in (composition or {}).get('layers') or [])
    return bool(node_active or transparent_contain or held_geometry or layer.get('motion_keyframes') or layer.get('perspective') or participants
                or (layer.get('track_matte') or {}).get('mode', 'none') != 'none'
                or (effects.get('mask') or {}).get('enabled')
                or (effects.get('motion_blur') or {}).get('enabled')
                or (effects.get('shadow') or {}).get('enabled')
                or (effects.get('glow') or {}).get('enabled')
                or (effects.get('colorize') or {}).get('enabled')
                or (effects.get('scrapbook_frame') or {}).get('enabled')
                or float(effects.get('blur') or 0) > 0)


def video_layer_raster_key(source, overlay, layer, width, height, duration, speed_plan, fps):
    raw = overlay if isinstance(overlay, dict) else overlay.model_dump()
    # Ownership/source access is checked before materialization. Compare actual
    # prepared bytes here, rather than trusting a caller's claimed content hash.
    source_hash = hashlib.sha256()
    with Path(source).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            source_hash.update(chunk)
    ordinary = {k: v for k, v in raw.items() if k not in {
        'id', 'name', 'src', 'url', 'file', 'poster', 'sourceStoragePath',
        'sourceMediaId', 'contentHash', 'isLocal', 'trackMatte', 'keepMatteVisible'}}
    pixels = {k: v for k, v in layer.items() if k not in {'id', 'name', 'track_matte', 'keep_matte_visible'}}
    if 'motion_keyframes' in pixels:
        pixels['motion_keyframes'] = [{k: v for k, v in key.items() if k not in {'id', 'targetId'}}
                                    for key in pixels['motion_keyframes']]
    value = [source_hash.hexdigest(), ordinary, pixels, width, height, duration, speed_plan, fps]
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()).hexdigest()
