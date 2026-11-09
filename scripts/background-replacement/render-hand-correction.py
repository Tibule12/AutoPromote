"""Actual corrective SAM2 tracking of the raised hand, forward and backward.

This is source-bound short-shot qualification, not a registered long-form job.
"""
from pathlib import Path
import argparse,json,subprocess,importlib.util,hashlib,socket,time
import cv2,numpy as np
from PIL import Image,ImageDraw
from model_workers.adapters.component_segmentation import ComponentVideoTracker
from pymatting import estimate_alpha_cf,estimate_foreground_ml
from pymatting.preconditioner.ichol import ichol
s=importlib.util.spec_from_file_location('roi',Path(__file__).with_name('repair-microphone-windscreen.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
p=argparse.ArgumentParser();p.add_argument('root');a=p.parse_args();r=Path(a.root);out=r/'hand-correction-224-226';out.mkdir(exist_ok=True);socket.socket.connect=lambda *a,**k:(_ for _ in ()).throw(RuntimeError('Local model inference only'));cv2.setNumThreads(1);reg=json.load(open('reports/background-replacement-20261101/private/long-podcast-r7/registration.json'))['rows'];model=next(v for v in json.load(open('config/model-runtime/registry.v1.json'))['models'] if v['id']=='sam21-multiobject-cpu-v2');params=json.load(open(r/'sam-hand-correction/selection.json'))['parameters'];master='/home/tibule12/Videos/cam-combiner-5050c706-a6cb-48bc-ac43-8fa54f21bc1a.mp4';src=subprocess.Popen(['ffmpeg','-nostdin','-v','error','-threads','1','-ss','224','-i',master,'-t','2','-vf','fps=24','-an','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],stdout=subprocess.PIPE);frames=[]
for i in range(48):
 raw=src.stdout.read(6220800);assert len(raw)==6220800;frames.append(cv2.warpAffine(np.frombuffer(raw,np.uint8).reshape(1080,1920,3),np.array(reg[(5376+i)//6]['matrix']),(1440,1000),flags=cv2.INTER_LANCZOS4))
assert not src.stdout.read(1) and src.wait()==0
cache=m.MicrophoneRepair((268,330,487,730));(out/'component-probability').mkdir(exist_ok=True);(out/'corrected-alpha').mkdir(exist_ok=True);(out/'hand-composite').mkdir(exist_ok=True);(out/'source-hand').mkdir(exist_ok=True);rows={};shared=None;start=time.monotonic();base_picture=cv2.VideoCapture(str(r/'assembled/Four-minute repaired preview.mp4'));base_alpha=cv2.VideoCapture(str(r/'assembled/Full alpha matte - lossless.mkv'))
for direction,indices in [('forward',list(range(24,48))),('backward',list(range(24,-1,-1)))]:
 tracker=ComponentVideoTracker({'model':model,'request':{'parameters':params}},{'width':1440,'height':1000},Path('/home/tibule12/.cache/autopromote-model-runtime/sam21-small-pinned'),model=shared);shared=tracker.model
 for j,index in enumerate(indices):
  rgb=frames[index];mask,_=tracker.frame(rgb,j)
  if direction=='backward' and index==24:continue
  source=cv2.resize(rgb,(1430,1000),interpolation=cv2.INTER_LANCZOS4);mask=cv2.resize(mask,(1430,1000),interpolation=cv2.INTER_LANCZOS4);x0,y0,x1,y1=cache.box;im=source[y0:y1,x0:x1];evidence=mask[y0:y1,x0:x1];binary=(evidence>=128).astype(np.uint8);tri=np.full(binary.shape,.5);tri[cv2.erode(binary,np.ones((3,3),np.uint8))>0]=1;tri[cv2.dilate(binary,np.ones((7,7),np.uint8))==0]=0;applied=bool(np.any(tri==1) and np.any(tri==0));name=f'{index:04d}.png'
  if (out/'hand-composite'/name).exists() and (out/'corrected-alpha'/name).exists():
   cache.alpha=np.array(Image.open(out/'corrected-alpha'/name));comp=Image.open(out/'hand-composite'/name).copy()
  elif applied:
   alpha=estimate_alpha_cf(im.astype(np.float64)/255,tri,laplacian_kwargs={'epsilon':1e-6},preconditioner=lambda v:ichol(v,shifts=[.01,.1,1,10,100]),cg_kwargs={'rtol':1e-5,'maxiter':500});cache.alpha=np.rint(alpha.clip(0,1)*255).astype(np.uint8);fore=estimate_foreground_ml(im.astype(np.float64)/255,alpha);fore[(cache.alpha==0)|(cache.alpha==255)]=im[(cache.alpha==0)|(cache.alpha==255)]/255;comp=cache.renderer.render(Image.fromarray(np.rint(fore.clip(0,1)*255).astype(np.uint8)),5376+index)
  else:
   # The selected hand exits this ROI. Preserve the current underlying body,
   # equipment and background rather than turning the still-visible sleeve off.
   base_picture.set(cv2.CAP_PROP_POS_FRAMES,5376+index);ok,picture=base_picture.read();assert ok;base_alpha.set(cv2.CAP_PROP_POS_FRAMES,5376+index);ok,alpha_frame=base_alpha.read();assert ok;comp=Image.fromarray(cv2.cvtColor(picture,cv2.COLOR_BGR2RGB)[y0:y1,x0:x1]);cache.alpha=cv2.cvtColor(alpha_frame,cv2.COLOR_BGR2GRAY)[y0:y1,x0:x1]
  Image.fromarray(evidence).save(out/'component-probability'/name);Image.fromarray(cache.alpha).save(out/'corrected-alpha'/name);comp.save(out/'hand-composite'/name);Image.fromarray(im).save(out/'source-hand'/name);rows[index]={'sourceFrame':5376+index,'sourceSeconds':224+index/24,'trackingDirection':direction,'correctionApplied':applied,'baseFramePreservedWhenHandExitsRegion':not applied,'correctedAlphaSha256':hashlib.sha256(cache.alpha.tobytes()).hexdigest()};print('ACTUAL_CORRECTIVE_HAND_FRAME',direction,index,flush=True)
assert len(rows)==48
for n in range(0,48,12):
 page=Image.new('RGB',(1752,1200),(20,20,20));d=ImageDraw.Draw(page)
 for j,index in enumerate(range(n,n+12)):
  source=Image.open(out/'source-hand'/f'{index:04d}.png').resize((219,400));after=Image.open(out/'hand-composite'/f'{index:04d}.png').resize((219,400));x=j%4*438;y=j//4*400;page.paste(source,(x,y));page.paste(after,(x+219,y));d.text((x+3,y+3),str(index),fill='white')
 page.save(out/f'all-hand-frames-{n//12+1}.jpg',quality=96)
(out/'receipt.json').write_text(json.dumps({'frames':48,'sourceSeconds':[224,226],'box':cache.box,'parameters':params,'model':model['id'],'weights':model['weights'],'sourceSha256':'93ce466b525041df305e839154645bd8fb5b9ec9b621c64d4c2afd5d9badff8a','rows':[rows[i] for i in range(48)],'elapsedSeconds':time.monotonic()-start,'nativeArtifactQualification':False,'actualLocalCpuInference':True,'paidCloud':False,'visualGate':False},indent=2));print('ACTUAL_48_HAND_CORRECTIONS_READY',flush=True)
