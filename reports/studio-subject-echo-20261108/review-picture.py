from pathlib import Path
from PIL import Image,ImageDraw,ImageStat,ImageChops
import json,subprocess,math
r=Path(__file__).resolve().parent;p=r/'private/native';movie=p/'native-motion-flow/final.mp4';frames=p/'Decoded frames';frames.mkdir(exist_ok=True)
subprocess.run(['ffmpeg','-v','error','-threads','2','-i',str(movie),'-f','null','-'],check=True,capture_output=True)
subprocess.run(['ffmpeg','-v','error','-threads','2','-i',str(movie),'-vsync','0','-threads','2',str(frames/'%03d.png')],check=True,capture_output=True)
assert len(list(frames.glob('*.png')))==192
indices=[0,1,3,4,7,8,11,12,15,16,24,36,48,60,72,84,94,95,96,97,99,100,103,104,107,108,111,112,120,132,144,156,168,180,190,191]
board=Image.new('RGB',(1280,math.ceil(len(indices)/4)*202),'#10131c');draw=ImageDraw.Draw(board)
for i,f in enumerate(indices):
 im=Image.open(frames/f'{f+1:03d}.png');im.thumbnail((316,178));x=i%4*320;y=i//4*202;board.paste(im,(x,y));draw.text((x+5,y+181),f'{f:03d} / {f/24:.3f}s',fill='white')
board.save(p/'Film contact.jpg',quality=90)
pairs=[];times=[.5,1.5,2.75,3.958333,4,4.5,5.5,6.75,7.958333];compare=Image.new('RGB',(1280,math.ceil(len(times)/2)*202),'#10131c');draw=ImageDraw.Draw(compare)
for i,t in enumerate(times):
 live=Image.open(p/f'live-{t:.3f}.png').convert('RGB');f=min(191,round(t*24));out=Image.open(frames/f'{f+1:03d}.png').convert('RGB').resize(live.size,Image.Resampling.LANCZOS)
 mse=sum(ImageStat.Stat(ImageChops.difference(live,out)).sum2)/(live.width*live.height*3);psnr=10*math.log10(255**2/mse)if mse else 100
 pairs.append({'requestedProgrammeTime':t,'exportFrame':f,'diagnosticPsnrDb':psnr,'strictParityClaimed':False,'limit':'Initial preview selected source-rate clock; source/frame raster and full mix equality remain unqualified.'})
 for j,im in enumerate([live,out]):
  im.thumbnail((316,178));x=i%2*640+j*320;y=i//2*202;compare.paste(im,(x,y));draw.text((x+5,y+181),f'{t:.3f}s '+('LIVE'if j==0 else'EXPORT'),fill='white')
compare.save(p/'Live vs export.jpg',quality=90)
result={'seconds':8,'frames':192,'fps':24,'fullDecode':True,'reviewedBoundaryFrames':indices,'pairedDiagnostics':pairs,'minimumDiagnosticPsnrDb':min(x['diagnosticPsnrDb']for x in pairs),'strictPictureAudioParity':False,'humanListeningQualified':False,'ownerCreativeApproval':False}
(r/'picture-review.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k not in ['reviewedBoundaryFrames','pairedDiagnostics']}))
