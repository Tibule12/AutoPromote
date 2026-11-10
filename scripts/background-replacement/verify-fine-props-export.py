"""Inspect the actual native export against its preview and original source."""
import json,hashlib,subprocess,math
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
R=Path('reports/background-replacement-20261101/private/fine-props-r8');N=R/'native-scoped-final';O=R/'export-review';O.mkdir(exist_ok=True)
source=Path('/home/tibule12/Videos/AutoPromote Background Replacement - 2026-11-01/Four-minute movement test/Latest short source - 115-117s.mp4')
before=Path('reports/background-replacement-20261101/private/long-podcast-r7/final-short-correction/proof-115-2/replacement.mp4')
def decoder(p):return subprocess.Popen(['ffmpeg','-nostdin','-v','error','-i',str(p),'-map','0:v:0','-vsync','0','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],stdout=subprocess.PIPE)
paths=[source,before,N/'preview.mp4',N/'native-export.mp4'];sizes=[(1430,1000)]*3+[(1920,1080)];procs=[decoder(p) for p in paths];selected={0,8,12,16,24,36,47};rows=[];regions={'head':(250,150,540,435),'hands-shirt-mic':(140,385,770,900),'couch':(0,480,850,1000),'plant-stands':(850,440,1430,1000)}
for stage in ['source','before','preview','export']:(O/stage).mkdir(exist_ok=True)
try:
 for i in range(48):
  ims=[]
  for p,(w,h) in zip(procs,sizes):
   b=p.stdout.read(w*h*3);assert len(b)==w*h*3,(i,w,h);ims.append(Image.frombytes('RGB',(w,h),b))
  original,old,preview,export=ims;expected=Image.new('RGB',(1920,1080));expected.paste(preview.resize((1544,1080),Image.Resampling.LANCZOS),(188,0))
  difference=np.abs(np.asarray(expected).astype(np.int16)-np.asarray(export).astype(np.int16));aligned=export.crop((188,0,1732,1080)).resize((1430,1000),Image.Resampling.LANCZOS)
  common=np.abs(np.asarray(preview).astype(np.int16)-np.asarray(aligned).astype(np.int16));rows.append({'index':i,'programmeSeconds':i/24,'sourceStartSeconds':115+i/24,'maeExpectedFit':float(difference.mean()),'maeCommon':float(common.mean()),'regions':{name:float(common[y0:y1,x0:x1].mean()) for name,(x0,y0,x1,y1) in regions.items()}})
  for stage,im in zip(['source','before','preview','export'],[original,old,preview,aligned]):im.save(O/stage/f'{i:04d}.jpg',quality=97)
  if i%12==0:sheet=Image.new('RGB',(1920,1940),(15,15,15));draw=ImageDraw.Draw(sheet)
  x=i%3*640;y=(i%12//3)*485;t=export.copy();t.thumbnail((640,460));sheet.paste(t,(x,y+25));draw.text((x+5,y+5),f'Actual native export frame {i} | {i/24:.4f}s',fill='white')
  if i%12==11:sheet.save(O/f'all-export-frames-{i//12+1:02d}.jpg',quality=96)
  if i in selected:
   pair=Image.new('RGB',(1430*3,1030),(15,15,15));draw=ImageDraw.Draw(pair)
   for j,(label,im) in enumerate(zip(['Original source','Previous short repair','Actual native final'],[original,old,aligned])):pair.paste(im,(1430*j,30));draw.text((1430*j+5,7),f'{label} | frame {i}',fill='white')
   pair.save(O/f'paired-{i:04d}.jpg',quality=97)
   for name,box in regions.items():
    w,h=box[2]-box[0],box[3]-box[1];detail=Image.new('RGB',(w*3,h+30),(15,15,15));draw=ImageDraw.Draw(detail)
    for j,(label,im) in enumerate(zip(['Source','Previous','Native final'],[original,old,aligned])):detail.paste(im.crop(box),(w*j,30));draw.text((w*j+5,7),f'{label} | {i}',fill='white')
    detail.save(O/f'{name}-{i:04d}.jpg',quality=97)
 for p in procs:assert not p.stdout.read(1);assert p.wait()==0
finally:
 for p in procs:
  if p.poll() is None:p.kill();p.wait()
def audio(p):return np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-i',str(p),'-vn','-ac','1','-ar','48000','-f','f32le','pipe:1']),dtype=np.float32)
a,b=audio(source),audio(N/'native-export.mp4');length=min(len(a),len(b));correlation=float(np.corrcoef(a[:length],b[:length])[0,1]);assert length>=95000
result={'actualExportFrames':48,'actualPreviewFrames':48,'frameClockFps':24,'fitGeometry':{'contentWidth':1544,'contentHeight':1080,'leftPadding':188},'rows':rows,'meanAbsoluteRgbDifferenceExpectedFit':float(np.mean([r['maeExpectedFit'] for r in rows])),'maxFrameMae':max(r['maeExpectedFit'] for r in rows),'audio':{'sourceSamples':len(a),'exportSamples':len(b),'sampleRate':48000,'zeroLagCorrelation':correlation,'subjectiveListeningApproval':False},'scope':'Actual decoded comparison. Fit reconstruction and final H.264 encode differ; no pixel identity or creative pass is inferred.'};(O/'comparison.json').write_text(json.dumps(result,indent=2));print(json.dumps({k:v for k,v in result.items() if k!='rows'},indent=2))
