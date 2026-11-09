"""Review measured source geometry at actual frame times, without mask changes."""
import argparse,json,subprocess
from pathlib import Path
import cv2,numpy as np
from PIL import Image,ImageDraw
from scipy.signal import savgol_filter
p=argparse.ArgumentParser();p.add_argument('root',type=Path);a=p.parse_args();root=a.root
data=json.load(open(root/'registration.json'));rows=data['rows'];assert len(rows)==5760 and all(r['frame']==i for i,r in enumerate(rows))
oldroot=Path('reports/background-replacement-20261101/private/long-podcast-r7');coarse=json.load(open(oldroot/'registration.json'))['rows'];cuts=json.load(open(oldroot/'frame-camera-verification.json'))['exactTransitions']
assert all(r['accepted'] for r in rows),'Preserve unaccepted fits for inspection rather than fabricate transforms'
raw=np.asarray([r['matrix'] for r in rows]);smooth=raw.copy()
for i,cut in enumerate(cuts):
    first=cut['frame'];end=cuts[i+1]['frame'] if i+1<len(cuts) else 5760
    if end-first>=5:smooth[first:end]=savgol_filter(raw[first:end],min(9,(end-first)//2*2-1),2,axis=0,mode='interp')
for r,m in zip(rows,smooth):r['smoothedMatrix']=m.tolist()
anchors=np.array([[0,0],[1920,0],[0,1080],[1920,1080],[960,540]],float)
def locations(matrix):return anchors@matrix[:,:2].T+matrix[:,2]
errors=[];step=[]
for i,r in enumerate(rows):
    if coarse[i//6]['angle']!=r['angle']:continue
    old=np.asarray(coarse[i//6]['matrix']);difference=float(np.max(np.linalg.norm(locations(old)-locations(smooth[i]),axis=1)));errors.append((difference,i))
    if i and rows[i-1]['angle']==r['angle']:
        before=np.asarray(coarse[(i-1)//6]['matrix']);step.append({'frame':i,'oldTransformStepPixels':float(np.max(np.linalg.norm(locations(old)-locations(before),axis=1))),'measuredStepPixels':float(np.max(np.linalg.norm(locations(raw[i])-locations(raw[i-1]),axis=1))),'smoothedStepPixels':float(np.max(np.linalg.norm(locations(smooth[i])-locations(smooth[i-1]),axis=1)))})
samples=[]
for _,index in sorted(errors,reverse=True):
    if any(abs(index-other)<48 for other in samples):continue
    samples.append(index)
    if len(samples)==8:break
samples=sorted(set(samples+[1187,1188,1260,2202,2760,5376,5399,5759]));out=root/'actual-frame-review';out.mkdir(exist_ok=False)
decoder=subprocess.Popen(['ffmpeg','-nostdin','-v','error','-threads','1','-i',data['source'],'-t','240','-vf','fps=24','-an','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],stdout=subprocess.PIPE)
for index in range(5760):
    rawframe=decoder.stdout.read(1920*1080*3);assert len(rawframe)==1920*1080*3,index
    if index not in samples:continue
    picture=np.frombuffer(rawframe,np.uint8).reshape(1080,1920,3);angle=rows[index]['angle'];w=[1430,1440][angle]
    old=cv2.warpAffine(picture,np.asarray(coarse[index//6]['matrix']),(w,1000),flags=cv2.INTER_LANCZOS4)
    new=cv2.warpAffine(picture,smooth[index],(w,1000),flags=cv2.INTER_LANCZOS4)
    box=[(730,480,1430,1000),(0,640,900,1000)][angle];left,top,right,bottom=box;cw,ch=right-left,bottom-top
    sheet=Image.new('RGB',(cw*2,ch+28));d=ImageDraw.Draw(sheet)
    for j,(title,image) in enumerate([('Original source / previous 4Hz alignment',old),('Same source frame / measured 24Hz alignment',new)]):sheet.paste(Image.fromarray(image).crop(box),(cw*j,28));d.text((cw*j+4,4),f'{title} | {index/24:.3f}s',fill='white')
    sheet.save(out/f'props-{index:05d}.jpg',quality=97)
assert not decoder.stdout.read(1) and decoder.wait()==0
summary={'framesMeasured':5760,'acceptedFrames':sum(r['accepted'] for r in rows),'cameraIntervals':len(cuts),'coarseVsFullRateMaxPixels':max(v for v,_ in errors),'coarseVsFullRateP95Pixels':float(np.percentile([v for v,_ in errors],95)),'coarseStepMaxPixels':max(r['oldTransformStepPixels'] for r in step),'measuredStepMaxPixels':max(r['measuredStepPixels'] for r in step),'smoothedStepMaxPixels':max(r['smoothedStepPixels'] for r in step),'sampleFrames':samples,'actualFramesReviewed':False,'maskGeometryUnchanged':True,'sourceMediaChanged':False,'newFourMinuteRender':False,'visualPass':False}
(root/'smoothed-registration.json').write_text(json.dumps(data,indent=2)+'\n');(root/'analysis.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary,indent=2))
