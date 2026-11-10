"""Private source-colour Laplacian alpha solve with observed empty pixels.

Independently selected palm/clothing interiors and actual matching background
are constraints. No frame is replaced by a still, generated RGB or roto shape.
"""
import argparse,json,time
from pathlib import Path
import cv2,numpy as np
from PIL import Image,ImageDraw
from scipy.sparse import diags
from pymatting.laplacian.cf_laplacian import cf_laplacian
from pymatting.preconditioner.ichol import ichol
from pymatting.solver.cg import cg
from pymatting import estimate_foreground_ml
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
from python_media_worker.studio_subject_matte import CachedSubjectMatte,sha256
p=argparse.ArgumentParser();p.add_argument('out',type=Path);p.add_argument('--indices',default='9,23,6,36');a=p.parse_args();a.out.mkdir(exist_ok=False);cv2.setNumThreads(2)
root=Path('/tmp/autopromote-application-demo-YU8K0a/model-jobs/46d71c74a26b1292737293505105011117c5c9978872589bb6fc82add8a5e95f/d021b00d-7f30-4a2c-a931-e49ed061fc2f');guide=root/'component_dependency';manifest=json.loads((guide/'manifest.json').read_text());reference=np.asarray(Image.open(root/'outputs/observed_detail/photographed-reference.png')).astype(float)/255;observed=np.asarray(Image.open(root/'outputs/observed_detail/observed-support.png'))>0
work=Path('/tmp/autopromote-application-demo-YU8K0a/subject-previews/4e4e7769-e295-4fb5-8310-042cc31c281c');spec=json.loads((work/'spec.json').read_text())['spec'];cache=CachedSubjectMatte(work/'matte',work/'source.mp4');assets={v['assetId']:work/f'replacement-{i}.asset' for i,v in enumerate(spec['replacementAssets'])};renderer=VfxFrameRenderer({'version':1,'source_sha256':sha256(work/'source.mp4'),'matte_sha256':cache.artifact_sha256,'effects':spec['scene']['effects']},cache,asset_resolver=assets.__getitem__);prepare=renderer._prepare_foreground;rows=[]
for index in map(int,a.indices.split(',')):
 started=time.monotonic();rgb=Image.open(root/f'outputs/rgb/rgb_{index:04d}.png').convert('RGB');C=np.asarray(rgb).astype(float)/255;h,w=C.shape[:2];active=[e for e in renderer.plan['effects'] if e['start']<=index/24<e['end']];fg,effective=prepare(rgb,Image.fromarray(cache.frame(index)),active,w,h);old=np.asarray(effective).astype(float)/255;bayes=np.asarray(Image.open(f'/dev/shm/autopromote-observed-bayesian-pair-r51-20261104/paired-alpha-{index:04d}.png')).astype(float)/255
 results={}
 for strength in [.01,.1]:
  values=old.copy();allowed=np.zeros(old.shape,bool)
  for ci in [1,2]:
   hand=np.asarray(Image.open(guide/manifest['components'][ci]['frames'][index]['file']));ys,xs=np.where(hand>=128)
   if not len(xs):continue
   x0,y0=max(0,int(xs.min())-55),max(0,int(ys.min())-55);x1,y1=min(w,int(xs.max())+56),min(h,int(ys.max())+56);sl=np.s_[y0:y1,x0:x1];local=C[sl];prior=old[sl];depth=cv2.distanceTransform((hand[sl]>=224).astype(np.uint8),cv2.DIST_L2,5);domain=(cv2.dilate((hand[sl]>=128).astype(np.uint8),np.ones((31,31),np.uint8))>0)&observed[sl];photo=np.linalg.norm(local-reference[sl],axis=2)*255
   hsv=cv2.cvtColor(np.rint(local*255).astype(np.uint8),cv2.COLOR_RGB2HSV);skin=(hsv[:,:,1]>60)&((local[:,:,0]-local[:,:,1])>.5*(local[:,:,1]-local[:,:,2]));cloth=(prior>=.995)&(~skin)&(hand[sl]<128)&(photo>25)
   interior=(depth>16)&(prior>=.98)&(photo>32);empty=(photo<6)&domain&~interior&~cloth;core=interior|cloth
   target=prior.copy();target[domain]=bayes[sl][domain];target[empty]=0;target[core]=1
   unary=np.full(prior.shape,100.);unary[domain]=strength;unary[empty|core]=100.
   L=cf_laplacian(local,epsilon=1e-6);A=L+diags(unary.ravel());b=unary.ravel()*target.ravel();solved=cg(A,b,M=ichol(A,shifts=[.01,.1,1,10]),rtol=1e-6,maxiter=500).reshape(prior.shape).clip(0,1)
   solved[~domain]=prior[~domain];solved[empty]=0;solved[core&domain]=1
   weight=np.minimum(cv2.distanceTransform(domain.astype(np.uint8),cv2.DIST_L2,5)/12,1);values[sl]=values[sl]*(1-weight)+solved*weight;allowed[sl]|=domain
  results[strength]=(values,allowed)
  Image.fromarray(np.rint(values*255).astype(np.uint8)).save(a.out/f'alpha-{strength}-{index:04d}.png')
  fore=estimate_foreground_ml(C,values).clip(0,1)
  for treatment in ['multilevel','observed-unmix']:
   colour=fore.copy()
   if treatment=='observed-unmix':
    recovered=(C-reference*(1-values[...,None]))/np.maximum(values[...,None],.05);safe=allowed&(values>.12)&(values<.99)&(np.min(recovered,2)>-.1)&(np.max(recovered,2)<1.1);colour[safe]=recovered[safe].clip(0,1)
   def corrected(*args,v=values,f=colour):return Image.fromarray(np.rint(f*255).astype(np.uint8)),Image.fromarray(np.rint(v*255).astype(np.uint8))
   renderer._prepare_foreground=corrected;result=renderer.render(rgb,index);renderer._prepare_foreground=prepare;tag=f'{strength}-{treatment}';result.save(a.out/f'{tag}-composite-{index:04d}.png');box=(1040,170,1430,760) if index in [9,36] else (280,240,560,680);cw,ch=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(cw*3,ch+24));draw=ImageDraw.Draw(sheet)
   for j,(label,im) in enumerate([('Actual source',rgb),('Actual native revision 3',Image.open(f'/dev/shm/autopromote-native-motion-review-r35-20261104/preview/{index:04d}.png')),('Observed smooth alpha '+tag,result)]):sheet.paste(im.crop(box),(cw*j,24));draw.text((cw*j,0),label,fill='white')
   sheet.save(a.out/f'{tag}-{index:04d}.jpg',quality=97)
  print('ACTUAL_OBSERVED_SMOOTH_ALPHA_VARIANT',index,strength,flush=True)
 rows.append({'frame':index,'seconds':time.monotonic()-started});print('ACTUAL_OBSERVED_SMOOTH_ALPHA',json.dumps(rows[-1]),flush=True)
 (a.out/'evaluation.json').write_text(json.dumps({'privateLocalEvaluationOnly':True,'noNewWeights':True,'observedBackgroundConstraints':True,'rows':rows,'visualPass':False},indent=2)+'\n')
