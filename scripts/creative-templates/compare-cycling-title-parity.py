#!/usr/bin/env python3
"""Inspect visible brand-colour title masks in actual paired source/export images.

No generated expected title, alignment correction, or pass threshold is used.
This diagnostic starts the title slice excluded by the geometry comparison.
"""
import argparse
import json
from pathlib import Path

import cv2
import numpy as np

parser = argparse.ArgumentParser()
parser.add_argument('folder')
args = parser.parse_args()
folder = Path(args.folder)
receipt = json.loads((folder / 'paired-source-capture.json').read_text())
project = json.loads((folder / 'before-project.private.json').read_text())
assert project['id'] == receipt['projectId']


def colour_mask(image):
    # This exact film uses #baff38. Hue/saturation isolates its visible green
    # text from the neutral source footage; font, white copy and alpha differ.
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    return cv2.inRange(hsv, (30, 115, 115), (45, 255, 255)) > 0


def box(mask):
    ys, xs = np.where(mask)
    if not len(xs):
        return None
    return [int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1)]


rows = []
for frame in receipt['frames']:
    time = frame['requestedTime']
    preview = cv2.imread(str(folder / f'preview-{time}.png'))
    final = cv2.imread(str(folder / f'final-{time}.png'))
    assert preview is not None and final is not None and preview.shape == final.shape
    height, width = preview.shape[:2]
    for overlay in frame['overlays']:
        if not overlay['text'] or float(overlay['opacity']) < .95:
            continue
        definitions = [o for o in project['snapshot']['overlays']
                       if o.get('type') == 'text' and o.get('text') == overlay['text']
                       and o.get('color', '').lower() == '#baff38'
                       and o['startTime'] <= frame['programmeTime'] < o['startTime'] + o['duration']]
        if not definitions:
            continue
        r = overlay['rectangle']
        # Keep the observed aperture coordinates. Padding includes antialiasing
        # without shifting either image to improve its agreement.
        x0 = max(0, int(r['x'] * width) - 3)
        y0 = max(0, int(r['y'] * height) - 3)
        x1 = min(width, int((r['x'] + r['width']) * width) + 3)
        y1 = min(height, int((r['y'] + r['height']) * height) + 3)
        a = colour_mask(preview[y0:y1, x0:x1])
        b = colour_mask(final[y0:y1, x0:x1])
        if a.sum() < 12 and b.sum() < 12:
            continue
        union = (a | b).sum()
        ba, bb = box(a), box(b)
        rows.append({'requestedTime': time, 'programmeTime': frame['programmeTime'],
                     'text': overlay['text'], 'crop': [x0, y0, x1, y1],
                     'canonicalColour': '#baff38', 'matchingCanonicalIds': [o['id'] for o in definitions],
                     'previewPixels': int(a.sum()), 'exportPixels': int(b.sum()),
                     'previewBox': ba, 'exportBox': bb,
                     'maximumBoxEdgeDifferencePixels': max(abs(x-y) for x, y in zip(ba, bb)) if ba and bb else None,
                     'unregisteredMaskIoU': float((a & b).sum() / max(1, union)),
                     'qualification': 'DIAGNOSTIC_ONLY'})

result = {'projectId': receipt['projectId'], 'canonicalHash': receipt['canonicalHash'],
          'inputReceipt': 'paired-source-capture.json', 'rows': rows,
          'scope': 'Canonical time/colour-bound visible #baff38 title masks in existing actual paused native/export pairs. '
                   'No new edit, alignment correction, threshold promotion or glyph regeneration. '
                   'Colour segmentation can include source pixels; white copy, translucent entrance, '
                   'full raster/alpha, live motion and sound are not qualified.',
          'fullTitleParity': 'UNQUALIFIED', 'creativeApproval': False}
(folder / 'title-colour-diagnostic.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'measuredTitlePairs': len(rows),
                  'maskIoURange': [min(x['unregisteredMaskIoU'] for x in rows), max(x['unregisteredMaskIoU'] for x in rows)],
                  'maximumBoxEdgeDifferencePixels': max(x['maximumBoxEdgeDifferencePixels'] or 0 for x in rows),
                  'qualification': 'DIAGNOSTIC_ONLY'}))
