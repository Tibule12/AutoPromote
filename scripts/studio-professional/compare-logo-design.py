#!/usr/bin/env python3
"""Native settled-logo comparison. Bounds set before the first comparison.

Compare three settled programme frames at 2.5/5.5/7.5 seconds. Foreground is
any RGB channel >80 against the authored dark canvas. IoU >=.95, symmetric
boundary p95 <=2 screenshot pixels. No alignment, fitting, crop or time search.
This does not qualify low-alpha arrivals, sound or full predictive paint.
"""
import hashlib,io,json,subprocess
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.ndimage import binary_erosion,distance_transform_edt
ROOT=Path(__file__).resolve().parents[2];P=ROOT/'reports/studio-logo-design-20261018/proof'
read=lambda name:json.loads((P/name).read_text())
receipt=read('film/render-receipt.json');movie=P/'film/final.mp4';assert hashlib.sha256(movie.read_bytes()).hexdigest()==receipt['outputSha256']
# Bind exact canonical geometry and normal keys to the actual submitted plan.
request=read('film-render-request.private.json')['options']['viralData'];project=read('delivery-project.private.json');assert project['id']==receipt['projectId']
plans={l['id']:l for l in request['composition_plan']['layers']};snapshot=project['snapshot'];vectors=[l for l in snapshot['overlays'] if l.get('vectorShape')]
for l in vectors:
 assert plans[l['id']]['vector_shape']==l['vectorShape']
 expected=[{k:v for k,v in key.items() if k!='targetId'} for key in snapshot['motionKeyframes'] if key['targetId']==l['id']]
 assert plans[l['id']]['motion_keyframes']==expected
rows=[]
for t in [2.5,5.5,7.5]:
 raw=subprocess.run(['ffmpeg','-v','error','-i',str(movie),'-vf',f'select=eq(n\\,{round(t*24)})','-frames:v','1','-f','image2pipe','-c:v','png','-'],check=True,capture_output=True).stdout
 exported=Image.open(io.BytesIO(raw)).convert('RGB');exported.save(P/f'export-{t:g}.png');live=Image.open(P/f'paired-live-{t:g}.png').convert('RGB')
 a=np.max(np.asarray(live),axis=2)>80;b=np.max(np.asarray(exported.resize(live.size,Image.Resampling.LANCZOS)),axis=2)>80
 iou=float((a&b).sum()/(a|b).sum());ea,eb=a&~binary_erosion(a),b&~binary_erosion(b);p95=float(np.percentile(np.concatenate([distance_transform_edt(~eb)[ea],distance_transform_edt(~ea)[eb]]),95))
 rows.append(dict(time=t,frame=round(t*24),iou=iou,boundaryP95ScreenshotPixels=p95,passed=iou>=.95 and p95<=2))
result=dict(nativeFinalSha256=receipt['outputSha256'],projectId=receipt['projectId'],canonicalHash=receipt['projectHash'],canonicalVectorLayersExact=len(vectors),canonicalKeysExact=len(snapshot['motionKeyframes']),thresholds=dict(iouMin=.95,boundaryP95Max=2,classifier='any RGB channel >80'),samples=rows,passed=all(r['passed'] for r in rows),scope='Settled opaque logo geometry only; real pre-final/native final at exact common clock frames. Low-alpha arrivals, whole colour/paint/sound and broad effects/parent/retime remain separate.')
(P/'logo-parity.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2));assert result['passed']
