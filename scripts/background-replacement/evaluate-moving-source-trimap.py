"""Internal source-resolution moving-hand matte without opaque blurred clicks.

Foreground presence from a segmentation click is not evidence that a blurred
finger pixel is opaque. Seed actual broad interiors; retain explicit background
corrections and solve the unknown moving boundary from current source RGB.
"""
import argparse,json,time
from pathlib import Path
import cv2,numpy as np
from PIL import Image,ImageDraw
from pymatting import estimate_alpha_cf
from pymatting.preconditioner.ichol import ichol
from model_workers.adapters.temporal_alpha import condition_trimap_clicks
from model_workers.adapters.moving_detail_alpha import foreground_colour_support
from python_media_worker.studio_subject_matte import CachedSubjectMatte,sha256
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
p=argparse.ArgumentParser();p.add_argument('out',type=Path);p.add_argument('--all-frames',action='store_true');p.add_argument('--observed-colour',action='store_true');a=p.parse_args();a.out.mkdir(exist_ok=False);cv2.setNumThreads(2)
root=Path('/tmp/autopromote-application-demo-YU8K0a/model-jobs/39e005f4354085956cb2bcc82468b18296955d32b26cf3958c53821cbc3f5526/2f43d6cc-1eda-4854-be75-66cceadd172a');guide=root/'component_dependency';manifest=json.load(open(guide/'manifest.json'));work=Path('/tmp/autopromote-application-demo-YU8K0a/subject-previews/f2033724-fb92-44dd-b7ae-54114b51036f');spec=json.load(open(work/'spec.json'))['spec'];cache=CachedSubjectMatte(work/'matte',work/'source.mp4');assets={v['assetId']:work/f'replacement-{i}.asset' for i,v in enumerate(spec['replacementAssets'])};renderer=VfxFrameRenderer({'version':1,'source_sha256':sha256(work/'source.mp4'),'matte_sha256':cache.artifact_sha256,'effects':spec['scene']['effects']},cache,asset_resolver=assets.__getitem__);original_frame=cache.frame;rows=[]
reference=np.asarray(Image.open(root/'outputs/observed_detail/photographed-reference.png'));observed=np.asarray(Image.open(root/'outputs/observed_detail/observed-support.png'))>0;first=np.asarray(Image.open(root/'outputs/rgb/rgb_0000.png'))
for index in (range(48) if a.all_frames else [6,8,9,23,36]):
 started=time.monotonic();rgb=Image.open(root/f'outputs/rgb/rgb_{index:04d}.png').convert('RGB');C=np.asarray(rgb);old=original_frame(index);values=old.copy();fixed=np.zeros_like(old);planes=[];altered=np.zeros_like(old,dtype=bool)
 for c in manifest['components']:
  plane=np.asarray(Image.open(guide/c['frames'][index]['file']));planes.append(plane)
  if not c['selection'].get('propagate',True):np.maximum(fixed,plane,out=fixed)
 for ci in [1,2]:
  hand=planes[ci];ys,xs=np.where(hand>=128)
  if not len(xs):continue
  box=(max(0,int(xs.min())-65),max(0,int(ys.min())-65),min(1430,int(xs.max())+66),min(1000,int(ys.max())+66));x0,y0,x1,y1=box;sl=np.s_[y0:y1,x0:x1];picture=C[sl];prior=old[sl];depth=cv2.distanceTransform((hand[sl]>=224).astype(np.uint8),cv2.DIST_L2,5)
  neighbourhood=cv2.dilate((hand[sl]>=128).astype(np.uint8),np.ones((21,21),np.uint8))>0
  tri=np.full(prior.shape,128,np.uint8);tri[(~neighbourhood)&(prior<=8)]=0;tri[(~neighbourhood)&(prior>=250)]=255
  tri[(depth>18)&(prior>=250)]=255
  difference=np.max(np.abs(picture.astype(np.int16)-reference[sl].astype(np.int16)),2);tri[observed[sl]&(difference<=6)]=0
  selections=[]
  for comp,plane in zip(manifest['components'],planes):
   selection=dict(comp['selection'])
   if selection.get('propagate',True):
    selection['points']=[q for q in selection.get('points',[]) if not q['label']]
    selection['shotPrompts']=[{**q,'points':[v for v in q['points'] if not v['label']]} for q in selection.get('shotPrompts',[])]
   selections.append((selection,plane))
  whole=np.full(old.shape,128,np.uint8);whole[sl]=tri;tri=condition_trimap_clicks(whole,C,first,selections,index)[sl]
  if not (tri==0).any() or not (tri==255).any():continue
  solved=estimate_alpha_cf(picture.astype(np.float64)/255,tri.astype(np.float64)/255,laplacian_kwargs={'epsilon':1e-6},preconditioner=lambda m:ichol(m,shifts=[.01,.1,1,10,100,1000]),cg_kwargs={'rtol':1e-6,'maxiter':1000})
  assert np.isfinite(solved).all();palette=picture[(depth>18)&(prior>=250)]
  if len(palette)>100:palette=palette[::max(1,len(palette)//100)]
  domain=neighbourhood&observed[sl]&(fixed[sl]<24)&(depth<28)
  if not a.observed_colour:domain&=foreground_colour_support(picture,reference[sl].astype(np.float32),palette)
  weight=np.minimum(cv2.distanceTransform(domain.astype(np.uint8),cv2.DIST_L2,5)/8,1)*np.clip((28-depth)/10,0,1)
  candidate=prior.astype(float)/255*(1-weight)+solved.clip(0,1)*weight;values[sl]=np.rint(candidate*255).astype(np.uint8);altered[sl]|=weight>0
  Image.fromarray(tri).save(a.out/f'trimap-{index:04d}-hand{ci}.png')
 cache.frame=lambda frame_index,v=values:v if frame_index==index else original_frame(frame_index)
 prepare=renderer._prepare_foreground
 if a.observed_colour:
  def recovered(frame,alpha,active,width,height):
   foreground,effective=prepare(frame,alpha,active,width,height);va=np.asarray(effective).astype(float)/255;colour=np.asarray(foreground).astype(float)
   # Diagnostic observed-background unmixing. This branch clips recovered
   # RGB to the renderer's current image format; review clipping artefacts.
   f=(C.astype(float)-(1-va[...,None])*reference)/np.maximum(va[...,None],.001)
   domain=altered&observed&(va>.015)&(va<.995)&(fixed<24)
   colour[domain]=f[domain].clip(0,255)
   return Image.fromarray(np.rint(colour).astype(np.uint8)),effective
  renderer._prepare_foreground=recovered
 try:result=renderer.render(rgb,index)
 finally:cache.frame=original_frame;renderer._prepare_foreground=prepare
 result.save(a.out/f'composite-{index:04d}.png');Image.fromarray(values).save(a.out/f'alpha-{index:04d}.png')
 for label,box in [('left',(280,240,680,720)),('right',(1040,170,1430,760))]:
  w,h=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(w*3,h+24));draw=ImageDraw.Draw(sheet)
  for j,(title,im) in enumerate([('Actual source',rgb),('Current native output',Image.open(f'/dev/shm/autopromote-native-click-review-r66-20261104/preview/{index:04d}.png')),('Moving-source trimap',result)]):sheet.paste(im.crop(box),(w*j,24));draw.text((w*j+3,4),title,fill='white')
  sheet.save(a.out/f'{label}-{index:04d}.jpg',quality=97)
 rows.append({'frame':index,'seconds':time.monotonic()-started,'opaqueBlurredFingerSeedsNotAdded':True});print('INTERNAL_MOVING_SOURCE_TRIMAP',index,flush=True)
 (a.out/'evaluation.json').write_text(json.dumps({'rows':rows,'newModelWeights':False,'internalOnly':True,'visualPass':False,'fourMinuteProof':False},indent=2)+'\n')
