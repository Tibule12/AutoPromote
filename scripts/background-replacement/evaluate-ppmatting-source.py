"""Private actual-frame PP-MattingV2 comparison, official inference archive.

Publisher pre/postprocessing, CPU only, no upload, model registration or product
change. Independent equipment alpha remains on the current native path.
"""
import argparse,json,time,socket,hashlib
from pathlib import Path
import cv2,numpy as np
from PIL import Image,ImageDraw
from python_media_worker.studio_subject_matte import CachedSubjectMatte,sha256
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
p=argparse.ArgumentParser();p.add_argument('out',type=Path);p.add_argument('--indices',default='6,9,23,36');p.add_argument('--limit-short',type=int,default=512,choices=[512,1000]);a=p.parse_args();a.out.mkdir(exist_ok=False);cv2.setNumThreads(2)
modelroot=Path('/dev/shm/autopromote-ppmatting-evaluation-20261104');lock=json.load(open(modelroot/'source-lock.json'))
for row in lock['files']:assert hashlib.file_digest((modelroot/row['file']).open('rb'),'sha256').hexdigest()==row['sha256']
import paddle
from paddle.inference import Config,create_predictor
socket.socket.connect=lambda *args,**kwargs:(_ for _ in ()).throw(RuntimeError('Private CPU inference networking disabled'))
model=modelroot/'model/ppmattingv2-stdc1-human_512';configuration=Config(str(model/'model.pdmodel'),str(model/'model.pdiparams'));configuration.disable_gpu();configuration.set_cpu_math_library_num_threads(2);configuration.disable_glog_info();configuration.enable_memory_optim();configuration.switch_ir_optim(True);predictor=create_predictor(configuration)
input_name=predictor.get_input_names();output_name=predictor.get_output_names();print('OFFICIAL_STATIC_INPUT_OUTPUT',input_name,output_name,flush=True);assert len(input_name)==1
root=Path('/tmp/autopromote-application-demo-YU8K0a/model-jobs/39e005f4354085956cb2bcc82468b18296955d32b26cf3958c53821cbc3f5526/2f43d6cc-1eda-4854-be75-66cceadd172a');guide=root/'component_dependency';manifest=json.load(open(guide/'manifest.json'));work=Path('/tmp/autopromote-application-demo-YU8K0a/subject-previews/f2033724-fb92-44dd-b7ae-54114b51036f');spec=json.load(open(work/'spec.json'))['spec'];cache=CachedSubjectMatte(work/'matte',work/'source.mp4');assets={v['assetId']:work/f'replacement-{i}.asset' for i,v in enumerate(spec['replacementAssets'])};renderer=VfxFrameRenderer({'version':1,'source_sha256':sha256(work/'source.mp4'),'matte_sha256':cache.artifact_sha256,'effects':spec['scene']['effects']},cache,assets.__getitem__);original=cache.frame;rows=[]
for index in map(int,a.indices.split(',')):
    tick=time.monotonic();rgb=Image.open(root/f'outputs/rgb/rgb_{index:04d}.png').convert('RGB');current=np.asarray(rgb);h,w=current.shape[:2]
    ratio=min(1,a.limit_short/min(h,w));short_size=(round(w*ratio),round(h*ratio));scaled=cv2.resize(current,short_size,interpolation=cv2.INTER_LINEAR);sh,sw=scaled.shape[:2];scaled=cv2.resize(scaled,(sw-sw%32,sh-sh%32),interpolation=cv2.INTER_LINEAR)
    pixels=np.ascontiguousarray(((scaled.astype(np.float32)/255-.5)/.5).transpose(2,0,1)[None]);handle=predictor.get_input_handle(input_name[0]);handle.reshape(pixels.shape);handle.copy_from_cpu(pixels);predictor.run();result=predictor.get_output_handle(output_name[0]).copy_to_cpu();assert np.isfinite(result).all(),result.shape
    # Reverse ResizeToIntMult and LimitShort independently, as the publisher's
    # trans_info stack does. This is not a direct arbitrary proxy rescale.
    values=result[0,0];values=cv2.resize(values,(sw,sh),interpolation=cv2.INTER_LINEAR);values=cv2.resize(values,(w,h),interpolation=cv2.INTER_LINEAR);inferred=np.rint(values.clip(0,1)*255).astype(np.uint8);Image.fromarray(inferred).save(a.out/f'model-alpha-{index:04d}.png')
    prior=original(index);person=np.zeros_like(prior);fixed=np.zeros_like(prior)
    for comp in manifest['components']:
        plane=np.asarray(Image.open(guide/comp['frames'][index]['file']));target=person if comp['selection'].get('propagate',True) else fixed;np.maximum(target,plane,out=target)
    scope=(cv2.dilate((person>=128).astype(np.uint8),np.ones((51,51),np.uint8))>0)&(cv2.dilate((fixed>=24).astype(np.uint8),np.ones((5,5),np.uint8))==0)
    effective=prior.copy();effective[scope]=inferred[scope];cache.frame=lambda i,v=effective:v if i==index else original(i)
    try:composite=renderer.render(rgb,index)
    finally:cache.frame=original
    composite.save(a.out/f'composite-{index:04d}.png');Image.fromarray(effective).save(a.out/f'protected-alpha-{index:04d}.png')
    for label,box in [('left',(280,240,680,720)),('right',(1040,170,1430,760)),('head',(660,45,1040,480))]:
        cw,ch=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(cw*3,ch+24));d=ImageDraw.Draw(sheet)
        for j,(title,im) in enumerate([('Actual source',rgb),('Current native',Image.open(f'/dev/shm/autopromote-native-click-review-r66-20261104/preview/{index:04d}.png')),('Official PP-MattingV2 '+str(a.limit_short),composite)]):sheet.paste(im.crop(box),(cw*j,24));d.text((cw*j+3,4),title,fill='white')
        sheet.save(a.out/f'{label}-{index:04d}.jpg',quality=97)
    rows.append({'frame':index,'seconds':time.monotonic()-tick,'modelInputShape':list(pixels.shape)});print('ACTUAL_PRIVATE_PPMATTING',json.dumps(rows[-1]),flush=True)
    (a.out/'evaluation.json').write_text(json.dumps({'rows':rows,'sourceLock':lock,'paddleVersion':paddle.__version__,'inputName':input_name,'outputName':output_name,'privateOnly':True,'visualPass':False,'fourMinuteProof':False},indent=2)+'\n')
