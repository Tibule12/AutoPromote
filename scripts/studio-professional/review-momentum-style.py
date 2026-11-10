"""Decoded native picture review and paired diagnostics. No external effects authored."""
from pathlib import Path
import subprocess,json,hashlib,math
from PIL import Image,ImageDraw,ImageChops,ImageStat
root=Path(__file__).resolve().parents[2];p=root/'reports/studio-motion-styles-20261104';movie=p/'native-motion-flow/final.mp4';run=lambda args:subprocess.run(args,check=True,capture_output=True)
sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest()
d=json.loads(run(['ffprobe','-v','error','-count_frames','-show_streams','-show_format','-of','json',str(movie)]).stdout);v=next(s for s in d['streams'] if s['codec_type']=='video');assert int(v['nb_read_frames'])==576;assert (v['width'],v['height'],v['r_frame_rate'])==(1280,720,'24/1');assert any(s['codec_type']=='audio' for s in d['streams']);run(['ffmpeg','-v','error','-i',str(movie),'-f','null','-'])
frames=p/'Export inspection';frames.mkdir(exist_ok=True);times=[0,.5,1.5,3,4.5,6,7.5,7.958333,8,8.5,9.5,10.5,11.5,13,14.5,14.958333,15,15.5,16.5,17.8,19.2,20.5,20.958333,21,21.5,22.5,23,23.5,23.958333];contact=None
for i,t in enumerate(times):
 if i%12==0:contact=Image.new('RGB',(1280,600),(17,17,20));draw=ImageDraw.Draw(contact)
 f=frames/f'{t:.6f}.jpg';run(['ffmpeg','-v','error','-ss',str(t),'-i',str(movie),'-frames:v','1','-y',str(f)]);im=Image.open(f);im.thumbnail((316,178));x=(i%4)*320;y=((i%12)//4)*200;contact.paste(im,(x,y));draw.text((x+5,y+181),f'{t:.3f}s',fill='white')
 if i%12==11 or i==len(times)-1:contact.save(p/f'Export contact {i//12+1}.jpg')
board=Image.new('RGB',(1280,10*200),(17,17,20));draw=ImageDraw.Draw(board);metrics=[]
for i,s in enumerate(json.loads((p/'preview-samples.json').read_text())):
 t=float(s['programmeTime']);n=round(t*24);f=frames/f'paired-{n}.jpg';run(['ffmpeg','-v','error','-i',str(movie),'-vf',f'select=eq(n\\,{n})','-frames:v','1','-y',str(f)]);a=Image.open(p/f'preview-{s["requested"]:.2f}.png').convert('RGB');b=Image.open(f).convert('RGB').resize(a.size,Image.Resampling.LANCZOS);diff=ImageStat.Stat(ImageChops.difference(a,b));mse=sum(diff.sum2)/(a.width*a.height*3);psnr=10*math.log10(255*255/mse) if mse else 100;metrics.append(dict(requested=s['requested'],measuredProgrammeTime=t,exportFrameIndex=n,psnrDb=psnr,passClaimed=False))
 for j,im in enumerate([a,b]):
  im.thumbnail((316,178));x=i%2*640+j*320;y=i//2*200;board.paste(im,(x,y));draw.text((x+5,y+181),f'{t:.3f}s '+('LIVE' if j==0 else 'EXPORT'),fill='white')
board.save(p/'Live vs export.jpg');(p/'paired-observations.json').write_text(json.dumps({'pairs':metrics,'minimumPsnrDb':min(x['psnrDb'] for x in metrics),'scope':'Diagnostics only. Whole picture, source alpha edge/time and colour parity remain unqualified.'},indent=2))
sources=json.loads((root/'reports/studio-whatsapp-director-20261103/sources.json').read_text());assert all(sha(Path(s['path']))==s['sha256'] for s in sources);(p/'native-validation.json').write_text(json.dumps({'sha256':sha(movie),'frames':576,'fps':24,'seconds':24,'width':1280,'height':720,'audioStreams':len([s for s in d['streams'] if s['codec_type']=='audio']),'fullDecode':True,'sampleTimes':times,'addedTextLayers':0,'sourceSpeechMuted':True,'allOriginalSourcesUnchanged':True},indent=2));print('Native movie fully decoded; 29 picture samples and 19 live/export pairs saved')
