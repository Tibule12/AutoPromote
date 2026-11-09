"""Private source-bound BEN2-base matting check; reviewed local MIT weights.

This does not register or deploy a model. Fixed equipment masks are retained,
and the exact same source/replacement/native foreground treatment is used.
"""
import argparse,hashlib,importlib.util,json,socket,time
from pathlib import Path
import cv2,numpy as np,torch
from PIL import Image,ImageDraw
from safetensors.torch import load_file
from python_media_worker.studio_subject_matte import CachedSubjectMatte,sha256
from python_media_worker.studio_vfx_plan import VfxFrameRenderer

p=argparse.ArgumentParser();p.add_argument('out',type=Path);p.add_argument('--indices',default='23,9,36,6');a=p.parse_args();a.out.mkdir(exist_ok=False)
torch.set_num_threads(4);torch.set_num_interop_threads(1);cv2.setNumThreads(2)
directory=Path('/dev/shm/autopromote-ben2-evaluation-20261104');lock=json.loads((directory/'source-lock.json').read_text())
for row in lock['files']:
 with (directory/row['path']).open('rb') as f:assert hashlib.file_digest(f,'sha256').hexdigest()==row['sha256']
socket.socket.connect=lambda *args,**kw:(_ for _ in ()).throw(RuntimeError('Local evaluation networking disabled'))
spec=importlib.util.spec_from_file_location('private_ben2_20261104',directory/'BEN2.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
model=module.BEN_Base().float().eval();model.load_state_dict(load_file(str(directory/'model.safetensors')),strict=True)
mean=torch.tensor([.485,.456,.406])[None,:,None,None];std=torch.tensor([.229,.224,.225])[None,:,None,None]
print('PINNED_BEN2_BASE_LOADED_STRICT_CPU',flush=True)
root=Path('/tmp/autopromote-application-demo-YU8K0a/model-jobs/46d71c74a26b1292737293505105011117c5c9978872589bb6fc82add8a5e95f/d021b00d-7f30-4a2c-a931-e49ed061fc2f');manifest=json.loads((root/'component_dependency/manifest.json').read_text())
work=Path('/tmp/autopromote-application-demo-YU8K0a/subject-previews/4e4e7769-e295-4fb5-8310-042cc31c281c');spec=json.loads((work/'spec.json').read_text())['spec'];cache=CachedSubjectMatte(work/'matte',work/'source.mp4');assets={v['assetId']:work/f'replacement-{i}.asset' for i,v in enumerate(spec['replacementAssets'])};renderer=VfxFrameRenderer({'version':1,'source_sha256':sha256(work/'source.mp4'),'matte_sha256':cache.artifact_sha256,'effects':spec['scene']['effects']},cache,asset_resolver=assets.__getitem__);frame_original=cache.frame;rows=[]
for index in map(int,a.indices.split(',')):
 rgb=Image.open(root/f'outputs/rgb/rgb_{index:04d}.png').convert('RGB');started=time.monotonic();tensor=torch.from_numpy(np.asarray(rgb.resize((1024,1024),Image.Resampling.LANCZOS)).copy()).permute(2,0,1)[None].float()/255
 with torch.inference_mode():prediction=model((tensor-mean)/std)
 prediction=torch.nn.functional.interpolate(prediction,size=(rgb.height,rgb.width),mode='bilinear',align_corners=False)[0,0].numpy().clip(0,1)
 Image.fromarray(np.rint(prediction*255).astype(np.uint8)).save(a.out/f'raw-alpha-{index:04d}.png')
 prior=frame_original(index).copy();person=np.zeros_like(prior)
 for component in manifest['components'][:3]:np.maximum(person,np.asarray(Image.open(root/'component_dependency'/component['frames'][index]['file'])),out=person)
 domain=cv2.dilate((person>=128).astype(np.uint8),np.ones((41,41),np.uint8))>0;weight=np.minimum(cv2.distanceTransform(domain.astype(np.uint8),cv2.DIST_L2,5)/16,1)
 fixed=np.zeros_like(prior)
 for component in manifest['components'][3:]:np.maximum(fixed,np.asarray(Image.open(root/'component_dependency'/component['frames'][index]['file'])),out=fixed)
 weight[(fixed>=24)&(person<128)]=0
 values=np.rint(prior*(1-weight)+prediction*255*weight).astype(np.uint8)
 Image.fromarray(values).save(a.out/f'alpha-{index:04d}.png');cache.frame=lambda i,v=values:v;result=renderer.render(rgb,index);cache.frame=frame_original;result.save(a.out/f'composite-{index:04d}.png')
 for name,box in [('left-hand',(280,240,560,680)),('right-hand',(1040,170,1430,760)),('head',(660,45,1040,480)),('props',(0,700,950,1000))]:
  w,h=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(w*3,h+24));draw=ImageDraw.Draw(sheet)
  for j,(label,pic) in enumerate([('Actual source',rgb),('Native revision 3',Image.open(f'/dev/shm/autopromote-native-motion-review-r35-20261104/preview/{index:04d}.png')),('Private local BEN2 diagnostic',result)]):sheet.paste(pic.crop(box),(w*j,24));draw.text((w*j,0),label,fill='white')
  sheet.save(a.out/f'{name}-{index:04d}.jpg',quality=97)
 rows.append({'frame':index,'inputSize':1024,'seconds':time.monotonic()-started});print('ACTUAL_LOCAL_BEN2_FRAME',json.dumps(rows[-1]),flush=True)
 (a.out/'evaluation.json').write_text(json.dumps({'model':lock,'rows':rows,'privateLocalEvaluationOnly':True,'nativeResult':False,'visualPass':False},indent=2)+'\n')
