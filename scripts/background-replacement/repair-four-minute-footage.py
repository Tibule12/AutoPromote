"""Bounded local repair of retained model alpha through the existing compositor.

This is footage-specific qualification orchestration, not a product model job.
RGB always decodes anew. Independent person evidence only repairs known mask
failures; source/head refinement and separate object masks retain their roles.
"""
from pathlib import Path
import argparse,copy,json,time,hashlib,subprocess,shutil,socket
import numpy as np,cv2,onnxruntime as ort
from PIL import Image
from pymatting import estimate_alpha_cf,estimate_foreground_ml
from pymatting.preconditioner.ichol import ichol
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
p=argparse.ArgumentParser();p.add_argument('output');p.add_argument('--start',type=float,default=0);p.add_argument('--seconds',type=float,default=240);p.add_argument('--full-colour',action='store_true');a=p.parse_args();out=Path(a.output).resolve();out.mkdir(exist_ok=False,parents=True);assert a.start>=0 and a.seconds>0 and a.start+a.seconds<=240
R=Path('reports/background-replacement-20261101/private/four-minute-r9');oldroot=Path('reports/background-replacement-20261101/private/long-podcast-r7');registry=json.load(open(oldroot/'registration.json'))['rows'];cuts=json.load(open(oldroot/'frame-camera-verification.json'))['exactTransitions'];cam=np.zeros(5760,np.uint8)
for i,c in enumerate(cuts):cam[c['frame']:cuts[i+1]['frame'] if i+1<len(cuts) else 5760]=c['angle']
cv2.setNumThreads(2);checkpoint=Path('/home/tibule12/.cache/autopromote-model-runtime/rvm-private-cpu-evaluation-v1/rvm_mobilenetv3_fp32.onnx');assert hashlib.file_digest(checkpoint.open('rb'),'sha256').hexdigest()=='88d4531297118f595bf2fd60f6f566aec2e559393802d1f436c380f0cbbd2828';options=ort.SessionOptions();options.intra_op_num_threads=2;options.inter_op_num_threads=1;recurrent=ort.InferenceSession(str(checkpoint),sess_options=options,providers=['CPUExecutionProvider']);socket.socket.connect=lambda *args,**kwargs:(_ for _ in ()).throw(RuntimeError('Local inference network disabled'))
static=[np.array(Image.open('reports/background-replacement-20261101/private/fine-props-r8/native-effective-alpha/effective-alpha/alpha_0000.png')),np.array(Image.open('reports/background-replacement-20261101/private/piece-review-r6/effective-alpha-second/effective-alpha/alpha_0000.png'))];references=[np.array(Image.open(R/'source-115.png')),np.array(Image.open(R/'source-055.png'))]
equipment=cv2.dilate((np.array(Image.open(R/'equipment-reference-probability.png'))>=64).astype(np.uint8),np.ones((7,7),np.uint8))>0
# Original source-referenced object matte; isolated pixel islands are not allowed
# to masquerade as foreground, while connected one-pixel stems remain intact.
for angle in range(2):
 values=static[angle];n,lab,stats,_=cv2.connectedComponentsWithStats((values>12).astype(np.uint8));valid=np.zeros(n,bool);valid[1:]=stats[1:,cv2.CC_STAT_AREA]>=4;values[~valid[lab]]=0;values[values<8]=0;values[values>247]=255
static_correction=[]
for rgb,alpha in zip(references,static):
 pix=rgb.astype(np.float64)/255;clean=estimate_foreground_ml(pix,alpha.astype(np.float64)/255);correction=clean-pix;static_correction.append(correction.astype(np.float32))
face=cv2.FaceDetectorYN_create('/home/tibule12/Projects/AutoPromte/AutoPromote/python_media_worker/models/yunet/face_detection_yunet_2023mar.onnx','',(1430,1000),.6,.3,5000)
scene=json.load(open('reports/background-replacement-20261101/private/fine-props-r8/native-scoped-final/final-project.autopromote.json'))['snapshot']['subjectVfxScenes'][0]['scene'];effects=[copy.deepcopy(e) for e in scene['effects'] if e['type'] in ['background_replace','foreground_grade']]
spill=copy.deepcopy(next(e for e in scene['effects'] if e.get('blue_spill')));spill.update({'id':'retained-source-prop-spill','detail_box':[.60,.40,1,.744],'reject_saturation':1,'reject_value':1,'reject_tolerance':0,'feather':0,'blue_spill':.9});effects.append(spill)
for e in effects:e['start']=0;e['end']=a.seconds
class Cache:
 artifact_sha256='0'*64;directory=None
 def __init__(self,w):self.manifest={'width':w,'height':1000,'frame_count':round(a.seconds*24),'fps':24,'fps_fraction':'24/1','source_sha256':'0'*64}
 def frame(self,index):return self.value
caches=[Cache(w) for w in [1430,1440]];renderers=[]
for angle,c in enumerate(caches):
 commands=copy.deepcopy(effects)
 if angle==1:commands[-1]['detail_box']=[0,.7,.27,1]
 renderers.append(VfxFrameRenderer({'version':1,'source_sha256':'0'*64,'matte_sha256':'0'*64,'effects':commands},c,lambda _:Path('reports/background-replacement-20261101/private/replacement.png')))
def decoder(file,w,h,*,source=False):
 cmd=['ffmpeg','-nostdin','-v','error','-threads','1','-ss',str(a.start),'-i',str(file),'-t',str(a.seconds)]
 if source:cmd+=['-vf','fps=24']
 return subprocess.Popen(cmd+['-an','-pix_fmt','rgb24' if source else 'gray','-f','rawvideo','pipe:1'],stdout=subprocess.PIPE)
master=Path('/home/tibule12/Videos/cam-combiner-5050c706-a6cb-48bc-ac43-8fa54f21bc1a.mp4');source=decoder(master,1920,1080,source=True);old=decoder('/home/tibule12/Videos/AutoPromote Background Replacement - 2026-11-01/Four-minute movement test/Full alpha matte - lossless.mkv',1430,1000)
def encoder(file,pix,codec):return subprocess.Popen(['ffmpeg','-nostdin','-v','error','-threads','1','-f','rawvideo','-pix_fmt',pix,'-s','1430x1000','-r','24','-i','pipe:0','-an','-c:v',codec,'-threads','2',*(['-level','3','-g','1'] if codec=='ffv1' else ['-preset','fast','-crf','16','-pix_fmt','yuv420p','-movflags','+faststart']),str(file)],stdin=subprocess.PIPE)
writer=encoder(out/'picture.mp4','rgb24','libx264');alpha_writer=encoder(out/'alpha.mkv','gray','ffv1');(out/'samples').mkdir();last=None;previous_rgb=None;previous_person=None;states=None;count=round(a.seconds*24);records=[];start=time.monotonic();last_face=[None,None]
try:
 for i in range(count):
  tick=time.monotonic();absolute=round(a.start*24)+i;angle=int(cam[absolute]);w=[1430,1440][angle];raw=source.stdout.read(1920*1080*3);prior=old.stdout.read(1430*1000);assert len(raw)==1920*1080*3 and len(prior)==1430*1000,('Source alpha clock',i)
  if i%24==0 and shutil.disk_usage(out).free<2.5*1024**3:raise RuntimeError('Disk reserve reached; source and old deliverables preserved')
  original=np.frombuffer(raw,np.uint8).reshape(1080,1920,3);rgb=cv2.warpAffine(original,np.array(registry[absolute//6]['matrix']),(w,1000),flags=cv2.INTER_LANCZOS4);base=np.frombuffer(prior,np.uint8).reshape(1000,1430).copy();base=cv2.resize(base,(w,1000),interpolation=cv2.INTER_LANCZOS4) if w!=1430 else base;values=base.copy();reset=last!=angle
  infer=reset or i%4==0
  if infer:
   if reset:states={f'r{n}i':np.zeros((1,1,1,1),np.float32) for n in range(1,5)}
   _,pha,*newstates=recurrent.run(None,{'src':rgb.transpose(2,0,1)[None].astype(np.float32)/255,'downsample_ratio':np.array([.35],np.float32),**states});states={f'r{n}i':v for n,v in enumerate(newstates,1)};person=np.rint(pha[0,0].clip(0,1)*255).astype(np.uint8)
   n,labels,stats,_=cv2.connectedComponentsWithStats((person>24).astype(np.uint8));person[labels!=1+np.argmax(stats[1:,cv2.CC_STAT_AREA])]=0
  else:
   # Source flow transports alpha evidence only; no photographed frame is held.
   small=cv2.resize(rgb,(w//3,333));previous=cv2.resize(previous_rgb,(w//3,333));flow=cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_FAST).calc(cv2.cvtColor(small,cv2.COLOR_RGB2GRAY),cv2.cvtColor(previous,cv2.COLOR_RGB2GRAY),None);flow=cv2.resize(flow,(w,1000));flow[:,:,0]*=w/(w//3);flow[:,:,1]*=1000/333;xx,yy=np.meshgrid(np.arange(w,dtype=np.float32),np.arange(1000,dtype=np.float32));person=cv2.remap(previous_person,xx+flow[:,:,0],yy+flow[:,:,1],cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)
  domain=np.zeros((1000,w),bool)
  if angle==0:
   domain[440:744,750:]=True;domain[590:711,543:751]=True;values[domain]=np.maximum(static[angle],person)[domain]
   fixed_stable=np.max(np.abs(rgb.astype(np.int16)-references[angle].astype(np.int16)),axis=2)<=24
   contact=values[590:711,543:751];contact[:]=np.maximum(np.where(equipment[590:711,543:751],static[angle][590:711,543:751],0),person[590:711,543:751])
   hsv=cv2.cvtColor(rgb,cv2.COLOR_RGB2HSV);blue=(hsv[:,:,0]>95)&(hsv[:,:,0]<130)&(hsv[:,:,1]>55)&(hsv[:,:,2]<175);blue[:590]=False;blue[:,850:]=False;values[blue]=255
   dark=np.max(rgb[700:,500:850],axis=2)<85;region=values[700:,500:850];keep=(static[angle][700:,500:850]>64)&(dark|blue[700:,500:850]);region[keep]=255
   values[744:,844:]=255
   # Recover the real cropped dark chair against its pale photographed wall.
   luminance=cv2.cvtColor(rgb[600:760,:100],cv2.COLOR_RGB2GRAY).astype(np.float32);chair=np.rint(np.clip((115-luminance)/20,0,1)*255).astype(np.uint8);values[600:760,:100]=np.maximum(values[600:760,:100],chair)
  else:
   domain[480:,:200]=True;values[domain]=np.maximum(static[angle],person)[domain]
   values[520:615,815:875]=np.maximum(values[520:615,815:875],np.where(np.max(rgb[520:615,815:875],axis=2)<150,255,0))
  face.setInputSize((w,1000));_,faces=face.detect(cv2.cvtColor(rgb,cv2.COLOR_RGB2BGR));head_box=None
  if faces is not None:
   x,y,fw,fh=max(faces,key=lambda q:q[2]*q[3])[:4];head_box=(max(0,round(x-fw*.6)),max(0,round(y-fh*.8)),min(w,round(x+fw*1.55)),min(1000,round(y+fh*1.15)));last_face[angle]=head_box
  else:head_box=last_face[angle]
  if head_box:
   x0,y0,x1,y1=head_box;im=rgb[y0:y1,x0:x1];prior=base[y0:y1,x0:x1].copy();mat=person[y0:y1,x0:x1];known_bg=np.array([[225,219,203],[239,225,209],[91,99,123]],np.float32) if angle==0 else np.array([[167,162,130],[112,111,91]],np.float32);distance=np.min(np.linalg.norm(im.astype(np.float32)[:,:,None]-known_bg,axis=3),axis=2);candidate=(mat<24)&(distance<30);prior[candidate]=0;binary=(prior>=128).astype(np.uint8);tri=np.full(prior.shape,.5);tri[cv2.erode(binary,np.ones((5,5),np.uint8))>0]=1;tri[cv2.dilate(binary,np.ones((3,3),np.uint8))==0]=0;tri[candidate]=0
   alpha=estimate_alpha_cf(im.astype(np.float64)/255,tri,laplacian_kwargs={'epsilon':1e-6},preconditioner=lambda m:ichol(m,shifts=[.01,.1,1,10,100]),cg_kwargs={'rtol':1e-5,'maxiter':500});values[y0:y1,x0:x1]=np.rint(alpha.clip(0,1)*255).astype(np.uint8)
  matte_time=time.monotonic();pixels=rgb.astype(np.float64)/255;alphaf=values.astype(np.float64)/255
  if a.full_colour:clean=estimate_foreground_ml(pixels,alphaf)
  else:
   # Solve the colour field at half source dimensions, then use the exact
   # source-resolution head solve and reviewed static-object colour evidence.
   small=cv2.resize(pixels,(w//2,500),interpolation=cv2.INTER_AREA);smalla=cv2.resize(alphaf,(w//2,500),interpolation=cv2.INTER_AREA);correction=estimate_foreground_ml(small,smalla)-small;clean=pixels+cv2.resize(correction,(w,1000),interpolation=cv2.INTER_LINEAR)
   stable=np.max(np.abs(rgb.astype(np.int16)-references[angle].astype(np.int16)),axis=2)<=24;fixed=domain&stable&(person<24);clean[fixed]=pixels[fixed]+static_correction[angle][fixed]
   if head_box:
    x0,y0,x1,y1=head_box;clean[y0:y1,x0:x1]=estimate_foreground_ml(pixels[y0:y1,x0:x1],alphaf[y0:y1,x0:x1])
  clean[(values==0)|(values==255)]=pixels[(values==0)|(values==255)];foreground=Image.fromarray(np.rint(clean.clip(0,1)*255).astype(np.uint8));caches[angle].value=values;rendered=renderers[angle].render(foreground,i)
  if w!=1430:rendered=rendered.resize((1430,1000),Image.Resampling.LANCZOS);delivered_alpha=Image.fromarray(values).resize((1430,1000),Image.Resampling.LANCZOS)
  else:delivered_alpha=Image.fromarray(values)
  writer.stdin.write(rendered.tobytes());alpha_writer.stdin.write(delivered_alpha.tobytes())
  if i%24==0 or reset or i==count-1:
   rendered.save(out/'samples'/f'after-{absolute:05d}.jpg',quality=96);Image.fromarray(rgb).resize((1430,1000)).save(out/'samples'/f'source-{absolute:05d}.jpg',quality=96);delivered_alpha.save(out/'samples'/f'alpha-{absolute:05d}.png')
  records.append({'frame':absolute,'angle':angle,'reset':reset,'independentPersonInference':infer,'headBox':head_box,'maskSha256':hashlib.sha256(delivered_alpha.tobytes()).hexdigest(),'sourceRgbAlwaysDecodedCurrentFrame':True,'matteSeconds':matte_time-tick,'frameSeconds':time.monotonic()-tick});previous_rgb=rgb;previous_person=person;last=angle
  if i%24==0 or i==count-1:
   status={'completedFrames':i+1,'totalFrames':count,'sourceSeconds':absolute/24,'elapsedSeconds':time.monotonic()-start,'remainingDiskBytes':shutil.disk_usage(out).free,'creativeGate':False};(out/'progress.json').write_text(json.dumps(status));print(json.dumps(status),flush=True)
 assert not source.stdout.read(1) and not old.stdout.read(1);assert source.wait()==0 and old.wait()==0
 for process in [writer,alpha_writer]:process.stdin.close();assert process.wait()==0
 subprocess.run(['ffmpeg','-nostdin','-v','error','-i',str(out/'picture.mp4'),'-ss',str(a.start),'-i',str(master),'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','192k','-t',str(a.seconds),'-movflags','+faststart',str(out/'replacement.mp4')],check=True)
 (out/'receipt.json').write_text(json.dumps({'source':str(master),'startSeconds':a.start,'seconds':a.seconds,'frames':count,'records':records,'elapsedSeconds':time.monotonic()-start,'sourceCameraRegistration':'Retained independent exact 24fps camera IDs, 4Hz original registration','sourceRgbAlwaysDecodedCurrentFrame':True,'sourceRgbFrozen':False,'privateGplRvmGuidanceNotProductRegistry':True,'newBiRefNetNotUsed':True,'existingSharedCompositor':True,'nativeModelArtifactQualification':False,'fullColourSolve':a.full_colour,'creativeGate':False,'paidCloud':False},indent=2));print('ACTUAL_REPAIRED_INTERVAL_COMPLETE',flush=True)
finally:
 for proc in [source,old,writer,alpha_writer]:
  if proc.poll() is None:proc.kill();proc.wait()
