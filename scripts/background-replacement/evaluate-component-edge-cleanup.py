"""Internal existing-matte cleanup with independent equipment protection.

Changes only current moving-person boundary opacity; current photographed RGB,
opaque interiors and independently selected equipment alpha remain intact.
"""
import argparse,json,time
from pathlib import Path
import cv2,numpy as np
from PIL import Image,ImageDraw
from python_media_worker.studio_subject_matte import CachedSubjectMatte,sha256
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
p=argparse.ArgumentParser();p.add_argument('out',type=Path);p.add_argument('--all-frames',action='store_true');a=p.parse_args();a.out.mkdir(exist_ok=False);cv2.setNumThreads(2)
root=Path('/tmp/autopromote-application-demo-YU8K0a/model-jobs/39e005f4354085956cb2bcc82468b18296955d32b26cf3958c53821cbc3f5526/2f43d6cc-1eda-4854-be75-66cceadd172a');guide=root/'component_dependency';manifest=json.load(open(guide/'manifest.json'));work=Path('/tmp/autopromote-application-demo-YU8K0a/subject-previews/f2033724-fb92-44dd-b7ae-54114b51036f');spec=json.load(open(work/'spec.json'))['spec'];cache=CachedSubjectMatte(work/'matte',work/'source.mp4');assets={v['assetId']:work/f'replacement-{i}.asset' for i,v in enumerate(spec['replacementAssets'])};renderer=VfxFrameRenderer({'version':1,'source_sha256':sha256(work/'source.mp4'),'matte_sha256':cache.artifact_sha256,'effects':spec['scene']['effects']},cache,asset_resolver=assets.__getitem__);original_frame=cache.frame;rows=[]
for index in (range(48) if a.all_frames else [6,8,9,23,36]):
 rgb=Image.open(root/f'outputs/rgb/rgb_{index:04d}.png').convert('RGB');alpha=original_frame(index);fixed=np.zeros_like(alpha);moving=np.zeros_like(alpha)
 for c in manifest['components']:
  target=moving if c['selection'].get('propagate',True) else fixed
  np.maximum(target,np.asarray(Image.open(guide/c['frames'][index]['file'])),out=target)
 scope=(cv2.dilate((moving>=128).astype(np.uint8),np.ones((15,15),np.uint8))>0)&(cv2.dilate((fixed>=24).astype(np.uint8),np.ones((5,5),np.uint8))==0)
 eroded=cv2.erode(alpha,np.ones((3,3),np.uint8));start=time.monotonic()
 for strength in [.5,1.]:
  values=alpha.copy();values[scope]=np.rint(alpha[scope]*(1-strength)+eroded[scope]*strength).astype(np.uint8)
  assert np.array_equal(values[~scope],alpha[~scope]);cache.frame=lambda frame_index,v=values:v if frame_index==index else original_frame(frame_index)
  try:result=renderer.render(rgb,index)
  finally:cache.frame=original_frame
  tag=f'choke-{strength}';result.save(a.out/f'{tag}-{index:04d}.png');Image.fromarray(values).save(a.out/f'{tag}-alpha-{index:04d}.png')
  if index in [6,8,9,23,36]:
   for label,box in [('left',(280,240,680,720)),('right',(1040,170,1430,760)),('head',(660,45,1040,480))]:
    w,h=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(w*3,h+24));draw=ImageDraw.Draw(sheet)
    for j,(title,im) in enumerate([('Actual source',rgb),('Current native output',Image.open(f'/dev/shm/autopromote-native-click-review-r66-20261104/preview/{index:04d}.png')),('Protected person choke '+str(strength),result)]):sheet.paste(im.crop(box),(w*j,24));draw.text((w*j+3,4),title,fill='white')
    sheet.save(a.out/f'{label}-{tag}-{index:04d}.jpg',quality=97)
 rows.append({'frame':index,'seconds':time.monotonic()-start,'equipmentOpacityUnchanged':True,'newRGBInvented':False});print('INTERNAL_PROTECTED_PERSON_EDGE',index,flush=True)
 (a.out/'evaluation.json').write_text(json.dumps({'rows':rows,'newModelWeights':False,'internalOnly':True,'visualPass':False,'fourMinuteProof':False},indent=2)+'\n')
