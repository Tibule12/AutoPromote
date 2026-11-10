"""Private person-only foreground edge extension on the exact native matte.

Extend photographed, opaque subject colours into soft subject boundaries before
compositing. Alpha, body features and separately selected equipment stay exact.
No new weights, generated RGB, colour key or missing-finger substitution.
"""
import argparse,json,time
from pathlib import Path
import cv2,numpy as np
from PIL import Image,ImageDraw
from scipy.ndimage import distance_transform_edt
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
from python_media_worker.studio_subject_matte import CachedSubjectMatte,sha256
p=argparse.ArgumentParser();p.add_argument('out',type=Path);p.add_argument('--indices',default='9,23,6,36');a=p.parse_args();a.out.mkdir(exist_ok=False);cv2.setNumThreads(2)
root=Path('/tmp/autopromote-application-demo-YU8K0a/model-jobs/46d71c74a26b1292737293505105011117c5c9978872589bb6fc82add8a5e95f/d021b00d-7f30-4a2c-a931-e49ed061fc2f');guide=root/'component_dependency';manifest=json.loads((guide/'manifest.json').read_text());work=Path('/tmp/autopromote-application-demo-YU8K0a/subject-previews/4e4e7769-e295-4fb5-8310-042cc31c281c');spec=json.loads((work/'spec.json').read_text())['spec'];cache=CachedSubjectMatte(work/'matte',work/'source.mp4');assets={v['assetId']:work/f'replacement-{i}.asset' for i,v in enumerate(spec['replacementAssets'])};renderer=VfxFrameRenderer({'version':1,'source_sha256':sha256(work/'source.mp4'),'matte_sha256':cache.artifact_sha256,'effects':spec['scene']['effects']},cache,asset_resolver=assets.__getitem__);prepare=renderer._prepare_foreground;rows=[]
for index in map(int,a.indices.split(',')):
 started=time.monotonic();rgb=Image.open(root/f'outputs/rgb/rgb_{index:04d}.png').convert('RGB');current=np.asarray(rgb);h,w=current.shape[:2];active=[e for e in renderer.plan['effects'] if e['start']<=index/24<e['end']];fg,effective=prepare(rgb,Image.fromarray(cache.frame(index)),active,w,h);values=np.asarray(effective).astype(float)/255;old=np.asarray(fg).astype(float);person=np.zeros((h,w),np.uint8);fixed=np.zeros_like(person)
 for component in manifest['components'][:3]:np.maximum(person,np.asarray(Image.open(guide/component['frames'][index]['file'])),out=person)
 for component in manifest['components'][3:]:np.maximum(fixed,np.asarray(Image.open(guide/component['frames'][index]['file'])),out=fixed)
 domain=(cv2.dilate((person>=128).astype(np.uint8),np.ones((15,15),np.uint8))>0)&~((fixed>=24)&(person<128))
 seed=cv2.erode(((values>=.995)&(person>=128)).astype(np.uint8),np.ones((11,11),np.uint8))>0
 distance,indices=distance_transform_edt(~seed,return_indices=True);nearest=current[tuple(indices)].astype(float)
 inside=cv2.distanceTransform((values>=.995).astype(np.uint8),cv2.DIST_L2,5)
 for variant,strength,inner in [('soft-only',1.,False),('soft-and-inner',1.,True),('soft-moderate',.65,False)]:
  weight=np.clip((.995-values)/.25,0,1)
  if inner:weight=np.maximum(weight,np.clip((5-inside)/5,0,1))
  weight*=domain*(values>.01)*np.clip((64-distance)/24,0,1)*strength
  clean=old*(1-weight[...,None])+nearest*weight[...,None]
  def corrected(*args,colour=clean):return Image.fromarray(np.rint(colour.clip(0,255)).astype(np.uint8)),effective
  renderer._prepare_foreground=corrected;result=renderer.render(rgb,index);renderer._prepare_foreground=prepare;result.save(a.out/f'{variant}-composite-{index:04d}.png')
  for name,box in [('left-hand',(280,240,560,680)),('right-hand',(1040,170,1430,760)),('head',(660,45,1040,480))]:
   cw,ch=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(cw*3,ch+24));draw=ImageDraw.Draw(sheet)
   for j,(label,im) in enumerate([('Actual source',rgb),('Actual native revision 3',Image.open(f'/dev/shm/autopromote-native-motion-review-r35-20261104/preview/{index:04d}.png')),('Subject edge extension '+variant,result)]):sheet.paste(im.crop(box),(cw*j,24));draw.text((cw*j,0),label,fill='white')
   sheet.save(a.out/f'{name}-{variant}-{index:04d}.jpg',quality=97)
 rows.append({'frame':index,'seconds':time.monotonic()-started,'alphaUnchanged':True,'fixedPropsExcluded':True});print('ACTUAL_SUBJECT_EDGE_EXTENSION',json.dumps(rows[-1]),flush=True)
 (a.out/'evaluation.json').write_text(json.dumps({'privateEvaluationOnly':True,'noNewWeights':True,'sourceInteriorRgbOnly':True,'rows':rows,'visualPass':False},indent=2)+'\n')
