"""Source-flow foreground samples plus photographed-background unmixing probe.

Use only opaque current/nearby independently tracked hand pixels, reject
forward/backward-inconsistent correspondence, and never cross a source cut.
Unknown background cannot authorize alpha changes. No new model weights.
"""
import argparse,json,time
from pathlib import Path
import cv2,numpy as np
from PIL import Image,ImageDraw
from scipy.ndimage import distance_transform_edt
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
from python_media_worker.studio_subject_matte import CachedSubjectMatte,sha256
p=argparse.ArgumentParser();p.add_argument('out',type=Path);p.add_argument('--indices',default='9,23,6,36');a=p.parse_args();a.out.mkdir(exist_ok=False);cv2.setNumThreads(2)
root=Path('/tmp/autopromote-application-demo-YU8K0a/model-jobs/46d71c74a26b1292737293505105011117c5c9978872589bb6fc82add8a5e95f/d021b00d-7f30-4a2c-a931-e49ed061fc2f');guide=root/'component_dependency';manifest=json.loads((guide/'manifest.json').read_text());reference=np.asarray(Image.open(root/'outputs/observed_detail/photographed-reference.png')).astype(np.float32)/255;observed=np.asarray(Image.open(root/'outputs/observed_detail/observed-support.png'))>0
work=Path('/tmp/autopromote-application-demo-YU8K0a/subject-previews/4e4e7769-e295-4fb5-8310-042cc31c281c');spec=json.loads((work/'spec.json').read_text())['spec'];cache=CachedSubjectMatte(work/'matte',work/'source.mp4');assets={v['assetId']:work/f'replacement-{i}.asset' for i,v in enumerate(spec['replacementAssets'])};renderer=VfxFrameRenderer({'version':1,'source_sha256':sha256(work/'source.mp4'),'matte_sha256':cache.artifact_sha256,'effects':spec['scene']['effects']},cache,asset_resolver=assets.__getitem__);prepare=renderer._prepare_foreground;rows=[];flow_engine=cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
for index in map(int,a.indices.split(',')):
 started=time.monotonic();rgb=Image.open(root/f'outputs/rgb/rgb_{index:04d}.png').convert('RGB');current=np.asarray(rgb);C=current.astype(float)/255;h,w=current.shape[:2];active=[e for e in renderer.plan['effects'] if e['start']<=index/24<e['end']];fg,effective=prepare(rgb,Image.fromarray(cache.frame(index)),active,w,h);old=np.asarray(effective).astype(float)/255;oldf=np.asarray(fg).astype(float)/255;variants={x:(old.copy(),oldf.copy()) for x in ['paired','flow-colour-only']}
 for ci in [1,2]:
  hand=np.asarray(Image.open(guide/manifest['components'][ci]['frames'][index]['file']));ys,xs=np.where(hand>=128)
  if not len(xs):continue
  box=(max(0,int(xs.min())-85),max(0,int(ys.min())-85),min(w,int(xs.max())+86),min(h,int(ys.max())+86));x0,y0,x1,y1=box;sl=np.s_[y0:y1,x0:x1];height,width=hand[sl].shape;local=current[sl];cc=C[sl];bg=reference[sl];prior=old[sl];depth=cv2.distanceTransform((hand[sl]>=224).astype(np.uint8),cv2.DIST_L2,5);domain=(cv2.dilate((hand[sl]>=128).astype(np.uint8),np.ones((31,31),np.uint8))>0)&observed[sl]&(depth<28)
  # Actual opaque neighbouring surface colours become candidate F values.
  fields=[];confidences=[];gray=cv2.cvtColor(local,cv2.COLOR_RGB2GRAY);yy,xx=np.mgrid[:height,:width].astype(np.float32)
  for other in range(max(0,index-5),min(48,index+6)):
   nrgb=np.asarray(Image.open(root/f'outputs/rgb/rgb_{other:04d}.png'))[sl];na=np.asarray(Image.open(root/f'outputs/subject_masks/matte_{other:04d}.png'))[sl];nh=np.asarray(Image.open(guide/manifest['components'][ci]['frames'][other]['file']))[sl];ngray=cv2.cvtColor(nrgb,cv2.COLOR_RGB2GRAY)
   if other==index:flow=np.zeros((height,width,2),np.float32);reverse=flow.copy()
   else:flow=flow_engine.calc(gray,ngray,None);reverse=flow_engine.calc(ngray,gray,None)
   mx,my=xx+flow[:,:,0],yy+flow[:,:,1];back=cv2.remap(reverse,mx,my,cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT);fb=np.linalg.norm(flow+back,axis=2);seed=(cv2.erode(((na>=254)&(nh>=224)).astype(np.uint8),np.ones((7,7),np.uint8))>0)
   valid=cv2.remap(seed.astype(np.uint8),mx,my,cv2.INTER_NEAREST,borderMode=cv2.BORDER_CONSTANT)>0;valid&=(fb<1.5)&(mx>=0)&(mx<width-1)&(my>=0)&(my<height-1)
   warped=cv2.remap(nrgb,mx,my,cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT).astype(np.float32)/255;fields.append(warped);confidences.append(valid.astype(np.float32)/(1+.15*abs(other-index)))
  numerator=sum(f*v[...,None] for f,v in zip(fields,confidences));denom=sum(confidences);seed=denom>.05
  distance,nearest=distance_transform_edt(~seed,return_indices=True);F=numerator/np.maximum(denom[...,None],.001);F=F[tuple(nearest)]
  # Smooth the actual warped opaque colours instead of copying Voronoi cells.
  for channel in range(3):F[:,:,channel]=cv2.GaussianBlur(F[:,:,channel],(0,0),2)
  vector=F-bg;delta=cc-bg;contrast=np.sum(vector*vector,2);alpha=np.clip(np.sum(delta*vector,2)/np.maximum(contrast,1e-7),0,1);residual=np.sqrt(np.mean((delta-alpha[...,None]*vector)**2,2));weight=domain*np.clip((.065-residual)/.03,0,1)*np.minimum(cv2.distanceTransform(domain.astype(np.uint8),cv2.DIST_L2,5)/12,1)*np.clip((28-depth)/12,0,1)*np.clip((48-distance)/24,0,1)
  recovered=(cc-(1-alpha[...,None])*bg)/np.maximum(alpha[...,None],.05);recovered=recovered.clip(0,1)
  for name,(values,colours) in variants.items():
   va=values[sl].copy();f=colours[sl].copy();newa=alpha if name=='paired' else va;newf=recovered if name=='paired' else F;nexta=va*(1-weight)+newa*weight;premul=f*va[...,None]*(1-weight[...,None])+newf*newa[...,None]*weight[...,None];colours[sl]=np.where(nexta[...,None]>.001,premul/np.maximum(nexta[...,None],.001),f);values[sl]=nexta
 for name,(values,colours) in variants.items():
  def corrected(*args,v=values,f=colours):return Image.fromarray(np.rint(f.clip(0,1)*255).astype(np.uint8)),Image.fromarray(np.rint(v*255).astype(np.uint8))
  renderer._prepare_foreground=corrected;result=renderer.render(rgb,index);renderer._prepare_foreground=prepare;result.save(a.out/f'{name}-composite-{index:04d}.png');box=(1040,170,1430,760) if index in [9,36] else (280,240,560,680);cw,ch=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(cw*3,ch+24));draw=ImageDraw.Draw(sheet)
  for j,(label,im) in enumerate([('Actual source',rgb),('Actual native revision 3',Image.open(f'/dev/shm/autopromote-native-motion-review-r35-20261104/preview/{index:04d}.png')),('Flow foreground '+name,result)]):sheet.paste(im.crop(box),(cw*j,24));draw.text((cw*j,0),label,fill='white')
  sheet.save(a.out/f'{name}-{index:04d}.jpg',quality=97)
 rows.append({'frame':index,'seconds':time.monotonic()-started,'nearbyActualFrames':11,'flowForwardBackwardMaxError':1.5});print('ACTUAL_TEMPORAL_FOREGROUND',json.dumps(rows[-1]),flush=True)
 (a.out/'evaluation.json').write_text(json.dumps({'privateLocalEvaluationOnly':True,'noNewWeights':True,'rows':rows,'visualPass':False},indent=2)+'\n')
