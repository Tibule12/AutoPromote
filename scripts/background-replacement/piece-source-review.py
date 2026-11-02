"""Compare decoded original-master pixels with the delivered native export, per region."""
from pathlib import Path
import hashlib,json,subprocess
import cv2,numpy as np
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[2]
PRIVATE=ROOT/'reports/background-replacement-20261101/private'
OUT=PRIVATE/'piece-review-r6';OUT.mkdir(exist_ok=True)
MASTER=Path('/home/tibule12/Videos/cam-combiner-60sec.mp4')
FINAL=PRIVATE/'body-edge-r5/two-speaker-native-export.mp4'
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',18)
CONFIG=[
 {'source':PRIVATE/'source-3s.mp4','crop':[170,40,1430,1000],'masterFrames':[667,770],
  'regions':{'head-face-ears':(410,150,640,440),'neck-shoulders':(280,350,800,540),'hands-shirt':(240,610,850,880),'chair-arm-reveal':(480,650,850,970),'mic-body-cable':(470,460,660,800),'boom-gap-and-pivots':(700,540,1110,730),'stand-and-foliage':(960,470,1370,960)}},
 {'source':PRIVATE/'two-speaker-r4/Speaker 2 - source 54-57s.mp4','crop':[430,40,1440,1000],'masterFrames':[1615,1716],
  'regions':{'cap-face-ears':(670,60,1020,450),'neck-shoulders':(450,340,1320,620),'hands-shirt':(560,830,1180,1000),'left-sleeve':(345,730,605,1000),'right-body':(1150,450,1440,1000),'mic-mount-cable':(775,485,960,1000),'boom-spring-and-gaps':(140,710,835,850),'stand-and-foliage':(0,790,240,1000)}}
]
# Source timestamps are obtained from the original master, not inferred from 24fps output.
pts=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_entries','frame=best_effort_timestamp_time','-of','json',str(MASTER)]))['frames']
capfinal=cv2.VideoCapture(str(FINAL));results=[]
for angle,cfg in enumerate(CONFIG,1):
 target=OUT/f'angle-{angle}';target.mkdir(exist_ok=True)
 src=cv2.VideoCapture(str(cfg['source']));srcframes=[]
 for i in range(72):
  ok,f=src.read();assert ok;srcframes.append(f)
 assert not src.read()[0];src.release()
 master=cv2.VideoCapture(str(MASTER));master.set(cv2.CAP_PROP_POS_FRAMES,cfg['masterFrames'][0]);thumbs=[]
 x,y,w,h=cfg['crop']
 for idx in range(*cfg['masterFrames']):
  ok,f=master.read();assert ok
  thumbs.append(cv2.resize(f[y:y+h,x:x+w],(143,100)).astype(np.float32))
 master.release();thumbs=np.stack(thumbs);mapping=[]
 for f in srcframes:
  t=cv2.resize(f,(143,100)).astype(np.float32)
  scores=np.mean((thumbs-t)**2,axis=(1,2,3));j=int(np.argmin(scores));mapping.append({'masterFrame':cfg['masterFrames'][0]+j,'masterTimeSeconds':float(pts[cfg['masterFrames'][0]+j]['best_effort_timestamp_time']),'thumbnailMSE':float(scores[j])})
 assert all(mapping[i]['masterFrame']<mapping[i+1]['masterFrame'] for i in range(71)),mapping
 master=cv2.VideoCapture(str(MASTER));originals=[];currents=[]
 for i,m in enumerate(mapping):
  master.set(cv2.CAP_PROP_POS_FRAMES,m['masterFrame']);ok,f=master.read();assert ok
  original=f[y:y+h,x:x+w];originals.append(original)
  ok,f=capfinal.read();assert ok
  common=cv2.resize(f[:,188:1732],(1430,1000),interpolation=cv2.INTER_AREA)
  current=common if angle==1 else cv2.resize(common[3:996],(1440,1000),interpolation=cv2.INTER_AREA)
  currents.append(current)
  if i in [0,12,24,35,36,37,48,60,71]:
   canvas=Image.new('RGB',(w*2,h+38),(18,18,18));d=ImageDraw.Draw(canvas)
   for j,(label,im) in enumerate([('Original master',original),('Delivered export - inverse Fit full',current)]):
    canvas.paste(Image.fromarray(cv2.cvtColor(im,cv2.COLOR_BGR2RGB)),(j*w,38));d.text((j*w+7,8),f'{label} | frame {i} | original {m["masterTimeSeconds"]:.6f}s',font=font,fill='white')
   canvas.save(target/f'whole-{i:04d}.jpg',quality=97)
 master.release()
 for name,roi in cfg['regions'].items():
  l,t,r,b=roi;rw,rh=r-l,b-t
  # Every output frame is present in a source/export paired contact sheet.
  cellw=400;cellh=round(rh/rw*cellw)
  for group in range(6):
   sheet=Image.new('RGB',(cellw*4,(cellh+32)*6),(20,20,20));draw=ImageDraw.Draw(sheet)
   for k in range(12):
    i=group*12+k;column=k%2;row=k//2
    for j,(label,frames) in enumerate([('Original',originals),('Export',currents)]):
     crop=frames[i][t:b,l:r];im=Image.fromarray(cv2.cvtColor(crop,cv2.COLOR_BGR2RGB)).resize((cellw,cellh),Image.Resampling.LANCZOS)
     px=(column*2+j)*cellw;py=row*(cellh+32);sheet.paste(im,(px,py+32));draw.text((px+5,py+6),f'{label} f{i:02d}',font=font,fill='white')
   sheet.save(target/f'{name}-all-{group+1}.jpg',quality=96)
  for i in [0,24,36,48,71]:
   scale=2 if rw<420 else 1
   sheet=Image.new('RGB',(rw*scale*2,rh*scale+36),(20,20,20));d=ImageDraw.Draw(sheet)
   for j,(label,frames) in enumerate([('Original master',originals),('Delivered export',currents)]):
    im=Image.fromarray(cv2.cvtColor(frames[i][t:b,l:r],cv2.COLOR_BGR2RGB)).resize((rw*scale,rh*scale),Image.Resampling.NEAREST)
    sheet.paste(im,(j*rw*scale,36));d.text((j*rw*scale+5,8),f'{label} | frame {i}',font=font,fill='white')
   sheet.save(target/f'{name}-detail-{i:04d}.png')
 results.append({'angle':angle,'source':str(cfg['source']),'cropOriginalPixels':cfg['crop'],'frameMapping':mapping,'regions':cfg['regions'],'allPairedFrameSheetsCreated':72*len(cfg['regions']),'reviewed':False,'fitInverseScope':'Export has an additional encode and 1430x1000 common canvas/Fit full scaling. Geometry inverse for inspection, not pixel identity or alpha ground truth.'})
 for label,frames in [('original',originals),('export',currents)]:
  # Retain exact extracted original and inverse-scaled final PNGs for frame stepping.
  folder=target/label;folder.mkdir(exist_ok=True)
  for i,f in enumerate(frames):cv2.imwrite(str(folder/f'{i:04d}.png'),f)
capfinal.release()
(OUT/'piece-review-provenance.json').write_text(json.dumps({'masterSha256':hashlib.file_digest(MASTER.open('rb'),'sha256').hexdigest(),'exportSha256':hashlib.file_digest(FINAL.open('rb'),'sha256').hexdigest(),'angles':results,'scope':'Frame-exact original-master match, no generated or frozen source RGB, no modified movie.'},indent=2)+'\n')
print(json.dumps({'angles':2,'frames':144,'regions':sum(len(c['regions']) for c in CONFIG),'sourceExportRegionPairsCreated':sum(72*len(c['regions']) for c in CONFIG),'reviewed':False}))
