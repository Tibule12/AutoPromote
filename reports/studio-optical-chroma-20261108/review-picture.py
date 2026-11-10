from pathlib import Path
from PIL import Image,ImageDraw,ImageStat,ImageChops
import json,subprocess,math,re
r=Path(__file__).resolve().parent;p=r/'private/native';movie=p/'native-motion-flow/final.mp4';frames=p/'Decoded frames';frames.mkdir(exist_ok=True)
def run(a):return subprocess.run(a,check=True,capture_output=True,text=True).stdout
run(['ffmpeg','-v','error','-threads','2','-i',str(movie),'-f','null','-'])
backup=json.loads((p/'Editable Project.autopromote.json').read_text());events={0,.3,.75,1.2,4.35,7.55,8,8.45,11.6,15.15,15.45,15.6,16}
for cut in backup['snapshot'].get('reframeModeCuts',[]):events.add(float(cut['time']))
for l in backup['snapshot']['overlays']:events.update([l.get('startTime',0),l.get('startTime',0)+l.get('duration',16)])
for k in backup['snapshot']['motionKeyframes']:events.add(k['time'])
times=[x['time']for x in json.loads((p/'paused-preview.json').read_text())];indices=sorted(set(max(0,min(383,round(t*24)))for t in [*times,*[s for t in events for s in [t-1/24,t,t+1/24]]]))
temp=frames/'selected';temp.mkdir(exist_ok=True)
selection='+'.join(r'eq(n\,'+str(f)+')'for f in indices)
run(['ffmpeg','-v','error','-threads','2','-i',str(movie),'-vf','select='+selection,'-vsync','0','-threads','2','-start_number','0','-y',str(temp/'%04d.png')]);assert len(list(temp.glob('*.png')))==len(indices)
for i,f in enumerate(indices):(temp/f'{i:04d}.png').replace(frames/f'{f:04d}.png')
board=Image.new('RGB',(1280,math.ceil(len(indices)/4)*207),'#10131b');draw=ImageDraw.Draw(board)
for i,f in enumerate(indices):
 im=Image.open(frames/f'{f:04d}.png');im.thumbnail((316,178));x=i%4*320;y=i//4*207;board.paste(im,(x,y));draw.text((x+6,y+181),f'Frame {f:03d} / {f/24:.3f}s',fill='white')
board.save(p/'Film contact.jpg',quality=90)
pairs=[];comparison=Image.new('RGB',(1280,math.ceil(len(times)/2)*207),'#10131b');draw=ImageDraw.Draw(comparison)
for i,t in enumerate(times):
 live=Image.open(p/f'live-{t:.2f}.png').convert('RGB');export=Image.open(frames/f'{round(t*24):04d}.png').convert('RGB').resize(live.size,Image.Resampling.LANCZOS);mse=sum(ImageStat.Stat(ImageChops.difference(live,export)).sum2)/(live.width*live.height*3);psnr=10*math.log10(255**2/mse)if mse else 100;pairs.append({'programmeTime':t,'exportFrame':round(t*24),'diagnosticPsnrDb':psnr,'strictPassClaimed':False})
 for j,im in enumerate([live,export]):
  im.thumbnail((316,178));x=i%2*640+j*320;y=i//2*207;comparison.paste(im,(x,y));draw.text((x+6,y+181),f'{t:.2f}s '+('LIVE'if j==0 else'EXPORT'),fill='white')
comparison.save(p/'Live vs export.jpg',quality=90)
audio=subprocess.run(['ffmpeg','-hide_banner','-i',str(movie),'-af','volumedetect','-vn','-sn','-dn','-f','null','-'],capture_output=True,text=True,check=True).stderr;(p/'audio-levels.txt').write_text(audio)
findings={'fullDecode':True,'frames':384,'seconds':16,'fps':24,'appliedNativeBoundaries':sorted(events),'sampledFrameIndices':indices,'pairedDiagnosticSamples':pairs,'minimumDiagnosticPsnrDb':min(x['diagnosticPsnrDb']for x in pairs),'pairedDiagnosticScope':'Initial and partial native paused observations retained; corrected sampling returned429BUSY, so these are not final-graph strict conformance.','wholePictureParityQualified':False,'humanListeningQualified':False,'creativeApproval':False,'audioLevels':{k:float(re.search(k+'_volume: ([-0-9.]+) dB',audio).group(1)) for k in ['mean','max']}};(r/'picture-review.json').write_text(json.dumps(findings,indent=2));print(json.dumps({'decoded':True,'sampledFrames':len(indices),'pairs':len(pairs),'minimumPsnrDb':findings['minimumDiagnosticPsnrDb']}))
