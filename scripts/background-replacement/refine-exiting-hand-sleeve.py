"""Retain the actual sleeve after the separately tracked hand exits its ROI."""
from pathlib import Path
import argparse,subprocess,json,hashlib,importlib.util,shutil
import numpy as np,cv2,onnxruntime as ort
from PIL import Image
from pymatting import estimate_alpha_cf,estimate_foreground_ml
from pymatting.preconditioner.ichol import ichol
s=importlib.util.spec_from_file_location('roi',Path(__file__).with_name('repair-microphone-windscreen.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
p=argparse.ArgumentParser();p.add_argument('root');a=p.parse_args();r=Path(a.root);out=r/'hand-correction-224-226';rejected=out/'rejected-frozen-source-fallback';rejected.mkdir(exist_ok=False);reg=json.load(open('reports/background-replacement-20261101/private/long-podcast-r7/registration.json'))['rows'];opts=ort.SessionOptions();opts.intra_op_num_threads=1;opts.inter_op_num_threads=1;model=ort.InferenceSession('/home/tibule12/.cache/autopromote-model-runtime/rvm-private-cpu-evaluation-v1/rvm_mobilenetv3_fp32.onnx',sess_options=opts,providers=['CPUExecutionProvider']);states={f'r{j}i':np.zeros((1,1,1,1),np.float32) for j in range(1,5)};cache=m.MicrophoneRepair((268,330,487,730));source=subprocess.Popen(['ffmpeg','-nostdin','-v','error','-threads','1','-ss','224','-i','/home/tibule12/Videos/cam-combiner-5050c706-a6cb-48bc-ac43-8fa54f21bc1a.mp4','-vf',r'fps=24,select=between(n\,43\,47),setpts=PTS-STARTPTS','-frames:v','5','-vsync','0','-an','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],stdout=subprocess.PIPE);rows=[]
try:
 for index in range(43,48):
  raw=source.stdout.read(6220800);assert len(raw)==6220800;rgb=cv2.warpAffine(np.frombuffer(raw,np.uint8).reshape(1080,1920,3),np.array(reg[(5376+index)//6]['matrix']),(1440,1000),flags=cv2.INTER_LANCZOS4);rgb=cv2.resize(rgb,(1430,1000),interpolation=cv2.INTER_LANCZOS4);_,pha,*new=model.run(None,{'src':rgb.transpose(2,0,1)[None].astype(np.float32)/255,'downsample_ratio':np.array([.35],np.float32),**states});states={f'r{j}i':v for j,v in enumerate(new,1)};x0,y0,x1,y1=cache.box;im=rgb[y0:y1,x0:x1];person=pha[0,0,y0:y1,x0:x1];binary=(person>=.5).astype(np.uint8);tri=np.full(binary.shape,.5);tri[cv2.erode(binary,np.ones((3,3),np.uint8))>0]=1;tri[cv2.dilate(binary,np.ones((7,7),np.uint8))==0]=0
  alpha=estimate_alpha_cf(im.astype(np.float64)/255,tri,laplacian_kwargs={'epsilon':1e-6},preconditioner=lambda v:ichol(v,shifts=[.01,.1,1,10,100]),cg_kwargs={'rtol':1e-5,'maxiter':500}) if np.any(tri==1) and np.any(tri==0) else np.where(binary,1.,0.);cache.alpha=np.rint(alpha.clip(0,1)*255).astype(np.uint8);fore=estimate_foreground_ml(im.astype(np.float64)/255,alpha);fore[(cache.alpha==0)|(cache.alpha==255)]=im[(cache.alpha==0)|(cache.alpha==255)]/255;composite=cache.renderer.render(Image.fromarray(np.rint(fore.clip(0,1)*255).astype(np.uint8)),5376+index);name=f'{index:04d}.png'
  for folder in ['corrected-alpha','hand-composite']:
   target=rejected/f'{folder}-{name}';shutil.copy2(out/folder/name,target)
  Image.fromarray(cache.alpha).save(out/'corrected-alpha'/name);composite.save(out/'hand-composite'/name);rows.append({'index':index,'sourceFrame':5376+index,'sourceSeconds':224+index/24,'correctedAlphaSha256':hashlib.sha256(cache.alpha.tobytes()).hexdigest(),'reason':'Separate hand component leaves ROI; actual current neural person/sleeve evidence retains underlying cloth','oldFallbackRetained':True});print('ACTUAL_EXITING_HAND_SLEEVE_REFINED',index,flush=True)
 assert not source.stdout.read(1) and source.wait()==0
finally:
 if source.poll() is None:source.kill();source.wait()
(out/'sleeve-fallback-repair.json').write_text(json.dumps({'rows':rows,'actualCurrentSourceRgb':True,'privateCpuGuidanceOnly':True,'nativeArtifactQualification':False,'paidCloud':False,'visualGate':False},indent=2))
