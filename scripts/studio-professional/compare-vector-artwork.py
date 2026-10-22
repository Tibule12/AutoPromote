#!/usr/bin/env python3
"""Fixed-threshold native vector preview/export geometry, without alignment fitting."""
import hashlib
import io
import json
from pathlib import Path
import subprocess

import numpy as np
from PIL import Image
from scipy.ndimage import binary_erosion, distance_transform_edt

PROOF = Path(__file__).resolve().parents[2] / 'reports/studio-vector-artwork-20261018/proof'


def read(name):
    return json.loads((PROOF / name).read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def mark(pixels):
    p = pixels.astype(np.int16)
    return (p[:, :, 2] > 140) & (p[:, :, 2] > p[:, :, 0] + 40)


def run():
    movie = PROOF / 'vector/final.mp4'
    receipt, samples, native = read('vector/render-receipt.json'), read('live-samples.json'), read('native-edit.json')
    assert sha(movie) == receipt['outputSha256'] == receipt['serverOutputSha256']
    assert samples['canonicalHash'] == receipt['projectHash']
    assert samples['projectId'] == receipt['projectId'] == native['projectId']
    request = read('vector-render-request.private.json')['options']['viralData']
    layer = next(l for l in request['composition_plan']['layers'] if l['id'] == native['layerId'])
    assert layer['vector_shape'] == native['vectorShape']
    expected = [{k: v for k, v in key.items() if k != 'targetId'} for key in native['keys']]
    assert layer['motion_keyframes'] == expected
    assert receipt['technical']['video']['frameCount'] == 192 and receipt['technical']['seconds'] == 8
    rows = []
    for row in samples['observations']:
        time = row['time']
        frame_index = round(time * 24)
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(movie), '-vf',
            f'select=eq(n\\,{frame_index})', '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', '-'],
            capture_output=True, check=True, timeout=30).stdout
        exported = Image.open(io.BytesIO(raw)).convert('RGB')
        live_path = PROOF / f'live-{time:g}.png'
        live = Image.open(live_path).convert('RGB')
        output_path = PROOF / f'export-{time:g}.png'; exported.save(output_path)
        scaled = np.asarray(exported.resize(live.size, Image.Resampling.LANCZOS))
        a, b = mark(np.asarray(live)), mark(scaled)
        assert a.sum() > 100 and b.sum() > 100, 'Missing vector artwork'
        iou = float((a & b).sum() / (a | b).sum())
        edge_a, edge_b = a & ~binary_erosion(a), b & ~binary_erosion(b)
        distances = np.concatenate((distance_transform_edt(~edge_b)[edge_a], distance_transform_edt(~edge_a)[edge_b]))
        p95 = float(np.percentile(distances, 95))
        rows.append({'time': time, 'frameIndex': frame_index, 'previewSha256': sha(live_path),
            'exportFrameSha256': sha(output_path), 'nativeSize': list(live.size), 'exportSize': list(exported.size),
            'iou': iou, 'symmetricBoundaryP95Pixels': p95, 'passed': iou >= .95 and p95 <= 2})
    result = {'projectId': receipt['projectId'], 'canonicalHash': receipt['projectHash'], 'outputSha256': sha(movie),
        'classifier': 'B > 140 and B > R + 40; fixed before comparison, white stroke excluded',
        'thresholds': {'iouMin': .95, 'boundaryP95MaxNativePixels': 2},
        'scaling': 'Full export scaled to declared native screenshot size; no fitted shift/crop/time',
        'compiledContourNodes': len(layer['vector_shape']['nodes']), 'compiledMotionKeys': len(expected),
        'observations': rows, 'passed': all(r['passed'] for r in rows),
        'scope': 'Five paused contour-fill geometry pairs on one animated ordinary vector-artwork layer. Exact gradient color, stroke raster, whole mix, groups and retiming remain separate.'}
    (PROOF / 'vector-parity.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'passed': result['passed'], 'samples': len(rows),
        'minIou': min(r['iou'] for r in rows), 'maxBoundaryP95Pixels': max(r['symmetricBoundaryP95Pixels'] for r in rows)}))
    assert result['passed'], 'Native vector preview/export geometry differs'


if __name__ == '__main__':
    run()
