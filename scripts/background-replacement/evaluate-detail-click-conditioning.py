"""Bounded local probe: does the moving detail network see actual corrections?

Uses unchanged pinned product weights and actual source/masks. This is a
selected-frame diagnostic, never a substitute for a complete native result.
"""
import argparse,json
from pathlib import Path
import cv2,numpy as np,torch
from PIL import Image,ImageDraw
from transformers import VitMatteForImageMatting
from model_workers.adapters.temporal_alpha import polish_trimap,condition_trimap_clicks
from model_workers.adapters.moving_detail_alpha import detail_trimap,foreground_colour_support,merge_detail_alpha
from python_media_worker.studio_subject_matte import CachedSubjectMatte,sha256
from python_media_worker.studio_vfx_plan import VfxFrameRenderer

p=argparse.ArgumentParser();p.add_argument('out',type=Path);a=p.parse_args();a.out.mkdir(exist_ok=False,parents=True)
torch.set_num_threads(4);torch.set_num_interop_threads(1);cv2.setNumThreads(2)
root=Path('/tmp/autopromote-application-demo-YU8K0a/model-jobs/6f1026d83f402009408ed22d43f1cc6909a7fc4f0329ea93cfebb63f5f00ba6f/6d8381fb-8d86-4bc4-931e-6918bbcbc71d')
preview=Path('/tmp/autopromote-application-demo-YU8K0a/subject-previews/5cad57a0-37cb-4583-89e1-323e96c150cb')
guide=root/'component_dependency';manifest=json.load(open(guide/'manifest.json'));spec=json.load(open(preview/'spec.json'))['spec']
model_dir=Path('/home/tibule12/.cache/autopromote-model-runtime/vitmatte-small-pinned');weight=json.load(open(root/'spec.json'))['model']['weights'][0]
assert sha256(model_dir/weight['path'])==weight['sha256'],'Pinned checkpoint changed'
model=VitMatteForImageMatting.from_pretrained(model_dir,local_files_only=True).eval()
reference=np.asarray(Image.open(root/'outputs/observed_detail/photographed-reference.png'))
observed=np.asarray(Image.open(root/'outputs/observed_detail/observed-support.png'))>0
first=np.asarray(Image.open(root/'outputs/rgb/rgb_0000.png'));cache=CachedSubjectMatte(preview/'matte',preview/'source.mp4')
plan={'version':1,'source_sha256':sha256(preview/'source.mp4'),'matte_sha256':cache.artifact_sha256,'effects':spec['scene']['effects']}
assets={v['assetId']:preview/f'replacement-{i}.asset' for i,v in enumerate(spec['replacementAssets'])}
renderer=VfxFrameRenderer(plan,cache,asset_resolver=assets.__getitem__);rows=[]
for index in [8,23]:
 rgb=np.asarray(Image.open(root/f'outputs/rgb/rgb_{index:04d}.png'));union=np.asarray(Image.open(root/f'dependency/matte_{index:04d}.png'))
 original=np.asarray(Image.open(root/f'outputs/subject_masks/matte_{index:04d}.png'))
 components=[(c['selection'],np.asarray(Image.open(guide/c['frames'][index]['file']))) for c in manifest['components']]
 base=polish_trimap(union,15);selection,hand=components[1];ys,xs=np.where(hand>=128)
 x0,y0=max(0,int(xs.min())-55),max(0,int(ys.min())-55);x1,y1=min(1430,int(xs.max())+56),min(1000,int(ys.max())+56);sl=np.s_[y0:y1,x0:x1];local=rgb[sl];h,w=local.shape[:2]
 empty=(cv2.dilate((union>=24).astype(np.uint8),np.ones((31,31),np.uint8))==0)[sl]&observed[sl]
 assert empty.sum()>=128;offset=np.median(local.astype(np.float32)[empty]-reference[sl].astype(np.float32)[empty],axis=0)
 assert np.max(np.abs(offset))<=12;background=np.clip(reference[sl].astype(np.float32)+offset,0,255)
 conditioned,domain=detail_trimap(base[sl],hand[sl],union[sl],local,background,observed[sl]);samples=[]
 for prompt in [{'frameIndex':0,'points':selection['points']},*selection.get('shotPrompts',[])]:
  picture=np.asarray(Image.open(root/f"outputs/rgb/rgb_{prompt['frameIndex']:04d}.png"))
  for point in prompt['points']:
   if point['label']!=1:continue
   x=round(point['position'][0]*1430);y=round(point['position'][1]*1000);samples.extend(picture[y-1:y+2,x-1:x+2].reshape(-1,3))
 domain&=foreground_colour_support(local,background,samples);conditioned[~domain]=base[sl][~domain]
 full=base.copy();full[sl]=conditioned;corrected=condition_trimap_clicks(full,rgb,first,components,index)[sl]
 for name,tri in [('current-detail-input',conditioned),('click-conditioned-detail-input',corrected)]:
  inp=torch.cat((torch.from_numpy(local.copy()).permute(2,0,1).float()/127.5-1,torch.from_numpy(tri.copy())[None].float()/255),0)[None]
  inp=torch.nn.functional.pad(inp,(0,(-w)%32,0,(-h)%32),mode='replicate')
  with torch.inference_mode():values=model(pixel_values=inp).alphas[0,0,:h,:w].numpy().clip(0,1)
  values[tri==0]=0;values[tri==255]=1
  candidate=original.copy();candidate[sl]=merge_detail_alpha(original[sl],values,hand[sl],domain,observed[sl]);candidate=condition_trimap_clicks(candidate,rgb,first,components,index)
  prior_frame=cache.frame;cache.frame=lambda frame_index: candidate if frame_index==index else prior_frame(frame_index)
  try:result=renderer.render(Image.fromarray(rgb),index)
  finally:cache.frame=prior_frame
  tag=f'{index:04d}-{name}';Image.fromarray(candidate).save(a.out/f'{tag}-alpha.png');result.save(a.out/f'{tag}-composite.png');Image.fromarray(tri).save(a.out/f'{tag}-trimap.png')
  rows.append({'frame':index,'variant':name,'crop':[x0,y0,x1,y1],'inputCorrectionPixels':int(np.count_nonzero(conditioned!=corrected)),'alphaChangedPixels':int(np.count_nonzero(candidate!=original))})
 box=(280,240,680,720);sheet=Image.new('RGB',(1200,510));draw=ImageDraw.Draw(sheet)
 for n,(label,im) in enumerate([('Actual source',Image.fromarray(rgb)),('Actual native preview',Image.open(f'/dev/shm/autopromote-native-click-review-r65-20261104/preview/{index:04d}.png')),('Conditioned detail diagnostic',Image.open(a.out/f'{index:04d}-click-conditioned-detail-input-composite.png'))]):
  sheet.paste(im.crop(box),(400*n,30));draw.text((400*n+4,8),label,fill='white')
 sheet.save(a.out/f'{index:04d}-comparison.jpg',quality=97);print('ACTUAL_DETAIL_CLICK_PROBE',index,flush=True)
(a.out/'evaluation.json').write_text(json.dumps({'rows':rows,'nativeFinal':False,'fullMovingQualification':False,'visualPass':False,'providerUpload':False},indent=2))
