"""Private tracked-material source-spill correction, preserving luminance.

Independent current hand/person masks bound each material field. No alpha or
equipment geometry changes; no nearest-pixel RGB facets or generated texture.
"""
import argparse,json,time
from pathlib import Path
import cv2,numpy as np
from PIL import Image,ImageDraw
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
from python_media_worker.studio_subject_matte import CachedSubjectMatte,sha256
p=argparse.ArgumentParser();p.add_argument('out',type=Path);p.add_argument('--indices',default='9,23,6,36');a=p.parse_args();a.out.mkdir(exist_ok=False);cv2.setNumThreads(2)
root=Path('/tmp/autopromote-application-demo-YU8K0a/model-jobs/46d71c74a26b1292737293505105011117c5c9978872589bb6fc82add8a5e95f/d021b00d-7f30-4a2c-a931-e49ed061fc2f');guide=root/'component_dependency';manifest=json.loads((guide/'manifest.json').read_text());work=Path('/tmp/autopromote-application-demo-YU8K0a/subject-previews/4e4e7769-e295-4fb5-8310-042cc31c281c');spec=json.loads((work/'spec.json').read_text())['spec'];cache=CachedSubjectMatte(work/'matte',work/'source.mp4');assets={v['assetId']:work/f'replacement-{i}.asset' for i,v in enumerate(spec['replacementAssets'])};renderer=VfxFrameRenderer({'version':1,'source_sha256':sha256(work/'source.mp4'),'matte_sha256':cache.artifact_sha256,'effects':spec['scene']['effects']},cache,asset_resolver=assets.__getitem__);prepare=renderer._prepare_foreground;rows=[];reference=np.asarray(Image.open(root/'outputs/observed_detail/photographed-reference.png')).astype(np.float32)/255;observed=np.asarray(Image.open(root/'outputs/observed_detail/observed-support.png'))>0;reference_lab=cv2.cvtColor(reference,cv2.COLOR_RGB2LAB)
for index in map(int,a.indices.split(',')):
 started=time.monotonic();rgb=Image.open(root/f'outputs/rgb/rgb_{index:04d}.png').convert('RGB');current=np.asarray(rgb);h,w=current.shape[:2];active=[e for e in renderer.plan['effects'] if e['start']<=index/24<e['end']];fg,effective=prepare(rgb,Image.fromarray(cache.frame(index)),active,w,h);values=np.asarray(effective).astype(np.float32)/255;old=np.asarray(fg).astype(np.float32)/255;source_lab=cv2.cvtColor(current.astype(np.float32)/255,cv2.COLOR_RGB2LAB);old_lab=cv2.cvtColor(old,cv2.COLOR_RGB2LAB);fixed=np.zeros((h,w),np.uint8)
 for c in manifest['components'][3:]:np.maximum(fixed,np.asarray(Image.open(guide/c['frames'][index]['file'])),out=fixed)
 target=old_lab.copy();eligible=np.zeros(values.shape,bool);shadow_weight=np.zeros(values.shape,np.float32);inside=cv2.distanceTransform((values>=.995).astype(np.uint8),cv2.DIST_L2,5)
 for ci in [0,1,2]:
  comp=np.asarray(Image.open(guide/manifest['components'][ci]['frames'][index]['file']));domain=(cv2.dilate((comp>=128).astype(np.uint8),np.ones((15,15),np.uint8))>0)&(fixed<24);seed=cv2.erode(((values>=.995)&(comp>=128)).astype(np.uint8),np.ones((7,7),np.uint8)).astype(np.float32)
  if ci in [1,2]:
   samples=[];background_samples=[];selection=manifest['components'][ci]['selection']
   for prompt in [{'frameIndex':0,'points':selection['points']},*selection.get('shotPrompts',[])]:
    pic=np.asarray(Image.open(root/f"outputs/rgb/rgb_{prompt['frameIndex']:04d}.png")).astype(np.float32)/255;plab=cv2.cvtColor(pic,cv2.COLOR_RGB2LAB)
    for point in prompt['points']:
     px=min(w-1,round(point['position'][0]*w));py=min(h-1,round(point['position'][1]*h));
     if point['label']==1:samples.append(plab[py,px,1:])
     else:
      source_alpha=np.asarray(Image.open(root/f"outputs/subject_masks/matte_{prompt['frameIndex']:04d}.png"))
      if source_alpha[py,px]<24:background_samples.append(plab[py,px,1:])
   palette=np.asarray(samples,np.float32);distance=np.full(values.shape,np.inf,np.float32)
   for colour in palette:distance=np.minimum(distance,np.linalg.norm(source_lab[:,:,1:]-colour,axis=2))
   seed*=distance<9
  if seed.sum()<32:continue
  field=np.zeros_like(source_lab[:,:,1:]);normalizer=np.zeros_like(values)
  # Smooth weighted extension avoids discontinuities at Voronoi boundaries.
  for sigma in [3.,6.,12.,24.,40.]:
   weight=cv2.GaussianBlur(seed,(0,0),sigma);numerator=cv2.GaussianBlur(source_lab[:,:,1:]*seed[...,None],(0,0),sigma);reliable=weight>1e-4;candidate=numerator/np.maximum(weight[...,None],1e-6);use=reliable&(normalizer<1e-4);field[use]=candidate[use];normalizer[use]=weight[use]
  allowed=domain&(normalizer>1e-4);target[:,:,1:][allowed]=field[allowed];eligible|=allowed
  if ci in [1,2]:
   # Real observed blue background and actual positive-click hand material
   # define the spill direction. A legitimately blue selected material would
   # not have this separation and is not neutralised by a global hue key.
   background_field=reference_lab[:,:,1:].copy()
   if background_samples:
    background_palette=np.asarray(background_samples,np.float32);cool=background_palette[np.argmin(background_palette[:,1])];background_field[~observed]=cool
   vector=background_field-field;difference=old_lab[:,:,1:]-field;contrast=np.sum(vector*vector,2);projection=np.sum(difference*vector,2)/np.maximum(contrast,1);cosine=np.sum(difference*vector,2)/np.maximum(np.sqrt(contrast*np.sum(difference*difference,2)),1)
   shadow=allowed&(comp>=128)&(background_field[:,:,1]<field[:,:,1]-10)&(contrast>15**2)
   shadow_weight=np.maximum(shadow_weight,shadow*np.clip((projection-.02)/.15,0,1)*np.clip((cosine-.6)/.3,0,1))
 for strength in [.5,1.]:
  weight=np.maximum(np.maximum(np.clip((.999-values)/.15,0,1),np.clip((2-inside)/2,0,1))*eligible,shadow_weight)*(values>.01)*strength
  clean_lab=old_lab.copy();clean_lab[:,:,1:]=old_lab[:,:,1:]*(1-weight[...,None])+target[:,:,1:]*weight[...,None];clean=cv2.cvtColor(clean_lab,cv2.COLOR_LAB2RGB).clip(0,1)
  def corrected(*args,c=clean):return Image.fromarray(np.rint(c*255).astype(np.uint8)),effective
  renderer._prepare_foreground=corrected;result=renderer.render(rgb,index);renderer._prepare_foreground=prepare;tag=f'guided-spill-{strength}';result.save(a.out/f'{tag}-composite-{index:04d}.png')
  for name,box in [('left-hand',(280,240,560,680)),('right-hand',(1040,170,1430,760)),('head',(660,45,1040,480))]:
   cw,ch=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(cw*3,ch+24));draw=ImageDraw.Draw(sheet)
   for j,(label,im) in enumerate([('Actual source',rgb),('Actual native revision 3',Image.open(f'/dev/shm/autopromote-native-motion-review-r35-20261104/preview/{index:04d}.png')),('Tracked material spill '+str(strength),result)]):sheet.paste(im.crop(box),(cw*j,24));draw.text((cw*j,0),label,fill='white')
   sheet.save(a.out/f'{name}-{tag}-{index:04d}.jpg',quality=97)
 rows.append({'frame':index,'seconds':time.monotonic()-started,'alphaUnchanged':True,'foregroundLuminanceUnchanged':True});print('ACTUAL_SOURCE_GUIDED_MATERIAL_SPILL',json.dumps(rows[-1]),flush=True)
 (a.out/'evaluation.json').write_text(json.dumps({'privateLocalEvaluationOnly':True,'noNewWeights':True,'rows':rows,'visualPass':False},indent=2)+'\n')
