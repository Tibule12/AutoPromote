"""Actual source/previous/current speaker detail; no changed or frozen RGB."""
from pathlib import Path
import argparse
import json
import cv2
from PIL import Image, ImageDraw

p=argparse.ArgumentParser()
p.add_argument('angle',type=int,choices=[1,2])
p.add_argument('current')
p.add_argument('output')
a=p.parse_args()
root=Path(__file__).resolve().parents[2]/'reports/background-replacement-20261101/private'
out=Path(a.output);out.mkdir(parents=True,exist_ok=True)
source=root/'source-3s.mp4' if a.angle==1 else root/'two-speaker-r4/Speaker 2 - source 54-57s.mp4'
previous=root/f'two-speaker-r4/angle-{a.angle}-preview.mp4'
captures=[cv2.VideoCapture(str(x)) for x in [source,previous,a.current]]
rois={'head-face-neck':(390,130,670,470),'clothes-hands':(200,380,850,970),'hands-mic':(360,550,830,780)} if a.angle==1 else {
 'head-face-neck':(530,40,1050,600),'clothes-hands':(330,400,1440,1000),'sleeve-boundary':(340,810,450,970)}
selected={0,12,24,35,36,37,48,60,71}
for i in range(72):
    images=[]
    for capture in captures:
        ok,bgr=capture.read();assert ok,'Actual reference ended early'
        images.append(Image.fromarray(cv2.cvtColor(bgr,cv2.COLOR_BGR2RGB)))
    if i%18==0:
        heads=Image.new('RGB',(280*6,370*3),(18,18,18))
    crop=images[-1].crop(rois['head-face-neck']);crop.thumbnail((280,340))
    x=i%6*280;y=i%18//6*370
    heads.paste(crop,(x,y+25));ImageDraw.Draw(heads).text((x+5,y+5),f'Actual current frame {i}',fill='white')
    if i%18==17:heads.save(out/f'angle-{a.angle}-all-moving-heads-{i//18+1}.jpg',quality=97)
    if i in selected:
        for name,roi in rois.items():
            w,h=roi[2]-roi[0],roi[3]-roi[1]
            scale=max(1,(300+w-1)//w);w*=scale;h*=scale
            paired=Image.new('RGB',(w*3,h+30),(18,18,18));draw=ImageDraw.Draw(paired)
            for j,(label,im) in enumerate(zip(['Source','Previous native','Current native'],images)):
                paired.paste(im.crop(roi).resize((w,h)),(j*w,30));draw.text((j*w+5,7),f'{label} | frame {i}',fill='white')
            paired.save(out/f'angle-{a.angle}-{name}-{i:04d}.jpg',quality=98)
for capture in captures:
    assert not capture.read()[0];capture.release()
(out/f'angle-{a.angle}-detail-review.json').write_text(json.dumps({'source':str(source),'previous':str(previous),
 'current':a.current,'actualFrames':72,'actualCurrentHeadFrames':72,'selectedSourceBeforeAfterFrames':sorted(selected),
 'crops':rois,'scope':'Decoded source and native preview frames at their original clock. Cropped viewing evidence, not ground truth.'},indent=2)+'\n')
print('72 actual moving head frames and source/previous/current body details extracted.')
