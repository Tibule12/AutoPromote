"""Private model-foreground prior plus observed-source unmixing evaluation.

No product registration; cached GPL recurrent prediction is evaluated only.
Actual source/background observations constrain the equation, and independent
hand selections protect unrelated objects and opaque palm/cuff interiors.
"""
import argparse,json
from pathlib import Path
import cv2,numpy as np
from PIL import Image,ImageDraw
from model_workers.adapters.moving_detail_alpha import foreground_colour_support
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
from python_media_worker.studio_subject_matte import CachedSubjectMatte,sha256
p=argparse.ArgumentParser();p.add_argument('out',type=Path);a=p.parse_args();a.out.mkdir(exist_ok=False);cv2.setNumThreads(2)
job=Path('/tmp/autopromote-application-demo-YU8K0a/model-jobs/46d71c74a26b1292737293505105011117c5c9978872589bb6fc82add8a5e95f/d021b00d-7f30-4a2c-a931-e49ed061fc2f');guide=job/'component_dependency';manifest=json.loads((guide/'manifest.json').read_text());rvm=Path('/dev/shm/autopromote-motion-rvm-resnet-r27-20261104');reference=np.asarray(Image.open(job/'outputs/observed_detail/photographed-reference.png')).astype(float)/255;observed=np.asarray(Image.open(job/'outputs/observed_detail/observed-support.png'))>0
work=Path('/tmp/autopromote-application-demo-YU8K0a/subject-previews/4e4e7769-e295-4fb5-8310-042cc31c281c');spec=json.loads((work/'spec.json').read_text())['spec'];cache=CachedSubjectMatte(work/'matte',work/'source.mp4');assets={v['assetId']:work/f'replacement-{i}.asset' for i,v in enumerate(spec['replacementAssets'])};renderer=VfxFrameRenderer({'version':1,'source_sha256':sha256(work/'source.mp4'),'matte_sha256':cache.artifact_sha256,'effects':spec['scene']['effects']},cache,asset_resolver=assets.__getitem__);prepare=renderer._prepare_foreground
palettes={}
for ci in [1,2]:
 c=manifest['components'][ci];samples=[]
 for prompt in [{'frameIndex':0,'points':c['selection']['points']},*c['selection'].get('shotPrompts',[])]:
  pic=np.asarray(Image.open(job/f"outputs/rgb/rgb_{prompt['frameIndex']:04d}.png"));h,w=pic.shape[:2]
  for pt in prompt['points']:
   if pt['label']!=1:continue
   x=min(w-1,round(pt['position'][0]*w));y=min(h-1,round(pt['position'][1]*h));samples.extend(pic[max(0,y-1):min(h,y+2),max(0,x-1):min(w,x+2)].reshape(-1,3))
 palettes[ci]=np.asarray(samples,np.float32)
for i in [6,9,23,36]:
 rgb=Image.open(job/f'outputs/rgb/rgb_{i:04d}.png').convert('RGB');c=np.asarray(rgb).astype(float)/255;fg=np.asarray(Image.open(rvm/f'foreground/{i:04d}.png')).astype(float)/255;ra=np.asarray(Image.open(rvm/f'alpha/{i:04d}.png')).astype(float)/255
 regions=[]
 for ci in [1,2]:
  hand=np.asarray(Image.open(guide/manifest['components'][ci]['frames'][i]['file']));domain=(cv2.dilate((hand>=128).astype(np.uint8),np.ones((31,31),np.uint8))>0)&observed
  domain&=foreground_colour_support(np.asarray(rgb),reference.astype(np.float32)*255,palettes[ci]);weight=np.minimum(cv2.distanceTransform(domain.astype(np.uint8),cv2.DIST_L2,5)/12,1);depth=cv2.distanceTransform((hand>=224).astype(np.uint8),cv2.DIST_L2,5);weight*=np.clip((28-depth)/12,0,1);regions.append(weight)
 weight=np.maximum.reduce(regions)
 for variant in ['observed-rgb','observed-linear','paired-confidence']:
  def corrected(frame,alpha,active,width,height):
   foreground,effective=prepare(frame,alpha,active,width,height);va=np.asarray(effective).astype(float)/255;old=np.asarray(foreground).astype(float)/255;w=weight.copy()
   if variant=='paired-confidence':
    # Continuous confidence, not the earlier binary RGB/alpha switch.
    w*=np.clip((.5-np.abs(va-ra))/.3,0,1);newa=ra;newf=fg
   else:
    linear=lambda v:np.where(v<=.04045,v/12.92,((v+.055)/1.055)**2.4)
    encoded=lambda v:np.where(v<=.0031308,v*12.92,1.055*np.maximum(v,0)**(1/2.4)-.055)
    cc,bb,ff=(linear(c),linear(reference),linear(fg)) if variant=='observed-linear' else (c,reference,fg)
    vector=ff-bb;delta=cc-bb;contrast=np.sum(vector*vector,2);newa=np.clip(np.sum(delta*vector,2)/np.maximum(contrast,1e-8),0,1)
    residual=np.sqrt(np.mean((delta-newa[...,None]*vector)**2,2));w*=np.clip((.08-residual)/.04,0,1)*np.clip((contrast-.001)/.005,0,1)
    recovered=(cc-(1-newa[...,None])*bb)/np.maximum(newa[...,None],.025);newf=encoded(recovered.clip(0,1)) if variant=='observed-linear' else recovered.clip(0,1)
   # Blend the premultiplied pair to avoid independently changing edge RGB.
   nexta=va*(1-w)+newa*w;premul=old*va[...,None]*(1-w[...,None])+newf*newa[...,None]*w[...,None];out=np.where(nexta[...,None]>.001,premul/np.maximum(nexta[...,None],.001),old)
   return Image.fromarray(np.rint(out.clip(0,1)*255).astype(np.uint8)),Image.fromarray(np.rint(nexta*255).astype(np.uint8))
  renderer._prepare_foreground=corrected;result=renderer.render(rgb,i);renderer._prepare_foreground=prepare;result.save(a.out/f'{variant}-composite-{i:04d}.png');box=(1040,170,1430,760) if i in [9,36] else (280,280,540,660);w,h=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(w*3,h+24));draw=ImageDraw.Draw(sheet)
  for j,(label,im) in enumerate([('Actual source',rgb),('Actual native revision 3',Image.open(f'/dev/shm/autopromote-native-motion-review-r35-20261104/preview/{i:04d}.png')),(variant,result)]):sheet.paste(im.crop(box),(w*j,24));draw.text((w*j,0),label,fill='white')
  sheet.save(a.out/f'{variant}-{i:04d}.jpg',quality=97);print('ACTUAL_RECURRENT_OBSERVED_PAIR',variant,i,flush=True)
(a.out/'evaluation.json').write_text(json.dumps({'privateDiagnosticOnly':True,'registeredForProduct':False,'visualPass':False,'rvmLicense':'GPL-3.0','noPaidCloud':True,'actualFrames':[6,9,23,36]},indent=2)+'\n')
