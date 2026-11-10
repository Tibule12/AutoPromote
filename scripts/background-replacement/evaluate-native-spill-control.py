"""Exact native blue-spill control on the selected right-hand source region.

Use existing strict VFX commands, not a new algorithm or flattened movie. The
source interval and region are explicit; compare effective alpha before/after.
"""
import argparse,copy,json
from pathlib import Path
import cv2,numpy as np
from PIL import Image,ImageDraw
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
from python_media_worker.studio_subject_matte import CachedSubjectMatte,sha256
p=argparse.ArgumentParser();p.add_argument('out',type=Path);p.add_argument('--all-frames',action='store_true');a=p.parse_args();a.out.mkdir(exist_ok=False);cv2.setNumThreads(2)
root=Path('/tmp/autopromote-application-demo-YU8K0a/model-jobs/46d71c74a26b1292737293505105011117c5c9978872589bb6fc82add8a5e95f/d021b00d-7f30-4a2c-a931-e49ed061fc2f');work=Path('/tmp/autopromote-application-demo-YU8K0a/subject-previews/4e4e7769-e295-4fb5-8310-042cc31c281c');spec=json.loads((work/'spec.json').read_text())['spec'];cache=CachedSubjectMatte(work/'matte',work/'source.mp4');assets={v['assetId']:work/f'replacement-{i}.asset' for i,v in enumerate(spec['replacementAssets'])}
base={'version':1,'source_sha256':sha256(work/'source.mp4'),'matte_sha256':cache.artifact_sha256,'effects':spec['scene']['effects']};old=VfxFrameRenderer(base,cache,asset_resolver=assets.__getitem__);rows=[]
effect={'id':'right-hand-photographed-blue-spill','type':'foreground_refine','start':0,'end':2,'choke':0,'feather':0,'recover_box':[0,0,0,0],'recover_hue':0,'hue_tolerance':0,'saturation_min':1,'detail_box':[.7,.10,1,.73],'dark_max':0,'clear_box':[0,0,0,0],'reject_hue':0,'reject_tolerance':0,'reject_saturation':1,'reject_value':1,'edge_radius':0,'decontaminate':0,'blue_spill':1,'after_holdout':True}
for strength in ([1.] if a.all_frames else [.5,1.]):
 command=copy.deepcopy(base);e={**effect,'blue_spill':strength};command['effects'].append(e);renderer=VfxFrameRenderer(command,cache,asset_resolver=assets.__getitem__);folder=a.out/f'spill-{strength}';folder.mkdir();(folder/'plan.json').write_text(json.dumps(command,indent=2)+'\n')
 for index in (range(48) if a.all_frames else [9,23,6,36]):
  rgb=Image.open(root/f'outputs/rgb/rgb_{index:04d}.png').convert('RGB');alpha=Image.fromarray(cache.frame(index));active=[x for x in command['effects'] if x['start']<=index/24<x['end']];_,old_alpha=old._prepare_foreground(rgb,alpha,[x for x in base['effects'] if x['start']<=index/24<x['end']],rgb.width,rgb.height);_,new_alpha=renderer._prepare_foreground(rgb,alpha,active,rgb.width,rgb.height);changed=int(np.count_nonzero(np.asarray(old_alpha)!=np.asarray(new_alpha)));assert changed==0
  result=renderer.render(rgb,index);result.save(folder/f'{index:04d}.png')
  if index in [6,9,23,36]:
   box=(1040,170,1430,760);w,h=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(w*3,h+24));draw=ImageDraw.Draw(sheet)
   for j,(label,im) in enumerate([('Actual source',rgb),('Actual native revision 3',Image.open(f'/dev/shm/autopromote-native-motion-review-r35-20261104/preview/{index:04d}.png')),('Existing native spill '+str(strength),result)]):sheet.paste(im.crop(box),(w*j,24));draw.text((w*j,0),label,fill='white')
   sheet.save(folder/f'comparison-{index:04d}.jpg',quality=97)
  rows.append({'frame':index,'strength':strength,'effectiveAlphaChangedPixels':changed});print('ACTUAL_NATIVE_SPILL_CONTROL',index,strength,flush=True)
(a.out/'evaluation.json').write_text(json.dumps({'privateEvaluationOnly':True,'existingNativeEffect':effect,'rows':rows,'visualPass':False,'savedThroughStudio':False},indent=2)+'\n')
