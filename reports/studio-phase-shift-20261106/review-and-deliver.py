"""Inspect/package native files. All evaluated motion remains in Studio."""
from pathlib import Path
import json,subprocess,hashlib,shutil,math
from PIL import Image,ImageDraw,ImageStat,ImageChops
root=Path(__file__).resolve().parents[2];report=root/'reports/studio-phase-shift-20261106';p=Path('/dev/shm/autopromote-phase-shift-proof-20261106');out=Path('/home/tibule12/Videos/Studio - Phase Shift - 2026-11-06');out.mkdir(exist_ok=True)
read=lambda f:json.loads(f.read_text());sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest();run=lambda args:subprocess.run(args,check=True,capture_output=True)
receipt=read(p/'native-motion-flow/render-receipt.json');movie=p/'native-motion-flow/final.mp4';assert sha(movie)==receipt['outputSha256'];assert receipt['actualNativeDownload'];info=json.loads(run(['ffprobe','-v','error','-count_frames','-show_streams','-show_format','-of','json',str(movie)]).stdout);v=next(s for s in info['streams']if s['codec_type']=='video');assert (v['width'],v['height'],v['r_frame_rate'],int(v['nb_read_frames']))==(1280,720,'24/1',360);assert any(s['codec_type']=='audio'for s in info['streams']);run(['ffmpeg','-v','error','-i',str(movie),'-f','null','-'])
frames=p/'Decoded frames';frames.mkdir(exist_ok=True);times=[0,.5,2.5,4.5,4.958333,5,5.5,6.5,8,8.958333,9,9.5,11,13,13.5,14.5,14.958333];board=Image.new('RGB',(1280,1200),'#11131b');draw=ImageDraw.Draw(board)
for i,t in enumerate(times):
 f=frames/f'{t:.6f}.jpg';run(['ffmpeg','-v','error','-i',str(movie),'-vf',f'select=eq(n\\,{round(t*24)})','-frames:v','1','-y',str(f)]);im=Image.open(f);im.thumbnail((316,178));x=i%4*320;y=i//4*232;board.paste(im,(x,y));draw.text((x+5,y+183),f'{t:.3f}s',fill='white')
board.save(p/'Film contact.jpg');pairs=[];comp=Image.new('RGB',(1280,1100),'#11131b');draw=ImageDraw.Draw(comp)
for i,s in enumerate(read(p/'preview-samples.json')):
 t=float(s['programmeTime']);f=frames/f'paired-{round(t*24)}.jpg';run(['ffmpeg','-v','error','-i',str(movie),'-vf',f'select=eq(n\\,{round(t*24)})','-frames:v','1','-y',str(f)]);a=Image.open(p/f'preview-{s["requested"]:.2f}.png').convert('RGB');b=Image.open(f).convert('RGB').resize(a.size,Image.Resampling.LANCZOS);mse=sum(ImageStat.Stat(ImageChops.difference(a,b)).sum2)/(a.width*a.height*3);pairs.append({'requested':s['requested'],'measuredProgrammeTime':t,'frame':round(t*24),'psnrDb':10*math.log10(255**2/mse)if mse else 100,'strictPassClaimed':False})
 for j,im in enumerate([a,b]):
  im.thumbnail((316,178));x=i%2*640+j*320;y=i//2*220;comp.paste(im,(x,y));draw.text((x+4,y+182),f'{t:.3f}s '+('LIVE'if j==0 else'EXPORT'),fill='white')
comp.save(p/'Live vs export.jpg');findings={'fullDecode':True,'frames':360,'fps':24,'seconds':15,'pictureSamples':times,'pairs':pairs,'minimumPsnrDb':min(s['psnrDb']for s in pairs),'wholeParityQualified':False,'humanListeningQualified':False};(p/'picture-review.json').write_text(json.dumps(findings,indent=2));shutil.copy2(movie,out/'Phase Shift.mp4');shutil.copy2(p/'Editable Project.autopromote.json',out/'Editable Project.autopromote.json')
for source,name in [('native-authoring/editing-in-studio.mp4','Native authoring.mp4'),('live-playback/editing-in-studio.mp4','Live Studio playback.mp4'),('finished-playback/editing-in-studio.mp4','Finished movie in Studio.mp4'),('Film contact.jpg','Film contact.jpg'),('Live vs export.jpg','Live vs export.jpg'),('controls-before.png','Controls - before.png'),('controls-finished-reframe.png','Controls - after.png'),('controls-1440-Sound.png','Sound controls.png'),('controls-1440-Reframe.png','Reframe controls.png'),('controls-finished-sound.png','Studio with new sound controls.png')]:
 if(p/source).exists():shutil.copy2(p/source,out/name)
tech=out/'Technical';tech.mkdir(exist_ok=True)
for name in ['picture-review.json','controls-ui.json','signed-in-help.json','authoring.json','refinement.json','scoring.json','recovery.json','finished-file-identity.json','live-playback.json','finished-playback.json','render-ui.json','finished-ui.json','exact-native-binding.json','native-worker-resource.json']:
 if(p/name).exists():shutil.copy2(p/name,tech/name)
shutil.copy2(p/'native-motion-flow/render-receipt.json',tech/'render-receipt.json')
for phase in ['live','finished']:
 if(p/f'{phase}-playback/editing-recording.json').exists():shutil.copy2(p/f'{phase}-playback/editing-recording.json',tech/(phase+'-recording.json'))
for name in ['native-render-preflight.json','candidate-build.json','sources.json','audio-panel-tests.log','focused-editor-tests.json','kernel-check.log']:
 if(report/name).exists():shutil.copy2(report/name,tech/name)
print(json.dumps({'delivery':str(out),'movieSha256':sha(movie),**findings},indent=2))
