"""Footage-bound corrective SAM2 video tracking with source-flow intermediate frames.

Preserve the original reviewed body matte; do not gate it through failed recurrent
person evidence or a static photographed foreground stencil. Only the reproduced
moving elbow gap is re-matted from current neural selection and current RGB.
"""
from pathlib import Path
import argparse,subprocess,json,hashlib,time,importlib.util,socket
import cv2,numpy as np
from PIL import Image
from model_workers.adapters.component_segmentation import ComponentVideoTracker
from pymatting import estimate_alpha_cf,estimate_foreground_ml
from pymatting.preconditioner.ichol import ichol
p=argparse.ArgumentParser();p.add_argument('input');p.add_argument('output');p.add_argument('--start',type=float,default=0);p.add_argument('--seconds',type=float,default=240);a=p.parse_args();inp=Path(a.input);out=Path(a.output);out.mkdir(parents=True,exist_ok=False);first=round(a.start*24);count=round(a.seconds*24);assert first>=0 and first+count<=5760
r=Path('reports/background-replacement-20261101/private/four-minute-r9');model=next(v for v in json.load(open('config/model-runtime/registry.v1.json'))['models'] if v['id']=='sam21-multiobject-cpu-v2');params=json.load(open(r/'current-frame-sam-sleeve-evaluation/selection.json'))['parameters'];spec=importlib.util.spec_from_file_location('roi',Path(__file__).with_name('repair-microphone-windscreen.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);cache=m.MicrophoneRepair((300,650,800,1000));reg=json.load(open(r.parent/'long-podcast-r7/registration.json'))['rows'];cuts=json.load(open(r.parent/'long-podcast-r7/frame-camera-verification.json'))['exactTransitions'];cam=np.zeros(5760,np.uint8)
for i,c in enumerate(cuts):cam[c['frame']:cuts[i+1]['frame'] if i+1<len(cuts) else 5760]=c['angle']
cv2.setNumThreads(1);socket.socket.connect=lambda *a,**kw:(_ for _ in ()).throw(RuntimeError('Local inference only'))
def decode(file,pixel,source=False):
 cmd=['ffmpeg','-nostdin','-v','error','-threads','1']
 if not source:cmd+=['-ss',str(a.start)]
 cmd+=['-i',str(file)]
 if source:cmd+=['-vf',f'fps=24,select=between(n\\,{first}\\,{first+count-1}),setpts=PTS-STARTPTS','-vsync','0']
 return subprocess.Popen(cmd+['-frames:v',str(count),'-an','-pix_fmt',pixel,'-f','rawvideo','pipe:1'],stdout=subprocess.PIPE)
def encode(file,pixel,codec):return subprocess.Popen(['ffmpeg','-nostdin','-v','error','-f','rawvideo','-pix_fmt',pixel,'-s','1430x1000','-r','24','-i','pipe:0','-an','-c:v',codec,'-threads','2',*(['-level','3','-g','1'] if codec=='ffv1' else ['-preset','fast','-crf','16','-pix_fmt','yuv420p','-movflags','+faststart']),str(file)],stdin=subprocess.PIPE)
source=decode('/home/tibule12/Videos/cam-combiner-5050c706-a6cb-48bc-ac43-8fa54f21bc1a.mp4','rgb24',True);picture=decode(inp/'Four-minute repaired preview.mp4','rgb24');matte=decode(inp/'Full alpha matte - lossless.mkv','gray');old=decode('/home/tibule12/Videos/AutoPromote Background Replacement - 2026-11-01/Four-minute movement test/Full alpha matte - lossless.mkv','gray');writer=encode(out/'picture.mp4','rgb24','libx264');alpha_writer=encode(out/'Full alpha matte - lossless.mkv','gray','ffv1');(out/'samples').mkdir();(out/'neural-key-masks').mkdir();last=None;tracker=None;shared=None;sam=None;previous=None;key_index=0;since=0;digest=hashlib.sha256();rows=[];started=time.monotonic();gridx,gridy=np.meshgrid(np.arange(1430,dtype=np.float32),np.arange(1000,dtype=np.float32));flow_engine=cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_FAST)
try:
 for i in range(count):
  frame_id=first+i;angle=int(cam[frame_id]);raw=source.stdout.read(6220800);pix=picture.stdout.read(4290000);av=matte.stdout.read(1430000);prior=old.stdout.read(1430000);assert all([len(raw)==6220800,len(pix)==4290000,len(av)==1430000,len(prior)==1430000]),('Source clock mismatch',frame_id);frame=np.frombuffer(pix,np.uint8).reshape(1000,1430,3).copy();alpha=np.frombuffer(av,np.uint8).reshape(1000,1430).copy();key=False
  if angle==1:
   rgb=cv2.resize(cv2.warpAffine(np.frombuffer(raw,np.uint8).reshape(1080,1920,3),np.array(reg[frame_id//6]['matrix']),(1440,1000),flags=cv2.INTER_LANCZOS4),(1430,1000),interpolation=cv2.INTER_LANCZOS4);small=cv2.resize(cv2.cvtColor(rgb,cv2.COLOR_RGB2GRAY),(357,250))
   if last!=1:
    tracker=ComponentVideoTracker({'model':model,'request':{'parameters':params}},{'width':1430,'height':1000},Path('/home/tibule12/.cache/autopromote-model-runtime/sam21-small-pinned'),model=shared);shared=tracker.model;key_index=0;since=24
   if since>=24:
    sam,_=tracker.frame(rgb,key_index);key_index+=1;since=0;key=True;Image.fromarray(sam).save(out/'neural-key-masks'/f'{frame_id:05d}.png')
   else:
    flow=flow_engine.calc(small,previous,None);flow=cv2.resize(flow,(1430,1000));flow[:,:,0]*=1430/357;flow[:,:,1]*=4;sam=cv2.remap(sam,gridx+flow[:,:,0],gridy+flow[:,:,1],cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)
   since+=1;previous=small
   # Restore actual original body alpha, never the failed photographed stencil.
   x0,y0,x1,y1=cache.box;alpha[y0:y1,x0:x1]=np.frombuffer(prior,np.uint8).reshape(1000,1430)[y0:y1,x0:x1];core=cv2.erode((sam>=128).astype(np.uint8),np.ones((5,5),np.uint8))>0;alpha[y0:y1,x0:x1][core[y0:y1,x0:x1]]=255
   binary=(sam[810:945,380:620]>=128).astype(np.uint8);tri=np.full(binary.shape,.5);tri[cv2.erode(binary,np.ones((3,3),np.uint8))>0]=1;tri[cv2.dilate(binary,np.ones((5,5),np.uint8))==0]=0
   if np.any(tri==0) and np.any(tri==1):solved=estimate_alpha_cf(rgb[810:945,380:620].astype(np.float64)/255,tri,preconditioner=lambda q:ichol(q,shifts=[.01,.1,1,10,100]),cg_kwargs={'rtol':1e-5,'maxiter':500})
   else:solved=(binary>0).astype(np.float64)
   alpha[810:945,380:620]=np.rint(solved.clip(0,1)*255).astype(np.uint8);cache.alpha=alpha[y0:y1,x0:x1];region=rgb[y0:y1,x0:x1];fg=estimate_foreground_ml(region.astype(np.float64)/255,cache.alpha.astype(np.float64)/255);opaque=(cache.alpha==0)|(cache.alpha==255);fg[opaque]=region[opaque]/255;frame[y0:y1,x0:x1]=np.array(cache.renderer.render(Image.fromarray(np.rint(fg.clip(0,1)*255).astype(np.uint8)),frame_id))
  writer.stdin.write(frame.tobytes());alpha_writer.stdin.write(alpha.tobytes());digest.update(alpha.tobytes());rows.append({'frame':frame_id,'angle':angle,'currentSamVideoInference':key,'sourceFlowIntermediate':angle==1 and not key,'currentSourceRgb':True,'originalBodyMatteRestored':angle==1})
  if i%24==0 or i==count-1 or last!=angle:
   Image.fromarray(frame).save(out/'samples'/f'after-{frame_id:05d}.jpg',quality=97);Image.fromarray(alpha).save(out/'samples'/f'alpha-{frame_id:05d}.png');(out/'progress.json').write_text(json.dumps({'completedFrames':i+1,'totalFrames':count,'sourceSeconds':frame_id/24,'elapsedSeconds':time.monotonic()-started,'visualGate':False}));print('CURRENT_NEURAL_BODY',frame_id,i+1,flush=True)
  if count<=72:Image.fromarray(frame).save(out/'samples'/f'actual-{frame_id:05d}.png')
  last=angle
 for proc in [source,picture,matte,old]:assert not proc.stdout.read(1);assert proc.wait()==0
 for proc in [writer,alpha_writer]:proc.stdin.close();assert proc.wait()==0
 final=out/'Four-minute repaired preview.mp4';subprocess.run(['ffmpeg','-nostdin','-v','error','-i',str(out/'picture.mp4'),'-ss',str(a.start),'-i',str(inp/'Four-minute repaired preview.mp4'),'-map','0:v:0','-map','1:a:0','-c','copy','-t',str(a.seconds),'-movflags','+faststart',str(final)],check=True);actual=subprocess.check_output(['ffmpeg','-nostdin','-v','error','-threads','1','-i',str(out/'Full alpha matte - lossless.mkv'),'-pix_fmt','gray','-f','hash','-hash','sha256','-']).decode().strip().split('=')[-1];assert actual==digest.hexdigest();upstream=json.load(open(inp/'assembly-verification.json'));rejected=upstream.pop('sourceBoundSleeveCorrection',None);receipt={**upstream,'seconds':a.seconds,'frames':count,'sourceStartSeconds':a.start,'previewSha256':hashlib.file_digest(final.open('rb'),'sha256').hexdigest(),'fullPrecisionAlphaDecodedSha256':actual,'rejectedPhotographedStencilAncestorPresent':bool(rejected),'currentNeuralBodyCorrection':{'model':model['id'],'parameters':params,'currentVideoTrackingAtHz':1,'sourceFlowAtHz':24,'originalBodyMatteRestored':True,'photographedForegroundStencilsRemoved':True,'gapMatting':'Source-conditioned CF, current SAM seeds, foreground colour recovery','sourceRgbAlwaysCurrent':True,'rows':rows},'visualGate':False};(out/'assembly-verification.json').write_text(json.dumps(receipt,indent=2));(out/'picture.mp4').unlink();print('CURRENT_NEURAL_BODY_COMPLETE',flush=True)
finally:
 for proc in [source,picture,matte,old,writer,alpha_writer]:
  if proc.poll() is None:proc.kill();proc.wait()
