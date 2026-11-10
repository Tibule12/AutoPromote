from pathlib import Path
import hashlib,time,subprocess,torch,numpy as np,cv2
from PIL import Image,ImageDraw
r=Path(__file__).resolve().parent;torch.set_num_threads(2);torch.set_num_interop_threads(1)
p=Path.home()/'.cache/autopromote-model-runtime/rvm-resnet50-private-eval-v1/rvm_resnet50_fp32.torchscript'
assert hashlib.file_digest(p.open('rb'),'sha256').hexdigest()=='072adec3c75a1af773ec35d8b595612f8e3472b7a4b8a210684432b493376852'
model=torch.jit.load(str(p),map_location='cpu').eval();print('model loaded',flush=True)
board=Image.new('RGB',(3*576,1024),'#10121a');draw=ImageDraw.Draw(board)
for i,t in enumerate([9,10,12]):
 data=subprocess.check_output(['ffmpeg','-v','error','-ss',str(t),'-i','/home/tibule12/Videos/number two dance.mp4','-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-']);a=np.frombuffer(data,np.uint8).reshape(1024,576,3).copy();x=torch.from_numpy(a).permute(2,0,1)[None].float()/255;start=time.monotonic()
 with torch.no_grad():fgr,pha,*_=model(x,None,None,None,None,.5)
 rgb=np.clip(fgr[0].permute(1,2,0).numpy()*255,0,255).astype('uint8');alpha=np.clip(pha[0,0].numpy(),0,1)
 Image.fromarray((alpha*255).astype('uint8')).save(r/'private'/f'resnet-alpha-{t}.png');Image.fromarray(rgb).save(r/'private'/f'resnet-fgr-{t}.png')
 check=(rgb*alpha[:,:,None]+np.array([50,80,100])*(1-alpha[:,:,None])).astype('uint8');board.paste(Image.fromarray(check),(i*576,0));print(t,time.monotonic()-start,flush=True)
board.save(r/'private/resnet-matte-review.jpg',quality=94)
