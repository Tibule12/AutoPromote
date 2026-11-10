from pathlib import Path
from PIL import Image,ImageDraw,ImageStat,ImageChops
import json,subprocess,math
report=Path(__file__).resolve().parent;p=report/'private/native';movie=p/'native-motion-flow/final.mp4';frames=p/'Decoded frames';frames.mkdir(exist_ok=True)
def run(args):return subprocess.run(args,check=True,capture_output=True,text=True).stdout
run(['ffmpeg','-v','error','-threads','2','-i',str(movie),'-f','null','-'])
plan=json.loads((p/'director-api-responses.json').read_text())[-1]['response']['plan'];events={0,12}
for layer in plan['composition']['layers']:
 events.update([layer['start'],layer['end']]);events.update(k['at']for k in layer['poses'])
pairTimes=[.5,2,3.8,4.5,6,7.8,8.5,10,11.8]
indices=sorted(set(max(0,min(287,round(t*24)))for t in [*pairTimes,0,12-1/24,*[x for t in events for x in[t-1/24,t,t+1/24]]]))
board=Image.new('RGB',(1280,math.ceil(len(indices)/4)*207),'#11131b');draw=ImageDraw.Draw(board)
for i,f in enumerate(indices):
 dest=frames/f'{f:04d}.jpg';run(['ffmpeg','-v','error','-threads','2','-i',str(movie),'-vf',f'select=eq(n\\,{f})','-frames:v','1','-y',str(dest)]);im=Image.open(dest);im.thumbnail((316,178));x=i%4*320;y=i//4*207;board.paste(im,(x,y));draw.text((x+6,y+181),f'Frame {f:03d} / {f/24:.3f}s',fill='white')
board.save(p/'Film contact.jpg',quality=90)
pairs=[];comparison=Image.new('RGB',(1280,5*207),'#11131b');draw=ImageDraw.Draw(comparison)
for i,t in enumerate(pairTimes):
 live=Image.open(p/f'live-{t:.2f}.png').convert('RGB');export=Image.open(frames/f'{round(t*24):04d}.jpg').convert('RGB').resize(live.size,Image.Resampling.LANCZOS);mse=sum(ImageStat.Stat(ImageChops.difference(live,export)).sum2)/(live.width*live.height*3);psnr=10*math.log10(255**2/mse)if mse else 100
 pairs.append({'programmeTime':t,'exportFrame':round(t*24),'diagnosticPsnrDb':psnr,'strictPassClaimed':False})
 for j,im in enumerate([live,export]):
  im.thumbnail((316,178));x=(i%2)*640+j*320;y=(i//2)*207;comparison.paste(im,(x,y));draw.text((x+6,y+181),f'{t:.2f}s '+('LIVE'if j==0 else'EXPORT'),fill='white')
comparison.save(p/'Live vs export.jpg',quality=90)
findings={'fullDecode':True,'frames':288,'seconds':12,'fps':24,'cutAndPoseBoundaries':sorted(events),'sampledFrameIndices':indices,'pairedDiagnosticSamples':pairs,'minimumDiagnosticPsnrDb':min(x['diagnosticPsnrDb']for x in pairs),'wholePictureParityQualified':False,'humanListeningQualified':False,'creativeApproval':False};(report/'picture-review.json').write_text(json.dumps(findings,indent=2));print(json.dumps({'decoded':True,'sampledFrames':len(indices),'pairs':len(pairs),'minimumPsnrDb':findings['minimumDiagnosticPsnrDb']}))
