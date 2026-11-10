"""Review and package actual native outputs; no evaluated effects composed here."""
from pathlib import Path
import json,subprocess,hashlib,shutil,math,sys
from PIL import Image,ImageDraw,ImageStat,ImageChops
root=Path(__file__).resolve().parents[2];p=root/'reports/studio-template-collection-20261104';out=Path('/home/tibule12/Videos/Studio Template Collection - 2026-11-04');out.mkdir(exist_ok=True)
cases=json.loads((p/'collection.json').read_text());sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest();run=lambda a:subprocess.run(a,check=True,capture_output=True)
for case in cases:
 d=p/case['id'];movie=d/'native-motion-flow/final.mp4'
 if not (d/'render-ui.json').exists():continue
 receipt=json.loads((d/'native-motion-flow/render-receipt.json').read_text());assert sha(movie)==receipt['outputSha256'];assert receipt['actualNativeDownload'];assert receipt['technical']['video']['frameCount']==192
 dest=out/case['label'].split(' — ')[0];dest.mkdir(exist_ok=True);shutil.copy2(movie,dest/(case['label'].split(' — ')[0]+'.mp4'));shutil.copy2(d/'Editable Project.autopromote.json',dest/'Editable Project.autopromote.json')
 if not (d/'picture-review.json').exists():
  run(['ffmpeg','-v','error','-i',str(movie),'-f','null','-']);board=Image.new('RGB',(960,600),'#151515');draw=ImageDraw.Draw(board);samples=[0,.25,1.5,2.5,3.5,4.5,5.5,6.5,7.958333];frames=d/'Decoded frames';frames.mkdir(exist_ok=True)
  for i,t in enumerate(samples):
   f=frames/f'{t:.6f}.jpg';run(['ffmpeg','-v','error','-ss',str(t),'-i',str(movie),'-frames:v','1','-y',str(f)]);a=Image.open(f);a.thumbnail((316,178));x=i%3*320;y=i//3*200;board.paste(a,(x,y));draw.text((x+4,y+180),f'{t:.3f}s',fill='white')
  board.save(d/'Export contact.jpg');pairs=[];paired=Image.new('RGB',(1280,600),'#151515');draw=ImageDraw.Draw(paired)
  for i,s in enumerate(json.loads((d/'preview-samples.json').read_text())):
   t=float(s['programmeTime']);n=round(t*24);f=frames/f'paired-{n}.jpg';run(['ffmpeg','-v','error','-i',str(movie),'-vf',f'select=eq(n\\,{n})','-frames:v','1','-y',str(f)]);a=Image.open(d/f'preview-{s["requested"]:.2f}.png').convert('RGB');b=Image.open(f).convert('RGB').resize(a.size,Image.Resampling.LANCZOS);diff=ImageStat.Stat(ImageChops.difference(a,b));mse=sum(diff.sum2)/(a.width*a.height*3);metric=10*math.log10(255*255/mse) if mse else 100;pairs.append({'requested':s['requested'],'measuredProgrammeTime':t,'exportFrameIndex':n,'psnrDb':metric,'passClaimed':False})
   for j,im in enumerate([a,b]):
    im.thumbnail((316,178));x=i%2*640+j*320;y=i//2*200;paired.paste(im,(x,y));draw.text((x+4,y+180),f'{t:.3f}s '+('LIVE' if j==0 else 'EXPORT'),fill='white')
  paired.save(d/'Live vs export.jpg');(d/'picture-review.json').write_text(json.dumps({'fullDecode':True,'frames':192,'fps':24,'seconds':8,'width':1280,'height':720,'movieSha256':sha(movie),'sampleTimes':samples,'pairs':pairs,'minimumPsnrDb':min(r['psnrDb'] for r in pairs),'wholeParityQualified':False},indent=2))
 for name in ['Export contact.jpg','Live vs export.jpg','template-selection.png']:
  shutil.copy2(d/name,dest/name)
 technical=dest/'Technical';technical.mkdir(exist_ok=True)
 for name in ['authoring.json','director-selection.json','picture-review.json','reopen-controls.json','live-playback.json','finished-playback.json','finished-file-identity.json','exact-native-binding.json','native-worker-resource.json','render-ui.json','finished-ui.json']:
  f=d/name
  if f.exists():shutil.copy2(f,technical/name)
 shutil.copy2(d/'native-motion-flow/render-receipt.json',technical/'render-receipt.json')
 for folder,name in [('native-authoring','Native authoring.mp4'),('live-playback','Live Studio playback.mp4'),('finished-playback','Finished video in Studio.mp4')]:
  f=d/folder/'editing-in-studio.mp4'
  if f.exists():shutil.copy2(f,dest/name)
 print(case['id'],'packaged',flush=True)
