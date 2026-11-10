"""Private joint alpha/F solve where the actual source background was observed.

Alternating constrained least squares fits the photo formation equation and
smooths F, rather than changing alpha and RGB independently. No new weights.
"""
import argparse,json,time
from pathlib import Path
import cv2,numpy as np
from PIL import Image,ImageDraw
from scipy.sparse import diags,eye
from scipy.sparse.linalg import cg,LinearOperator
from pymatting import estimate_foreground_ml
from model_workers.adapters.moving_detail_alpha import foreground_colour_support
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
from python_media_worker.studio_subject_matte import CachedSubjectMatte,sha256
p=argparse.ArgumentParser();p.add_argument('out',type=Path);p.add_argument('--indices',default='9,23,6,36');a=p.parse_args();a.out.mkdir(exist_ok=False);cv2.setNumThreads(2)
root=Path('/tmp/autopromote-application-demo-YU8K0a/model-jobs/46d71c74a26b1292737293505105011117c5c9978872589bb6fc82add8a5e95f/d021b00d-7f30-4a2c-a931-e49ed061fc2f');guide=root/'component_dependency';manifest=json.loads((guide/'manifest.json').read_text());reference=np.asarray(Image.open(root/'outputs/observed_detail/photographed-reference.png')).astype(float)/255;observed=np.asarray(Image.open(root/'outputs/observed_detail/observed-support.png'))>0;work=Path('/tmp/autopromote-application-demo-YU8K0a/subject-previews/4e4e7769-e295-4fb5-8310-042cc31c281c');spec=json.loads((work/'spec.json').read_text())['spec'];cache=CachedSubjectMatte(work/'matte',work/'source.mp4');assets={v['assetId']:work/f'replacement-{i}.asset' for i,v in enumerate(spec['replacementAssets'])};renderer=VfxFrameRenderer({'version':1,'source_sha256':sha256(work/'source.mp4'),'matte_sha256':cache.artifact_sha256,'effects':spec['scene']['effects']},cache,asset_resolver=assets.__getitem__);prepare=renderer._prepare_foreground;rows=[]
for index in map(int,a.indices.split(',')):
 started=time.monotonic();rgb=Image.open(root/f'outputs/rgb/rgb_{index:04d}.png').convert('RGB');C=np.asarray(rgb).astype(float)/255;h,w=C.shape[:2];active=[e for e in renderer.plan['effects'] if e['start']<=index/24<e['end']];fg,effective=prepare(rgb,Image.fromarray(cache.frame(index)),active,w,h);old=np.asarray(effective).astype(float)/255;oldf=np.asarray(fg).astype(float)/255
 for regularization in [.002,.02]:
  values=old.copy();colours=oldf.copy()
  for ci in [1,2]:
   hand=np.asarray(Image.open(guide/manifest['components'][ci]['frames'][index]['file']));ys,xs=np.where(hand>=128)
   if not len(xs):continue
   x0,y0=max(0,int(xs.min())-55),max(0,int(ys.min())-55);x1,y1=min(w,int(xs.max())+56),min(h,int(ys.max())+56);sl=np.s_[y0:y1,x0:x1];cc=C[sl];B=reference[sl];prior=old[sl];height,width=prior.shape;n=height*width
   domain=(cv2.dilate((hand[sl]>=128).astype(np.uint8),np.ones((31,31),np.uint8))>0)&observed[sl];depth=cv2.distanceTransform((hand[sl]>=224).astype(np.uint8),cv2.DIST_L2,5)
   # Current-frame known opaque source samples, including their actual
   # variations in skin lighting. Clothing remains on its existing matte.
   hsv=cv2.cvtColor(np.rint(cc*255).astype(np.uint8),cv2.COLOR_RGB2HSV);skin=(hsv[:,:,1]>60)&((cc[:,:,0]-cc[:,:,1])>.5*(cc[:,:,1]-cc[:,:,2]));domain&=skin|((np.linalg.norm(cc-B,axis=2)*255)<12)
   core=(depth>20)&(prior>.99)&(np.linalg.norm(cc-B,axis=2)>.12);empty=domain&(np.linalg.norm(cc-B,axis=2)<.025)&~core
   # Positive semidefinite four-neighbour Laplacian. Sources outside the
   # bounded observed domain are fixed, never invented as an empty plate.
   right=np.ones(n-1);right[np.arange(n-1)%width==width-1]=0;down=np.ones(n-width);adj=diags([right,right,down,down],[-1,1,-width,width],shape=(n,n),format='csr');lap=diags(np.asarray(adj.sum(axis=1)).ravel())-adj
   alpha=prior.copy();F=estimate_foreground_ml(cc,alpha).clip(0,1);fixed=(~domain)|core;coreweight=np.where(fixed,100.,0.).ravel()
   for iteration in range(8):
    diagonal=alpha.ravel()**2+coreweight+1e-6;A=diags(diagonal)+regularization*lap;precondition=LinearOperator((n,n),matvec=lambda x,d=diagonal+regularization*np.asarray(lap.diagonal()):x/d)
    rhs=alpha[...,None]*(cc-(1-alpha[...,None])*B)+coreweight.reshape(height,width,1)*cc
    for channel in range(3):
     solution,info=cg(A,rhs[:,:,channel].ravel(),x0=F[:,:,channel].ravel(),M=precondition,rtol=1e-5,maxiter=250);F[:,:,channel]=solution.reshape(height,width)
    F=F.clip(0,1);vector=F-B;delta=cc-B;mu=.001;nexta=np.clip((np.sum(delta*vector,2)+mu*prior)/(np.sum(vector*vector,2)+mu),0,1)
    # Mild regularity removes code-value noise; photo edges remain weighted
    # by the same actually observed formation equation on the next iteration.
    nexta=cv2.GaussianBlur(nexta.astype(np.float32),(0,0),.55);alpha[domain]=nexta[domain];alpha[empty]=0;alpha[core&domain]=1;alpha[~domain]=prior[~domain]
   weight=np.minimum(cv2.distanceTransform(domain.astype(np.uint8),cv2.DIST_L2,5)/12,1)*np.clip((28-depth)/12,0,1);va=values[sl].copy();nexta=va*(1-weight)+alpha*weight;premul=colours[sl]*va[...,None]*(1-weight[...,None])+F*alpha[...,None]*weight[...,None];colours[sl]=np.where(nexta[...,None]>.001,premul/np.maximum(nexta[...,None],.001),colours[sl]);values[sl]=nexta
  def corrected(*args,v=values,f=colours):return Image.fromarray(np.rint(f.clip(0,1)*255).astype(np.uint8)),Image.fromarray(np.rint(v*255).astype(np.uint8))
  renderer._prepare_foreground=corrected;result=renderer.render(rgb,index);renderer._prepare_foreground=prepare;result.save(a.out/f'{regularization}-composite-{index:04d}.png');Image.fromarray(np.rint(values*255).astype(np.uint8)).save(a.out/f'{regularization}-alpha-{index:04d}.png');box=(1040,170,1430,760) if index in [9,36] else (280,240,560,680);cw,ch=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(cw*3,ch+24));draw=ImageDraw.Draw(sheet)
  for j,(label,im) in enumerate([('Actual source',rgb),('Actual native revision 3',Image.open(f'/dev/shm/autopromote-native-motion-review-r35-20261104/preview/{index:04d}.png')),('Joint observed alpha/F '+str(regularization),result)]):sheet.paste(im.crop(box),(cw*j,24));draw.text((cw*j,0),label,fill='white')
  sheet.save(a.out/f'{regularization}-{index:04d}.jpg',quality=97);print('ACTUAL_JOINT_OBSERVED_VARIANT',index,regularization,flush=True)
 rows.append({'frame':index,'seconds':time.monotonic()-started});print('ACTUAL_JOINT_OBSERVED_FRAME',json.dumps(rows[-1]),flush=True)
 (a.out/'evaluation.json').write_text(json.dumps({'privateLocalEvaluationOnly':True,'noNewWeights':True,'rows':rows,'visualPass':False},indent=2)+'\n')
