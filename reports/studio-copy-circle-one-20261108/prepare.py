from pathlib import Path
import torch,numpy as np,cv2,subprocess,time,json,hashlib
from PIL import Image
r=Path(__file__).resolve().parent;out=r/'prepared';out.mkdir(exist_ok=True);src=Path('/home/tibule12/Videos/number one dance.mp4');start=6;duration=8;fps=24
working=out/src.name
if not working.exists():subprocess.run(['ffmpeg','-v','error','-i',str(src),'-t','24','-c','copy','-movflags','+faststart',str(working)],check=True)
model=Path.home()/'.cache/autopromote-model-runtime/rvm-resnet50-private-eval-v1/rvm_resnet50_fp32.torchscript';modelsha=hashlib.file_digest(model.open('rb'),'sha256').hexdigest();assert modelsha=='072adec3c75a1af773ec35d8b595612f8e3472b7a4b8a210684432b493376852'
torch.set_num_threads(2);torch.set_num_interop_threads(1);net=torch.jit.load(str(model),map_location='cpu').eval();state=[None]*4;clock=time.monotonic()
dec=subprocess.Popen(['ffmpeg','-v','error','-threads','2','-ss',str(start),'-i',str(src),'-t',str(duration),'-vf',f'fps={fps}','-an','-pix_fmt','rgb24','-f','rawvideo','-'],stdout=subprocess.PIPE)
def encoder(name,pix):return subprocess.Popen(['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt',pix,'-s','576x1024','-r',str(fps),'-i','pipe:0','-an','-c:v','libx264','-crf','10','-preset','fast','-threads','2','-pix_fmt','yuv420p','-movflags','+faststart',str(out/name)],stdin=subprocess.PIPE)
matte=encoder('number one - subject matte.mp4','gray');fgr=encoder('One - recovered foreground.mp4','rgb24');feet=[]
try:
 for i in range(duration*fps):
  data=dec.stdout.read(576*1024*3);assert len(data)==576*1024*3
  rgb=np.frombuffer(data,np.uint8).reshape(1024,576,3).copy();tensor=torch.from_numpy(rgb).permute(2,0,1)[None].float()/255
  with torch.no_grad():fg,a,*state=net(tensor,*state,.5)
  alpha=np.clip(a[0,0].numpy(),0,1);foreground=np.clip(fg[0].permute(1,2,0).numpy()*255,0,255).astype('uint8')
  # Suppress isolated decoded badge specks without thresholding the subject edge.
  n,labels,stats,_=cv2.connectedComponentsWithStats((alpha>.25).astype('uint8'));keep=np.zeros(alpha.shape,np.uint8)
  for label in range(1,n):
   if stats[label,4]>1200 and stats[label,3]>140:keep[labels==label]=1
  alpha*=cv2.dilate(keep,np.ones((7,7),np.uint8))
  alpha=np.clip((alpha-.055)/.89,0,1)
  alpha=cv2.erode(alpha,np.ones((2,2),np.uint8),anchor=(0,0))
  matte.stdin.write(np.round(alpha*255).astype('uint8').tobytes());fgr.stdin.write(foreground.tobytes())
  frame=[]
  for low,high in [(0,576)]:
   ys,xs=np.where((alpha[:,low:high]>.7)&(np.indices(alpha[:,low:high].shape)[0]>740));xs=xs+low
   if len(xs):
    yy=np.quantile(ys,.985);foot=ys>yy-5;frame.append({'x':float(np.median(xs[foot])/576*100),'y':float(yy/1024*100),'span':float((np.quantile(xs[foot],.9)-np.quantile(xs[foot],.1))/576*100)})
   else:frame.append(None)
  feet.append({'t':i/fps,'feet':frame})
  if i in [0,24,48,72,96,120,144,168,191]:
   Image.fromarray(foreground).save(r/'private'/f'foreground-{i}.png');Image.fromarray(np.round(alpha*255).astype('uint8')).save(r/'private'/f'alpha-{i}.png')
  if i%24==0:print(i,'wall',round(time.monotonic()-clock,2),flush=True)
  if time.monotonic()-clock>600:raise RuntimeError('Bounded600-second CPU matte preparation exceeded')
finally:
 dec.stdout.close();dec.wait();matte.stdin.close();fgr.stdin.close();assert matte.wait()==fgr.wait()==0
sha=lambda f:hashlib.file_digest(f.open('rb'),'sha256').hexdigest()
(r/'one-preparation.json').write_text(json.dumps({'word':'one','sourceName':src.name,'sourceStart':start,'seconds':duration,'fps':fps,'frames':duration*fps,'sourceSha256':sha(src),'workingSha256':sha(working),'matteSha256':sha(out/'number one - subject matte.mp4'),'foregroundName':'One - recovered foreground.mp4','foregroundSha256':sha(out/'One - recovered foreground.mp4'),'modelSha256':modelsha,'modelLicense':'GPL-3.0; private prepared analysis inputs, not shipped as product integration','inference':'RVM ResNet50 CPU, native576x1024 output, internal downsample0.5, recurrent state retained','wallSeconds':time.monotonic()-clock,'automaticProductSegmentation':False,'originalMusicRetained':True,'onsets':[],'feet':feet},indent=2));print('prepared',time.monotonic()-clock,flush=True)
