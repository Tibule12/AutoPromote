"""Per-export reuse of identical moving media rasters, before track mattes.

No decoded still-frame cache. The entire moving intermediate is reused only
when source bytes, clocks, geometry, animation and local effects are identical.
"""
import hashlib
import json
from pathlib import Path


def video_layer_uses_canonical_raster(identity, layer, composition):
    """Mattes need the full declared canvas even when their pose is held.

    Legacy B-roll sizing does not implement canonical anchors/scale. A static
    video matte or fill cannot use that path merely because it has no keys.
    """
    if not layer:
        return False
    effects = layer.get('effects') or {}
    participants = any(str((candidate.get('track_matte') or {}).get('source_layer_id') or '') == str(identity)
                       for candidate in (composition or {}).get('layers') or [])
    return bool(layer.get('motion_keyframes') or layer.get('perspective') or participants
                or (layer.get('track_matte') or {}).get('mode', 'none') != 'none'
                or (effects.get('mask') or {}).get('enabled')
                or (effects.get('motion_blur') or {}).get('enabled')
                or (effects.get('shadow') or {}).get('enabled')
                or (effects.get('glow') or {}).get('enabled')
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
