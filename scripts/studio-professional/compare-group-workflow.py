#!/usr/bin/env python3
"""Exact recorded programme frames, native group gates and fixed source-feature
geometry. No fitted homography, spatial alignment or time search is applied.
"""
import hashlib,json,subprocess
from pathlib import Path
import cv2
import numpy as np
from PIL import Image
root=Path(__file__).resolve().parents[2]
folder=root/'reports/studio-professional-group-workflow-20261014/proof'
case=folder/'workflow'
receipt=json.loads((case/'render-receipt.json').read_text());live=json.loads((case/'native-live.json').read_text())
limits=json.loads((folder/'predeclared-checks.json').read_text())
assert receipt['projectHash']==live['canonicalHash']
assert receipt['projectId']==live['projectId']
assert hashlib.sha256((case/'final.mp4').read_bytes()).hexdigest()==receipt['outputSha256']
request=json.loads((folder/'workflow-render-request.private.json').read_text())['options']['viralData']
assert request['composition_plan']['groups'][0]['timing']==live['groups'][0]['timing']
rows=[];sift=cv2.SIFT_create(contrastThreshold=limits["siftContrastThreshold"]);matcher=cv2.BFMatcher()
for i,sample in enumerate(live['samples']):
 time=sample['time'];assert time==limits['mappedSampleTimes'][i]
 assert sample['frameIndex']==round(time*24)
 assert sample['sampling']['mode']=='accurate-paused' and sample['sampling']['sourceContentHash']
 final=case/f'final-{i}.png'
 subprocess.run(['ffmpeg','-v','error','-threads','1','-i',str(case/'final.mp4'),'-vf',f'select=eq(n\\,{sample["frameIndex"]})','-frames:v','1','-y',str(final)],check=True)
 native=Image.open(case/f'live-{i}.png').convert('RGB');rendered=Image.open(final).convert('RGB')
 assert rendered.size==(1280,720)
 arrays=[np.asarray(native),np.asarray(rendered.resize(native.size,Image.Resampling.LANCZOS))]
 height,width=arrays[0].shape[:2];mask=np.zeros((height,width),np.uint8);mask[:round(height*.7),round(width*.55):]=255
 features=[sift.detectAndCompute(cv2.cvtColor(image,cv2.COLOR_RGB2GRAY),mask) for image in arrays]
 pairs=matcher.knnMatch(features[0][1],features[1][1],k=2) if all(f[1] is not None for f in features) else []
 matched=[m for pair in pairs if len(pair)==2 for m,n in [pair] if m.distance<limits["descriptorRatio"]*n.distance]
 deltas=np.asarray([np.linalg.norm(np.asarray(features[0][0][m.queryIdx].pt)-np.asarray(features[1][0][m.trainIdx].pt)) for m in matched])
 p95=float(np.percentile(deltas,95)) if len(deltas) else None
 passed=len(matched)>=limits['minimumSourceFeatureMatches'] and p95<=limits['sourceFeatureP95Pixels']
 rows.append({'time':time,'outputFrameIndex':sample['frameIndex'],'sourceFrameIndex':sample['sampling']['frameIndex'],
 'sourceContentHash':sample['sampling']['sourceContentHash'],'nativeRasterSize':[width,height],
 'groupVisible':sample['groupVisible'],'sourceFeatureMatches':len(matched),'sourceFeatureP95Pixels':p95,'passed':passed})
result={'comparisons':rows,'sourceFeatureP95TolerancePixels':limits['sourceFeatureP95Pixels'],
 'minimumSourceFeatureMatches':limits['minimumSourceFeatureMatches'],'passed':all(r['passed'] for r in rows),
 'canonicalHash':receipt['projectHash'],'outputSha256':receipt['outputSha256'],'gpuJobs':0,
 'scope':'Nine exact programme frames with half-open native group gates. Fixed rightmost 45 percent/top 70 percent source region, unchanged 2 display-pixel p95 bound and eight-match minimum declared before capture. Final resized only to the exact native stage dimensions. No fitted transform, crop or time search. This does not qualify glyph/matte/full raster, continuous picture or human listening.'}
(folder/'paired-workflow.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
assert result['passed'],'Declared real-footage source geometry is not fully qualified'
