"""Compare final heads to exact sequential original frames, without creative scores."""
from pathlib import Path
import argparse,json,subprocess,cv2,numpy as np
from PIL import Image,ImageDraw
p=argparse.ArgumentParser();p.add_argument('root');a=p.parse_args();r=Path(a.root);out=r/'actual-source-head-review';out.mkdir(exist_ok=False);reg=json.load(open(r.parent/'long-podcast-r7/registration.json'))['rows'];records={}
for start in [0,60,120,180]:
 for row in json.load(open(f'/dev/shm/autopromote-background-four-minute-r9/interval-{start}/receipt.json'))['records']:records[row['frame']]=row
source=subprocess.Popen(['ffmpeg','-nostdin','-v','error','-threads','1','-i','/home/tibule12/Videos/cam-combiner-5050c706-a6cb-48bc-ac43-8fa54f21bc1a.mp4','-t','240','-vf','fps=24','-an','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],stdout=subprocess.PIPE);movie=cv2.VideoCapture(str(r/'assembled/Four-minute repaired preview.mp4'));page=None;draw=None;rows=[];group=0
try:
 for frame in range(5760):
  raw=source.stdout.read(6220800);ok,bgr=movie.read();assert len(raw)==6220800 and ok,('Exact original/final clock',frame)
  if frame%24:continue
  row=records[frame];angle=row['angle'];w=[1430,1440][angle];rgb=cv2.warpAffine(np.frombuffer(raw,np.uint8).reshape(1080,1920,3),np.array(reg[frame//6]['matrix']),(w,1000),flags=cv2.INTER_LANCZOS4);rgb=cv2.resize(rgb,(1430,1000),interpolation=cv2.INTER_LANCZOS4);box=row['headBox'];assert box;box=[max(0,round(box[0]*1430/w)-5),max(0,box[1]-5),min(1430,round(box[2]*1430/w)+5),min(1000,box[3]+5)];j=len(rows)%15
  if j==0:page=Image.new('RGB',(1200,1250),(16,16,16));draw=ImageDraw.Draw(page);group+=1
  x=j%3*400;y=j//3*250
  for col,im in enumerate([Image.fromarray(rgb),Image.fromarray(cv2.cvtColor(bgr,cv2.COLOR_BGR2RGB))]):page.paste(im.crop(box).resize((200,220),Image.Resampling.LANCZOS),(x+col*200,y+30))
  draw.text((x+3,y+6),f'{frame/24:g}s | source / actual final',fill='white');rows.append({'frame':frame,'sourceSeconds':frame/24,'angle':angle,'headBox':box,'sheet':group})
  if j==14:page.save(out/f'heads-{group:02d}.jpg',quality=97)
 assert not source.stdout.read(1) and source.wait()==0 and not movie.read()[0]
 if len(rows)%15:page.save(out/f'heads-{group:02d}.jpg',quality=97)
 (out/'source-head-clock.json').write_text(json.dumps({'sourceSequentialFrames':5760,'actualFinalFrames':5760,'headPairs':len(rows),'rows':rows,'visualReviewRequired':True,'creativeGate':False,'sourceIndexExact':True},indent=2));print('ACTUAL_SEQUENTIAL_SOURCE_HEAD_PAIRS',len(rows),flush=True)
finally:
 if source.poll() is None:source.kill();source.wait()
 movie.release()
