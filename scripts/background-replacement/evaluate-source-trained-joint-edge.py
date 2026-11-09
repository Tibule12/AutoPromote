"""Private source-specific joint alpha/colour calibration, trained from scratch.

Synthetic motion-blur mixtures have exact alpha/F targets. Source training
patches use later opaque tracked hand interiors; failed test gestures are held
out. No downloaded weights, external inference, or product registration.
"""
import argparse,json,time,random,hashlib
from pathlib import Path
import cv2,numpy as np,torch
from PIL import Image,ImageDraw
from scipy.ndimage import distance_transform_edt
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
from python_media_worker.studio_subject_matte import CachedSubjectMatte,sha256
from model_workers.adapters.moving_detail_alpha import foreground_colour_support

p=argparse.ArgumentParser();p.add_argument('out',type=Path);p.add_argument('--steps',type=int,default=600);p.add_argument('--checkpoint',type=Path);a=p.parse_args();a.out.mkdir(parents=True,exist_ok=False)
torch.set_num_threads(4);torch.set_num_interop_threads(1);cv2.setNumThreads(2);torch.manual_seed(7419);rng=np.random.default_rng(7419)
root=Path('/tmp/autopromote-application-demo-YU8K0a/model-jobs/39e005f4354085956cb2bcc82468b18296955d32b26cf3958c53821cbc3f5526/2f43d6cc-1eda-4854-be75-66cceadd172a');guide=root/'component_dependency';manifest=json.load(open(guide/'manifest.json'))
work=Path('/tmp/autopromote-application-demo-YU8K0a/subject-previews/f2033724-fb92-44dd-b7ae-54114b51036f');spec=json.load(open(work/'spec.json'))['spec'];cache=CachedSubjectMatte(work/'matte',work/'source.mp4');assets={v['assetId']:work/f'replacement-{i}.asset' for i,v in enumerate(spec['replacementAssets'])};renderer=VfxFrameRenderer({'version':1,'source_sha256':sha256(work/'source.mp4'),'matte_sha256':cache.artifact_sha256,'effects':spec['scene']['effects']},cache,asset_resolver=assets.__getitem__);prepare=renderer._prepare_foreground
reference=np.asarray(Image.open(root/'outputs/observed_detail/photographed-reference.png')).astype(np.float32)/255;observed=np.asarray(Image.open(root/'outputs/observed_detail/observed-support.png'))>0
training=[];background_colours=reference[observed];training_frames=list(range(26,35))
for index in training_frames:
 rgb=np.asarray(Image.open(root/f'outputs/rgb/rgb_{index:04d}.png')).astype(np.float32)/255
 for ci in [1,2]:
  hand=np.asarray(Image.open(guide/manifest['components'][ci]['frames'][index]['file']));mask=cv2.erode((hand>=224).astype(np.uint8),np.ones((3,3),np.uint8));ys,xs=np.where(mask)
  if len(xs)<128:continue
  box=(max(0,int(xs.min())-12),max(0,int(ys.min())-12),min(1430,int(xs.max())+13),min(1000,int(ys.max())+13));x0,y0,x1,y1=box;patch=rgb[y0:y1,x0:x1];alpha=mask[y0:y1,x0:x1].astype(np.float32)
  # Only observed RGB inside selected opaque photographed material supplies F.
  _,nearest=distance_transform_edt(alpha==0,return_indices=True);foreground=patch[tuple(nearest)]
  training.append((foreground,alpha))
assert len(training)>=10
class Net(torch.nn.Module):
 def __init__(self):
  super().__init__();block=lambda i,o:torch.nn.Sequential(torch.nn.Conv2d(i,o,3,padding=1),torch.nn.SiLU(),torch.nn.Conv2d(o,o,3,padding=1),torch.nn.SiLU())
  self.a=block(7,16);self.b=block(16,32);self.c=block(32,48);self.d=block(80,32);self.e=block(48,16);self.head=torch.nn.Conv2d(16,4,1)
 def forward(self,x):
  aa=self.a(x);bb=self.b(torch.nn.functional.avg_pool2d(aa,2));cc=self.c(torch.nn.functional.avg_pool2d(bb,2));dd=self.d(torch.cat([torch.nn.functional.interpolate(cc,size=bb.shape[-2:],mode='bilinear',align_corners=False),bb],1));ee=self.e(torch.cat([torch.nn.functional.interpolate(dd,size=aa.shape[-2:],mode='bilinear',align_corners=False),aa],1));return torch.sigmoid(self.head(ee))
model=Net();optimizer=torch.optim.AdamW(model.parameters(),lr=.001,weight_decay=1e-5)
def example():
 F,A=training[int(rng.integers(len(training)))];size=128;factor=float(rng.uniform(.5,1.5));shape=(max(16,round(F.shape[1]*factor)),max(16,round(F.shape[0]*factor)));F=cv2.resize(F,shape);A=cv2.resize(A,shape,interpolation=cv2.INTER_NEAREST)
 pad=48;F=np.pad(F,((pad,pad),(pad,pad),(0,0)),mode='edge');A=np.pad(A,((pad,pad),(pad,pad)));y=int(rng.integers(max(1,F.shape[0]-size)));x=int(rng.integers(max(1,F.shape[1]-size)));F=F[y:y+size,x:x+size].copy();A=A[y:y+size,x:x+size].copy()
 if F.shape[:2]!=(size,size):F=cv2.resize(F,(size,size));A=cv2.resize(A,(size,size))
 length=int(rng.integers(1,24));kernel=np.zeros((25,25),np.float32);angle=float(rng.uniform(0,np.pi));dx=int(round(np.cos(angle)*length/2));dy=int(round(np.sin(angle)*length/2));cv2.line(kernel,(12-dx,12-dy),(12+dx,12+dy),1,1);kernel/=kernel.sum()
 alpha=cv2.filter2D(A,-1,kernel);premul=cv2.filter2D(F*A[...,None],-1,kernel);foreground=premul/np.maximum(alpha[...,None],1e-5)
 bg=background_colours[int(rng.integers(len(background_colours)))];bg=np.broadcast_to(bg,(size,size,3)).copy();shade=rng.normal(0,.015,(size,size)).astype(np.float32);bg=np.clip(bg+cv2.GaussianBlur(shade,(0,0),4)[...,None],0,1)
 image=premul+bg*(1-alpha[...,None]);image=np.clip(image+rng.normal(0,.003,image.shape),0,1).astype(np.float32)
 proxy=cv2.GaussianBlur(A,(0,0),float(rng.uniform(1,5)));proxy=np.clip(proxy+rng.normal(0,.025,A.shape),0,1).astype(np.float32)
 return np.concatenate([image,bg,proxy[...,None]],2).transpose(2,0,1),np.concatenate([alpha[...,None],foreground],2).transpose(2,0,1)
started=time.monotonic();history=[];model.train()
if a.checkpoint:
 assert a.checkpoint.resolve().is_relative_to(Path('/dev/shm/autopromote-source-joint-r67b-20261104'))
 model.load_state_dict(torch.load(a.checkpoint,map_location='cpu',weights_only=True))
else:
 for step in range(a.steps):
  batch=[example() for _ in range(8)];xx=torch.from_numpy(np.stack([x for x,y in batch]));yy=torch.from_numpy(np.stack([y for x,y in batch]));pred=model(xx);alpha=pred[:,:1];foreground=pred[:,1:];mask=yy[:,:1]
  loss=(alpha-mask).abs().mean()+.5*((foreground-yy[:,1:]).abs()*mask).mean()+.5*(foreground*alpha+xx[:,3:6]*(1-alpha)-xx[:,:3]).abs().mean();optimizer.zero_grad();loss.backward();optimizer.step()
  if step%50==0 or step==a.steps-1:
   row={'step':step+1,'syntheticLoss':float(loss.detach()),'seconds':time.monotonic()-started};history.append(row);(a.out/'training-progress.json').write_text(json.dumps(row));print('PRIVATE_SOURCE_TRAINING',json.dumps(row),flush=True)
 torch.save(model.state_dict(),a.out/'source-specific-joint-edge.pth')
model.eval();rows=[]
for index in [6,8,9,23,36]:
 rgb=Image.open(root/f'outputs/rgb/rgb_{index:04d}.png').convert('RGB');current=np.asarray(rgb);h,w=current.shape[:2];active=[e for e in renderer.plan['effects'] if e['start']<=index/24<e['end']];fg,effective=prepare(rgb,Image.fromarray(cache.frame(index)),active,w,h);old=np.asarray(effective).astype(np.float32)/255;oldf=np.asarray(fg).astype(np.float32)/255;variants={name:(old.copy(),oldf.copy()) for name in ['joint','foreground-only','projected-joint']}
 for ci in [1,2]:
  hand=np.asarray(Image.open(guide/manifest['components'][ci]['frames'][index]['file']));ys,xs=np.where(hand>=128)
  if not len(xs):continue
  box=(max(0,int(xs.min())-55),max(0,int(ys.min())-55),min(w,int(xs.max())+56),min(h,int(ys.max())+56));x0,y0,x1,y1=box;sl=np.s_[y0:y1,x0:x1];ch,cw=hand[sl].shape;picture=current[sl].astype(np.float32)/255;bg=reference[sl];prior=old[sl];inputs=torch.from_numpy(np.concatenate([picture,bg,prior[...,None]],2).transpose(2,0,1).copy())[None];inputs=torch.nn.functional.pad(inputs,(0,(-cw)%4,0,(-ch)%4),mode='replicate')
  with torch.inference_mode():prediction=model(inputs)[0,:,:ch,:cw].permute(1,2,0).numpy()
  depth=cv2.distanceTransform((hand[sl]>=224).astype(np.uint8),cv2.DIST_L2,5);domain=(cv2.dilate((hand[sl]>=128).astype(np.uint8),np.ones((21,21),np.uint8))>0)&observed[sl]&(depth<24)
  # Preserve all photographed opaque interiors and all unobserved background.
  weight=domain*np.clip((24-depth)/12,0,1)*np.minimum(cv2.distanceTransform(domain.astype(np.uint8),cv2.DIST_L2,5)/8,1)
  vector=prediction[:,:,1:]-bg;delta=picture-bg;contrast=np.sum(vector*vector,2)
  projected=np.clip(np.sum(delta*vector,2)/np.maximum(contrast,1e-6),0,1)
  lower=np.maximum(np.maximum((picture-bg)/np.maximum(1-bg,1e-5),(bg-picture)/np.maximum(bg,1e-5)).max(2),0)
  projected=np.maximum(projected,np.clip(lower,0,1));residual=np.sqrt(np.mean((delta-projected[...,None]*vector)**2,2))
  physical=(picture-(1-projected[...,None])*bg)/np.maximum(projected[...,None],.02)
  for name,(values,colours) in variants.items():
   candidate=prediction[:,:,0] if name=='joint' else prior;candidate_f=prediction[:,:,1:];blend=weight
   if name=='projected-joint':candidate=projected;candidate_f=physical.clip(0,1);blend=weight*np.clip((.08-residual)/.04,0,1)*(contrast>.01)
   nexta=prior*(1-blend)+candidate*blend;premul=oldf[sl]*prior[...,None]*(1-blend[...,None])+candidate_f*candidate[...,None]*blend[...,None];values[sl]=nexta;colours[sl]=np.where(nexta[...,None]>.001,premul/np.maximum(nexta[...,None],.001),oldf[sl])
 for name,(values,colours) in variants.items():
  renderer._prepare_foreground=lambda *args,v=values,f=colours:(Image.fromarray(np.rint(f.clip(0,1)*255).astype(np.uint8)),Image.fromarray(np.rint(v.clip(0,1)*255).astype(np.uint8)));result=renderer.render(rgb,index);renderer._prepare_foreground=prepare;result.save(a.out/f'{name}-{index:04d}.png')
  for label,box in [('left',(280,240,680,720)),('right',(1040,170,1430,760))]:
   cw,ch=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(cw*3,ch+24));draw=ImageDraw.Draw(sheet)
   for j,(title,im) in enumerate([('Actual source',rgb),('Current internal native output',Image.open(f'/dev/shm/autopromote-native-click-review-r66-20261104/preview/{index:04d}.png')),('Source-trained diagnostic '+name,result)]):sheet.paste(im.crop(box),(cw*j,24));draw.text((cw*j+3,4),title,fill='white')
   sheet.save(a.out/f'{label}-{name}-{index:04d}.jpg',quality=97)
 rows.append({'frame':index,'heldOutFromSourceTraining':index not in training_frames});print('PRIVATE_SOURCE_TRAINED_EDGE',index,flush=True)
(a.out/'evaluation.json').write_text(json.dumps({'privateInternalOnly':True,'sourceTrainingFrames':training_frames,'failedTestGesturesHeldOut':True,'newPretrainedWeightsDownloaded':False,'steps':a.steps,'syntheticHistory':history,'actualFrames':rows,'fullMovingQualification':False,'visualPass':False,'fourMinuteProof':False,'productRegistration':False},indent=2)+'\n')
