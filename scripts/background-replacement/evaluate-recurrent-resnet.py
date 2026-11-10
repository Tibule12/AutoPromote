"""Private official RVM ResNet50 check on the exact failed source with warmup.

GPL-3.0 publisher release: not a permissive product-model selection. No weights
are bundled with AutoPromote. Actual person/prop integration remains unqualified.
"""
import argparse,json,hashlib,subprocess,time,shutil
from pathlib import Path
import cv2,numpy as np,torch
from PIL import Image,ImageDraw
p=argparse.ArgumentParser();p.add_argument('out',type=Path);p.add_argument('--ratio',type=float,default=.5);a=p.parse_args();a.out.mkdir(exist_ok=False)
cache=Path('/home/tibule12/.cache/autopromote-model-runtime/rvm-resnet50-private-eval-v1');lock=json.loads((cache/'provenance.json').read_text());checkpoint=cache/'rvm_resnet50_fp32.torchscript'
with checkpoint.open('rb') as f:assert hashlib.file_digest(f,'sha256').hexdigest()==lock['sha256']
shutil.copy2('/home/tibule12/.cache/autopromote-model-runtime/rvm-1.0.0/LICENSE',cache/'LICENSE')
torch.set_num_threads(4);torch.set_num_interop_threads(1);cv2.setNumThreads(2);model=torch.jit.load(str(checkpoint),map_location='cpu').eval();states=[None]*4
regs=json.loads(Path('reports/background-replacement-20261101/private/long-podcast-r7/registration.json').read_text())['rows'];master='/home/tibule12/Videos/cam-combiner-5050c706-a6cb-48bc-ac43-8fa54f21bc1a.mp4'
process=subprocess.Popen(['ffmpeg','-nostdin','-v','error','-threads','1','-i',master,'-vf',r'fps=24,select=between(n\,5304\,5423),setpts=PTS-STARTPTS','-vsync','0','-frames:v','120','-an','-threads','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],stdout=subprocess.PIPE)
for n in ['alpha','foreground','source']: (a.out/n).mkdir()
start=time.monotonic()
try:
 for n in range(120):
  raw=process.stdout.read(1920*1080*3);assert len(raw)==1920*1080*3
  rgb=cv2.warpAffine(np.frombuffer(raw,np.uint8).reshape(1080,1920,3),np.array(regs[(5304+n)//6]['matrix']),(1440,1000),flags=cv2.INTER_LANCZOS4);rgb=cv2.resize(rgb,(1430,1000),interpolation=cv2.INTER_LANCZOS4)
  tensor=torch.from_numpy(rgb.copy()).permute(2,0,1)[None].float()/255
  with torch.inference_mode():foreground,alpha,*states=model(tensor,*states,a.ratio)
  if n>=72:
   i=n-72;Image.fromarray(np.rint(alpha[0,0].numpy().clip(0,1)*255).astype(np.uint8)).save(a.out/'alpha'/f'{i:04d}.png');Image.fromarray(np.rint(foreground[0].permute(1,2,0).numpy().clip(0,1)*255).astype(np.uint8)).save(a.out/'foreground'/f'{i:04d}.png');Image.fromarray(rgb).save(a.out/'source'/f'{i:04d}.png')
  if n%24==0:print('ACTUAL_RECURRENT_RESNET_FRAME',n,'elapsed',round(time.monotonic()-start,2),flush=True)
 assert not process.stdout.read(1);assert process.wait()==0
finally:
 if process.poll() is None:process.kill();process.wait()
assert np.array_equal(np.asarray(Image.open(a.out/'source/0024.png')),np.asarray(Image.open('/dev/shm/autopromote-background-reassessment-20261103/registered-source-5400.png')))
plate=np.asarray(Image.open('reports/background-replacement-20261101/private/replacement.png').convert('RGB')).astype(float)/255
for i in [6,8,23,24,36,47]:
 rgb=np.asarray(Image.open(a.out/'source'/f'{i:04d}.png'));alpha=np.asarray(Image.open(a.out/'alpha'/f'{i:04d}.png')).astype(float)/255;fg=np.asarray(Image.open(a.out/'foreground'/f'{i:04d}.png')).astype(float)/255;result=np.rint((fg*alpha[...,None]+plate*(1-alpha[...,None]))*255).astype(np.uint8)
 for label,box in [('left-hand',(280,240,680,720)),('right-hand',(1040,170,1430,760)),('head',(660,45,1040,480))]:
  w,h=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(w*3,h+24));d=ImageDraw.Draw(sheet)
  for j,(name,im) in enumerate([('Source',rgb),('Private RVM ResNet50',result),('Alpha',np.repeat(np.rint(alpha*255).astype(np.uint8)[...,None],3,2))]):sheet.paste(Image.fromarray(im).crop(box),(j*w,24));d.text((j*w,0),name,fill='white')
  sheet.save(a.out/f'{label}-{i:04d}.jpg',quality=97)
(a.out/'receipt.json').write_text(json.dumps({'sourceFrames':[5304,5423],'warmupFrames':72,'actualMattingHz':24,'retainedFrames':48,'allSourceFramesRegistered':True,'elapsedSeconds':time.monotonic()-start,'downsampleRatio':a.ratio,'weights':lock,'visualPass':False,'productModelRegistered':False,'nativeExport':False,'paidCloudInference':False},indent=2));print('ACTUAL_RECURRENT_RESNET48_COMPLETE',flush=True)
