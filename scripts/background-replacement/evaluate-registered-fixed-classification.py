"""Actual-frame check of the registered fixed-object classifier, not a mock."""
import argparse,json
from pathlib import Path
import cv2,numpy as np
from PIL import Image,ImageDraw
from model_workers.adapters.source_edge_alpha import classify_corrected_fixed_object
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
from python_media_worker.studio_subject_matte import CachedSubjectMatte,sha256
p=argparse.ArgumentParser();p.add_argument('out',type=Path);p.add_argument('--component-directory',type=Path);p.add_argument('--selection-file',type=Path);a=p.parse_args();a.out.mkdir(exist_ok=False);cv2.setNumThreads(2)
r=Path('/tmp/autopromote-application-demo-YU8K0a/model-jobs/2ffcb14a6f49829c8367f70a0e2acf88c680677ea16c867b2b06e16625b50d8b/8bdb364c-fc94-4289-b720-4374bcefcc9a');directory=r/'component_dependency';manifest=json.loads((directory/'manifest.json').read_text());rgb=np.asarray(Image.open(r/'outputs/rgb/rgb_0000.png'));prior=np.asarray(Image.open(r/'outputs/subject_masks/matte_0000.png'));probe=Path('/dev/shm/autopromote-corrected-plant-r33-20261104');evidence=np.asarray(Image.open(probe/'corrected-tv-alpha.png'));selection=json.loads((probe/'corrected-tv-selection.json').read_text());person=np.asarray(Image.open(directory/manifest['components'][0]['frames'][0]['file']));protect=cv2.dilate((person>=24).astype(np.uint8),np.ones((7,7),np.uint8))
if a.component_directory:
 assert a.selection_file
 directory=a.component_directory;selection=json.loads(a.selection_file.read_text())
 person=np.asarray(Image.open(directory/'component_00_0000.png'));protect=cv2.dilate((person>=24).astype(np.uint8),np.ones((7,7),np.uint8));evidence=np.asarray(Image.open(directory/'component_05_0000.png'))
 for c in range(1,5):protect|=cv2.dilate((np.asarray(Image.open(directory/f'component_{c:02d}_0000.png'))>=128).astype(np.uint8),np.ones((7,7),np.uint8))
else:
 for component in manifest['components'][1:-1]:protect|=cv2.dilate((np.asarray(Image.open(directory/component['frames'][0]['file']))>=128).astype(np.uint8),np.ones((7,7),np.uint8))
changed=classify_corrected_fixed_object(rgb,prior,rgb,selection['points'],[0,760,200,1000],evidence,protect);assert changed is not None
Image.fromarray(changed).save(a.out/'alpha.png');work=Path('/tmp/autopromote-application-demo-YU8K0a/subject-previews/cfa95525-d7a9-4afe-9f51-2951ae9ab0bd');spec=json.loads((work/'spec.json').read_text())['spec'];base=CachedSubjectMatte(work/'matte',work/'source.mp4');assets={v['assetId']:work/f'replacement-{i}.asset' for i,v in enumerate(spec['replacementAssets'])}
class Cache:
 manifest=base.manifest;artifact_sha256='private-diagnostic';directory=None
 def frame(self,index):return changed
renderer=VfxFrameRenderer({'version':1,'source_sha256':sha256(work/'source.mp4'),'matte_sha256':'private-diagnostic','effects':spec['scene']['effects']},Cache(),asset_resolver=assets.__getitem__);result=renderer.render(Image.fromarray(rgb),0);result.save(a.out/'composite.png');box=(0,755,330,992);sheet=Image.new('RGB',(990,261));draw=ImageDraw.Draw(sheet)
for j,(name,im) in enumerate([('Actual source',Image.fromarray(rgb)),('Actual prior native preview',Image.open('/dev/shm/autopromote-native-motion-review-r31-20261104/preview/0000.png')),('Registered classifier diagnostic',result)]):sheet.paste(im.crop(box),(330*j,24));draw.text((330*j,0),name,fill='white')
sheet.resize((1485,392)).save(a.out/'comparison.jpg',quality=97);print('ACTUAL_REGISTERED_FIXED_CLASSIFIER_COMPLETE',flush=True)
