#!/usr/bin/env python3
"""Compare actual native title-unit poses and full-frame colour geometry.

Thresholds fixed before the first movie comparison: unit-transform error 1e-8,
opacity error 1e-9; glyph/guide colour-mask IoU >= .90 and symmetric boundary p95
<= two native screenshot pixels. This is bounded text geometry, not whole paint.
"""
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess
import sys
import numpy as np
from PIL import Image
from scipy.ndimage import binary_erosion, distance_transform_edt

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from python_media_worker.studio_text_animator import text_layout, text_poses
from python_media_worker.studio_layer_motion import interpolate_layer_value

PROOF = ROOT/'reports/studio-text-choreography-20261018/proof'
read = lambda name: json.loads((PROOF/name).read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()


def mask(pixels, color):
    target = np.array([int(color[i:i+2],16) for i in (1,3,5)],dtype=float)
    background = np.array([7,11,19],dtype=float)
    direction = target-background
    delta = pixels.astype(float)-background
    alpha = np.sum(delta*direction,axis=2)/np.sum(direction*direction)
    residual = np.max(np.abs(delta-alpha[...,None]*direction),axis=2)
    return (alpha >= .55) & (alpha <= 1.08) & (residual <= 14)


def run():
    movie = PROOF/'film/final.mp4'
    receipt, samples = read('film/render-receipt.json'), read('paired-live-samples.json')
    assert sha(movie) == receipt['outputSha256'] == receipt['serverOutputSha256']
    assert samples['canonicalHash'] == receipt['projectHash'] and samples['projectId'] == receipt['projectId']
    request = read('film-render-request.private.json')['options']['viralData']
    saved = read('delivery-project.private.json')['snapshot']
    plans = {l['id']:l for l in request['composition_plan']['layers']}
    layers = {l['id']:l for l in saved['overlays'] if l.get('textAnimator')}
    for id, layer in layers.items():
        assert plans[id]['text_animator'] == layer['textAnimator']
        assert plans[id]['base_transform']['text_progress'] == layer['textProgress']
        expected = [{k:v for k,v in key.items() if k!='targetId'} for key in saved['motionKeyframes'] if key['targetId']==id]
        assert plans[id]['motion_keyframes'] == expected
    rows, unit_count = [], 0
    for row in samples['observations']:
        time = row['time']; frame_index=round(time*24)
        assert abs(frame_index/24-time) < 1e-9
        assert len(row['titles']) == 1
        title = row['titles'][0]; layer=layers[title['layerId']]; plan=plans[layer['id']]
        layout=text_layout(layer,1280,layer['textAnimator'])
        progress=interpolate_layer_value(plan,'textProgress',time,layer['textProgress'])
        poses=text_poses(layer['textAnimator'],progress,layout)
        assert len(title['units']) == len(poses)
        errors=[]
        for unit,pose,actual in zip(layout['units'],poses,title['units']):
            cx,cy=unit['x']+unit['width']/2,unit['y']+25.2
            expected=[cx+pose['x'],cy+pose['y'],pose['rotation'],pose['scale'],-cx,-cy]
            observed=[float(v) for v in re.findall(r'-?\d+(?:\.\d+)?(?:e[+-]?\d+)?',actual['transform'])]
            assert len(observed)==6
            error=max(abs(a-b) for a,b in zip(observed,expected));errors.append(error)
            assert error < 1e-8 and abs(actual['opacity']-pose['opacity']) < 1e-9
            unit_count+=1
        raw=subprocess.run(['ffmpeg','-v','error','-i',str(movie),'-vf',f'select=eq(n\\,{frame_index})','-frames:v','1','-f','image2pipe','-c:v','png','-'],capture_output=True,check=True,timeout=60).stdout
        exported=Image.open(io.BytesIO(raw)).convert('RGB');export_path=PROOF/f'export-{time:g}.png';exported.save(export_path)
        live_path=PROOF/f'paired-live-{time:g}.png';live=Image.open(live_path).convert('RGB')
        a,b=mask(np.asarray(live),layer['color']),mask(np.asarray(exported.resize(live.size,Image.Resampling.LANCZOS)),layer['color'])
        union=(a|b).sum();iou=float((a&b).sum()/union) if union else 1
        if a.any() and b.any():
            ea,eb=a&~binary_erosion(a),b&~binary_erosion(b)
            distances=np.concatenate((distance_transform_edt(~eb)[ea],distance_transform_edt(~ea)[eb]));p95=float(np.percentile(distances,95))
        else: p95=0 if not union else float('inf')
        rows.append(dict(time=time,frameIndex=frame_index,units=len(poses),maxLocalPoseError=max(errors,default=0),
                         iou=iou,boundaryP95NativePixels=p95,previewSha256=sha(live_path),exportFrameSha256=sha(export_path),
                         nativeSize=list(live.size),passed=iou>=.90 and p95<=2))
    result=dict(projectId=receipt['projectId'],canonicalHash=receipt['projectHash'],outputSha256=sha(movie),
        thresholds=dict(localTransformErrorMax=1e-8,opacityErrorMax=1e-9,iouMin=.90,boundaryP95MaxNativePixels=2),
        classifier='Projection onto authored RGB from fixed background [7,11,19]; alpha 0.55–1.08 and max channel residual 14. Includes bright same-colour guides where present; no fitted alignment/crop/time.',
        scope='Sixteen paused full-frame text-colour geometry pairs and every visible native unit transform/alpha. Whole paint/live sound, low-alpha colour and broad shaping/parent/retime combinations remain separate.',
        compiledAnimators=len(layers),unitObservations=unit_count,nativeUnitTransformsAndOpacityPassed=True,
        fullFrameColourGeometryPassed=all(r['passed'] for r in rows),
        observations=rows,passed=all(r['passed'] for r in rows))
    (PROOF/'text-parity.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(dict(passed=result['passed'],samples=len(rows),unitObservations=unit_count,minIou=min(r['iou'] for r in rows),maxBoundaryP95Pixels=max(r['boundaryP95NativePixels'] for r in rows))))
    assert result['passed'], 'Native text preview/export geometry differs'


if __name__=='__main__': run()
