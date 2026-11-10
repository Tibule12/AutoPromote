"""Compare actual source/model alpha repairs before committing a long render."""
from pathlib import Path
import json,time,hashlib,subprocess,copy
import numpy as np,cv2,onnxruntime as ort
from PIL import Image,ImageDraw
from pymatting import estimate_alpha_cf,estimate_foreground_ml
from pymatting.preconditioner.ichol import ichol
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
R=Path('reports/background-replacement-20261101/private/four-minute-r9');cv2.setNumThreads(3)
p=Path('/home/tibule12/.cache/autopromote-model-runtime/rvm-private-cpu-evaluation-v1/rvm_mobilenetv3_fp32.onnx');opt=ort.SessionOptions();opt.intra_op_num_threads=3;opt.inter_op_num_threads=1;model=ort.InferenceSession(str(p),sess_options=opt,providers=['CPUExecutionProvider'])
a0=np.array(Image.open('reports/background-replacement-20261101/private/fine-props-r8/native-effective-alpha/effective-alpha/alpha_0000.png'));a1=np.array(Image.open('reports/background-replacement-20261101/private/piece-review-r6/effective-alpha-second/effective-alpha/alpha_0000.png'))
scene=json.load(open('reports/background-replacement-20261101/private/fine-props-r8/native-scoped-final/final-project.autopromote.json'))['snapshot']['subjectVfxScenes'][0]['scene'];oldcap=cv2.VideoCapture('/home/tibule12/Videos/AutoPromote Background Replacement - 2026-11-01/Four-minute movement test/Full alpha matte - lossless.mkv')
face=cv2.FaceDetectorYN_create('/home/tibule12/Projects/AutoPromte/AutoPromote/python_media_worker/models/yunet/face_detection_yunet_2023mar.onnx','',(1430,1000),.6,.3,5000)
class Cache:
 artifact_sha256='0'*64;directory=None
 def __init__(self,w):self.manifest={'width':w,'height':1000,'frame_count':24,'fps':24,'fps_fraction':'24/1','source_sha256':'0'*64}
 def frame(self,i):return self.value
for t in [0,15,44,55,75,110,115,120,145,165,180,210,235]:
 start=time.monotonic();rgb=np.array(Image.open(R/f'source-{t:03d}.png'));h,w=rgb.shape[:2];angle=0 if w==1430 else 1;oldcap.set(cv2.CAP_PROP_POS_MSEC,t*1000);ok,bgr=oldcap.read();assert ok;old=cv2.cvtColor(bgr,cv2.COLOR_BGR2GRAY);old=cv2.resize(old,(w,h),interpolation=cv2.INTER_LANCZOS4);values=old.copy()
 _,pha,*_=model.run(None,{'src':rgb.transpose(2,0,1)[None].astype(np.float32)/255,'downsample_ratio':np.array([.35],np.float32),**{f'r{i}i':np.zeros((1,1,1,1),np.float32) for i in range(1,5)}});person=np.rint(pha[0,0].clip(0,1)*255).astype(np.uint8)
 n,labels,stats,_=cv2.connectedComponentsWithStats((person>24).astype(np.uint8));person[labels!=1+np.argmax(stats[1:,cv2.CC_STAT_AREA])]=0
 static=(a0 if angle==0 else a1).copy()
 if angle==0:
  # Actual refined model-backed fixed objects replace the old undersampled
  # plant/stand masks. Current neural person retains moving occlusions.
  domain=np.zeros((h,w),bool);domain[440:744,750:]=True;domain[590:711,543:751]=True
  values[domain]=np.maximum(static,person)[domain]
  hsv=cv2.cvtColor(rgb,cv2.COLOR_RGB2HSV);blue=(hsv[:,:,0]>95)&(hsv[:,:,0]<130)&(hsv[:,:,1]>55)&(hsv[:,:,2]<175);blue[:590]=False;blue[:,850:]=False;values[blue]=255;values[744:,844:]=255
  # Cropped chair at left remains a source object, with no floating soft islands.
  values[650:,:80]=np.where(old[650:,:80]>=128,255,0)
 else:
  domain=np.zeros((h,w),bool);domain[480:,:200]=True
  values[domain]=np.maximum(static,person)[domain]
  # The actual black microphone windscreen is opaque, including the model's
  # false interior alpha hole. The bounded source point is on its real core.
  values[520:615,815:875]=np.maximum(values[520:615,815:875],np.where(np.max(rgb[520:615,815:875],axis=2)<150,255,0))
 face.setInputSize((w,h));_,faces=face.detect(cv2.cvtColor(rgb,cv2.COLOR_RGB2BGR));head_seconds=0
 if faces is not None:
  x,y,fw,fh=max(faces,key=lambda q:q[2]*q[3])[:4];x0=max(0,round(x-fw*.6));x1=min(w,round(x+fw*1.55));y0=max(0,round(y-fh*.8));y1=min(h,round(y+fh*1.15));im=rgb[y0:y1,x0:x1];prior=old[y0:y1,x0:x1];mat=person[y0:y1,x0:x1]
  # Revoke only the reproduced wall wedge, using its photographed colour and
  # independent neural evidence, before solving the real full-resolution edge.
  known_bg=np.array([[225,219,203],[239,225,209],[91,99,123]],np.float32) if angle==0 else np.array([[167,162,130],[112,111,91]],np.float32)
  dist=np.min(np.linalg.norm(im.astype(np.float32)[:,:,None]-known_bg,axis=3),axis=2);candidate=(mat<24)&(dist<30);prior=prior.copy();prior[candidate]=0
  binary=(prior>=128).astype(np.uint8);tri=np.full(prior.shape,.5);tri[cv2.erode(binary,np.ones((5,5),np.uint8))>0]=1;tri[cv2.dilate(binary,np.ones((3,3),np.uint8))==0]=0;tri[candidate]=0
  tm=time.monotonic();alpha=estimate_alpha_cf(im.astype(np.float64)/255,tri,laplacian_kwargs={'epsilon':1e-6},preconditioner=lambda m:ichol(m,shifts=[.01,.1,1,10,100]),cg_kwargs={'rtol':1e-5,'maxiter':500});values[y0:y1,x0:x1]=np.rint(alpha.clip(0,1)*255).astype(np.uint8);head_seconds=time.monotonic()-tm
 cache=Cache(w);cache.value=values;effects=copy.deepcopy(scene['effects'][:2]);effects=[e for e in effects if e['type'] in ['background_replace','foreground_grade']]
 fine=next(e for e in scene['effects'] if e['type']=='foreground_refine' and e.get('decontaminate'));effects.append(copy.deepcopy(fine))
 for e in effects:e['start']=0;e['end']=1
 renderer=VfxFrameRenderer({'version':1,'source_sha256':'0'*64,'matte_sha256':'0'*64,'effects':effects},cache,lambda _:Path('reports/background-replacement-20261101/private/replacement.png'));tm=time.monotonic();result=renderer.render(Image.fromarray(rgb),0);composite_seconds=time.monotonic()-tm
 result.save(R/f'trial2-{t:03d}.png');Image.fromarray(values).save(R/f'trial2-alpha-{t:03d}.png');Image.fromarray(person).save(R/f'trial2-person-{t:03d}.png');sheet=Image.new('RGB',(w*2,h+30),(15,15,15));d=ImageDraw.Draw(sheet);sheet.paste(Image.fromarray(rgb),(0,30));sheet.paste(result,(w,30));d.text((8,8),f'Source {t}s',fill='white');d.text((w+8,8),f'Actual-source corrected trial2 | head {head_seconds:.2f}s, compose {composite_seconds:.2f}s',fill='white');sheet.save(R/f'trial2-pair-{t:03d}.jpg',quality=96);print('ACTUAL_REFERENCE_TRIAL2',t,round(head_seconds,3),round(composite_seconds,3),round(time.monotonic()-start,3),flush=True)
oldcap.release()
