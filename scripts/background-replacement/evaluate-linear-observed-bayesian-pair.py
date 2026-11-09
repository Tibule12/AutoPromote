"""Private source-observed Bayesian alpha/foreground comparison, no new weights.

Colour statistics use only opaque independently selected hand interiors from
the actual same-shot source. The background must actually have been observed;
unobserved plate pixels cannot authorise a change. This is not product code.
"""
import argparse,json,time
from pathlib import Path
import cv2,numpy as np
from PIL import Image,ImageDraw
from model_workers.adapters.moving_detail_alpha import foreground_colour_support
from python_media_worker.studio_subject_matte import CachedSubjectMatte,sha256
from python_media_worker.studio_vfx_plan import VfxFrameRenderer

p=argparse.ArgumentParser();p.add_argument('out',type=Path);p.add_argument('--indices',default='9,23,6,36');a=p.parse_args();a.out.mkdir(exist_ok=False);cv2.setNumThreads(2)
root=Path('/tmp/autopromote-application-demo-YU8K0a/model-jobs/46d71c74a26b1292737293505105011117c5c9978872589bb6fc82add8a5e95f/d021b00d-7f30-4a2c-a931-e49ed061fc2f');guide=root/'component_dependency';manifest=json.loads((guide/'manifest.json').read_text());reference=np.asarray(Image.open(root/'outputs/observed_detail/photographed-reference.png')).astype(np.float32);observed=np.asarray(Image.open(root/'outputs/observed_detail/observed-support.png'))>0
work=Path('/tmp/autopromote-application-demo-YU8K0a/subject-previews/4e4e7769-e295-4fb5-8310-042cc31c281c');spec=json.loads((work/'spec.json').read_text())['spec'];cache=CachedSubjectMatte(work/'matte',work/'source.mp4');assets={v['assetId']:work/f'replacement-{i}.asset' for i,v in enumerate(spec['replacementAssets'])};renderer=VfxFrameRenderer({'version':1,'source_sha256':sha256(work/'source.mp4'),'matte_sha256':cache.artifact_sha256,'effects':spec['scene']['effects']},cache,asset_resolver=assets.__getitem__);prepare=renderer._prepare_foreground
linear=lambda im:np.where(im/255<=.081,(im/255)/4.5,((im/255+.099)/1.099)**(1/.45))*255
encoded=lambda im:np.where(im/255<.018,(im/255)*4.5,1.099*np.maximum(im/255,0)**.45-.099)*255
reference=linear(reference)
mixtures={};provenance=[]
for ci in [1,2]:
 samples=[]
 for index in [0,3,12,24,36,47]:
  rgb=np.asarray(Image.open(root/f'outputs/rgb/rgb_{index:04d}.png'));hand=np.asarray(Image.open(guide/manifest['components'][ci]['frames'][index]['file']));matte=np.asarray(Image.open(root/f'outputs/subject_masks/matte_{index:04d}.png'));depth=cv2.distanceTransform((hand>=224).astype(np.uint8),cv2.DIST_L2,5);hsv=cv2.cvtColor(rgb,cv2.COLOR_RGB2HSV);v=rgb.astype(np.float32)
  skin=(hsv[:,:,1]>60)&(hsv[:,:,2]<225)&((v[:,:,0]-v[:,:,1])>.5*(v[:,:,1]-v[:,:,2]))
  known=(depth>12)&(matte>=254)&skin
  colors=linear(v)[known][::3];samples.append(colors);provenance.append({'component':ci,'frame':index,'opaqueSourceSamples':len(colors)})
 samples=np.concatenate(samples);assert len(samples)>128
 cv2.setRNGSeed(0);_,labels,centres=cv2.kmeans(samples,16,None,(cv2.TERM_CRITERIA_EPS+cv2.TERM_CRITERIA_MAX_ITER,60,.05),2,cv2.KMEANS_PP_CENTERS)
 components=[]
 for k,mean in enumerate(centres):
  colors=samples[labels[:,0]==k]
  if len(colors)<8:continue
  cov=np.cov(colors.T)+np.eye(3)*4**2;components.append((mean,cov,len(colors)/len(samples)))
 mixtures[ci]=components
print('ACTUAL_OPAQUE_HAND_COLOUR_MIXTURES',json.dumps(provenance),flush=True)
rows=[]
for index in map(int,a.indices.split(',')):
 started=time.monotonic();rgb=Image.open(root/f'outputs/rgb/rgb_{index:04d}.png').convert('RGB');current=linear(np.asarray(rgb).astype(np.float32));height,width=current.shape[:2];active=[e for e in renderer.plan['effects'] if e['start']<=index/24<e['end']];oldf,olda=prepare(rgb,Image.fromarray(cache.frame(index)),active,width,height);oldvalues=np.asarray(olda).astype(np.float32)/255;oldcolour=np.asarray(oldf).astype(np.float32)/255
 estimates=[]
 for ci in [1,2]:
  hand=np.asarray(Image.open(guide/manifest['components'][ci]['frames'][index]['file']));depth=cv2.distanceTransform((hand>=224).astype(np.uint8),cv2.DIST_L2,5)
  domain=(cv2.dilate((hand>=128).astype(np.uint8),np.ones((31,31),np.uint8))>0)&observed&(depth<28)
  domain&=foreground_colour_support(current,reference,np.asarray([x[0] for x in mixtures[ci]],np.float32))
  ys,xs=np.where(domain);C=current[ys,xs];B=reference[ys,xs];prior=oldvalues[ys,xs];best=np.full(len(ys),np.inf);newa=prior.copy();newf=C.copy();residual=np.full(len(ys),np.inf)
  for mu,cov,prob in mixtures[ci]:
   for alpha in np.linspace(0,1,41):
    sigma=alpha**2*cov+np.eye(3)*(3**2+(1-alpha)**2*3**2);inv=np.linalg.inv(sigma);error=C-(1-alpha)*B-alpha*mu
    mahal=np.einsum('ni,ij,nj->n',error,inv,error);score=.5*mahal+.5*np.linalg.slogdet(sigma)[1]-np.log(prob)+.5*((alpha-prior)/.3)**2
    take=score<best
    if not take.any():continue
    posterior=mu+alpha*(error[take]@inv@cov);best[take]=score[take];newa[take]=alpha;newf[take]=posterior;residual[take]=mahal[take]
  weight=np.minimum(cv2.distanceTransform(domain.astype(np.uint8),cv2.DIST_L2,5)[ys,xs]/12,1)*np.clip((28-depth[ys,xs])/12,0,1)
  weight*=np.clip((30-residual)/15,0,1)
  estimates.append((ys,xs,newa,newf.clip(0,255)/255,weight))
 for variant in ['linear-observed-smoothed','linear-alpha-smoothed']:
  values=oldvalues.copy();colour=oldcolour.copy()
  for ys,xs,newa,newf,weight in estimates:
   previous=values[ys,xs].copy();candidate=values.copy();candidate[ys,xs]=newa;candidate=cv2.GaussianBlur(candidate.astype(np.float32),(0,0),1.);nexta=previous*(1-weight)+candidate[ys,xs]*weight
   if variant=='paired':
    premul=colour[ys,xs]*previous[:,None]*(1-weight[:,None])+newf*newa[:,None]*weight[:,None];colour[ys,xs]=premul/np.maximum(nexta[:,None],.001)
   values[ys,xs]=nexta
  from pymatting import estimate_foreground_ml
  colour=encoded(estimate_foreground_ml(current.astype(float)/255,values).clip(0,1)*255)/255
  if variant=='linear-observed-smoothed':
   recovered=(current-reference*(1-values[...,None]))/np.maximum(values[...,None],.05)
   use=observed&(values>.1)&(values<.99)&(np.min(recovered,2)>-5)&(np.max(recovered,2)<260)
   colour[use]=encoded(recovered[use].clip(0,255))/255
  def corrected(*args,v=values,f=colour):return Image.fromarray(np.rint(f.clip(0,1)*255).astype(np.uint8)),Image.fromarray(np.rint(v*255).astype(np.uint8))
  renderer._prepare_foreground=corrected;result=renderer.render(rgb,index);renderer._prepare_foreground=prepare;result.save(a.out/f'{variant}-composite-{index:04d}.png');Image.fromarray(np.rint(values*255).astype(np.uint8)).save(a.out/f'{variant}-alpha-{index:04d}.png')
  box=(1040,170,1430,760) if index in [9,36] else (280,240,560,680);w,h=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(w*3,h+24));draw=ImageDraw.Draw(sheet)
  for j,(label,im) in enumerate([('Actual source',rgb),('Actual native revision 3',Image.open(f'/dev/shm/autopromote-native-motion-review-r35-20261104/preview/{index:04d}.png')),('Observed Bayesian '+variant,result)]):sheet.paste(im.crop(box),(w*j,24));draw.text((w*j,0),label,fill='white')
  sheet.save(a.out/f'{variant}-{index:04d}.jpg',quality=97)
 rows.append({'frame':index,'seconds':time.monotonic()-started});print('ACTUAL_LINEAR_BAYES_PAIR',json.dumps(rows[-1]),flush=True)
 (a.out/'evaluation.json').write_text(json.dumps({'privateEvaluationOnly':True,'noNewWeights':True,'observedSourceOnly':True,'sourceForegroundSampleProvenance':provenance,'rows':rows,'visualPass':False},indent=2)+'\n')
