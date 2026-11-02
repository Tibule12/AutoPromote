"""Compare retained native exports with actual Studio screenshots; no effects/rendering."""
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
SOURCE = ROOT / 'reports/studio-motion-flow-takeover-20261031/video-texture'
AUDIT = SOURCE / 'scene-sampling-audit-20261101'
rows = []
sheet = Image.new('RGB', (1440, 4*294), '#10131c')
draw = ImageDraw.Draw(sheet)
for index, time in enumerate([6.5, 8.2, 10.1, 15.9]):
    exported = Image.open(SOURCE / f'export-frames/{time:.2f}.png').convert('RGB')
    old = Image.open(SOURCE / f'preview-{time:.2f}.png').convert('RGB').resize(exported.size, Image.Resampling.LANCZOS)
    new = Image.open(AUDIT / f'settled-{time:.2f}.png').convert('RGB').resize(exported.size, Image.Resampling.LANCZOS)
    row = {'time': time}
    for name, picture in [('previous', old), ('corrected', new)]:
        mse = float(np.mean((np.asarray(exported, dtype=float)-np.asarray(picture, dtype=float))**2))
        row[name] = {'rgbRmse': mse**.5, 'psnrDb': float(10*np.log10(255**2/max(mse, 1e-12)))}
    for column, (label, picture) in enumerate([('Previous Studio', old), ('Corrected Studio', new), ('Native export', exported)]):
        sheet.paste(picture.resize((480, 270), Image.Resampling.LANCZOS), (column*480, index*294+24))
        draw.text((column*480+8, index*294+5), f'{time:.2f}s - {label}', fill='white')
    rows.append(row)
sheet.save(OUT / 'paired-frames.jpg')
(OUT / 'paired-frames.json').write_text(json.dumps({'measurements': rows,
    'scope': 'Resized whole-picture measurements, without a new or relaxed pass threshold.',
    'wholePictureParityQualified': False}, indent=2))
print(json.dumps(rows))
