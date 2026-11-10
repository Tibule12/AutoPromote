"""Actual-frame colour-only probe: retain the exact reviewed moving alpha."""
import argparse,json
from pathlib import Path
import cv2,numpy as np
from PIL import Image,ImageDraw
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
from python_media_worker.studio_subject_matte import CachedSubjectMatte,sha256
p=argparse.ArgumentParser();p.add_argument('out',type=Path);p.add_argument('--indices',default='9,23,6,36');a=p.parse_args();a.out.mkdir(exist_ok=False);cv2.setNumThreads(2)
job=Path('/tmp/autopromote-application-demo-YU8K0a/model-jobs/46d71c74a26b1292737293505105011117c5c9978872589bb6fc82add8a5e95f/d021b00d-7f30-4a2c-a931-e49ed061fc2f');reference=np.asarray(Image.open(job/'outputs/observed_detail/photographed-reference.png')).astype(float)/255;observed=np.asarray(Image.open(job/'outputs/observed_detail/observed-support.png'))>0
work=Path('/tmp/autopromote-application-demo-YU8K0a/subject-previews/4e4e7769-e295-4fb5-8310-042cc31c281c');spec=json.loads((work/'spec.json').read_text())['spec'];cache=CachedSubjectMatte(work/'matte',work/'source.mp4');assets={v['assetId']:work/f'replacement-{i}.asset' for i,v in enumerate(spec['replacementAssets'])};renderer=VfxFrameRenderer({'version':1,'source_sha256':sha256(work/'source.mp4'),'matte_sha256':cache.artifact_sha256,'effects':spec['scene']['effects']},cache,asset_resolver=assets.__getitem__);prepare=renderer._prepare_foreground
for i in map(int,a.indices.split(',')):
 rgb=Image.open(job/f'outputs/rgb/rgb_{i:04d}.png').convert('RGB')
 def corrected(frame,alpha,active,width,height):
  foreground,effective=prepare(frame,alpha,active,width,height);c=np.asarray(frame).astype(float)/255;values=np.asarray(effective).astype(float)/255
  recovered=(c-reference*(1-values[...,None]))/np.maximum(values[...,None],.05);domain=observed&(values>.15)&(values<.95)&(np.min(recovered,2)>-.1)&(np.max(recovered,2)<1.1)
  # No alpha changes, plate fill, new skin pixels or unobserved background.
  out=np.asarray(foreground).copy();out[domain]=np.rint(recovered[domain].clip(0,1)*255).astype(np.uint8)
  Image.fromarray(domain.astype(np.uint8)*255).save(a.out/f'domain-{i:04d}.png');return Image.fromarray(out),effective
 renderer._prepare_foreground=corrected;result=renderer.render(rgb,i);renderer._prepare_foreground=prepare;result.save(a.out/f'composite-{i:04d}.png');box=(1040,170,1430,760) if i in [9,36] else (280,280,540,660);w,h=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(w*3,h+24));draw=ImageDraw.Draw(sheet)
 for j,(label,im) in enumerate([('Actual source',rgb),('Actual native preview',Image.open(f'/dev/shm/autopromote-native-motion-review-r35-20261104/preview/{i:04d}.png')),('Observed-colour-only diagnostic',result)]):sheet.paste(im.crop(box),(w*j,24));draw.text((w*j,0),label,fill='white')
 sheet.save(a.out/f'comparison-{i:04d}.jpg',quality=97);print('ACTUAL_OBSERVED_COLOUR_ONLY',i,flush=True)
