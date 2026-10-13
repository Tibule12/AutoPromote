#!/usr/bin/env python3
"""Native Gaussian/inverse masks against the completed owned CPU film.

No fitted shifts, retiming or tolerance changes. The real native programme
canvas supplies the before picture for estimating opaque-magenta layer alpha.
The worker matte is an independent alpha reference, not a substitute movie.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from python_media_worker.studio_layer_motion import _render_pose, layer_pose

parser = argparse.ArgumentParser()
parser.add_argument('folder', type=Path)
parser.add_argument('--boundary-checks', action='store_true', help='Report the existing 2px geometry gate and alpha interior separately; retain strict whole-box failure')
parser.add_argument('--title-geometry', action='store_true', help='Compare the actual green diagnostic title coverage; no glyph/alpha claim')
args = parser.parse_args()
folder = args.folder
movie = folder / 'soft-masks/final.mp4'
request = json.loads((folder / 'soft-masks-render-request.private.json').read_text())['options']['viralData']
samples = json.loads((folder / 'native-masks.json').read_text())
size = (960, 720)
if args.title_geometry:
    rows = []
    for index, sample in enumerate(samples):
        t = sample['time']
        delivered = folder / f'final-{index}.png'
        subprocess.run(['ffmpeg', '-v', 'error', '-threads', '1', '-i', str(movie), '-vf', f'select=eq(n\\,{round(t*30)})', '-frames:v', '1', '-y', str(delivered)], check=True)
        pictures = [Image.open(folder / f'native-{index}.png').convert('RGB').resize(size, Image.Resampling.LANCZOS), Image.open(delivered).convert('RGB')]
        bounds = []
        for picture in pictures:
            data = np.asarray(picture)
            green = (data[..., 1] > 180) & (data[..., 0] < 60) & (data[..., 2] < 60)
            ys, xs = np.where(green)
            assert len(xs) > 100, 'No visible diagnostic title coverage'
            bounds.append([int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())])
        differences = np.abs(np.array(bounds[0])-bounds[1]).tolist()
        rows.append({'time': t, 'nativeBounds': bounds[0], 'finalBounds': bounds[1], 'edgeDifferencesPixels': differences, 'passed': max(differences) <= 2})
    result = {'outputSha256': hashlib.sha256(movie.read_bytes()).hexdigest(), 'geometryTolerancePixels': 2,
              'comparisons': rows, 'passed': all(r['passed'] for r in rows),
              'scope': 'Visible green inverted ellipse title coverage bounds only; full glyph/shadow/alpha and moving creative/sound review remain unqualified.'}
    (folder / 'paired-title-soft-geometry.json').write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps(result, indent=2))
    assert result['passed'], 'Title mask coverage exceeds existing 2px bound'
    sys.exit(0)
asset = Image.open(folder.parent / 'mask-crop-20261013/diagnostic-magenta.png').convert('RGBA')
foreground = np.array([255., 0., 255.])
rows, panels = [], []
for index, sample in enumerate(samples):
    t = sample['time']
    delivered = folder / f'final-{index}.png'
    subprocess.run(['ffmpeg', '-v', 'error', '-threads', '1', '-i', str(movie), '-vf', f'select=eq(n\\,{round(t*30)})', '-frames:v', '1', '-y', str(delivered)], check=True)
    native_image = Image.open(folder / f'native-{index}.png').convert('RGB')
    before_image = Image.open(folder / f'background-{index}.png').convert('RGB')
    # DOM screenshots outward-round fractional CSS bounds, while the native
    # programme canvas rounds its backing dimensions. Retain that known <=1px
    # difference; normalize both declared viewport sizes without fitting a shift.
    assert max(abs(a-b) for a,b in zip(native_image.size,before_image.size)) <= 1, 'Native picture and compositing canvas geometry differ'
    native = np.asarray(native_image.resize(size, Image.Resampling.LANCZOS), dtype=float)
    before = np.asarray(before_image.resize(size, Image.Resampling.LANCZOS), dtype=float)
    final = np.asarray(Image.open(delivered).convert('RGB'), dtype=float)
    direction = foreground - before
    denominator = np.maximum(1, np.sum(direction ** 2, axis=2))
    native_alpha = np.clip(np.sum((native - before) * direction, axis=2) / denominator, 0, 1)
    final_alpha = np.clip(np.sum((final - before) * direction, axis=2) / denominator, 0, 1)
    panel = Image.new('RGB', (1920, 744), 'black')
    panel.paste(Image.fromarray(native.astype(np.uint8)), (0, 24))
    panel.paste(Image.fromarray(final.astype(np.uint8)), (960, 24))
    ImageDraw.Draw(panel).text((5, 5), f'Native live {t}s | exact CPU final', fill='white')
    panels.append(panel)
    for overlay in request['overlays']:
        if overlay['type'] != 'image': continue
        layer = next(l for l in request['composition_plan']['layers'] if l['id'] == overlay['id'])
        pose = layer_pose(layer, overlay, t)
        reference = np.asarray(_render_pose(asset, overlay, layer, pose, size))[..., 3] / 255.
        cx, cy = round(pose['x'] * 960 / 100), round(pose['y'] * 720 / 100)
        half_w = round(960 * overlay['width'] / 100 * pose['scale'] / 2)
        half_h = round(720 * overlay['height'] / 100 * pose['scale'] / 2)
        region = np.s_[cy-half_h:cy+half_h, cx-half_w:cx+half_w]
        a, b, r = native_alpha[region], final_alpha[region], reference[region]
        shape = layer['effects']['mask']['shape']
        # Alpha metrics count the whole authored box, including the real hole
        # and soft boundary. RGB compression/source differences remain visible.
        native_rmse = float(np.sqrt(np.mean((a-r)**2)))
        final_rmse = float(np.sqrt(np.mean((b-r)**2)))
        pair_rmse = float(np.sqrt(np.mean((a-b)**2)))
        soft = (r > .05) & (r < .95)
        assert soft.sum() > 100, 'No actual feathered transition in the reference'
        def bounds(alpha):
            ys, xs = np.where(alpha >= .5)
            assert len(xs) > 100, 'Missing actual visible mask'
            return np.array([xs.min(), ys.min(), xs.max(), ys.max()])
        # The strict whole-box metric above stays unchanged. This separate
        # diagnostic uses the pre-existing 2px geometry allowance, verifies
        # every box edge and retains the entire inner softened/hole boundary.
        # It cannot qualify exact alpha coverage at the outermost 2px.
        native_edge = int(np.max(np.abs(bounds(a)-bounds(r))))
        final_edge = int(np.max(np.abs(bounds(b)-bounds(r))))
        def contour_distance(first, second):
            edges = []
            for measured in (first, second):
                coverage = np.pad((measured >= .5).astype(np.uint8), 2)
                edges.append(coverage-cv2.erode(coverage, np.ones((3, 3), np.uint8)))
            one, two = edges
            distances = np.concatenate([
                cv2.distanceTransform(1-one, cv2.DIST_L2, cv2.DIST_MASK_PRECISE)[two > 0],
                cv2.distanceTransform(1-two, cv2.DIST_L2, cv2.DIST_MASK_PRECISE)[one > 0],
            ])
            return {'p95Pixels': float(np.percentile(distances, 95)), 'maximumPixels': float(distances.max())}
        native_contour, final_contour = contour_distance(a, r), contour_distance(b, r)
        interior = np.s_[2:-2, 2:-2]
        inner_native = float(np.sqrt(np.mean((a[interior]-r[interior])**2)))
        inner_final = float(np.sqrt(np.mean((b[interior]-r[interior])**2)))
        inner_pair = float(np.sqrt(np.mean((a[interior]-b[interior])**2)))
        rows.append({'time': t, 'shape': shape, 'inverted': bool(layer['effects']['mask'].get('inverted')),
                     'feather': layer['effects']['mask']['feather'], 'nativeReferenceAlphaRmse': native_rmse,
                     'finalReferenceAlphaRmse': final_rmse, 'nativeFinalAlphaRmse': pair_rmse,
                     'featherTransitionPixels': int(soft.sum()),
                     'nativeOuterBoundsDifferencePixels': native_edge, 'finalOuterBoundsDifferencePixels': final_edge,
                     'nativeContourDistance': native_contour, 'finalContourDistance': final_contour,
                     'alphaInteriorNativeRmse': inner_native, 'alphaInteriorFinalRmse': inner_final, 'alphaInteriorPairRmse': inner_pair,
                     'geometryAndInteriorPassed': max(native_edge, final_edge, native_contour['p95Pixels'], final_contour['p95Pixels']) <= 2 and max(inner_native, inner_final, inner_pair) <= .04,
                     'passed': native_rmse <= .04 and final_rmse <= .04 and pair_rmse <= .04})
sheet = Image.new('RGB', (1920, 744*len(panels)))
for index, panel in enumerate(panels): sheet.paste(panel, (0, 744*index))
sheet.save(folder / 'paired-soft-masks.jpg', quality=90)
result = {'outputSha256': hashlib.sha256(movie.read_bytes()).hexdigest(), 'alphaRmseTolerance': .04,
          'comparisons': rows, 'passed': all(r['passed'] for r in rows),
          'boundaryGeometryTolerancePixels': 2, 'geometryAndInteriorPassed': all(r['geometryAndInteriorPassed'] for r in rows),
          'scope': 'Nine native/actual-film ordinary image Gaussian/inverse masks. Opaque diagnostic source and declared frame clocks only; no fitted alignment. Full HDR/general alpha/creative/public qualification is separate.'}
(folder / ('paired-soft-boundary-checks.json' if args.boundary_checks else 'paired-soft-alpha.json')).write_text(json.dumps(result, indent=2)+'\n')
print(json.dumps(result, indent=2))
if args.boundary_checks:
    assert result['geometryAndInteriorPassed'], 'Soft mask geometry/interior differs beyond existing 2px/.04 bounds; strict whole-box result remains separately reported'
else:
    assert result['passed'], 'Soft/inverse alpha differs beyond the declared .04 RMSE limit'
