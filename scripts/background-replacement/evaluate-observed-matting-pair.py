"""Private paired foreground/alpha check on actually observed hand backgrounds.

The photographed reference is never filled/inpainted. Its unobserved regions
cannot authorize a change. This diagnostic does not register model weights.
"""
import argparse, hashlib, json, time
from pathlib import Path
import cv2, numpy as np, torch
from PIL import Image, ImageDraw
from model_workers.adapters.moving_detail_alpha import foreground_colour_support
from python_media_worker.studio_subject_matte import CachedSubjectMatte, sha256
from python_media_worker.studio_vfx_plan import VfxFrameRenderer

p=argparse.ArgumentParser();p.add_argument('out',type=Path);a=p.parse_args();a.out.mkdir(exist_ok=False)
torch.set_num_threads(4);torch.set_num_interop_threads(1);cv2.setNumThreads(2)
r=Path('/tmp/autopromote-application-demo-YU8K0a/model-jobs/46d71c74a26b1292737293505105011117c5c9978872589bb6fc82add8a5e95f/d021b00d-7f30-4a2c-a931-e49ed061fc2f')
guide=r/'component_dependency';manifest=json.loads((guide/'manifest.json').read_text())
reference=np.asarray(Image.open(r/'outputs/observed_detail/photographed-reference.png'))
observed=np.asarray(Image.open(r/'outputs/observed_detail/observed-support.png'))>0
path=Path('/home/tibule12/.cache/autopromote-model-runtime/backgroundmattingv2-mit-eval-v1/model.pth')
with path.open('rb') as f:assert hashlib.file_digest(f,'sha256').hexdigest()=='6d449e8a0445438491cf07c03a6e86f21df2b3aa2dc630d9430347fcb807aae4'
model=torch.jit.load(str(path),map_location='cpu').eval();model.backbone_scale=1.;model.refine_mode='full'
work=Path('/tmp/autopromote-application-demo-YU8K0a/subject-previews/4e4e7769-e295-4fb5-8310-042cc31c281c');spec=json.loads((work/'spec.json').read_text())['spec'];cache=CachedSubjectMatte(work/'matte',work/'source.mp4');assets={v['assetId']:work/f'replacement-{i}.asset' for i,v in enumerate(spec['replacementAssets'])}
renderer=VfxFrameRenderer({'version':1,'source_sha256':sha256(work/'source.mp4'),'matte_sha256':cache.artifact_sha256,'effects':spec['scene']['effects']},cache,asset_resolver=assets.__getitem__);prepare=renderer._prepare_foreground
palettes={}
for ci in [1,2]:
 c=manifest['components'][ci];samples=[]
 for prompt in [{'frameIndex':0,'points':c['selection']['points']},*c['selection'].get('shotPrompts',[])]:
  pic=np.asarray(Image.open(r/f"outputs/rgb/rgb_{prompt['frameIndex']:04d}.png"));h,w=pic.shape[:2]
  for pt in prompt['points']:
   if pt['label']!=1:continue
   x=min(w-1,round(pt['position'][0]*w));y=min(h-1,round(pt['position'][1]*h));samples.extend(pic[max(0,y-1):min(h,y+2),max(0,x-1):min(w,x+2)].reshape(-1,3))
 palettes[ci]=np.asarray(samples,np.float32)
rows=[]
for index in [6,9,23,36]:
 rgb=Image.open(r/f'outputs/rgb/rgb_{index:04d}.png').convert('RGB');current=np.asarray(rgb);height,width=current.shape[:2];estimates=[]
 for ci in [1,2]:
  hand=np.asarray(Image.open(guide/manifest['components'][ci]['frames'][index]['file']));ys,xs=np.where(hand>=128)
  if not len(xs):continue
  x0,y0=max(0,int(xs.min())-85),max(0,int(ys.min())-85);x1,y1=min(width,int(xs.max())+86),min(height,int(ys.max())+86);sl=np.s_[y0:y1,x0:x1];local=current[sl];bg=reference[sl];h,w=local.shape[:2]
  # Invalid plate pixels are masked from both the change domain and model
  # comparison input. They are never claimed to be a captured empty plate.
  model_bg=bg.copy();model_bg[~observed[sl]]=local[~observed[sl]]
  tensor=lambda im:torch.nn.functional.pad(torch.from_numpy(im.copy()).permute(2,0,1)[None].float()/255,(0,(-w)%32,0,(-h)%32),mode='replicate')
  started=time.monotonic()
  with torch.inference_mode():ma,mf,*_=model(tensor(local),tensor(model_bg))
  aa=ma[0,0,:h,:w].numpy().clip(0,1);ff=mf[0,:,:h,:w].permute(1,2,0).numpy().clip(0,1)
  domain=(cv2.dilate((hand[sl]>=128).astype(np.uint8),np.ones((31,31),np.uint8))>0)&observed[sl]
  domain&=foreground_colour_support(local,bg.astype(np.float32),palettes[ci])
  weight=np.minimum(cv2.distanceTransform(domain.astype(np.uint8),cv2.DIST_L2,5)/12,1)
  # A different colour model must not turn an opaque palm/cuff translucent.
  depth=cv2.distanceTransform((hand[sl]>=224).astype(np.uint8),cv2.DIST_L2,5)
  weight*=np.clip((28-depth)/12,0,1)
  estimates.append((sl,aa,ff,weight));rows.append({'frame':index,'component':ci,'seconds':time.monotonic()-started,'observedOnly':True})
  print('ACTUAL_BG_PAIR_TILE',json.dumps(rows[-1]),flush=True)
 def paired(frame,alpha,active,w,h):
  foreground,effective=prepare(frame,alpha,active,w,h);values=np.asarray(effective).astype(float)/255;out=np.asarray(foreground).astype(float)/255
  for sl,aa,ff,weight in estimates:
   # Blend premultiplied colours together. Straight-RGB swaps with unchanged
   # alpha create the hard seams seen in the rejected foreground-only trial.
   old=values[sl];premul=out[sl]*old[...,None];nexta=old*(1-weight)+aa*weight
   premul=premul*(1-weight[...,None])+ff*aa[...,None]*weight[...,None]
   out[sl]=np.where(nexta[...,None]>.001,premul/np.maximum(nexta[...,None],.001),out[sl]);values[sl]=nexta
  return Image.fromarray(np.rint(out.clip(0,1)*255).astype(np.uint8)),Image.fromarray(np.rint(values*255).astype(np.uint8))
 renderer._prepare_foreground=paired;result=renderer.render(rgb,index);renderer._prepare_foreground=prepare
 result.save(a.out/f'composite-{index:04d}.png');box=(1040,170,1430,760) if index in [9,36] else (280,280,540,660);w,h=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(w*3,h+24));draw=ImageDraw.Draw(sheet)
 for j,(label,im) in enumerate([('Actual source',rgb),('Actual native revision 3',Image.open(f'/dev/shm/autopromote-native-motion-review-r35-20261104/preview/{index:04d}.png')),('Observed background paired model',result)]):sheet.paste(im.crop(box),(j*w,24));draw.text((j*w,0),label,fill='white')
 sheet.save(a.out/f'comparison-{index:04d}.jpg',quality=97);print('ACTUAL_BG_PAIR_COMPOSITE',index,flush=True)
(a.out/'evaluation.json').write_text(json.dumps({'privateDiagnosticOnly':True,'registeredForProduct':False,'visualPass':False,'rows':rows},indent=2)+'\n')
