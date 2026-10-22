#!/usr/bin/env python3
"""Generate the shared unshaped Inter layout contract from the bundled fonts."""
import hashlib
import json
from pathlib import Path
from fontTools.ttLib import TTFont
from PIL import ImageFont

ROOT = Path(__file__).resolve().parent.parent
CHARS = ''.join(chr(c) for c in range(32, 127)) + ''.join(chr(c) for c in range(160, 384)) + '‘’“”–—…'
result = {'version': 1, 'size': 36, 'lineHeight': 50.4, 'weights': {}}
for weight, suffix in [(400, 'Regular'), (600, 'SemiBold'), (800, 'ExtraBold'), (900, 'Black')]:
    path = ROOT / f'python_media_worker/assets/fonts/Inter-{suffix}.ttf'
    browser = ROOT / f'frontend/src/components/motion/fonts/Inter-{suffix}.ttf'
    assert path.read_bytes() == browser.read_bytes()
    font = TTFont(path)
    cmap, upm = font.getBestCmap(), font['head'].unitsPerEm
    ascent, descent = ImageFont.truetype(str(path), 36).getmetrics()
    result['weights'][str(weight)] = {'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
        'ascent': ascent, 'descent': descent,
        'advances': {char: font['hmtx'][cmap[ord(char)]][0] * 36 / upm for char in CHARS if ord(char) in cmap}}
data = json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n'
for path in ['frontend/src/components/motion/textMetrics.v1.json', 'python_media_worker/assets/studio-text-metrics.v1.json']:
    (ROOT / path).write_text(data)
