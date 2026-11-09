from pathlib import Path
import cv2,numpy as np,json,hashlib,sys
from PIL import Image,ImageDraw
r=Path('/dev/shm/autopromote-background-finish-20261030');camera=sys.argv[1];ident=sys.argv[2];job=r/'vfx-jobs'/ident;state=json.loads((job/'state.json').read_text());assert state['status']=='completed'and state['receipt']['gpuCount']==0;file=job/'render.mp4';assert hashlib.sha256(file.read_bytes()).hexdigest()==state['receipt']['output_sha256'];cap=cv2.VideoCapture(str(file));out=r/('review-'+camera);out.mkdir(exist_ok=True);frames=[]
while True:
 ok,bgr=cap.read()
 if not ok:break
 frames.append(Image.fromarray(cv2.cvtColor(bgr,cv2.COLOR_BGR2RGB)))
cap.release();assert len(frames)==(208 if camera in ['a','clean']else 90)
# Every frame is retained for inspection, with separate full picture and native equipment/edge crops.
for kind,box in [('full',(0,0,1920,1080)),('person',(360,170,1050,820)if camera in ['a','clean']else(820,300,1860,760)),('rig',(1030,550,1580,1080)if camera in ['a','clean']else(0,705,860,1040))]:
 cols,per=(4,16);w,h=(480,270)if kind=='full'else(520,325)if kind=='person'else(550,340);pages=[]
 for start in range(0,len(frames),per):
  n=min(per,len(frames)-start);rows=(n+cols-1)//cols;canvas=Image.new('RGB',(cols*w,rows*(h+22)));d=ImageDraw.Draw(canvas)
  for j,i in enumerate(range(start,start+n)):
   x=j%cols*w;y=j//cols*(h+22);canvas.paste(frames[i].crop(box).resize((w,h)),(x,y+22));d.text((x+3,y+3),str(i),fill='white')
  name=f'{kind}-{start//per:02d}.png';canvas.save(out/name);pages.append(name)
 for i in [0,len(frames)//3,len(frames)*2//3,len(frames)-1]:frames[i].save(out/f'frame-{i:03d}.png')
(out/'decode.json').write_text(json.dumps({'camera':camera,'frames':len(frames),'outputSha256':state['receipt']['output_sha256'],'cpuOnly':True,'everyFrameInContactSheets':True,'professionalQualification':False},indent=2));print(camera,len(frames),'exact native frames retained for inspection')
