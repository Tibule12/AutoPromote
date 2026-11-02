"""Streaming contact sheets from actual decoded preview/export frames only."""
import argparse
import json
from pathlib import Path
import cv2
from PIL import Image, ImageDraw

p=argparse.ArgumentParser()
p.add_argument('movie')
p.add_argument('output')
p.add_argument('--expected-frames',type=int,default=72)
p.add_argument('--source')
p.add_argument('--before')
p.add_argument('--angle',type=int,default=1)
a=p.parse_args()
out=Path(a.output);out.mkdir(parents=True,exist_ok=True)
decoder=cv2.VideoCapture(a.movie)
source=cv2.VideoCapture(a.source) if a.source else None
before=cv2.VideoCapture(a.before) if a.before else None
selected={0,12,24,35,36,37,48,60,71}
columns,rows_per_page,cell_width,cell_height,page_frames=(4,6,480,295,24) if a.expected_frames==144 else (3,4,640,485,12)
if a.expected_frames==144:selected|={72+i for i in selected.copy()}
count=0;page=None;fps=decoder.get(cv2.CAP_PROP_FPS)
while True:
 ok,bgr=decoder.read()
 if not ok:break
 im=Image.fromarray(cv2.cvtColor(bgr,cv2.COLOR_BGR2RGB))
 if count%page_frames==0:page=Image.new('RGB',(1920,rows_per_page*cell_height),(18,18,18))
 thumb=im.copy();thumb.thumbnail((cell_width,cell_height-25));x=count%columns*cell_width;y=(count%page_frames//columns)*cell_height
 page.paste(thumb,(x,y+25));ImageDraw.Draw(page).text((x+8,y+5),f'Actual decoded frame {count} | {count/fps:.4f}s',fill='white')
 if count%page_frames==page_frames-1:page.save(out/f'all-frames-{count//page_frames+1:02d}.jpg',quality=96)
 rows=[]
 for capture,label in [(source,'Source'),(before,'Before')]:
  if capture:
   valid,frame=capture.read();assert valid,'Reference movie ended early'
   reference=Image.fromarray(cv2.cvtColor(frame,cv2.COLOR_BGR2RGB))
   if reference.size==(1920,1080) and im.size==(1430,1000):reference=reference.crop((188,0,1732,1080)).resize(im.size,Image.Resampling.LANCZOS)
   assert reference.size==im.size,(reference.size,im.size)
   rows.append((label,reference))
 if count in selected:
  im.save(out/f'actual-{count:04d}.png')
  if rows:
   rows.append(('Current actual preview',im));w,h=im.size
   paired=Image.new('RGB',(w*len(rows),h+30),(18,18,18));draw=ImageDraw.Draw(paired)
   for j,(label,row) in enumerate(rows):paired.paste(row,(j*w,30));draw.text((j*w+8,8),f'{label} | frame {count}',fill='white')
   paired.save(out/f'paired-{count:04d}.jpg',quality=97)
   rois={'person-mic':(540,590,751,710),'couch':(0,480,440,1000),'plant-stand':(850,400,1430,820)} if a.angle==1 else {'cap-shoulders':(390,40,1410,560),'microphone':(120,480,1020,1000),'plant':(0,580,400,1000)}
   for name,roi in rois.items():
    rw,rh=roi[2]-roi[0],roi[3]-roi[1];detail=Image.new('RGB',(rw*len(rows),rh+30),(18,18,18));draw=ImageDraw.Draw(detail)
    for j,(label,row) in enumerate(rows):detail.paste(row.crop(roi),(j*rw,30));draw.text((j*rw+8,8),f'{label} | {count}',fill='white')
    detail.save(out/f'detail-{name}-{count:04d}.jpg',quality=97)
 count+=1
assert count==a.expected_frames,count
if count%page_frames:page.save(out/f'all-frames-{(count-1)//page_frames+1:02d}.jpg',quality=96)
for capture in [source,before]:
 if capture:assert not capture.read()[0];capture.release()
decoder.release()
(out/'decode-review.json').write_text(json.dumps({'actualFrames':count,'fps':fps,'alteredSourceRgb':False,'retimed':False,'selectedFrames':sorted(selected)},indent=2)+'\n')
print(f'{count} actual movie frames decoded for review.')
