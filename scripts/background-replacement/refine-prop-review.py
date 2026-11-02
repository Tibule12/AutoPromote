"""Bounded actual-footage evaluation of the shared corrective alpha function."""
import argparse,json,time,subprocess,hashlib,cv2,numpy as np
from pathlib import Path
from PIL import Image
from model_workers.adapters.source_edge_alpha import refine_corrected_object_alpha
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
p=argparse.ArgumentParser();p.add_argument('root');a=p.parse_args();r=Path(a.root);out=r/'moving-proof';out.mkdir(exist_ok=False)
parent=Path('reports/background-replacement-20261101/private/long-podcast-r7');source='/home/tibule12/Videos/cam-combiner-5050c706-a6cb-48bc-ac43-8fa54f21bc1a.mp4';reg=json.load(open(parent/'registration.json'))['rows'];settings=json.load(open(r/'colour-clicks-v3.json'));scene=json.load(open(parent/'final-short-correction/scenes.json'))[0];effects=scene['scene']['effects'];cv2.setNumThreads(2)
for effect in effects:effect['start']=0;effect['end']=2
points=[{'position':[x/1430,y/1000],'label':label} for name,label in [('bg',0),('fg',1)] for x,y in settings[name]]
def encoder(file,pix,codec):return subprocess.Popen(['ffmpeg','-nostdin','-v','error','-f','rawvideo','-pix_fmt',pix,'-s','1430x1000','-r','24','-i','pipe:0','-an','-c:v',codec,*(['-level','3','-g','1'] if codec=='ffv1' else ['-preset','fast','-crf','16','-pix_fmt','yuv420p','-movflags','+faststart']),str(file)],stdin=subprocess.PIPE,stderr=subprocess.PIPE)
writer=encoder(out/'picture.mp4','rgb24','libx264');alpha_writer=encoder(out/'alpha.mkv','gray','ffv1')
decoder=subprocess.Popen(['ffmpeg','-nostdin','-v','error','-threads','2','-ss','115','-i',source,'-t','2','-vf','fps=24','-an','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],stdout=subprocess.PIPE)
prior=cv2.VideoCapture(str(parent/'final-short-correction/proof-115-2/alpha.mkv'));(out/'frames').mkdir();reference=None;rows=[];start=time.monotonic()
class Cache:
 manifest={'width':1430,'height':1000,'frame_count':48,'fps':24,'fps_fraction':'24/1','source_sha256':'0'*64};artifact_sha256='0'*64;directory=None;value=None
 def frame(self,i):return self.value
cache=Cache();renderer=VfxFrameRenderer({'version':1,'source_sha256':'0'*64,'matte_sha256':'0'*64,'effects':effects},cache,lambda _:Path('reports/background-replacement-20261101/private/replacement.png'))
try:
 for i in range(48):
  raw=decoder.stdout.read(1920*1080*3);assert len(raw)==1920*1080*3;image=np.frombuffer(raw,np.uint8).reshape(1080,1920,3);rgb=cv2.warpAffine(image,np.array(reg[(115*24+i)//6]['matrix']),(1430,1000),flags=cv2.INTER_LANCZOS4)
  ok,old=prior.read();assert ok;old=cv2.cvtColor(old,cv2.COLOR_BGR2GRAY)
  if reference is None:reference=rgb.copy()
  corrected=refine_corrected_object_alpha(rgb,old,reference,points,settings['box']);cache.value=corrected
  x0,y0,x1,y1=settings['box'];outside=np.ones(old.shape,bool);outside[y0:y1,x0:x1]=False;assert np.array_equal(corrected[outside],old[outside])
  prepare=renderer._prepare_foreground;observed=[]
  def observe(*args):value=prepare(*args);observed.append(value);return value
  renderer._prepare_foreground=observe;result=renderer.render(Image.fromarray(rgb),i);renderer._prepare_foreground=prepare
  effective=observed[0][1];writer.stdin.write(result.tobytes());alpha_writer.stdin.write(effective.tobytes())
  if i in [0,12,24,36,47]:result.save(out/'frames'/f'replacement-{i:03d}.png');Image.fromarray(rgb).save(out/'frames'/f'source-{i:03d}.png');Image.fromarray(corrected).save(out/'frames'/f'alpha-{i:03d}.png')
  rows.append({'index':i,'originalSeconds':115+i/24,'alphaChangedPixels':int(np.count_nonzero(corrected!=old)),'outsideSelectedRegionByteIdentical':True,'effectiveAlphaSha256':hashlib.sha256(effective.tobytes()).hexdigest()})
  if i%12==0:print('ACTUAL_CORRECTIVE_FRAME',i,round(time.monotonic()-start,2),flush=True)
 assert not decoder.stdout.read(1) and decoder.wait()==0 and not prior.read()[0]
 for proc in [writer,alpha_writer]:proc.stdin.close();assert proc.wait()==0
 subprocess.run(['ffmpeg','-nostdin','-v','error','-i',str(out/'picture.mp4'),'-ss','115','-i',source,'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','192k','-t','2','-movflags','+faststart',str(out/'replacement.mp4')],check=True)
 (out/'review.json').write_text(json.dumps({'frames':48,'sourceSeconds':[115,117],'sharedAdapterFunction':'refine_corrected_object_alpha','sourceRgbAlwaysDecodedCurrentFrame':True,'frozenSourcePixels':False,'outsideSelectedAlphaByteIdenticalEveryFrame':True,'rows':rows,'runtimeSeconds':time.monotonic()-start,'creativeGate':False,'nativeArtifactQualification':False},indent=2));print('MOVING_CORRECTIVE_REVIEW_COMPLETE',flush=True)
finally:
 prior.release()
 for proc in [decoder,writer,alpha_writer]:
  if proc.poll() is None:proc.kill();proc.wait()
