"""Private full-source person estimate plus retained props, shared compositor.

This derives new diagnostic alpha. It never registers native model receipts or
reuses a completed native identity for changed pixels.
"""
import argparse,copy,hashlib,json,socket,time,types
from pathlib import Path
import cv2,numpy as np
from PIL import Image,ImageDraw
from model_workers.common import sha,write_json
from python_media_worker.studio_subject_matte import CachedSubjectMatte
from python_media_worker.studio_vfx_plan import VfxFrameRenderer


def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('out',type=Path);p.add_argument('--all-frames',action='store_true');p.add_argument('--core-only',action='store_true');p.add_argument('--current-native',action='store_true');p.add_argument('--indices');p.add_argument('--previous-render',type=Path);a=p.parse_args();a.out.mkdir(exist_ok=False);cv2.setNumThreads(2)
 private=Path('reports/background-replacement-20261101/private');parent=private/'birefnet-actual-motion-r240-20261106'
 work=Path('/tmp/autopromote-application-demo-FDokC2/subject-previews/608ba066-166e-49c1-ba79-b1c28940c569')
 job=Path('/tmp/autopromote-application-demo-FDokC2/model-jobs/18f335240ae4777cd864a862acd96d59d5cbd1d4452a637391956c98bdfa56cf/a59210fa-0254-4000-b1b6-0e92ac9535e8')
 if a.current_native:
  job=Path('/dev/shm/autopromote-background-native-r280-20261107/model-jobs/a02e18c4a5e0d968c169fdd645d3fc8c537067eab4ede800802ff7fe2ddc21f8/ccd48ee2-bd53-413d-9ece-45b09a7a662b')
  work=Path('/tmp/autopromote-application-demo-FDokC2/subject-previews/1d977b58-4f18-4bd7-a6a3-7e37ec9e61ac')
 cache=CachedSubjectMatte(work/'matte',work/'source.mp4');original_frame=cache.frame
 guide=job/'component_dependency';components=json.loads((guide/'manifest.json').read_text())
 indices=list(map(int,a.indices.split(',')))if a.indices else(list(range(48))if a.all_frames else[0,6,15,23,39,46,47]);alphas={};bindings=[]
 source_bindings={row['name']:row['sourcePngSha256']for row in json.loads((parent/'receipt.json').read_text())['rows']}
 for i in indices:
  until=time.monotonic()+600
  while not(parent/f'gesture{i:02d}-alpha.png').is_file():
   if time.monotonic()>until:raise RuntimeError('Current source model estimate did not complete')
   time.sleep(1)
  person=np.asarray(Image.open(parent/f'gesture{i:02d}-alpha.png').convert('L'))
  assert sha(private/f'recovered-gesture-r180-20261105/rgb/rgb_{i:04d}.png')==source_bindings[f'gesture{i:02d}']
  fixed=np.zeros(person.shape,np.uint8)
  for component in components['components'][1:]:
   if component['selection'].get('propagate',True):continue
   row=component['frames'][i];file=guide/row['file']
   if sha(file)!=row['sha256']:raise ValueError('Native separate prop evidence changed')
   np.maximum(fixed,np.asarray(Image.open(file)),out=fixed)
  support=fixed>=64;distance=cv2.distanceTransform((~support).astype(np.uint8),cv2.DIST_L2,5)
  weight=np.clip((12-distance)/4,0,1)
  prop=np.rint(original_frame(i).astype(np.float32)*weight).astype(np.uint8)
  alpha=np.maximum(person,prop)
  if a.core_only:
   # Independent source evidence may repair opaque body interiors; it must
   # not replace the existing fractional hair/finger boundary with a new rim.
   core=cv2.erode((person>=254).astype(np.uint8),np.ones((25,25),np.uint8))>0
   alpha=original_frame(i).copy();alpha[core]=255
   # Preserve actual author exclusions, including their current source frame.
   from model_workers.adapters.temporal_alpha import condition_trimap_clicks
   current=np.array(Image.open(private/f'recovered-gesture-r180-20261105/rgb/rgb_{i:04d}.png'))
   reference=np.array(Image.open(private/'recovered-gesture-r180-20261105/rgb/rgb_0000.png'))
   selections=[(component['selection'],np.array(Image.open(guide/component['frames'][i]['file'])))for component in components['components']]
   alpha=condition_trimap_clicks(alpha,current,reference,selections,i)
  alphas[i]=alpha;Image.fromarray(alpha).save(a.out/f'alpha-{i:04d}.png')
  bindings.append({'frame':i,'personAlphaSha256':sha(parent/f'gesture{i:02d}-alpha.png'),'derivedAlphaSha256':sha(a.out/f'alpha-{i:04d}.png')})
 identity=hashlib.sha256(json.dumps({'nativeParent':cache.artifact_sha256,'derived':bindings},sort_keys=True).encode()).hexdigest()
 cache=types.SimpleNamespace(manifest=copy.deepcopy(cache.manifest),artifact_sha256=identity,
     observed_background=cache.observed_background,frame=lambda index:alphas[index])
 spec=json.loads((work/'spec.json').read_text())['spec'];effects=copy.deepcopy(spec['scene']['effects'])
 plan={'version':1,'source_sha256':cache.manifest['source_sha256'],'matte_sha256':cache.artifact_sha256,'effects':effects}
 renderer=VfxFrameRenderer(plan,cache,lambda _:private/'replacement.png');renderer.foreground_cache.root=None
 socket.socket.connect=lambda *args,**kw:(_ for _ in ()).throw(RuntimeError('Local diagnostic networking disabled'))
 rows=[];started=time.monotonic()
 # Compare the actual native encoded preview instead of recalculating its
 # expensive foreground solve just to produce an internal comparison column.
 native_decoder=cv2.VideoCapture(str(work/'render.mp4'));decoded_native={}
 for i in range(48):
  ok,picture=native_decoder.read();assert ok
  if i in indices:decoded_native[i]=Image.fromarray(cv2.cvtColor(picture,cv2.COLOR_BGR2RGB))
 assert not native_decoder.read()[0];native_decoder.release()
 for i in indices:
  rgb=Image.open(private/f'recovered-gesture-r180-20261105/rgb/rgb_{i:04d}.png').convert('RGB');reused=False
  if a.previous_render and(a.previous_render/f'actual-composite-{i:04d}.png').is_file():
   assert np.array_equal(np.array(Image.open(a.previous_render/f'alpha-{i:04d}.png')),alphas[i])
   previous=a.previous_render/f'actual-composite-{i:04d}.png';output=Image.open(previous).convert('RGB')
   import os
   os.link(previous,a.out/previous.name);reused=True
  else:
   output=renderer.render(rgb,i);output.save(a.out/f'actual-composite-{i:04d}.png')
  old=decoded_native[i]
  for name,box in [('left',(280,240,700,720)),('right',(1040,170,1430,760)),('head',(660,45,1040,480)),('lower',(430,810,1250,1000)),('rig',(100,690,950,925))]:
   w,h=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(w*3,h+24));draw=ImageDraw.Draw(sheet)
   for n,(label,picture)in enumerate([(f'Actual source {i}',rgb),('Current native',old),('Private opaque core; shared recovery',output)]):sheet.paste(picture.crop(box),(n*w,24));draw.text((n*w+3,4),label,fill='white')
   sheet.save(a.out/f'actual-{name}-{i:04d}.jpg',quality=98)
  rows.append({'frame':i,'seconds':time.monotonic()-started,'reusedOwnInterruptedRenderWithExactAlpha':reused,'outputSha256':sha(a.out/f'actual-composite-{i:04d}.png')});print('ACTUAL_SHARED_MATTING_COMPOSITE',json.dumps(rows[-1]),flush=True)
  write_json(a.out/'progress.json',{'rows':rows,'sourceAndDerivedAlphaBindings':bindings,'nativeAdmission':False,'fourMinuteProof':False})
 write_json(a.out/'receipt.json',{'rows':rows,'bindings':bindings,'usesCurrentNative2_5_13':a.current_native,'preservesActualAuthorClicks':a.core_only,'opaqueBodyCoreOnly':a.core_only,'actualCanonicalForegroundPreparation':True,'nativeAdmission':False,'nativeParentPreviewSha256':sha(work/'render.mp4'),'privateDerivedAlphaIdentity':cache.artifact_sha256,'foregroundPixelOverride':False,'fourMinuteProof':False,'visualReviewPending':True,'paidCloud':False})


if __name__=='__main__':main()
