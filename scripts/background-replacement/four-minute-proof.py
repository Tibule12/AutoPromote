"""Private continuous-footage qualification using the existing tracker/compositor.

All model work is local, source-clock bound, with explicit resets at camera cuts.
This executable is review orchestration, not another editing/rendering engine.
"""
import argparse,copy,json,time,subprocess,hashlib,sys,socket,shutil,signal
from pathlib import Path
import cv2,numpy as np,torch
from PIL import Image
from transformers import VitMatteForImageMatting,Sam2VideoConfig,Sam2VideoModel
from model_workers.adapters.component_segmentation import ComponentVideoTracker
from model_workers.adapters.temporal_alpha import make_trimap
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
from python_media_worker.studio_subject_matte import canonical_hash,mask_geometry
from model_workers.common import sha
p=argparse.ArgumentParser();p.add_argument('root');p.add_argument('--start',type=float,default=0);p.add_argument('--seconds',type=float,default=240);p.add_argument('--stride',type=int,default=1);p.add_argument('--temporal-colour',action='store_true');p.add_argument('--tracker-size',type=int,default=1024,choices=[512,1024]);p.add_argument('--recurrent-person-guidance',action='store_true');p.add_argument('--scene-review-json',type=Path);p.add_argument('--bounded-object-evidence',action='store_true');a=p.parse_args();root=Path(a.root);out=root/f'proof-{a.start:g}-{a.seconds:g}';out.mkdir(exist_ok=False)
assert a.start>=0 and 0<a.seconds<=240 and a.start+a.seconds<=240 and a.stride in [1,2,3,4]
def stop(_signum,_frame):raise KeyboardInterrupt('Requested local render interruption')
signal.signal(signal.SIGTERM,stop)
# No cloud service, model fetch or provider execution is reachable from inference.
socket.socket.connect=lambda *args,**kw:(_ for _ in ()).throw(RuntimeError('Local inference network disabled'))
cv2.setNumThreads(2);torch.set_num_threads(2);torch.set_num_interop_threads(1)
assert torch.cuda.get_device_name()=='Quadro M1200'
registry=json.load(open('config/model-runtime/registry.v1.json'));specmodel=next(v for v in registry['models'] if v['id']=='sam21-multiobject-cpu-v2');matte_model=next(v for v in registry['models'] if v['id']=='vitmatte-small-temporal-cpu-v2')
model_dir=Path('/home/tibule12/.cache/autopromote-model-runtime/sam21-small-pinned');alpha_dir=Path('/home/tibule12/.cache/autopromote-model-runtime/vitmatte-small-pinned')
face_model='/home/tibule12/Projects/AutoPromte/AutoPromote/python_media_worker/models/yunet/face_detection_yunet_2023mar.onnx'
detector=cv2.FaceDetectorYN_create(face_model,'',(1430,1000),.7,.3,5000)
assert sha(alpha_dir/'model.safetensors')==matte_model['weights'][0]['sha256']
matting=VitMatteForImageMatting.from_pretrained(alpha_dir,local_files_only=True).to('cuda').eval()
recurrent=None;recurrent_states=None
if a.recurrent_person_guidance:
 import onnxruntime as ort
 checkpoint=Path('/home/tibule12/.cache/autopromote-model-runtime/rvm-private-cpu-evaluation-v1/rvm_mobilenetv3_fp32.onnx')
 assert sha(checkpoint)=='88d4531297118f595bf2fd60f6f566aec2e559393802d1f436c380f0cbbd2828'
 options=ort.SessionOptions();options.intra_op_num_threads=2;options.inter_op_num_threads=1
 recurrent=ort.InferenceSession(str(checkpoint),sess_options=options,providers=['CPUExecutionProvider'])
snapshot=json.load(open('reports/background-replacement-20261101/private/piece-review-r6/final-detail-pass/native-final/two-speaker-final-project.autopromote.json'))['snapshot'];scenes=snapshot['subjectVfxScenes'];reg=json.load(open(root/'registration.json'))['rows'];master=Path('/home/tibule12/Videos/cam-combiner-5050c706-a6cb-48bc-ac43-8fa54f21bc1a.mp4')
if a.scene_review_json:
 assert a.scene_review_json.is_file() and a.scene_review_json.stat().st_size<100000
 scenes=json.load(open(a.scene_review_json));assert len(scenes)==2
# Existing object selection guidance is preserved and re-evaluated on CURRENT RGB.
baseparams=[]
for angle,s in enumerate(scenes):
 prompt=s['scene']['prompt'];components=copy.deepcopy(s['maskComponents'])
 for c in components:c['shotPrompts']=[]
 if angle==1:
  # The fixed microphone windscreen is a separate foreground object, even
  # when its dark core contrasts with pale clothing rather than the old wall.
  components[0]['points'].extend([{'position':[.60,.55],'label':1},{'position':[.60,.59],'label':1}])
 params={'subjectId':f'speaker-{angle+1}','initialBox':([.04,.02,.68,1] if angle==0 else [.20,0,1,1]),'points':[{'position':v,'label':l} for v,l in zip(prompt['points'],prompt['labels'])],'shotPrompts':[],'components':components}
 # Widen the actual moving person box, never a frozen silhouette.
 baseparams.append(params)
class FrameCache:
 def __init__(self,w,h):
  self.value=None;self.directory=None;self.artifact_sha256='0'*64;self.manifest={'version':1,'source_sha256':'0'*64,'width':w,'height':h,'frame_count':round(a.seconds*24),'fps':24,'fps_fraction':'24/1'}
 def frame(self,index):return self.value
renderers=[];caches=[]
for angle,s in enumerate(scenes):
 w=1430 if angle==0 else 1440;cache=FrameCache(w,1000);effects=copy.deepcopy(s['scene']['effects'])
 for e in effects:e['start']=0;e['end']=a.seconds
 plan={'version':1,'source_sha256':'0'*64,'matte_sha256':'0'*64,'effects':effects};renderers.append(VfxFrameRenderer(plan,cache,lambda _:Path('reports/background-replacement-20261101/private/replacement.png')));caches.append(cache)
# Review outputs retain lossless alpha and each model object separately. No PNG
# RGB dump is retained for thousands of frames; source is decoded sequentially.
def encoder(file,width,height,pix='rgb24',codec='libx264'):
 return subprocess.Popen(['ffmpeg','-nostdin','-v','error','-f','rawvideo','-pix_fmt',pix,'-s',f'{width}x{height}','-r','24','-i','pipe:0','-an','-c:v',codec,*(['-level','3','-g','1'] if codec=='ffv1' else ['-preset','fast','-crf','16','-pix_fmt','yuv420p','-movflags','+frag_keyframe+empty_moov+default_base_moof','-g','48']),str(file)],stdin=subprocess.PIPE,stderr=subprocess.PIPE)
writer=encoder(out/'picture.mp4',1430,1000);aw=encoder(out/'alpha.mkv',1430,1000,'gray','ffv1')
decoder=subprocess.Popen(['ffmpeg','-nostdin','-v','error','-threads','2','-i',str(master),'-ss',str(a.start),'-t',str(a.seconds),'-vf','fps=24','-an','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
sam_config=Sam2VideoConfig.from_pretrained(model_dir,local_files_only=True)
if a.tracker_size!=1024:
 sam_config.image_size=a.tracker_size;sam_config.prompt_encoder_config.image_size=a.tracker_size;sam_config.vision_config.backbone_config.image_size=[a.tracker_size]*2;sam_config.vision_config.backbone_feature_sizes=[[a.tracker_size//4]*2,[a.tracker_size//8]*2,[a.tracker_size//16]*2];sam_config.memory_attention_rope_feat_sizes=[a.tracker_size//16]*2
sam_model=Sam2VideoModel.from_pretrained(model_dir,config=sam_config,local_files_only=True).to('cuda').eval()
tracker=None;last_angle=None;local_index=0;previous_rgb=None;previous_plane=None;previous_alpha=None;previous_colour=None;records=[];timings=[];start=time.monotonic();(out/'frames').mkdir();count=round(a.seconds*24)
def alpha_inference(rgb,evidence,limit=1024,radius=8,objects=None):
 binary=(evidence>=128).astype(np.uint8);tri=make_trimap(binary,radius,evidence,objects);inside=tri==255;outside=tri==0;h,w=tri.shape
 image=torch.from_numpy(rgb.copy()).to('cuda').permute(2,0,1).float()/127.5-1;mask=torch.from_numpy(tri).to('cuda')[None].float()/255
 inputs=torch.cat((image,mask),0)[None];scale=min(1,limit/max(h,w));ih,iw=round(h*scale),round(w*scale)
 if scale<1:inputs=torch.cat((torch.nn.functional.interpolate(inputs[:,:3],(ih,iw),mode='bilinear',align_corners=False,antialias=True),torch.nn.functional.interpolate(inputs[:,3:],(ih,iw),mode='nearest')),1)
 inputs=torch.nn.functional.pad(inputs,(0,-iw%32,0,-ih%32))
 with torch.inference_mode():v=matting(pixel_values=inputs).alphas[:,:,:ih,:iw];v=torch.nn.functional.interpolate(v,(h,w),mode='bilinear',align_corners=False)[0,0].cpu().numpy()
 v=v.clip(0,1);v[inside]=1;v[outside]=0;return np.rint(v*255).astype(np.uint8)
def mask_frames():
 tracker=None;current_model=sam_model;tracking_last_angle=None;local_index=0
 tracking_previous_rgb=None;tracking_previous_plane=None;tracking_previous_alpha=None
 for i in range(count):
  if i%24==0 and shutil.disk_usage(root).free<2*1024**3:raise RuntimeError('Preserving at least 2GiB free disk; local review stopped before further writes')
  tick=time.monotonic();raw=decoder.stdout.read(1920*1080*3);assert len(raw)==1920*1080*3,('source ended',i)
  original=np.frombuffer(raw,np.uint8).reshape(1080,1920,3);absolute=round(a.start*24)+i;row=reg[min(len(reg)-1,absolute//6)];angle=row['angle'];w=1430 if angle==0 else 1440
  matrix=np.array(row['matrix']);rgb=cv2.warpAffine(original,matrix,(w,1000),flags=cv2.INTER_LANCZOS4)
  # The room registrations are reviewed at 4Hz; never propagate across shots.
  reset=tracking_last_angle!=angle
  if reset:
   params=copy.deepcopy(baseparams[angle]);detector.setInputSize((w,1000));_,faces=detector.detect(cv2.cvtColor(rgb,cv2.COLOR_RGB2BGR))
   if faces is None:raise ValueError(f'Camera reset at {absolute/24}s needs a reviewed person click')
   face=max(faces,key=lambda f:f[2]*f[3]);fx,fy,fw,fh=map(float,face[:4])
   # A point directly below the face can land on the microphone, which is a
   # separate object. Seed actual photographed cloth and leg interiors too.
   params['points']=[{'position':[(fx+fw*.5)/w,(fy+fh*.55)/1000],'label':1},
     *[{'position':v,'label':1} for v in ([[.20,.60],[.38,.80],[.25,.93]] if angle==0 else [[.80,.60],[.88,.75],[.60,.96],[.35,.85],[.35,.95],[.40,.82]])],
     {'position':[.90 if angle==0 else .05,.3],'label':0}]
   params['points'].extend(scenes[angle].get('reviewPersonPoints',[]))
   tracker=ComponentVideoTracker({'model':specmodel,'request':{'parameters':params}},{'width':w,'height':1000},model_dir,device='cuda',model=current_model);current_model=tracker.model;local_index=0;tracking_previous_rgb=None
   recurrent_states={f'r{n}i':np.zeros((1,1,1,1),np.float32) for n in range(1,5)}
  if reset or i%a.stride==0:
   union,planes=tracker.frame(rgb,local_index);local_index+=1;segmented=True
   if recurrent is not None:
    _,recurrent_alpha,*states=recurrent.run(None,{'src':rgb.transpose(2,0,1)[None].astype(np.float32)/255,'downsample_ratio':np.array([.35],np.float32),**recurrent_states})
    recurrent_states={f'r{n}i':v for n,v in enumerate(states,1)}
    person_guidance=np.rint(recurrent_alpha[0,0].clip(0,1)*255).astype(np.uint8)
    scope=np.zeros((1000,w),bool);x0,y0,x1,y1=params['initialBox'];scope[round(y0*1000):round(y1*1000),round(x0*w):round(x1*w)]=True
    # The recurrent person matte is independent evidence. Gating it by a SAM
    # object that loses clothing would reproduce that exact segmentation hole.
    # The source-camera person region excludes the baked picture-in-picture.
    person_guidance[~scope]=0
    if scenes[angle].get('reviewRecurrentBodyOnly'):
     # This trial isolates a reproduced head false positive from recurrent
     # body guidance. It is not a product model or automatic face correction.
     person_guidance[:round((fy+fh*1.3))]=0
    planes[0]=np.maximum(planes[0],person_guidance);union=np.maximum.reduce(planes)
  else:
   # Source motion warps evidence only. It never warps/freezes photographed RGB.
   gray=cv2.cvtColor(rgb,cv2.COLOR_RGB2GRAY);prior=cv2.cvtColor(tracking_previous_rgb,cv2.COLOR_RGB2GRAY);flow=cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM).calc(gray,prior,None);xx,yy=np.meshgrid(np.arange(w,dtype=np.float32),np.arange(1000,dtype=np.float32));planes=[cv2.remap(v,xx+flow[:,:,0],yy+flow[:,:,1],cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT) for v in tracking_previous_plane];union=np.maximum.reduce(planes);segmented=False
  object_evidence=np.maximum.reduce(planes[1:])>=24
  if a.bounded_object_evidence:
   object_evidence&=cv2.dilate((np.maximum.reduce(planes[1:])>=128).astype(np.uint8),np.ones((5,5),np.uint8))>0
  tracked_at=time.monotonic()
  if segmented:
   values=alpha_inference(rgb,union,objects=object_evidence)
   # Full source-resolution matting around head/ears/cap avoids proxy-scaled halo.
   head=[(250,0,790,455),(380,0,1250,560)][angle];x0,y0,x1,y1=head;values[y0:y1,x0:x1]=alpha_inference(rgb[y0:y1,x0:x1],planes[0][y0:y1,x0:x1],limit=1024,radius=12)
   prop=[(800,440,1430,1000),(0,480,430,1000)][angle];x0,y0,x1,y1=prop
   values[y0:y1,x0:x1]=alpha_inference(rgb[y0:y1,x0:x1],union[y0:y1,x0:x1],limit=1024,radius=8,objects=object_evidence[y0:y1,x0:x1])
  else:
   values=cv2.remap(tracking_previous_alpha,xx+flow[:,:,0],yy+flow[:,:,1],cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)
   # New scene/occlusion colours must be re-evaluated, never hidden by stale alpha.
   warped=cv2.remap(tracking_previous_rgb,xx+flow[:,:,0],yy+flow[:,:,1],cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)
   changed=np.max(np.abs(rgb.astype(np.int16)-warped.astype(np.int16)),axis=2)>32
   boundary=(values>0)&(values<255)
   if np.count_nonzero(changed&boundary)>max(512,np.count_nonzero(boundary)*.10):
    values=alpha_inference(rgb,union,objects=object_evidence)
  tracking_previous_rgb=rgb;tracking_previous_plane=planes;tracking_previous_alpha=values;tracking_last_angle=angle
  yield {'index':i,'rgb':rgb,'values':values,'planes':planes,'angle':angle,'width':w,'absolute':absolute,'reset':reset,'segmented':segmented,'tick':tick,'trackSeconds':tracked_at-tick,'matteSeconds':time.monotonic()-tracked_at,'flow':None if segmented else flow,'xx':None if segmented else xx,'yy':None if segmented else yy}

import queue,threading
work_queue=queue.Queue(maxsize=2);stop_event=threading.Event()
def send(kind,value):
 while not stop_event.is_set():
  try:work_queue.put((kind,value),timeout=.25);return
  except queue.Full:continue
def mask_producer():
 try:
  for item in mask_frames():
   if stop_event.is_set():return
   send('frame',item)
 except BaseException as error:send('error',error)
 finally:send('done',None)
producer=threading.Thread(target=mask_producer,name='owned-source-mask-producer',daemon=True)
producer.start()
try:
 for i in range(count):
  kind,item=work_queue.get()
  if kind=='error':raise item
  if kind!='frame' or item['index']!=i:raise RuntimeError('Source mask pipeline lost frame order')
  rgb,values,planes,angle,w,absolute,reset,segmented,tick=(item[k] for k in ['rgb','values','planes','angle','width','absolute','reset','segmented','tick'])
  flow,xx,yy=(item[k] for k in ['flow','xx','yy'])
  caches[angle].value=values
  matted_at=time.monotonic()
  # Observe the exact effective alpha returned by the ordinary compositor;
  # never repeat its expensive foreground-colour solve just for diagnostics.
  renderer=renderers[angle];prepare=renderer._prepare_foreground;observed=[]
  def observe(*args):
   temporal=a.temporal_colour and not segmented
   if temporal:
    image,mask,effects,fw,fh=args
    effects=[{**e,'decontaminate':0} if e['type']=='foreground_refine' else e for e in effects]
    foreground,effective=prepare(image,mask,effects,fw,fh)
    correction=cv2.remap(previous_colour,xx+flow[:,:,0],yy+flow[:,:,1],cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)
    warped_source=cv2.remap(previous_rgb,xx+flow[:,:,0],yy+flow[:,:,1],cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)
    valid=np.max(np.abs(rgb.astype(np.int16)-warped_source.astype(np.int16)),axis=2)<=24
    alpha_values=np.asarray(effective);valid&=(alpha_values>0)&(alpha_values<255)
    corrected=np.asarray(foreground).astype(np.float32)+correction*valid[:,:,None]
    prepared=Image.fromarray(np.rint(corrected).clip(0,255).astype(np.uint8)),effective
   else:prepared=prepare(*args)
   observed.append(prepared);return prepared
  renderer._prepare_foreground=observe
  result=renderers[angle].render(Image.fromarray(rgb),i)
  renderer._prepare_foreground=prepare;foreground,effective=observed[0]
  previous_colour=np.asarray(foreground).astype(np.float32)-rgb.astype(np.float32)
  if w!=1430:result=result.resize((1430,1000),Image.Resampling.LANCZOS);effective=effective.resize((1430,1000),Image.Resampling.LANCZOS)
  writer.stdin.write(result.tobytes());aw.stdin.write(effective.tobytes())
  if i%24==0 or reset or i==count-1:
   result.save(out/'frames'/f'replacement-{i:05d}.jpg',quality=96);Image.fromarray(rgb).resize((1430,1000)).save(out/'frames'/f'source-{i:05d}.jpg',quality=96)
   Image.fromarray(values).save(out/'frames'/f'alpha-{i:05d}.png')
   for j,plane in enumerate(planes):Image.fromarray(plane).save(out/'frames'/f'object-{i:05d}-{j}.png')
  records.append({'frame':i,'sourceFrame24':absolute,'sourceTime':absolute/24,'angle':angle,'cameraReset':reset,'modelInference':segmented,'alphaSha256':hashlib.sha256(values.tobytes()).hexdigest(),'effectiveAlphaSha256':hashlib.sha256(effective.tobytes()).hexdigest(),'seconds':time.monotonic()-tick,**mask_geometry(np.asarray(effective))})
  if i%24==0:(out/'progress.json').write_text(json.dumps({'completedFrames':i+1,'totalFrames':count,'sourceSeconds':absolute/24,'runtimeSeconds':time.monotonic()-start,'remainingDiskBytes':shutil.disk_usage(root).free,'visualGate':False}))
  previous_rgb=rgb
  if i%6==0:print(json.dumps({'event':'actual_moving_composite','frame':i,'total':count,'sourceSeconds':absolute/24,'angle':angle,'runtimeSeconds':time.monotonic()-start,'frameSeconds':records[-1]['seconds'],'trackSeconds':item['trackSeconds'],'matteSeconds':item['matteSeconds'],'compositeSeconds':time.monotonic()-matted_at}),flush=True)
 assert not decoder.stdout.read(1) and decoder.wait()==0
 writer.stdin.close();aw.stdin.close();assert writer.wait()==0 and aw.wait()==0
 subprocess.run(['ffmpeg','-nostdin','-v','error','-i',str(out/'picture.mp4'),'-ss',str(a.start),'-i',str(master),'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','192k','-t',str(a.seconds),'-movflags','+faststart',str(out/'replacement.mp4')],check=True)
 (out/'proof.json').write_text(json.dumps({'source':str(master),'startSeconds':a.start,'durationSeconds':a.seconds,'frames':count,'records':records,'runtimeSeconds':time.monotonic()-start,'modelStride':a.stride,'trackerInputSize':a.tracker_size,'temporalForegroundColourEvaluation':a.temporal_colour,'recurrentPersonGuidancePrivateEvaluation':a.recurrent_person_guidance,'gpu':'local Quadro M1200','commercialWeights':'existing pinned Apache-2.0 SAM2.1/ViTMatte; optional cached RVM GPL-3.0 for private local evaluation only, not distributed or integrated into product registry','nativeStudioQualification':False,'visualGate':False,'paidCloudInference':False},indent=2));print('PROOF_COMPLETE',out,flush=True)
finally:
 stop_event.set()
 for proc in [decoder,writer,aw]:
  if proc.poll() is None:proc.kill();proc.wait()
