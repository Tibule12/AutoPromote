"""Private Apache-2.0 MODNet comparison on actual failed footage; not admission."""
import argparse,json,socket,sys,time
from pathlib import Path
import cv2,numpy as np,torch
from PIL import Image,ImageDraw
from model_workers.common import sha,write_json
from python_media_worker.studio_subject_matte import CachedSubjectMatte
from python_media_worker.studio_vfx_plan import VfxFrameRenderer

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('out',type=Path);p.add_argument('--short-side',type=int,default=512);p.add_argument('--checkpoint',choices=['webcam','photographic'],default='webcam');p.add_argument('--indices',default='7,23,10,17,35');a=p.parse_args();a.out.mkdir(exist_ok=False)
 (a.out/'implementation.py').write_bytes(Path(__file__).read_bytes())
 code=Path('/home/tibule12/.cache/autopromote-model-runtime/modnet-apache-private-v1')
 cl=json.loads((code/'code-lock.json').read_text());wl=json.loads((code/'weights-lock.json').read_text())
 for row in cl['files']:
  if sha(code/row['file'])!=row['sha256']:raise ValueError('Reviewed source changed')
 checkpoint_row=next(v for v in wl['files'] if v['file']==a.checkpoint+'.ckpt')
 if sha(code/checkpoint_row['file'])!=checkpoint_row['sha256']:raise ValueError('MODNet checkpoint changed')
 socket.socket.connect=lambda *unused,**kw:(_ for _ in ()).throw(RuntimeError('Inference networking disabled'))
 sys.path.insert(0,str(code));from src.models.modnet import MODNet
 torch.set_num_threads(3);torch.set_num_interop_threads(1);cv2.setNumThreads(2)
 model=MODNet(backbone_pretrained=False)
 state=torch.load(code/checkpoint_row['file'],map_location='cpu',weights_only=True)
 if not all(k.startswith('module.') for k in state):raise ValueError('Unexpected published parameter names')
 model.load_state_dict({k[7:]:v for k,v in state.items()},strict=True);model=model.to('cuda').eval()
 root=Path('reports/background-replacement-20261101/private');parent=root/'coupled-photo-motion-r143-20261105';work=Path('/dev/shm/autopromote-current-pipeline-r83-20261105');outputs=work/'alpha-work/outputs';guide=work/'alpha-work/component_dependency';manifest=json.loads((guide/'manifest.json').read_text());source=Path(json.loads((work/'receipt.json').read_text())['source'])
 source_sha=sha(source)
 if source_sha!=json.loads((parent/'receipt.json').read_text())['sourceSha256']:raise ValueError('Source differs')
 B=np.array(Image.open(parent/'actual-photographed-reference.png')).astype(float)/255;observed=np.array(Image.open(parent/'actual-photographed-support.png'))>0
 cache=CachedSubjectMatte(outputs/'subject_masks',source);renderer=VfxFrameRenderer(json.loads((work/'actual-plan.json').read_text()),cache,lambda _:root/'replacement.png');renderer.foreground_cache.root=None;prepare=renderer._prepare_foreground
 started=time.monotonic();rows=[]
 for index in map(int,a.indices.split(',')):
  image=Image.open(outputs/f'rgb/rgb_{index:04d}.png').convert('RGB');C=np.array(image).astype(float)/255;h,w=C.shape[:2]
  rh=a.short_side;rw=int(w/h*rh);rh-=rh%32;rw-=rw%32
  tensor=torch.from_numpy(np.array(image).copy()).to('cuda').permute(2,0,1)[None].float()/127.5-1
  tensor=torch.nn.functional.interpolate(tensor,size=(rh,rw),mode='area')
  with torch.inference_mode():_,_,alpha=model(tensor,True)
  alpha=torch.nn.functional.interpolate(alpha,size=(h,w),mode='bilinear',align_corners=False)[0,0].cpu().numpy().clip(0,1)
  Image.fromarray(np.rint(alpha*255).astype(np.uint8)).save(a.out/f'raw-alpha-{index:04d}.png')
  A=np.array(Image.open(parent/f'alpha-{index:04d}.png')).astype(float)/255;F=np.array(Image.open(parent/f'foreground-{index:04d}.png')).astype(float)/255
  for ci in [1,2]:
   hand=np.array(Image.open(guide/manifest['components'][ci]['frames'][index]['file']))
   domain=(cv2.dilate((hand>=64).astype(np.uint8),np.ones((31,31),np.uint8))>0)&observed
   weight=np.minimum(cv2.distanceTransform(domain.astype(np.uint8),cv2.DIST_L2,5)/8,1)
   # The source-conditioned pair uses the same alpha as the actual neural run;
   # preserve all non-hand objects and unobserved reference pixels exactly.
   P=C-(1-alpha[:,:,None])*B
   newF=(P/np.maximum(alpha[:,:,None],.01)).clip(0,1)
   nexta=A*(1-weight)+alpha*weight
   P=F*A[:,:,None]*(1-weight[:,:,None])+newF*alpha[:,:,None]*weight[:,:,None]
   F=P/np.maximum(nexta[:,:,None],.001);A=nexta
  fg=Image.fromarray(np.rint(F.clip(0,1)*255).astype(np.uint8));ma=Image.fromarray(np.rint(A.clip(0,1)*255).astype(np.uint8));renderer._prepare_foreground=lambda *unused,f=fg,m=ma:(f,m);result=renderer.render(image,index);renderer._prepare_foreground=prepare
  fg.save(a.out/f'foreground-{index:04d}.png');ma.save(a.out/f'alpha-{index:04d}.png');result.save(a.out/f'actual-composite-{index:04d}.png')
  for side,box in [('left',(280,240,700,720)),('right',(1040,170,1430,760))]:
   cw,ch=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(cw*3,ch+24))
   for j,(title,pic) in enumerate([('Actual source',image),('Previous paired correction',Image.open(parent/f'actual-composite-{index:04d}.png')),('Published MODNet alpha + actual B',result)]):sheet.paste(pic.crop(box),(cw*j,24));ImageDraw.Draw(sheet).text((cw*j+3,4),title,fill='white')
   sheet.save(a.out/f'actual-{side}-comparison-{index:04d}.jpg',quality=98)
  rows.append({'frame':index,'sourceRgbSha256':sha(outputs/f'rgb/rgb_{index:04d}.png'),'visualPass':False});print(json.dumps({'frame':index,'seconds':time.monotonic()-started}),flush=True)
 write_json(a.out/'receipt.json',{'sourceSha256':source_sha,'checkpoint':checkpoint_row,'sourceCodeRevision':cl['revision'],'inputResolution':[rw,rh],'licence':'Apache-2.0 publisher explicitly includes models','codeLockSha256':sha(code/'code-lock.json'),'weightsLockSha256':sha(code/'weights-lock.json'),'rows':rows,'elapsedSeconds':time.monotonic()-started,'gpuPeakBytes':torch.cuda.max_memory_allocated(),'registeredForProduct':False,'nativeAdmission':False,'visualPass':False,'fourMinuteProof':False,'providerUpload':False,'paidCloudInference':False})
if __name__=='__main__':main()
