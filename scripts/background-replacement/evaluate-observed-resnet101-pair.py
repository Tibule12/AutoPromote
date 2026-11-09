"""Whole-frame background-conditioned alpha/F check, source-observed merge only.

The model context plate is explicitly inpainted in unobserved areas; those
areas can never authorize pixel changes. No inpainted RGB enters the delivered
subject or selected replacement. This private diagnostic installs no model.
"""
import argparse,hashlib,json,socket,time
from pathlib import Path
import cv2,numpy as np,torch
from PIL import Image,ImageDraw
from model_workers.adapters.moving_detail_alpha import foreground_colour_support
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
from python_media_worker.studio_subject_matte import CachedSubjectMatte,sha256
p=argparse.ArgumentParser();p.add_argument('out',type=Path);p.add_argument('--indices',default='23,9,6,36');a=p.parse_args();a.out.mkdir(exist_ok=False);cv2.setNumThreads(2);torch.set_num_threads(4);torch.set_num_interop_threads(1)
directory=Path('/dev/shm/autopromote-bgmatting-resnet101-evaluation-20261104');lock=json.loads((directory/'source-lock.json').read_text())
with (directory/'model.pth').open('rb') as f:assert hashlib.file_digest(f,'sha256').hexdigest()==lock['sha256']
socket.socket.connect=lambda *args,**kw:(_ for _ in ()).throw(RuntimeError('Local model evaluation networking disabled'))
model=torch.jit.load(str(directory/'model.pth'),map_location='cpu').eval();model.backbone_scale=.5;model.refine_mode='full'
root=Path('/tmp/autopromote-application-demo-YU8K0a/model-jobs/46d71c74a26b1292737293505105011117c5c9978872589bb6fc82add8a5e95f/d021b00d-7f30-4a2c-a931-e49ed061fc2f');guide=root/'component_dependency';manifest=json.loads((guide/'manifest.json').read_text());reference=np.asarray(Image.open(root/'outputs/observed_detail/photographed-reference.png'));observed=np.asarray(Image.open(root/'outputs/observed_detail/observed-support.png'))>0
# Only inference context is inpainted. Its mask and uncertainty are retained.
plate=cv2.inpaint(reference,(~observed).astype(np.uint8)*255,5,cv2.INPAINT_TELEA);Image.fromarray(plate).save(a.out/'estimated-context-only.png');Image.fromarray(observed.astype(np.uint8)*255).save(a.out/'actual-observed-support.png')
work=Path('/tmp/autopromote-application-demo-YU8K0a/subject-previews/4e4e7769-e295-4fb5-8310-042cc31c281c');spec=json.loads((work/'spec.json').read_text())['spec'];cache=CachedSubjectMatte(work/'matte',work/'source.mp4');assets={v['assetId']:work/f'replacement-{i}.asset' for i,v in enumerate(spec['replacementAssets'])};renderer=VfxFrameRenderer({'version':1,'source_sha256':sha256(work/'source.mp4'),'matte_sha256':cache.artifact_sha256,'effects':spec['scene']['effects']},cache,asset_resolver=assets.__getitem__);prepare=renderer._prepare_foreground
palettes={}
for ci in [1,2]:
 c=manifest['components'][ci];samples=[]
 for prompt in [{'frameIndex':0,'points':c['selection']['points']},*c['selection'].get('shotPrompts',[])]:
  pic=np.asarray(Image.open(root/f"outputs/rgb/rgb_{prompt['frameIndex']:04d}.png"));h,w=pic.shape[:2]
  for pt in prompt['points']:
   if pt['label']!=1:continue
   x=min(w-1,round(pt['position'][0]*w));y=min(h-1,round(pt['position'][1]*h));samples.extend(pic[max(0,y-1):min(h,y+2),max(0,x-1):min(w,x+2)].reshape(-1,3))
 palettes[ci]=np.asarray(samples,np.float32)
tensor=lambda im:torch.nn.functional.pad(torch.from_numpy(im.copy()).permute(2,0,1)[None].float()/255,(0,(-im.shape[1])%32,0,(-im.shape[0])%32),mode='replicate')
bg=tensor(plate);rows=[];print('ACTUAL_RESNET101_MODEL_AND_CONTEXT_READY',flush=True)
for index in map(int,a.indices.split(',')):
 started=time.monotonic();rgb=Image.open(root/f'outputs/rgb/rgb_{index:04d}.png').convert('RGB');C=np.asarray(rgb);h,w=C.shape[:2]
 with torch.inference_mode():alpha,foreground,*_=model(tensor(C),bg)
 aa=alpha[0,0,:h,:w].numpy().clip(0,1);ff=foreground[0,:,:h,:w].permute(1,2,0).numpy().clip(0,1);Image.fromarray(np.rint(aa*255).astype(np.uint8)).save(a.out/f'raw-alpha-{index:04d}.png');Image.fromarray(np.rint(ff*255).astype(np.uint8)).save(a.out/f'raw-foreground-{index:04d}.png')
 weights=[]
 for ci in [1,2]:
  hand=np.asarray(Image.open(guide/manifest['components'][ci]['frames'][index]['file']));domain=(cv2.dilate((hand>=128).astype(np.uint8),np.ones((31,31),np.uint8))>0)&observed;domain&=foreground_colour_support(C,reference.astype(np.float32),palettes[ci]);depth=cv2.distanceTransform((hand>=224).astype(np.uint8),cv2.DIST_L2,5);weight=np.minimum(cv2.distanceTransform(domain.astype(np.uint8),cv2.DIST_L2,5)/12,1)*np.clip((28-depth)/12,0,1);weights.append(weight)
 weight=np.maximum.reduce(weights)
 def paired(frame,matte,active,width,height):
  fg,effective=prepare(frame,matte,active,width,height);va=np.asarray(effective).astype(float)/255;old=np.asarray(fg).astype(float)/255;nexta=va*(1-weight)+aa*weight;premul=old*va[...,None]*(1-weight[...,None])+ff*aa[...,None]*weight[...,None];out=np.where(nexta[...,None]>.001,premul/np.maximum(nexta[...,None],.001),old)
  return Image.fromarray(np.rint(out.clip(0,1)*255).astype(np.uint8)),Image.fromarray(np.rint(nexta*255).astype(np.uint8))
 renderer._prepare_foreground=paired;result=renderer.render(rgb,index);renderer._prepare_foreground=prepare;result.save(a.out/f'composite-{index:04d}.png');box=(1040,170,1430,760) if index in [9,36] else (280,240,560,680);cw,ch=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(cw*3,ch+24));draw=ImageDraw.Draw(sheet)
 for j,(label,im) in enumerate([('Actual source',rgb),('Actual native revision 3',Image.open(f'/dev/shm/autopromote-native-motion-review-r35-20261104/preview/{index:04d}.png')),('ResNet101 observed-only pair',result)]):sheet.paste(im.crop(box),(cw*j,24));draw.text((cw*j,0),label,fill='white')
 sheet.save(a.out/f'comparison-{index:04d}.jpg',quality=97);rows.append({'frame':index,'seconds':time.monotonic()-started});print('ACTUAL_RESNET101_OBSERVED_PAIR',json.dumps(rows[-1]),flush=True)
 (a.out/'evaluation.json').write_text(json.dumps({'model':lock,'privateLocalEvaluationOnly':True,'backgroundContextIncludesExplicitInpainting':True,'unobservedPixelsNeverAuthorizeChanges':True,'inpaintedRgbEntersOutput':False,'rows':rows,'visualPass':False,'paidCloudInference':False},indent=2)+'\n')
