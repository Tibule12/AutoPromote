#!/usr/bin/env python3
"""Compare real Studio captures with decoded frames of the exact existing export."""
import argparse, json, math
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageDraw
parser=argparse.ArgumentParser();parser.add_argument('folder');parser.add_argument('movie');args=parser.parse_args()
p=Path(args.folder);d=json.loads((p/'paired-source-capture.json').read_text());movie=cv2.VideoCapture(args.movie)
project=json.loads((p/'before-project.private.json').read_text())
assert project['id']==d['projectId']
time_map=project['snapshot']['studioDocument']['outputTimeMap']
def output_time(programme_seconds):
    tick=math.floor(programme_seconds*90000+.5)
    if tick==time_map[-1]['programmeRange']['endTick']:
        return time_map[-1]['outputRange']['endTick']/90000
    segment=next(row for row in time_map if row['programmeRange']['startTick']<=tick<row['programmeRange']['endTick'])
    numerator=(tick-segment['programmeRange']['startTick'])*segment['rateDenominator']
    denominator=segment['rateNumerator']
    offset=(2*numerator+denominator)//(2*denominator)
    return min(segment['outputRange']['endTick'],segment['outputRange']['startTick']+offset)/90000
fps=movie.get(cv2.CAP_PROP_FPS);sift=cv2.SIFT_create();results=[];rows=[]
for f in d['frames']:
    # The native range is explicitly labelled Edited output position. Older
    # receipts mistakenly called that value programmeTime; do not map it twice.
    legacy_clock_label='outputTime' not in f
    mapped_output=f['outputTime'] if not legacy_clock_label else f['programmeTime']
    index=round(mapped_output*fps);movie.set(cv2.CAP_PROP_POS_FRAMES,index);ok,b=movie.read();assert ok
    a=cv2.imread(str(p/f"preview-{f['requestedTime']}.png"));h,w=a.shape[:2]
    b=cv2.resize(b,(w,h),interpolation=cv2.INTER_AREA);cv2.imwrite(str(p/f"final-{f['requestedTime']}.png"),b)
    mask=np.full((h,w),255,np.uint8)
    for overlay in f['overlays']:
        r=overlay['rectangle'];x=int(r['x']*w);y=int(r['y']*h);ww=int(r['width']*w);hh=int(r['height']*h)
        cv2.rectangle(mask,(max(0,x-8),max(0,y-8)),(min(w,x+ww+8),min(h,y+hh+8)),0,-1)
    ka,da=sift.detectAndCompute(cv2.cvtColor(a,cv2.COLOR_BGR2GRAY),mask)
    kb,db=sift.detectAndCompute(cv2.cvtColor(b,cv2.COLOR_BGR2GRAY),mask)
    good=[]
    if da is not None and db is not None:
        for candidates in cv2.BFMatcher().knnMatch(da,db,k=2):
            if len(candidates)==2 and candidates[0].distance<.72*candidates[1].distance:good.append(candidates[0])
    result={'requestedTime':f['requestedTime'],'programmeTime':f['programmeTime'] if not legacy_clock_label else None,'mappedOutputTime':mapped_output,'legacyCaptureClockMislabel':legacy_clock_label,'sourceTime':f['sourceTime'],'exportFrame':index,'frameRoundingSeconds':abs(index/fps-mapped_output),'matches':len(good),'tolerancePreviewPixels':2,'geometryStatus':'INSUFFICIENT_MATCHES'}
    if not legacy_clock_label:
        result['sourceToOutputResidualSeconds']=abs(output_time(f['programmeTime'])-mapped_output)
    visible=mask>0
    result.update(previewMeanLuma=float(cv2.cvtColor(a,cv2.COLOR_BGR2GRAY)[visible].mean()),
                  exportMeanLuma=float(cv2.cvtColor(b,cv2.COLOR_BGR2GRAY)[visible].mean()),
                  meanAbsolutePixelDifference=float(np.abs(a.astype(np.float32)-b.astype(np.float32))[visible].mean()))
    if f.get('transition',{}).get('opacity')==1 and f['transition']['mode']=='soft_dip':
        result['fullBlackAgreement']=bool(a[visible].max()<=2 and b[visible].max()<=2)
    if len(good)>=10:
        pa=np.float32([ka[m.queryIdx].pt for m in good]);pb=np.float32([kb[m.trainIdx].pt for m in good]);matrix,inliers=cv2.estimateAffinePartial2D(pa,pb,method=cv2.RANSAC,ransacReprojThreshold=2)
        if matrix is not None and inliers.sum()>=8:
            inside=inliers.ravel().astype(bool);displacements=np.linalg.norm(pb[inside]-pa[inside],axis=1)
            result.update(inliers=int(inliers.sum()),affine=matrix.tolist(),medianDisplacement=float(np.median(displacements)),p95Displacement=float(np.percentile(displacements,95)))
            result['geometryStatus']='PASS' if result['p95Displacement']<=2 else 'FAIL'
    results.append(result)
    row=Image.new('RGB',(w*2,h+24),'#14141a');row.paste(Image.fromarray(cv2.cvtColor(a,cv2.COLOR_BGR2RGB)),(0,24));row.paste(Image.fromarray(cv2.cvtColor(b,cv2.COLOR_BGR2RGB)),(w,24));draw=ImageDraw.Draw(row);draw.text((3,4),f"Raw preview output {mapped_output}s",fill='white');draw.text((w+3,4),f"Actual export frame {index} — {result['geometryStatus']}",fill='white');rows.append(row)
movie.release()
for first in range(0,len(rows),5):
    batch=rows[first:first+5];m=Image.new('RGB',(batch[0].width*len(batch),batch[0].height),'#14141a')
    for j,row in enumerate(batch):m.paste(row,(j*row.width,0))
    m.save(p/f'paired-{first//5}.jpg',quality=92)
(p/'paired-geometry.json').write_text(json.dumps({'scope':'Representative actual decoded source/finished-movie geometry outside visible overlay boxes; not full-film text/matte/sound parity. Identity preserved in native receipt.','results':results},indent=2)+'\n')
print(json.dumps({'frames':len(results),'geometryPasses':sum(x['geometryStatus']=='PASS' for x in results),'geometryFailures':sum(x['geometryStatus']=='FAIL' for x in results),'insufficient':sum(x['geometryStatus']=='INSUFFICIENT_MATCHES' for x in results)}))
