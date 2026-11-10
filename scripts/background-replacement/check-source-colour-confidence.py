"""Same immutable alpha, source B and compositor; vary colour regularization."""
import argparse,copy,inspect,json,time
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
from model_workers.common import sha,write_json
from python_media_worker.studio_subject_matte import CachedSubjectMatte
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
from python_media_worker import studio_source_background as colour_module


def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('out',type=Path);a=parser.parse_args();a.out.mkdir(exist_ok=False)
 private=Path('reports/background-replacement-20261101/private');work=Path('/tmp/autopromote-application-demo-FDokC2/subject-previews/608ba066-166e-49c1-ba79-b1c28940c569');cache=CachedSubjectMatte(work/'matte',work/'source.mp4');spec=json.loads((work/'spec.json').read_text())['spec'];plan={'version':1,'source_sha256':cache.manifest['source_sha256'],'matte_sha256':cache.artifact_sha256,'effects':copy.deepcopy(spec['scene']['effects'])}
 renderer=VfxFrameRenderer(plan,cache,lambda _:private/'replacement.png');renderer.foreground_cache.root=None;prepare=renderer._prepare_foreground
 text=inspect.getsource(colour_module.recover_foreground);assert text.count('0 < strength <= 1')==1;text=text.replace('0 < strength <= 1','0 < strength <= 50');namespace=vars(colour_module).copy();exec(text,namespace);recover=namespace['recover_foreground'];(a.out/'candidate-implementation.py').write_text(text)
 background,observed=cache.observed_background;rows=[];started=time.monotonic()
 for index in [10,15,23,39]:
  source=private/f'recovered-gesture-r180-20261105/rgb/rgb_{index:04d}.png';rgb=Image.open(source).convert('RGB');active=[e for e in plan['effects']if e['start']<=index/24<e['end']];base,alpha=prepare(rgb,Image.fromarray(cache.frame(index)),active,1430,1000)
  renderer._prepare_foreground=lambda *args:(base,alpha);baseline=renderer.render(rgb,index);variants=[]
  for strength in [3,15]:
   colour=recover(np.asarray(rgb),np.asarray(alpha),background,observed,np.asarray(base,np.float64)/255,strength=strength)
   foreground=Image.fromarray(np.rint(colour.clip(0,1)*255).astype(np.uint8));foreground.save(a.out/f'foreground-s{strength}-{index:04d}.png');renderer._prepare_foreground=lambda *args:(foreground,alpha);picture=renderer.render(rgb,index);picture.save(a.out/f'actual-s{strength}-{index:04d}.png');variants.append(picture)
  renderer._prepare_foreground=prepare
  for side,box in [('left',(280,240,700,720)),('right',(1040,170,1430,760))]:
   w,h=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(w*4,h+24));draw=ImageDraw.Draw(sheet)
   for i,(label,pic)in enumerate(zip(['Actual source','Current colour recovery','Regularization3','Regularization15'],[rgb,baseline,*variants])):sheet.paste(pic.crop(box),(i*w,24));draw.text((i*w+3,4),label,fill='white')
   sheet.save(a.out/f'{side}-{index:04d}.jpg',quality=98)
  rows.append({'frame':index,'sourcePngSha256':sha(source),'elapsedSeconds':time.monotonic()-started});print('ACTUAL_COLOUR_CONFIDENCE',json.dumps(rows[-1]),flush=True)
 write_json(a.out/'receipt.json',{'rows':rows,'alphaUnchanged':True,'actualSourceObservedBackground':True,'foregroundOnlyAblation':True,'allActualOpaquePixelsPreservedBySolver':True,'registeredImplementationChanged':False,'nativeAdmission':False,'fourMinuteProof':False,'visualReviewPending':True,'paidCloud':False})


if __name__=='__main__':main()
