"""Streaming inspection sheets of actual movies. Never modifies evidence video."""
import argparse,json
from pathlib import Path
import cv2,numpy as np
from PIL import Image,ImageDraw
p=argparse.ArgumentParser();p.add_argument('before');p.add_argument('after');p.add_argument('source');p.add_argument('out');a=p.parse_args()
out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
videos=[cv2.VideoCapture(v) for v in [a.before,a.after,a.source]]
rois={'couch-hand':(0,520,440,1000),'person-mic':(350,140,850,760),'mic-stand':(740,480,1430,820)}
ids=[0,12,18,24,30,35,36,37,48,60,71];details={}
for name,(x0,y0,x1,y1) in rois.items():
 w,h=x1-x0,y1-y0;details[name]=Image.new('RGB',(w*3,(h+25)*len(ids)),(18,18,18))
count=0;page=None
while True:
 rows=[v.read() for v in videos]
 if not rows[0][0]:
  if any(ok for ok,_ in rows[1:]):raise ValueError('Movie clocks differ')
  break
 if not all(ok for ok,_ in rows):raise ValueError('Movie ended early')
 ims=[Image.fromarray(cv2.cvtColor(bgr,cv2.COLOR_BGR2RGB)) for ok,bgr in rows]
 # Only actual Fit full geometry; never motion stabilization or alpha repair.
 ims=[im.crop((188,0,1732,1080)).resize((1430,1000),Image.Resampling.LANCZOS) if im.size==(1920,1080) else im for im in ims]
 if any(im.size!=(1430,1000) for im in ims):raise ValueError('Unexpected source geometry')
 if count%12==0:page=Image.new('RGB',(1920,4*485),(18,18,18))
 thumb=ims[1].copy();thumb.thumbnail((640,450));x=count%3*640;y=(count%12//3)*485
 page.paste(thumb,(x,y+25));ImageDraw.Draw(page).text((x+8,y+5),f'Actual after frame {count}/72 | {count/24:.4f}s',fill='white')
 if count%12==11:page.save(out/f'all-frames-{count//12+1}.jpg',quality=96)
 if count in ids:
  row=ids.index(count)
  for name,roi in rois.items():
   w,h=roi[2]-roi[0],roi[3]-roi[1]
   for col,(label,im) in enumerate([('Original source',ims[2]),('Before',ims[0]),('After - actual render',ims[1])]):
    x,y=col*w,row*(h+25);details[name].paste(im.crop(roi),(x,y+25));ImageDraw.Draw(details[name]).text((x+5,y+5),f'{label} | frame {count}',fill='white')
  ims[1].save(out/f'after-{count:04d}.png')
  if count in [18,36,60]:
   comparison=Image.new('RGB',(2860,1030),(18,18,18));comparison.paste(ims[0],(0,30));comparison.paste(ims[1],(1430,30));d=ImageDraw.Draw(comparison);d.text((10,8),'Before | same actual frame',fill='white');d.text((1440,8),'After | same actual frame',fill='white');comparison.save(out/f'before-after-{count:04d}.jpg',quality=97)
 count+=1
for name,im in details.items():im.save(out/f'detail-{name}.jpg',quality=97)
for v in videos:v.release()
assert count==72,count
(out/'decoded-review.json').write_text(json.dumps({'frames':count,'sourceClock':'24fps','evidence':'actual decoded movies, no repaired diagnostic RGB','retimed':False,'framesForFocusedInspection':ids},indent=2))
print(f'Decoded {count} actual frames from each of three movies, bounded memory.')
