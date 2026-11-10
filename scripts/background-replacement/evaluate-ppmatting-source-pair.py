"""Private publisher PP-Matting comparison on actual failed footage; not admission."""
import argparse,json,socket,sys,time
from pathlib import Path
import cv2,numpy as np
from PIL import Image,ImageDraw
from model_workers.common import sha,write_json
from python_media_worker.studio_subject_matte import CachedSubjectMatte
from python_media_worker.studio_vfx_plan import VfxFrameRenderer

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('out',type=Path);p.add_argument('--short-side',type=int,default=1024);p.add_argument('--indices',default='7,23,10,17,35');a=p.parse_args();a.out.mkdir(exist_ok=False)
 (a.out/'implementation.py').write_bytes(Path(__file__).read_bytes())
 code=Path('/home/tibule12/.cache/autopromote-model-runtime/ppmatting-private-eval-20261105')
 upstream=json.loads((code/'upstream-lock.json').read_text())
 for row in upstream['files']:
  if sha(code/row['file'])!=row['sha256']:raise ValueError('Publisher model bytes changed')
 socket.socket.connect=lambda *unused,**kw:(_ for _ in ()).throw(RuntimeError('Inference networking disabled'))
 print('NATIVE_PADDLE_IMPORT_START',flush=True)
 from paddle.inference import Config,create_predictor
 print('NATIVE_PADDLE_IMPORT_DONE',flush=True)
 model=code/'upstream/ppmatting-hrnet_w18-human_1024'
 config=Config(str(model/'model.pdmodel'),str(model/'model.pdiparams'));config.disable_gpu();config.set_cpu_math_library_num_threads(3);config.disable_glog_info();config.disable_mkldnn();config.switch_ir_optim(False)
 print('NATIVE_PREDICTOR_CREATE_START',flush=True);predictor=create_predictor(config);print('NATIVE_PREDICTOR_CREATE_DONE',flush=True)
 assert len(predictor.get_input_names())==1 and len(predictor.get_output_names())==1
 model_input=predictor.get_input_handle(predictor.get_input_names()[0]);model_output=predictor.get_output_handle(predictor.get_output_names()[0]);cv2.setNumThreads(2)
 from recovered_motion_inputs import RECOVERED,PAIR,renderer as recovered_renderer
 recovery=json.loads((RECOVERED/'receipt.json').read_text())
 component_recovery=json.loads((RECOVERED/'component-recovery.json').read_text())
 if not recovery['allExactRecordedR83PngMatch'] or not component_recovery['allArchiveManifestSha256Verified']:raise ValueError('Source recovery not verified')
 root=Path('reports/background-replacement-20261101/private');parent=PAIR;outputs=RECOVERED;guide=RECOVERED/'component_dependency';manifest=json.loads((guide/'manifest.json').read_text());source=Path(recovery['source'])
 source_sha=sha(source)
 if source_sha!=recovery['sourceSha256']:raise ValueError('Retained upload changed')
 B=np.array(Image.open(parent/'actual-photographed-reference.png')).astype(float)/255;observed=np.array(Image.open(parent/'actual-photographed-support.png'))>0
 renderer=recovered_renderer();prepare=renderer._prepare_foreground
 started=time.monotonic();rows=[]
 for index in map(int,a.indices.split(',')):
  image=Image.open(outputs/f'rgb/rgb_{index:04d}.png').convert('RGB');C=np.array(image).astype(float)/255;h,w=C.shape[:2]
  rh=min(h,a.short_side);rw=int(w/h*rh);rh-=rh%32;rw-=rw%32
  # Exact publisher deploy.yaml: RGB, LimitShort(max1024), floor32 resize,
  # Normalize(mean=.5,std=.5). No experimental colour preprocessing.
  resized=cv2.resize(np.array(image),(rw,rh),interpolation=cv2.INTER_LINEAR).astype(np.float32)/127.5-1
  values=np.ascontiguousarray(resized.transpose(2,0,1)[None]);model_input.reshape(values.shape);model_input.copy_from_cpu(values);print('NATIVE_FRAME_INFERENCE_START',index,flush=True);predictor.run();print('NATIVE_FRAME_INFERENCE_DONE',index,flush=True);alpha=model_output.copy_to_cpu()[0,0]
  if not np.isfinite(alpha).all():raise ValueError('Nonfinite native PP-Matting output')
  alpha=cv2.resize(alpha,(w,h),interpolation=cv2.INTER_LINEAR).clip(0,1)
  Image.fromarray(np.rint(alpha*255).astype(np.uint8)).save(a.out/f'raw-alpha-{index:04d}.png')
  A=np.array(Image.open(parent/f'alpha-{index:04d}.png')).astype(float)/255;F=np.array(Image.open(parent/f'foreground-{index:04d}.png')).astype(float)/255
  for ci in [1,2]:
   hand=np.array(Image.open(guide/manifest['components'][ci]['frames'][index]['file']))
   domain=(cv2.dilate((hand>=64).astype(np.uint8),np.ones((31,31),np.uint8))>0)&observed
   weight=np.minimum(cv2.distanceTransform(domain.astype(np.uint8),cv2.DIST_L2,5)/8,1)
   # The source-conditioned pair uses the same alpha as the actual neural run;
   # preserve all non-hand objects and unobserved reference pixels exactly.
   P=C-(1-alpha[:,:,None])*B
   newF=(P/np.maximum(alpha[:,:,None],.01)).clip(0,1)
   nexta=A*(1-weight)+alpha*weight
   P=F*A[:,:,None]*(1-weight[:,:,None])+newF*alpha[:,:,None]*weight[:,:,None]
   F=P/np.maximum(nexta[:,:,None],.001);A=nexta
  fg=Image.fromarray(np.rint(F.clip(0,1)*255).astype(np.uint8));ma=Image.fromarray(np.rint(A.clip(0,1)*255).astype(np.uint8));renderer._prepare_foreground=lambda *unused,f=fg,m=ma:(f,m);result=renderer.render(image,index);renderer._prepare_foreground=prepare
  fg.save(a.out/f'foreground-{index:04d}.png');ma.save(a.out/f'alpha-{index:04d}.png');result.save(a.out/f'actual-composite-{index:04d}.png')
  for side,box in [('left',(280,240,700,720)),('right',(1040,170,1430,760))]:
   cw,ch=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(cw*3,ch+24))
   for j,(title,pic) in enumerate([('Actual source',image),('Previous paired correction',Image.open(parent/f'actual-composite-{index:04d}.png')),('Native PP-Matting alpha + actual B',result)]):sheet.paste(pic.crop(box),(cw*j,24));ImageDraw.Draw(sheet).text((cw*j+3,4),title,fill='white')
   sheet.save(a.out/f'actual-{side}-comparison-{index:04d}.jpg',quality=98)
  rows.append({'frame':index,'sourceRgbSha256':sha(outputs/f'rgb/rgb_{index:04d}.png'),'visualPass':False});print(json.dumps({'frame':index,'seconds':time.monotonic()-started}),flush=True)
 write_json(a.out/'receipt.json',{'sourceSha256':source_sha,'exactAll48RecoveredR83PngHashes':True,'recoveryReceiptSha256':sha(RECOVERED/'receipt.json'),'componentRecoveryReceiptSha256':sha(RECOVERED/'component-recovery.json'),'model':'Official PP-Matting HRNet-W18 human1024','sourceLockSha256':sha(code/'upstream-lock.json'),'publisherLockSha256':sha(code/'publisher-source-lock.json'),'isolatedCpuRuntimeLockSha256':sha(code/'paddle-runtime-lock.json'),'nativePaddleInference':True,'failedConvertedOnnxNotUsed':True,'inputResolution':[rw,rh],'rows':rows,'elapsedSeconds':time.monotonic()-started,'registeredForProduct':False,'nativeAdmission':False,'visualPass':False,'fourMinuteProof':False,'providerUpload':False,'paidCloudInference':False})

if __name__=='__main__':main()
