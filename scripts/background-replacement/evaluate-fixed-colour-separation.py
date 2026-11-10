"""Private bounds comparison; never changes registered source-edge code."""
import argparse,inspect,json
from pathlib import Path
import cv2,numpy as np
from PIL import Image,ImageDraw
import model_workers.adapters.source_edge_alpha as edge
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
from python_media_worker.studio_subject_matte import CachedSubjectMatte,sha256
p=argparse.ArgumentParser();p.add_argument('out',type=Path);a=p.parse_args();a.out.mkdir(exist_ok=False);cv2.setNumThreads(2)
r=Path('/tmp/autopromote-application-demo-YU8K0a/model-jobs/2ffcb14a6f49829c8367f70a0e2acf88c680677ea16c867b2b06e16625b50d8b/8bdb364c-fc94-4289-b720-4374bcefcc9a');rgb=np.asarray(Image.open(r/'outputs/rgb/rgb_0000.png'));prior=np.asarray(Image.open('/dev/shm/autopromote-corrected-plant-matte-r33-20261104/alpha.png'));manifest=json.loads((r/'component_dependency/manifest.json').read_text());person=np.asarray(Image.open(r/'component_dependency'/manifest['components'][0]['frames'][0]['file']));protect=cv2.dilate((person>=24).astype(np.uint8),np.ones((7,7),np.uint8));selection=json.loads(Path('/dev/shm/autopromote-corrected-plant-r33-20261104/corrected-tv-selection.json').read_text())
work=Path('/tmp/autopromote-application-demo-YU8K0a/subject-previews/cfa95525-d7a9-4afe-9f51-2951ae9ab0bd');spec=json.loads((work/'spec.json').read_text())['spec'];base=CachedSubjectMatte(work/'matte',work/'source.mp4');assets={v['assetId']:work/f'replacement-{i}.asset' for i,v in enumerate(spec['replacementAssets'])}
class Cache:
 manifest=base.manifest;artifact_sha256='private-diagnostic';directory=None
 def frame(self,index):return changed
original_function=inspect.getsource(edge.refine_corrected_object_alpha)
for distance,margin in [(22,24),(14,8),(10,5),(8,3)]:
 scope=dict(edge.__dict__);source=original_function.replace('reject=(background<22)&(background+24<foreground)',f'reject=(background<{distance})&(background+{margin}<foreground)');exec(compile(source,'private-fixed-colour-probe','exec'),scope)
 changed=scope['refine_corrected_object_alpha'](rgb,prior,rgb,selection['points'],[0,760,200,1000],protect)
 renderer=VfxFrameRenderer({'version':1,'source_sha256':sha256(work/'source.mp4'),'matte_sha256':'private-diagnostic','effects':spec['scene']['effects']},Cache(),asset_resolver=assets.__getitem__);result=renderer.render(Image.fromarray(rgb),0);result.save(a.out/f'composite-{distance}-{margin}.png');Image.fromarray(changed).save(a.out/f'alpha-{distance}-{margin}.png');box=(0,760,210,992);sheet=Image.new('RGB',(630,256));draw=ImageDraw.Draw(sheet)
 for j,(name,im) in enumerate([('Actual source',Image.fromarray(rgb)),('Prior preview',Image.open('/dev/shm/autopromote-native-motion-review-r31-20261104/preview/0000.png')),(f'Private bounds {distance}/{margin}',result)]):sheet.paste(im.crop(box),(210*j,24));draw.text((210*j,0),name,fill='white')
 sheet.resize((1260,512)).save(a.out/f'comparison-{distance}-{margin}.jpg',quality=97);print('ACTUAL_FIXED_COLOUR_BOUNDS',distance,margin,int(np.count_nonzero(changed!=prior)),flush=True)
