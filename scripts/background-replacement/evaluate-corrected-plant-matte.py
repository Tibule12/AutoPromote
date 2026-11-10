"""One actual-frame diagnostic through the existing SAM/ViT/source-edge path."""
import argparse,copy,json
from pathlib import Path
import cv2,numpy as np,torch
from PIL import Image,ImageDraw
from transformers import VitMatteForImageMatting
from model_workers.adapters.temporal_alpha import make_trimap,condition_trimap_clicks
from model_workers.adapters.source_edge_alpha import refine_source_edge
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
from python_media_worker.studio_subject_matte import CachedSubjectMatte,sha256
p=argparse.ArgumentParser();p.add_argument('out',type=Path);a=p.parse_args();a.out.mkdir(exist_ok=False)
torch.set_num_threads(3);torch.set_num_interop_threads(1);cv2.setNumThreads(2)
r=Path('/tmp/autopromote-application-demo-YU8K0a/model-jobs/2ffcb14a6f49829c8367f70a0e2acf88c680677ea16c867b2b06e16625b50d8b/8bdb364c-fc94-4289-b720-4374bcefcc9a');directory=r/'component_dependency';manifest=json.loads((directory/'manifest.json').read_text());rgb=np.asarray(Image.open(r/'outputs/rgb/rgb_0000.png'));manifest['_reference_rgb']=rgb
probe=Path('/dev/shm/autopromote-corrected-plant-r33-20261104');variant='corrected-tv';manifest['components'][-1]['selection']=json.loads((probe/f'{variant}-selection.json').read_text());manifest['components'][-1]['frames'][0]['file']=str(probe/f'{variant}-alpha.png')
components=[(c['selection'],np.asarray(Image.open(directory/c['frames'][0]['file']))) for c in manifest['components']]
union=np.maximum.reduce([x for _,x in components]);fixed=np.maximum.reduce([x for c,x in components if not c.get('propagate',True)]);objects=np.maximum.reduce([x for _,x in components[1:]])>=24
trimap=make_trimap((union>=128).astype(np.uint8),15,evidence=union,weak_evidence_region=objects,fixed_evidence=fixed,moving_components=[x for c,x in components[1:] if c.get('propagate',True)],primary_evidence=components[0][1]);trimap=condition_trimap_clicks(trimap,rgb,rgb,components,0)
Image.fromarray(trimap).save(a.out/'trimap.png');h,w=trimap.shape
model=VitMatteForImageMatting.from_pretrained('/home/tibule12/.cache/autopromote-model-runtime/vitmatte-small-pinned',local_files_only=True).eval();inp=torch.cat([torch.from_numpy(rgb.copy()).permute(2,0,1).float()/127.5-1,torch.from_numpy(trimap)[None].float()/255],0)[None];scale=1024/max(h,w);ih,iw=round(h*scale),round(w*scale)
inp=torch.cat([torch.nn.functional.interpolate(inp[:,:3],(ih,iw),mode='bilinear',align_corners=False,antialias=True),torch.nn.functional.interpolate(inp[:,3:],(ih,iw),mode='nearest')],1);inp=torch.nn.functional.pad(inp,(0,(-iw)%32,0,(-ih)%32))
with torch.inference_mode():alpha=torch.nn.functional.interpolate(model(pixel_values=inp).alphas[:,:,:ih,:iw],(h,w),mode='bilinear',align_corners=False)[0,0].numpy().clip(0,1)
alpha[trimap==0]=0;alpha[trimap==255]=1;matte=np.rint(alpha*255).astype(np.uint8);matte=refine_source_edge(rgb,matte,(directory,manifest),0,colour_component_ids=[c['id'] for c,_ in components if not c.get('propagate',True)]);matte=condition_trimap_clicks(matte,rgb,rgb,components,0);Image.fromarray(matte).save(a.out/'alpha.png')
# Keep every other part of the retained matte exact: this probe assesses only
# the independently corrected plant selection, not a separate full-shot result.
prior=np.asarray(Image.open(r/'outputs/subject_masks/matte_0000.png')).copy();prior[760:1000,:201]=matte[760:1000,:201]
work=Path('/tmp/autopromote-application-demo-YU8K0a/subject-previews/cfa95525-d7a9-4afe-9f51-2951ae9ab0bd');spec=json.loads((work/'spec.json').read_text())['spec'];base=CachedSubjectMatte(work/'matte',work/'source.mp4')
class Cache:
 manifest=base.manifest;artifact_sha256='private-diagnostic';directory=None
 def frame(self,index):return prior
assets={v['assetId']:work/f'replacement-{i}.asset' for i,v in enumerate(spec['replacementAssets'])};renderer=VfxFrameRenderer({'version':1,'source_sha256':sha256(work/'source.mp4'),'matte_sha256':'private-diagnostic','effects':spec['scene']['effects']},Cache(),asset_resolver=assets.__getitem__);result=renderer.render(Image.fromarray(rgb),0);result.save(a.out/'composite.png')
box=(0,720,330,1000);sheet=Image.new('RGB',(990,304));draw=ImageDraw.Draw(sheet)
for j,(label,picture) in enumerate([('Actual source',Image.fromarray(rgb)),('Actual prior native preview',Image.open('/dev/shm/autopromote-native-motion-review-r31-20261104/preview/0000.png')),('New plant clicks: diagnostic',result)]):sheet.paste(picture.crop(box),(330*j,24));draw.text((330*j,0),label,fill='white')
sheet.resize((1485,456)).save(a.out/'comparison.jpg',quality=97);print('ACTUAL_CORRECTED_PLANT_MATTE_DIAGNOSTIC_COMPLETE',flush=True)
