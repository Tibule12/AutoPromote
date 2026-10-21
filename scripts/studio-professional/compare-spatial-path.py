#!/usr/bin/env python3
"""Bounded geometry check of native paused previews against the actual export.

Fixed magenta classifier and existing 2px/.95 geometry bounds. No fitted
translation, time search, hand-picked crop or alternative renderer.
"""
import hashlib
import io
import json
from pathlib import Path
import subprocess

import numpy as np
from PIL import Image
from scipy.ndimage import binary_erosion, distance_transform_edt

ROOT = Path(__file__).resolve().parents[2]
PROOF = ROOT / 'reports/studio-spatial-paths-20261017/proof'


def read(name):
    return json.loads((PROOF / name).read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def mark(pixels):
    return (pixels[:, :, 0] > 200) & (pixels[:, :, 1] < 50) & (pixels[:, :, 2] > 180)


def run():
    movie = PROOF / 'curved/final.mp4'
    receipt, samples, native = read('curved/render-receipt.json'), read('live-samples.json'), read('native-edit.json')
    assert sha(movie) == receipt['outputSha256'] == receipt['serverOutputSha256']
    assert samples['canonicalHash'] == receipt['projectHash']
    assert samples['projectId'] == receipt['projectId'] == native['projectId']
    request = read('curved-render-request.private.json')['options']['viralData']
    plan_layer = next(layer for layer in request['composition_plan']['layers'] if layer['id'] == native['layerId'])
    expected = [{k: v for k, v in key.items() if k != 'targetId'} for key in native['keys']]
    assert plan_layer['motion_keyframes'] == expected
    assert len(expected) == 10 and sum('spatialCurve' in k for k in expected) == 8
    assert request['editor_timeline']['programme_duration_ticks'] == 720000
    assert receipt['technical']['video']['frameCount'] == 192
    assert receipt['technical']['seconds'] == 8
    rows = []
    for row in samples['observations']:
        time = row['time']
        assert row['decoder']['paused'] and not row['decoder']['seeking']
        assert abs(row['decoder']['time'] - time) < 1 / 48
        frame_index = round(time * 24)
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(movie), '-vf',
            f'select=eq(n\\,{frame_index})', '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', '-'],
            capture_output=True, check=True, timeout=30).stdout
        exported = Image.open(io.BytesIO(raw)).convert('RGB')
        live_path = PROOF / f'live-{time:g}.png'
        live = Image.open(live_path).convert('RGB')
        output_path = PROOF / f'export-{time:g}.png'
        exported.save(output_path)
        native_pixels = np.asarray(live)
        scaled = np.asarray(exported.resize(live.size, Image.Resampling.LANCZOS))
        a, b = mark(native_pixels), mark(scaled)
        assert a.sum() > 100 and b.sum() > 100, 'Missing moving mark; a black/stale sample cannot qualify'
        iou = float((a & b).sum() / (a | b).sum())
        edge_a, edge_b = a & ~binary_erosion(a), b & ~binary_erosion(b)
        distances = np.concatenate((distance_transform_edt(~edge_b)[edge_a], distance_transform_edt(~edge_a)[edge_b]))
        p95 = float(np.percentile(distances, 95))
        ca, cb = np.array(np.nonzero(a)).mean(axis=1)[::-1], np.array(np.nonzero(b)).mean(axis=1)[::-1]
        rows.append({'time': time, 'frameIndex': frame_index, 'previewSha256': sha(live_path),
            'exportFrameSha256': sha(output_path), 'nativeSize': list(live.size), 'exportSize': list(exported.size),
            'iou': iou, 'symmetricBoundaryP95Pixels': p95, 'previewCentroid': ca.tolist(),
            'exportCentroid': cb.tolist(), 'passed': iou >= .95 and p95 <= 2})
    result = {'projectId': receipt['projectId'], 'canonicalHash': receipt['projectHash'], 'outputSha256': sha(movie),
        'classifier': 'R > 200, G < 50, B > 180; fixed before observing paired results',
        'thresholds': {'iouMin': .95, 'boundaryP95MaxNativePixels': 2},
        'scaling': 'Full export scaled once to the declared native screenshot size; no fitted shift/crop/time',
        'compiledPositionKeys': 10, 'compiledSpatialChannels': 8, 'programmeTicks': 720000,
        'observations': rows, 'passed': all(r['passed'] for r in rows),
        'scope': 'Six paused position-geometry pairs on one flat image layer. Whole raster, live sound, continuous performance, groups and retiming are separate qualifications.'}
    (PROOF / 'spatial-parity.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'passed': result['passed'], 'samples': len(rows),
        'minIou': min(r['iou'] for r in rows), 'maxBoundaryP95Pixels': max(r['symmetricBoundaryP95Pixels'] for r in rows)}))
    assert result['passed'], 'Native preview/export spatial geometry differs'


if __name__ == '__main__':
    run()
