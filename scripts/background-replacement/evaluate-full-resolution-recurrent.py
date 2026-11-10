"""Full-source-resolution recurrent matting check with existing licensed weights.

Private still diagnostics initialize the recurrent state per selected source
frame and are not motion qualification. The optional consecutive mode processes
the actual 48-frame source clock. Selected equipment never uses person alpha.
"""
import argparse,hashlib,json,socket,time
from pathlib import Path
import cv2,numpy as np,torch
from PIL import Image,ImageDraw
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
from python_media_worker.studio_subject_matte import CachedSubjectMatte,sha256
p=argparse.ArgumentParser();p.add_argument('out',type=Path);p.add_argument('--indices',default='9,23,6,36');p.add_argument('--sequence',action='store_true');a=p.parse_args();a.out.mkdir(exist_ok=False)
torch.set_num_threads(4);torch.set_num_interop_threads(1);cv2.setNumThreads(2)
directory=Path('/home/tibule12/.cache/autopromote-model-runtime/rvm-resnet50-private-eval-v1');lock=json.loads((directory/'provenance.json').read_text());path=directory/'rvm_resnet50_fp32.torchscript'
with path.open('rb') as f:assert hashlib.file_digest(f,'sha256').hexdigest()==lock['sha256']
socket.socket.connect=lambda *args,**kw:(_ for _ in ()).throw(RuntimeError('Local recurrent matting cannot access network'))
model=torch.jit.load(str(path),map_location='cpu').eval()
root=Path('/tmp/autopromote-application-demo-YU8K0a/model-jobs/46d71c74a26b1292737293505105011117c5c9978872589bb6fc82add8a5e95f/d021b00d-7f30-4a2c-a931-e49ed061fc2f');guide=root/'component_dependency';manifest=json.loads((guide/'manifest.json').read_text());work=Path('/tmp/autopromote-application-demo-YU8K0a/subject-previews/4e4e7769-e295-4fb5-8310-042cc31c281c');spec=json.loads((work/'spec.json').read_text())['spec'];cache=CachedSubjectMatte(work/'matte',work/'source.mp4');assets={v['assetId']:work/f'replacement-{i}.asset' for i,v in enumerate(spec['replacementAssets'])};renderer=VfxFrameRenderer({'version':1,'source_sha256':sha256(work/'source.mp4'),'matte_sha256':cache.artifact_sha256,'effects':spec['scene']['effects']},cache,asset_resolver=assets.__getitem__);prepare=renderer._prepare_foreground
for name in ['alpha','foreground','composite']:(a.out/name).mkdir()
indices=range(48) if a.sequence else map(int,a.indices.split(','));states=[None]*4;rows=[]
for index in indices:
 started=time.monotonic();rgb=Image.open(root/f'outputs/rgb/rgb_{index:04d}.png').convert('RGB');current=np.asarray(rgb);h,w=current.shape[:2];tensor=torch.from_numpy(current.copy()).permute(2,0,1)[None].float()/255
 if not a.sequence:states=[None]*4
 with torch.inference_mode():
  for repeat in range(2 if not a.sequence or index==0 else 1):rf,ra,*states=model(tensor,*states,1.)
 aa=ra[0,0].numpy().clip(0,1);ff=rf[0].permute(1,2,0).numpy().clip(0,1);Image.fromarray(np.rint(aa*255).astype(np.uint8)).save(a.out/'alpha'/f'{index:04d}.png');Image.fromarray(np.rint(ff*255).astype(np.uint8)).save(a.out/'foreground'/f'{index:04d}.png')
 person=np.zeros((h,w),np.uint8);fixed=np.zeros_like(person)
 for c in manifest['components'][:3]:np.maximum(person,np.asarray(Image.open(guide/c['frames'][index]['file'])),out=person)
 for c in manifest['components'][3:]:np.maximum(fixed,np.asarray(Image.open(guide/c['frames'][index]['file'])),out=fixed)
 domain=(cv2.dilate((person>=128).astype(np.uint8),np.ones((31,31),np.uint8))>0)&(fixed<24);weight=np.minimum(cv2.distanceTransform(domain.astype(np.uint8),cv2.DIST_L2,5)/12,1)
 def paired(frame,matte,active,width,height):
  fg,effective=prepare(frame,matte,active,width,height);old=np.asarray(effective).astype(float)/255;oldf=np.asarray(fg).astype(float)/255
  depth=cv2.distanceTransform(((person>=224)&(old>=.995)).astype(np.uint8),cv2.DIST_L2,5)
  use=weight*np.clip((32-depth)/16,0,1);values=old*(1-use)+aa*use;premul=oldf*old[...,None]*(1-use[...,None])+ff*aa[...,None]*use[...,None];colour=np.where(values[...,None]>.001,premul/np.maximum(values[...,None],.001),oldf)
  return Image.fromarray(np.rint(colour.clip(0,1)*255).astype(np.uint8)),Image.fromarray(np.rint(values*255).astype(np.uint8))
 renderer._prepare_foreground=paired;result=renderer.render(rgb,index);renderer._prepare_foreground=prepare;result.save(a.out/'composite'/f'{index:04d}.png')
 if index in [0,6,9,23,36,47]:
  for name,box in [('left-hand',(280,240,560,680)),('right-hand',(1040,170,1430,760)),('head',(660,45,1040,480))]:
   cw,ch=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(cw*3,ch+24));draw=ImageDraw.Draw(sheet)
   for j,(label,im) in enumerate([('Actual source',rgb),('Actual native revision 3',Image.open(f'/dev/shm/autopromote-native-motion-review-r35-20261104/preview/{index:04d}.png')),('Full-resolution recurrent pair',result)]):sheet.paste(im.crop(box),(cw*j,24));draw.text((cw*j,0),label,fill='white')
   sheet.save(a.out/f'{name}-{index:04d}.jpg',quality=97)
 rows.append({'frame':index,'seconds':time.monotonic()-started,'fullNativeInputResolution':[w,h],'downsampleRatio':1.});print('ACTUAL_FULL_RES_RECURRENT',json.dumps(rows[-1]),flush=True)
 (a.out/'evaluation.json').write_text(json.dumps({'privateLocalEvaluationOnly':True,'model':lock,'modelLicense':'GPL-3.0','registeredForProduct':False,'consecutiveActualSourceFrames':a.sequence,'warmup':'One repeated first source frame in sequence mode; two repeats per still in diagnostic mode','rows':rows,'visualPass':False},indent=2)+'\n')
