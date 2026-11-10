"""Private same-alpha test of linear-light source colour inversion/compositing."""
import argparse,copy,inspect,json,types,time
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
from model_workers.common import sha,write_json
from python_media_worker.studio_subject_matte import CachedSubjectMatte
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
from python_media_worker.studio_source_background import recover_foreground


def decode(v):return np.where(v<=.04045,v/12.92,((v+.055)/1.055)**2.4)
def encode(v):return np.where(v<=.0031308,12.92*v,1.055*np.maximum(v,0)**(1/2.4)-.055)
def linear_over(background,subject):
 b=np.asarray(background.convert('RGB'),np.float64)/255;f=np.asarray(subject.convert('RGB'),np.float64)/255;a=np.asarray(subject.getchannel('A'),np.float64)[:,:,None]/255
 return Image.fromarray(np.rint(encode(decode(f)*a+decode(b)*(1-a)).clip(0,1)*255).astype(np.uint8)).convert('RGBA')


def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('out',type=Path);a=p.parse_args();a.out.mkdir(exist_ok=False)
 private=Path('reports/background-replacement-20261101/private');work=Path('/tmp/autopromote-application-demo-FDokC2/subject-previews/608ba066-166e-49c1-ba79-b1c28940c569')
 cache=CachedSubjectMatte(work/'matte',work/'source.mp4');spec=json.loads((work/'spec.json').read_text())['spec'];plan={'version':1,'source_sha256':cache.manifest['source_sha256'],'matte_sha256':cache.artifact_sha256,'effects':copy.deepcopy(spec['scene']['effects'])}
 original=VfxFrameRenderer(plan,cache,lambda _:private/'replacement.png');original.foreground_cache.root=None
 from python_media_worker import studio_source_background as source_module
 implementation=inspect.getsource(recover_foreground)
 for before,after in [('c = rgb[sl].astype(np.float64) / 255','c = decode(rgb[sl].astype(np.float64) / 255)'),('b = background[sl].astype(np.float64) / 255','b = decode(background[sl].astype(np.float64) / 255)'),('result = fallback.copy()','result = decode(fallback.copy())'),('return result','return np.where(eligible[...,None], encode(result).clip(0,1), fallback)')]:
  assert implementation.count(before)==1;implementation=implementation.replace(before,after)
 namespace={**vars(source_module),'decode':decode,'encode':encode};exec(implementation,namespace);recover=namespace['recover_foreground']
 render_implementation=inspect.getsource(VfxFrameRenderer.render)
 import textwrap
 render_implementation=textwrap.dedent(render_implementation);assert render_implementation.count('background.alpha_composite(subject)')==1
 render_implementation=render_implementation.replace('background.alpha_composite(subject)','background = linear_over(background,subject)')
 from python_media_worker import studio_vfx_plan as render_module
 render_namespace={**vars(render_module),'linear_over':linear_over};exec(render_implementation,render_namespace)
 changed=VfxFrameRenderer(plan,cache,lambda _:private/'replacement.png');changed.foreground_cache.root=None;changed.recover_observed_foreground=recover;changed.render=types.MethodType(render_namespace['render'],changed)
 (a.out/'linear-recovery-implementation.py').write_text(implementation);(a.out/'linear-render-implementation.py').write_text(render_implementation)
 rows=[];started=time.monotonic()
 for index in [10,15,23,39]:
  source=private/f'recovered-gesture-r180-20261105/rgb/rgb_{index:04d}.png';rgb=Image.open(source).convert('RGB');baseline=original.render(rgb,index);result=changed.render(rgb,index);result.save(a.out/f'actual-linear-{index:04d}.png')
  for side,box in [('left',(280,240,700,720)),('right',(1040,170,1430,760))]:
   w,h=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(w*3,h+24));draw=ImageDraw.Draw(sheet)
   for i,(label,pic)in enumerate([('Actual source',rgb),('Current source recovery',baseline),('Linear-light inversion + composite',result)]):sheet.paste(pic.crop(box),(i*w,24));draw.text((i*w+3,4),label,fill='white')
   sheet.save(a.out/f'{side}-{index:04d}.jpg',quality=98)
  rows.append({'frame':index,'sourcePngSha256':sha(source),'elapsedSeconds':time.monotonic()-started});print('ACTUAL_LINEAR_SOURCE_ABLATION',json.dumps(rows[-1]),flush=True)
 write_json(a.out/'receipt.json',{'rows':rows,'actualNativeParentArtifactHash':spec['modelInput']['artifactHash'],'alphaUnchanged':True,'pinnedModelsUnchanged':True,'privateImplementationOnly':True,'nativeAdmission':False,'visualReviewPending':True,'fourMinuteProof':False,'paidCloud':False})


if __name__=='__main__':main()
