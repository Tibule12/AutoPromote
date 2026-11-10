"""Re-composite only reviewed contact/prop repairs on actual long moving frames."""
import argparse,importlib.util,json,subprocess,time,hashlib,copy,socket
from pathlib import Path
import cv2,numpy as np,onnxruntime as ort
from PIL import Image
from pymatting import estimate_alpha_cf,estimate_foreground_ml
from pymatting.preconditioner.ichol import ichol
s=importlib.util.spec_from_file_location('contact',Path(__file__).with_name('contact-overlap-repair.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
p=argparse.ArgumentParser();p.add_argument('input');p.add_argument('output');p.add_argument('--start',type=float,required=True);p.add_argument('--seconds',type=float,default=60);p.add_argument('--microphone-only',action='store_true');p.add_argument('--reveal-only',action='store_true');a=p.parse_args();inp=Path(a.input);out=Path(a.output);out.mkdir(parents=True,exist_ok=False);assert a.start>=0 and a.start+a.seconds<=240;cv2.setNumThreads(1);socket.socket.connect=lambda *a,**k:(_ for _ in ()).throw(RuntimeError('Local review egress denied'))
micro_spec=importlib.util.spec_from_file_location('microphone',Path(__file__).with_name('repair-microphone-windscreen.py'));micro_module=importlib.util.module_from_spec(micro_spec);micro_spec.loader.exec_module(micro_module);microphone=micro_module.MicrophoneRepair()
reveal_spec=importlib.util.spec_from_file_location('revealed_background',Path(__file__).with_name('repair-revealed-background.py'));reveal_module=importlib.util.module_from_spec(reveal_spec);reveal_spec.loader.exec_module(reveal_module);revealed=reveal_module.RevealedBackgroundRepair()
r=m.R;repair=m.OverlapRepair();cache=m.Cache();renderer=m.compositor(cache);reg=json.load(open('reports/background-replacement-20261101/private/long-podcast-r7/registration.json'))['rows'];cuts=json.load(open('reports/background-replacement-20261101/private/long-podcast-r7/frame-camera-verification.json'))['exactTransitions'];cam=np.zeros(5760,np.uint8)
for i,c in enumerate(cuts):cam[c['frame']:cuts[i+1]['frame'] if i+1<len(cuts) else 5760]=c['angle']
# The plant's current source is never frozen. The retained separate-object soft
# alpha supplies trimap seeds, refined once for this stationary registered rig.
x0,y0,x1,y1=960,440,1430,744;ref=repair.reference[y0:y1,x0:x1];aa=repair.static[y0:y1,x0:x1];binary=(aa>=128).astype(np.uint8);tri=np.full(aa.shape,.5);tri[cv2.erode(binary,np.ones((3,3),np.uint8))>0]=1;tri[cv2.dilate(binary,np.ones((3,3),np.uint8))==0]=0;plant=estimate_alpha_cf(ref.astype(np.float64)/255,tri,laplacian_kwargs={'epsilon':1e-6},preconditioner=lambda v:ichol(v,shifts=[.01,.1,1,10,100]),cg_kwargs={'rtol':1e-5,'maxiter':500});plant_u8=np.rint(plant.clip(0,1)*255).astype(np.uint8);chair_alpha=np.array(Image.open(r/'left-chair-refined-alpha.png'));chair_alpha[820:]=255;plant_delta=estimate_foreground_ml(ref.astype(np.float64)/255,plant)-ref.astype(np.float64)/255
opts=ort.SessionOptions();opts.intra_op_num_threads=1;opts.inter_op_num_threads=1;neural=ort.InferenceSession('/home/tibule12/.cache/autopromote-model-runtime/rvm-private-cpu-evaluation-v1/rvm_mobilenetv3_fp32.onnx',sess_options=opts,providers=['CPUExecutionProvider']);states=None;person=None
count=round(a.seconds*24);master='/home/tibule12/Videos/cam-combiner-5050c706-a6cb-48bc-ac43-8fa54f21bc1a.mp4'
def decode(file,pixel,seek=0,source=False):
 cmd=['ffmpeg','-nostdin','-v','error','-threads','1','-ss',str(seek),'-i',str(file),'-t',str(a.seconds)];cmd+=['-vf','fps=24'] if source else [];return subprocess.Popen(cmd+['-an','-pix_fmt',pixel,'-f','rawvideo','pipe:1'],stdout=subprocess.PIPE)
def encode(file,pixel,codec):return subprocess.Popen(['ffmpeg','-nostdin','-v','error','-f','rawvideo','-pix_fmt',pixel,'-s','1430x1000','-r','24','-i','pipe:0','-an','-c:v',codec,'-threads','1',*(['-level','3','-g','1'] if codec=='ffv1' else ['-preset','fast','-crf','16','-pix_fmt','yuv420p','-movflags','+faststart']),str(file)],stdin=subprocess.PIPE)
source=decode(master,'rgb24',a.start,True);old=decode('/home/tibule12/Videos/AutoPromote Background Replacement - 2026-11-01/Four-minute movement test/Full alpha matte - lossless.mkv','gray',a.start);input_offset=a.start-json.load(open(inp/'receipt.json'))['startSeconds'];assert input_offset>=0;picture=decode(inp/'picture.mp4','rgb24',input_offset);matte=decode(inp/'alpha.mkv','gray',input_offset);writer=encode(out/'picture.mp4','rgb24','libx264');alpha_writer=encode(out/'alpha.mkv','gray','ffv1');(out/'samples').mkdir();start=time.monotonic();rows=[];last=None
try:
 for i in range(count):
  absolute=round(a.start*24)+i;angle=int(cam[absolute]);raw=source.stdout.read(1920*1080*3);prior=old.stdout.read(1430000);base=picture.stdout.read(4290000);alpha=matte.stdout.read(1430000);assert len(raw)==6220800 and len(prior)==1430000 and len(base)==4290000 and len(alpha)==1430000,('Exact frame clock lost',absolute)
  w=[1430,1440][angle];rgb=cv2.warpAffine(np.frombuffer(raw,np.uint8).reshape(1080,1920,3),np.array(reg[absolute//6]['matrix']),(w,1000),flags=cv2.INTER_LANCZOS4);current=np.frombuffer(alpha,np.uint8).reshape(1000,1430).copy();frame=np.frombuffer(base,np.uint8).reshape(1000,1430,3).copy();changed=0
  if angle==0 and not (a.microphone_only or a.reveal_only):
   if i%4==0 or last!=angle:
    if last!=angle:states={f'r{j}i':np.zeros((1,1,1,1),np.float32) for j in range(1,5)}
    _,pha,*nextstates=neural.run(None,{'src':rgb.transpose(2,0,1)[None].astype(np.float32)/255,'downsample_ratio':np.array([.2],np.float32),**states});states={f'r{j}i':v for j,v in enumerate(nextstates,1)};person=np.rint(pha[0,0].clip(0,1)*255).astype(np.uint8)
   values=repair.alpha(rgb,np.frombuffer(prior,np.uint8).reshape(1000,1430),current,person);values[y0:y1,x0:x1]=plant_u8
   # Retain the actual cropped chair and yellow cushion as opaque foreground.
   left=rgb[600:,:160];hsv=cv2.cvtColor(left,cv2.COLOR_RGB2HSV);blue=(hsv[:,:,0]>95)&(hsv[:,:,0]<130)&(hsv[:,:,1]>55);values[600:,:160]=np.maximum(chair_alpha[600:],np.where(blue,255,values[600:,:160]));values[820:,:160]=255
   fg=repair.foreground(rgb,values);clean=rgb[y0:y1,x0:x1].astype(np.float32)/255+plant_delta;clean[(plant_u8==0)|(plant_u8==255)]=rgb[y0:y1,x0:x1][(plant_u8==0)|(plant_u8==255)]/255;clean[:,:,2]-=np.maximum(0,clean[:,:,2]-np.minimum(clean[:,:,0],clean[:,:,1]))*.9;fg[y0:y1,x0:x1]=np.rint(clean.clip(0,1)*255).astype(np.uint8);cache.value=values;composite=np.array(renderer.render(Image.fromarray(fg),absolute));cx0,cy0,cx1,cy1=m.CONTACT;frame[cy0:cy1,cx0:cx1]=composite[cy0:cy1,cx0:cx1];frame[y0:y1,x0:x1]=composite[y0:y1,x0:x1]
   # Only the newly verified opaque furniture pixels use the current source.
   frame[600:,:160]=composite[600:,:160]
   changed=int(np.count_nonzero(values!=current));current=values
  if angle==1:
   if not a.reveal_only:frame,current,changed=microphone.repair(rgb,frame,current,absolute)
   frame,current,reveal_changed=revealed.repair(rgb,frame,current,absolute,last!=angle);changed+=reveal_changed
  writer.stdin.write(frame.tobytes());alpha_writer.stdin.write(current.tobytes());rows.append({'frame':absolute,'angle':angle,'repairedAlphaPixels':changed,'sourceRgbAlwaysCurrent':True})
  if i%24==0 or last!=angle or i==count-1:
   Image.fromarray(frame).save(out/'samples'/f'after-{absolute:05d}.jpg',quality=96);Image.fromarray(current).save(out/'samples'/f'alpha-{absolute:05d}.png');(out/'progress.json').write_text(json.dumps({'completedFrames':i+1,'totalFrames':count,'sourceSeconds':absolute/24,'elapsedSeconds':time.monotonic()-start,'visualGate':False}));print('OVERLAP_REPAIR_PROGRESS',absolute,i+1,flush=True)
  last=angle
 for dec in [source,old,picture,matte]:assert not dec.stdout.read(1);assert dec.wait()==0
 for enc in [writer,alpha_writer]:enc.stdin.close();assert enc.wait()==0
 (out/'receipt.json').write_text(json.dumps({'startSeconds':a.start,'seconds':a.seconds,'frames':count,'rows':rows,'contactRepair':'Original per-frame body alpha, source-referenced wall observations and local CF solve','plantRepair':'Reviewed stationary separate-object trimap, one-pixel source-conditioned refinement; current RGB every frame','frozenSourceRgb':False,'fullCurvedMicrophoneRepair':True,'revealedSleeveBackgroundRepair':True,'microphoneOnlyPass':a.microphone_only,'revealOnlyPass':a.reveal_only,'sourceSpecificQualification':True,'nativeEditableModelArtifact':False,'elapsedSeconds':time.monotonic()-start,'creativeGate':False,'paidCloud':False},indent=2));print('OVERLAP_INTERVAL_COMPLETE',flush=True)
finally:
 for proc in [source,old,picture,matte,writer,alpha_writer]:
  if proc.poll() is None:proc.kill();proc.wait()
