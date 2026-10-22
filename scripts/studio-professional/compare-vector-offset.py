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

PROOF = Path(__file__).resolve().parents[2] / 'reports/studio-vector-offset-20261018/proof'


def read(name):
    return json.loads((PROOF / name).read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def mark(pixels, color):
    p = pixels.astype(np.int16)
    r,g,b=p[:,:,0],p[:,:,1],p[:,:,2]
    if color=='cyan': return (b>140)&(g>140)&(b>r+40)
    if color=='violet': return (b>140)&(r>90)&(b>g+50)&(g<150)
    if color=='gold': return (r>180)&(g>140)&(b<140)
    raise ValueError('Unknown declared stroke color')


def run():
    movie = PROOF / 'vector/final.mp4'
    receipt, samples, native = read('vector/render-receipt.json'), read('live-samples.json'), read('native-edit.json')
    assert sha(movie) == receipt['outputSha256'] == receipt['serverOutputSha256']
    assert samples['canonicalHash'] == receipt['projectHash']
    assert samples['projectId'] == receipt['projectId'] == native['projectId']
    request = read('vector-render-request.private.json')['options']['viralData']
    expected_layers = {l['id']:l for l in native['layers']}
    for item in request['composition_plan']['layers']:
        if item['id'] not in expected_layers: continue
        authored=expected_layers[item['id']]
        assert item['vector_shape']==authored['vectorShape']
        expected=[{k:v for k,v in key.items() if k!='targetId'} for key in native['allKeys'] if key['targetId']==item['id']]
        assert item['motion_keyframes']==expected
        assert len(expected)==5 and all(k['property']=='strokeOffset' for k in expected)
        assert item['base_transform']['stroke_offset']==next(k['value'] for k in expected if k['time']==0)
    assert len(expected_layers)==3
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
        for color in ['cyan','violet','gold']:
            a,b=mark(np.asarray(live),color),mark(scaled,color)
            assert a.sum()>100 and b.sum()>100, 'Missing '+color+' stroke'
            iou=float((a&b).sum()/(a|b).sum())
            edge_a,edge_b=a&~binary_erosion(a),b&~binary_erosion(b)
            distances=np.concatenate((distance_transform_edt(~edge_b)[edge_a],distance_transform_edt(~edge_a)[edge_b]))
            p95=float(np.percentile(distances,95))
            rows.append({'time':time,'color':color,'frameIndex':frame_index,'previewSha256':sha(live_path),
                'exportFrameSha256':sha(output_path),'nativeSize':list(live.size),'exportSize':list(exported.size),
                'iou':iou,'symmetricBoundaryP95Pixels':p95,'passed':iou>=.95 and p95<=2})
    result = {'projectId': receipt['projectId'], 'canonicalHash': receipt['projectHash'], 'outputSha256': sha(movie),
        'classifier': 'Fixed before comparison: cyan B>140 G>140 B>R+40; violet B>140 R>90 B>G+50 G<150; gold R>180 G>140 B<140. White title and red selection excluded.',
        'thresholds': {'iouMin': .95, 'boundaryP95MaxNativePixels': 2},
        'scaling': 'Full export scaled to declared native screenshot size; no fitted shift/crop/time',
        'compiledContourNodes': sum(len(l['vectorShape']['nodes']) for l in native['layers']), 'compiledMotionKeys': len(native['allKeys']),
        'observations': rows, 'passed': all(r['passed'] for r in rows),
        'scope': 'Ten paused mapped frames with three independently classified colored strokes (30 geometry pairs), including original-seam crossings and forward/reverse cumulative offsets. Whole live picture/sound, broad contours/effects/parents and retiming remain separate.'}
    (PROOF / 'offset-parity.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'passed': result['passed'], 'samples': len(rows),
        'minIou': min(r['iou'] for r in rows), 'maxBoundaryP95Pixels': max(r['symmetricBoundaryP95Pixels'] for r in rows)}))
    assert result['passed'], 'Native vector preview/export geometry differs'


if __name__ == '__main__':
    run()
