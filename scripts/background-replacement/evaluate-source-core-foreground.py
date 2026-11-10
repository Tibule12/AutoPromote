"""Actual-frame core/edge colour separation; final visible alpha stays exact.

The colour solver gets a narrower core matte so contaminated boundary RGB is
not declared opaque evidence. The compositing matte is never choked. Separate
equipment/plant pixels remain on the current native foreground path.
"""
import argparse,json,time
from pathlib import Path
import cv2,numpy as np
from PIL import Image,ImageDraw
from pymatting import estimate_foreground_ml
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
from python_media_worker.studio_subject_matte import CachedSubjectMatte,sha256
p=argparse.ArgumentParser();p.add_argument('out',type=Path);p.add_argument('--indices',default='9,23,6,36');a=p.parse_args();a.out.mkdir(exist_ok=False);cv2.setNumThreads(2)
root=Path('/tmp/autopromote-application-demo-YU8K0a/model-jobs/46d71c74a26b1292737293505105011117c5c9978872589bb6fc82add8a5e95f/d021b00d-7f30-4a2c-a931-e49ed061fc2f');guide=root/'component_dependency';manifest=json.loads((guide/'manifest.json').read_text());work=Path('/tmp/autopromote-application-demo-YU8K0a/subject-previews/4e4e7769-e295-4fb5-8310-042cc31c281c');spec=json.loads((work/'spec.json').read_text())['spec'];cache=CachedSubjectMatte(work/'matte',work/'source.mp4');assets={v['assetId']:work/f'replacement-{i}.asset' for i,v in enumerate(spec['replacementAssets'])};renderer=VfxFrameRenderer({'version':1,'source_sha256':sha256(work/'source.mp4'),'matte_sha256':cache.artifact_sha256,'effects':spec['scene']['effects']},cache,asset_resolver=assets.__getitem__);prepare=renderer._prepare_foreground;rows=[]
for index in map(int,a.indices.split(',')):
 started=time.monotonic();rgb=Image.open(root/f'outputs/rgb/rgb_{index:04d}.png').convert('RGB');current=np.asarray(rgb);h,w=current.shape[:2];active=[e for e in renderer.plan['effects'] if e['start']<=index/24<e['end']];fg,effective=prepare(rgb,Image.fromarray(cache.frame(index)),active,w,h);values=np.asarray(effective).astype(np.float64)/255;old=np.asarray(fg).astype(float)/255;person=np.zeros((h,w),np.uint8);fixed=np.zeros_like(person)
 for c in manifest['components'][:3]:np.maximum(person,np.asarray(Image.open(guide/c['frames'][index]['file'])),out=person)
 for c in manifest['components'][3:]:np.maximum(fixed,np.asarray(Image.open(guide/c['frames'][index]['file'])),out=fixed)
 domain=(cv2.dilate((person>=128).astype(np.uint8),np.ones((15,15),np.uint8))>0)&~((fixed>=24)&(person<128));inside=cv2.distanceTransform((values>=.995).astype(np.uint8),cv2.DIST_L2,5)
 for radius in [1,3]:
  core=cv2.erode(values,np.ones((2*radius+1,2*radius+1),np.uint8));core[~domain]=values[~domain];candidate=estimate_foreground_ml(current.astype(float)/255,core).clip(0,1)
  for inner in [False,True]:
   weight=np.clip((.999-values)/.15,0,1)
   if inner:weight=np.maximum(weight,np.clip((2-inside)/2,0,1))
   weight*=domain*(values>.01);clean=old*(1-weight[...,None])+candidate*weight[...,None]
   def corrected(*args,colour=clean):return Image.fromarray(np.rint(colour*255).astype(np.uint8)),effective
   renderer._prepare_foreground=corrected;result=renderer.render(rgb,index);renderer._prepare_foreground=prepare;tag=f'core{radius}'+('-inner2' if inner else '-soft');result.save(a.out/f'{tag}-composite-{index:04d}.png')
   for name,box in [('left-hand',(280,240,560,680)),('right-hand',(1040,170,1430,760)),('head',(660,45,1040,480))]:
    cw,ch=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(cw*3,ch+24));draw=ImageDraw.Draw(sheet)
    for j,(label,im) in enumerate([('Actual source',rgb),('Actual native revision 3',Image.open(f'/dev/shm/autopromote-native-motion-review-r35-20261104/preview/{index:04d}.png')),('Separate RGB core '+tag,result)]):sheet.paste(im.crop(box),(cw*j,24));draw.text((cw*j,0),label,fill='white')
    sheet.save(a.out/f'{name}-{tag}-{index:04d}.jpg',quality=97)
 rows.append({'frame':index,'seconds':time.monotonic()-started,'visibleAlphaUnchanged':True,'separateEquipmentPreserved':True});print('ACTUAL_SOURCE_CORE_FOREGROUND',json.dumps(rows[-1]),flush=True)
 (a.out/'evaluation.json').write_text(json.dumps({'privateEvaluationOnly':True,'noNewWeights':True,'rows':rows,'visualPass':False},indent=2)+'\n')
