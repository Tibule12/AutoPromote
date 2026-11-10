"""Map the actual reviewed gesture clicks into the full source's measured view."""
import copy
import json
from pathlib import Path
import subprocess

import cv2
import numpy as np
from PIL import Image

root = Path('reports/background-replacement-20261101/private')
out = root / 'corrective-click-agreement-r66'
native_root = Path('/dev/shm/autopromote-current-pipeline-r78-20261104/alpha-work/outputs/rgb')
native = np.asarray(Image.open(native_root / 'rgb_0000.png'))
reference = np.asarray(Image.open(root / 'four-minute-r9/source-055.png'))
cv2.setNumThreads(2)
sift = cv2.SIFT_create(nfeatures=10000)
mask = np.zeros(native.shape[:2], np.uint8)
mask[:280] = 255
mask[:, :180] = 255
mask[:, 1380:] = 255
kp1, d1 = sift.detectAndCompute(cv2.cvtColor(native, cv2.COLOR_RGB2GRAY), mask)
kp2, d2 = sift.detectAndCompute(cv2.cvtColor(reference, cv2.COLOR_RGB2GRAY), None)
matches = [a for a, b in cv2.BFMatcher().knnMatch(d1, d2, k=2) if a.distance < .7 * b.distance]
p1 = np.float32([kp1[m.queryIdx].pt for m in matches])
p2 = np.float32([kp2[m.trainIdx].pt for m in matches])
matrix, inliers = cv2.estimateAffinePartial2D(p1, p2, method=cv2.RANSAC, ransacReprojThreshold=1.5)
assert matrix is not None and int(inliers.sum()) >= 40
error = np.linalg.norm(p1 @ matrix[:, :2].T + matrix[:, 2] - p2, axis=1)[inliers.ravel() > 0]
assert np.median(error) < .8
registered = cv2.warpAffine(native, matrix, (1440, 1000), flags=cv2.INTER_LINEAR)
Image.fromarray(registered).save(out / 'gesture-in-canonical-view.jpg', quality=96)
registration = json.loads((root / 'full-rate-registration-20261104/smoothed-registration.json').read_text())
first, end = 5370, 5383
decoder = subprocess.Popen(['ffmpeg', '-nostdin', '-v', 'error', '-threads', '1',
    '-i', registration['source'], '-vf', f'fps=24,trim=start_frame={first}:end_frame={end},setpts=PTS-STARTPTS',
    '-frames:v', str(end - first), '-an', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], stdout=subprocess.PIPE)
scores = []
motion_domain = np.zeros((1000, 1440), bool)
motion_domain[250:720, 160:690] = True
motion_domain[250:720, 1080:1440] = True
for index in range(first, end):
    raw = decoder.stdout.read(1920 * 1080 * 3)
    assert len(raw) == 1920 * 1080 * 3
    row = registration['rows'][index]
    assert row['angle'] == 1
    current = cv2.warpAffine(np.frombuffer(raw, np.uint8).reshape(1080, 1920, 3),
        np.asarray(row['smoothedMatrix']), (1440, 1000), flags=cv2.INTER_LINEAR)
    if index == 5376:
        Image.fromarray(current).save(out / 'actual-source-frame-5376.jpg', quality=96)
    # Actual moving arms, not a static-wall match, establish the clock phase.
    scores.append({'sourceFrame': index, 'movingRgbMeanAbsError255': float(np.abs(
        current.astype(np.float32) - registered.astype(np.float32))[motion_domain].mean())})
assert not decoder.stdout.read(1) and decoder.wait() == 0
best = min(scores, key=lambda r: r['movingRgbMeanAbsError255'])
(out / 'gesture-clock-analysis.json').write_text(json.dumps({'matrix':matrix.tolist(),
    'inliers':int(inliers.sum()),'medianError':float(np.median(error)),
    'scores':scores,'best':best,'accepted':best['movingRgbMeanAbsError255']<12},indent=2)+'\n')
print(json.dumps({'matrix':matrix.tolist(),'scores':scores,'best':best}),flush=True)
assert best['movingRgbMeanAbsError255'] < 12
params = json.loads((out / 'actual-moving-opaque-clothing-points.json').read_text())


def point(p):
    xy = matrix @ np.array([p[0] * 1430, p[1] * 1000, 1.])
    return np.clip(xy / [1440, 1000], 0, 1).tolist()


def box(b):
    corners = np.asarray([point([x, y]) for x, y in [(b[0], b[1]), (b[2], b[1]), (b[2], b[3]), (b[0], b[3])]])
    return [*corners.min(0).tolist(), *corners.max(0).tolist()]


mapped = copy.deepcopy(params)
mapped['initialBox'] = box(params['initialBox'])
for c in [mapped, *mapped['components']]:
    if 'box' in c:
        c['box'] = box(c['box'])
    for p in c['points']:
        p['position'] = point(p['position'])
    for correction in c.get('shotPrompts', []):
        if 'box' in correction:
            correction['box'] = box(correction['box'])
        for p in correction['points']:
            p['position'] = point(p['position'])
mapped['refinement']['colourComponentIds'] = [c['id'] for c in mapped['components'] if not c.get('propagate', True)]
write = {'startFrame': best['sourceFrame'], 'endFrame': best['sourceFrame'] + 48,
    'angle': 1, 'parameters': mapped, 'nativeToCanonicalMatrix': matrix.tolist(),
    'staticFitInliers': int(inliers.sum()), 'staticFitMedianErrorPixels': float(np.median(error)),
    'actualMovingSourceClockScores': scores, 'clockEstablishedFromMovingRgb': True,
    'visualPass': False}
(out / 'full-source-corrective-gesture.json').write_text(json.dumps(write, indent=2) + '\n')
print(json.dumps({k: v for k, v in write.items() if k != 'parameters'}, indent=2))
