"""Internal same-alpha comparison of converged foreground colour solvers.

No new model, geometry, alpha, source pose or replacement scene is introduced.
"""
import argparse,json,time
from pathlib import Path
import cv2,numpy as np
from PIL import Image,ImageDraw
from pymatting import estimate_foreground_cf,estimate_foreground_ml
from python_media_worker.studio_subject_matte import CachedSubjectMatte,sha256
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
p=argparse.ArgumentParser();p.add_argument('out',type=Path);a=p.parse_args();a.out.mkdir(exist_ok=False);cv2.setNumThreads(2)
root=Path('/tmp/autopromote-application-demo-YU8K0a/model-jobs/39e005f4354085956cb2bcc82468b18296955d32b26cf3958c53821cbc3f5526/2f43d6cc-1eda-4854-be75-66cceadd172a');guide=root/'component_dependency';manifest=json.load(open(guide/'manifest.json'));work=Path('/tmp/autopromote-application-demo-YU8K0a/subject-previews/f2033724-fb92-44dd-b7ae-54114b51036f');spec=json.load(open(work/'spec.json'))['spec'];cache=CachedSubjectMatte(work/'matte',work/'source.mp4');assets={v['assetId']:work/f'replacement-{i}.asset' for i,v in enumerate(spec['replacementAssets'])};renderer=VfxFrameRenderer({'version':1,'source_sha256':sha256(work/'source.mp4'),'matte_sha256':cache.artifact_sha256,'effects':spec['scene']['effects']},cache,asset_resolver=assets.__getitem__);prepare=renderer._prepare_foreground;rows=[]
for index in [6,8,9,23,36]:
 started=time.monotonic();rgb=Image.open(root/f'outputs/rgb/rgb_{index:04d}.png').convert('RGB');picture=np.asarray(rgb).astype(np.float64)/255;active=[e for e in renderer.plan['effects'] if e['start']<=index/24<e['end']];fg,effective=prepare(rgb,Image.fromarray(cache.frame(index)),active,1430,1000);alpha=np.asarray(effective).astype(np.float64)/255;old=np.asarray(fg).astype(np.float64)/255;variants={name:old.copy() for name in ['multilevel20','closed-form']}
 for ci in [1,2]:
  hand=np.asarray(Image.open(guide/manifest['components'][ci]['frames'][index]['file']));ys,xs=np.where(hand>=128)
  if not len(xs):continue
  box=(max(0,int(xs.min())-65),max(0,int(ys.min())-65),min(1430,int(xs.max())+66),min(1000,int(ys.max())+66));x0,y0,x1,y1=box;sl=np.s_[y0:y1,x0:x1];C=picture[sl];A=alpha[sl];domain=(cv2.dilate((hand[sl]>=128).astype(np.uint8),np.ones((21,21),np.uint8))>0)&(A>0)&(A<1);weight=np.minimum(cv2.distanceTransform(domain.astype(np.uint8),cv2.DIST_L2,5)/3,1)
  for name in variants:
   tick=time.monotonic()
   if name=='multilevel20':candidate=estimate_foreground_ml(C,A,n_small_iterations=20,n_big_iterations=20)
   else:candidate=estimate_foreground_cf(C,A,foreground_guess=old[sl],regularization=1e-5,rtol=1e-5,ichol_kwargs={'shifts':[.001,.01,.1,1,10,100]},cg_kwargs={'maxiter':1000})
   assert np.isfinite(candidate).all();variants[name][sl]=old[sl]*(1-weight[...,None])+candidate.clip(0,1)*weight[...,None];rows.append({'frame':index,'component':ci,'solver':name,'seconds':time.monotonic()-tick,'alphaChanged':False})
 for name,foreground in variants.items():
  renderer._prepare_foreground=lambda *args,F=foreground:(Image.fromarray(np.rint(F.clip(0,1)*255).astype(np.uint8)),effective);result=renderer.render(rgb,index);renderer._prepare_foreground=prepare;result.save(a.out/f'{name}-{index:04d}.png')
  for label,box in [('left',(280,240,680,720)),('right',(1040,170,1430,760))]:
   w,h=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(w*3,h+24));draw=ImageDraw.Draw(sheet)
   for j,(title,im) in enumerate([('Actual source',rgb),('Current native output',Image.open(f'/dev/shm/autopromote-native-click-review-r66-20261104/preview/{index:04d}.png')),('Converged colour '+name,result)]):sheet.paste(im.crop(box),(w*j,24));draw.text((w*j+3,4),title,fill='white')
   sheet.save(a.out/f'{label}-{name}-{index:04d}.jpg',quality=97)
 print('INTERNAL_CONVERGED_FOREGROUND',index,time.monotonic()-started,flush=True)
 (a.out/'evaluation.json').write_text(json.dumps({'rows':rows,'alphaUnchanged':True,'newWeights':False,'internalOnly':True,'visualPass':False,'fourMinuteProof':False},indent=2)+'\n')
