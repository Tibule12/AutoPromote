#!/usr/bin/env python3
"""Measure one real layer's position; this is not whole-picture conformance."""
import json
import subprocess
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[2]
folder = root / 'reports/studio-professional-editing-20261013/proof'
movie = folder / 'property-animation/final.mp4'

def bounds(file):
    image = Image.open(file).convert('RGB')
    points = [(x, y) for y in range(image.height) for x in range(image.width)
              if (lambda c: c[0] < 70 and c[1] > 175 and c[2] > 175)(image.getpixel((x, y)))]
    assert len(points) > 100, f'No decoded cyan marker in {file.name}'
    box = [min(x for x, _ in points), min(y for _, y in points),
           max(x for x, _ in points), max(y for _, y in points)]
    return {'size': list(image.size), 'bbox': box,
            'center': [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2],
            'cyanPixels': len(points)}

samples = []
for time in [.5, 1, 1.5, 2.5]:
    preview = folder / f'preview-{time:g}.png'
    actual = bounds(preview)
    width, height = actual['size']
    final = folder / f'final-{time:g}.png'
    subprocess.run(['ffmpeg', '-v', 'error', '-i', str(movie), '-vf',
                    f'select=eq(n\\,{int(time * 24)}),scale={width}:{height}',
                    '-frames:v', '1', '-y', str(final)], check=True)
    rendered = bounds(final)
    delta = [abs(a - b) for a, b in zip(actual['center'], rendered['center'])]
    samples.append({'outputSeconds': time, 'deliveryFrame': int(time * 24),
                    'preview': actual, 'final': rendered, 'centerDeltaPixels': delta,
                    'passed': max(delta) <= 2})

receipt = json.loads((folder / 'property-animation/render-receipt.json').read_text())
lifecycle = json.loads((folder / 'native-lifecycle.json').read_text())
project = json.loads((folder / 'property-animation-project.private.json').read_text())
assert lifecycle['projectId'] == receipt['projectId'] == project['id']
assert lifecycle['singlePropertyKeys'] == project['snapshot']['motionKeyframes']
result = {'scope': 'Single-property X easing/position in independent live preview versus final decoded frames. '
                  'No whole-picture, audio, other-property or composition parity claim.',
          'projectId': receipt['projectId'], 'renderJobId': receipt['submittedJobId'],
          'finalSha256': receipt['outputSha256'], 'identicalMotionKeys': True,
          'displayPixelTolerance': 2, 'samples': samples,
          'passed': all(sample['passed'] for sample in samples)}
(folder / 'paired-property-measurement.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'passed': result['passed'], 'centerDeltas': [sample['centerDeltaPixels'] for sample in samples]}))
assert result['passed'], 'Layer position differs beyond the declared two-display-pixel bound'
