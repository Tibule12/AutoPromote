"""Actual native matte: linear-light foreground recovery and composition probe.

Opaque source/selected-background endpoints and authored grade remain. Alpha
and the selected scene are unchanged. No model download, inference or new RGB.
"""
import argparse,json,time
from pathlib import Path
import cv2,numpy as np
from PIL import Image,ImageDraw,ImageEnhance
from pymatting import estimate_foreground_ml
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
from python_media_worker.studio_subject_matte import CachedSubjectMatte,sha256
p=argparse.ArgumentParser();p.add_argument('out',type=Path);p.add_argument('--indices',default='9,23,6,36');a=p.parse_args();a.out.mkdir(exist_ok=False);cv2.setNumThreads(2)
root=Path('/tmp/autopromote-application-demo-YU8K0a/model-jobs/46d71c74a26b1292737293505105011117c5c9978872589bb6fc82add8a5e95f/d021b00d-7f30-4a2c-a931-e49ed061fc2f');work=Path('/tmp/autopromote-application-demo-YU8K0a/subject-previews/4e4e7769-e295-4fb5-8310-042cc31c281c');spec=json.loads((work/'spec.json').read_text())['spec'];cache=CachedSubjectMatte(work/'matte',work/'source.mp4');assets={v['assetId']:work/f'replacement-{i}.asset' for i,v in enumerate(spec['replacementAssets'])};renderer=VfxFrameRenderer({'version':1,'source_sha256':sha256(work/'source.mp4'),'matte_sha256':cache.artifact_sha256,'effects':spec['scene']['effects']},cache,asset_resolver=assets.__getitem__);prepare=renderer._prepare_foreground;reference=np.asarray(Image.open(root/'outputs/observed_detail/photographed-reference.png')).astype(float)/255;observed=np.asarray(Image.open(root/'outputs/observed_detail/observed-support.png'))>0;rows=[]
def decode(x,space):
 return np.where(x<=.04045,x/12.92,((x+.055)/1.055)**2.4) if space=='srgb' else np.where(x<.081,x/4.5,((x+.099)/1.099)**(1/.45))
def encode(x,space):
 return np.where(x<=.0031308,x*12.92,1.055*np.maximum(x,0)**(1/2.4)-.055) if space=='srgb' else np.where(x<.018,x*4.5,1.099*np.maximum(x,0)**.45-.099)
for index in map(int,a.indices.split(',')):
 started=time.monotonic();rgb=Image.open(root/f'outputs/rgb/rgb_{index:04d}.png').convert('RGB');C=np.asarray(rgb).astype(float)/255;h,w=C.shape[:2];active=[e for e in renderer.plan['effects'] if e['start']<=index/24<e['end']];fg,alpha=prepare(rgb,Image.fromarray(cache.frame(index)),active,w,h);values=np.asarray(alpha).astype(float)/255
 renderer._prepare_foreground=lambda *args:(rgb,Image.new('L',(w,h),0));background=renderer.render(rgb,index);renderer._prepare_foreground=prepare;B=np.asarray(background).astype(float)/255
 for space in ['srgb','bt709']:
  source_linear=decode(C,space);background_linear=decode(B,space);ref_linear=decode(reference,space);fore=estimate_foreground_ml(source_linear,values).clip(0,1)
  for mode in ['multilevel','observed-unmix']:
   F=fore.copy()
   if mode=='observed-unmix':
    recovered=(source_linear-ref_linear*(1-values[...,None]))/np.maximum(values[...,None],.05);safe=observed&(values>.12)&(values<.99)&(np.min(recovered,2)>-.02)&(np.max(recovered,2)<1.02);F[safe]=recovered[safe].clip(0,1)
   # The existing authored colour/exposure controls stay in their current
   # encoded domain; only the recovery and layer mixing change domains.
   foreground=Image.fromarray(np.rint(encode(F,space).clip(0,1)*255).astype(np.uint8))
   for effect in active:
    if effect['type']!='foreground_grade':continue
    foreground=ImageEnhance.Color(foreground).enhance(effect['saturation']);foreground=ImageEnhance.Contrast(foreground).enhance(effect['contrast']);foreground=ImageEnhance.Brightness(foreground).enhance(2**effect['exposure'])
   mixed=decode(np.asarray(foreground).astype(float)/255,space)*values[...,None]+background_linear*(1-values[...,None]);result=Image.fromarray(np.rint(encode(mixed,space).clip(0,1)*255).astype(np.uint8));tag=f'{space}-{mode}';result.save(a.out/f'{tag}-composite-{index:04d}.png')
   for name,box in [('left-hand',(280,240,560,680)),('right-hand',(1040,170,1430,760)),('head',(660,45,1040,480)),('props',(0,700,950,1000))]:
    cw,ch=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(cw*3,ch+24));draw=ImageDraw.Draw(sheet)
    for j,(label,im) in enumerate([('Actual source',rgb),('Actual native revision 3',Image.open(f'/dev/shm/autopromote-native-motion-review-r35-20261104/preview/{index:04d}.png')),('Linear-light diagnostic '+tag,result)]):sheet.paste(im.crop(box),(cw*j,24));draw.text((cw*j,0),label,fill='white')
    sheet.save(a.out/f'{name}-{tag}-{index:04d}.jpg',quality=97)
 rows.append({'frame':index,'seconds':time.monotonic()-started,'alphaUnchanged':True});print('ACTUAL_LINEAR_LIGHT_PAIR',json.dumps(rows[-1]),flush=True)
 (a.out/'evaluation.json').write_text(json.dumps({'privateLocalEvaluationOnly':True,'noNewWeights':True,'noAlphaChanges':True,'noReplacementAssetChanges':True,'rows':rows,'visualPass':False},indent=2)+'\n')
