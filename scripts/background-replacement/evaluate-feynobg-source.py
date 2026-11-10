"""Private, offline actual-frame check of pinned Apache-2.0 FeyNobg weights.

No product registration. Use the publisher's unchanged inference network and
the exact published resize/normalization; bypass unused Hub/processor helpers.
"""
import argparse,json,sys,socket,time,types,hashlib
from pathlib import Path
import cv2,numpy as np,torch
from PIL import Image,ImageDraw
from safetensors.torch import load_file
from python_media_worker.studio_subject_matte import CachedSubjectMatte,sha256
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
p=argparse.ArgumentParser();p.add_argument('out',type=Path);p.add_argument('--indices',default='6,9,23,36');p.add_argument('--eager-cpu',action='store_true');p.add_argument('--safe-deform-cpu',action='store_true');args=p.parse_args();args.out.mkdir(exist_ok=False)
torch.set_num_threads(2);torch.set_num_interop_threads(1);cv2.setNumThreads(1)
modelroot=Path('/dev/shm/autopromote-feynobg-evaluation-20261104');lock=json.load(open(modelroot/'source-lock.json'))
assert hashlib.file_digest((modelroot/'model.safetensors').open('rb'),'sha256').hexdigest()==lock['weights']['sha256']
for row in lock['files']:assert hashlib.file_digest((modelroot/row['file']).open('rb'),'sha256').hexdigest()==row['sha256']
socket.socket.connect=lambda *a,**kw:(_ for _ in ()).throw(RuntimeError('Inference network disabled'))
for name,path in [('nobg',modelroot/'nobg'),('nobg.birefnet',modelroot/'nobg/birefnet')]:
    package=types.ModuleType(name);package.__path__=[str(path)];sys.modules[name]=package
unused=types.ModuleType('nobg.birefnet.image_processing_birefnet');unused.BiRefNetImageProcessor=type('UnusedProcessor',(),{});sys.modules[unused.__name__]=unused
from nobg.birefnet.modeling_birefnet import BiRefNet,BiRefNetConfig
if args.safe_deform_cpu:
    from private_deform_conv import deform_conv2d,verify
    checks=verify();(args.out/'cpu-deform-verification.json').write_text(json.dumps(checks,indent=2)+'\n')
    sys.modules['nobg.birefnet.modeling_birefnet'].deform_conv2d=deform_conv2d
with torch.device('meta'):model=BiRefNet(BiRefNetConfig(**json.load(open(modelroot/'config.json'))))
result=model.load_state_dict(load_file(modelroot/'model.safetensors',device='cpu'),strict=True,assign=True);model.eval();print('PINNED_FEYNOBG_STRICT_STATE',result,flush=True)
# SafeTensors assign loads every serialized tensor, while Swin's derived,
# non-persistent relative-position indices remain on meta. Materialize them
# with the publisher's own deterministic constructor, not random state.
derived=[]
for name,module in model.named_modules():
    index=getattr(module,'relative_position_index',None)
    if isinstance(index,torch.Tensor) and index.device.type=='meta':
        module.relative_position_index=module._create_relative_position_index().view(-1)
        derived.append(name)
assert not any(t.device.type=='meta' for t in list(model.parameters())+list(model.buffers()))
print('DETERMINISTIC_POSITION_BUFFERS_MATERIALIZED',len(derived),flush=True)
if args.eager_cpu:
    torch.backends.mkldnn.enabled=False
    model.bb.swin.set_attn_implementation('eager')
    print('OFFICIAL_EAGER_ATTENTION_CPU',flush=True)
root=Path('/tmp/autopromote-application-demo-YU8K0a/model-jobs/39e005f4354085956cb2bcc82468b18296955d32b26cf3958c53821cbc3f5526/2f43d6cc-1eda-4854-be75-66cceadd172a');guide=root/'component_dependency';manifest=json.load(open(guide/'manifest.json'));work=Path('/tmp/autopromote-application-demo-YU8K0a/subject-previews/f2033724-fb92-44dd-b7ae-54114b51036f');spec=json.load(open(work/'spec.json'))['spec'];cache=CachedSubjectMatte(work/'matte',work/'source.mp4');assets={v['assetId']:work/f'replacement-{i}.asset' for i,v in enumerate(spec['replacementAssets'])};renderer=VfxFrameRenderer({'version':1,'source_sha256':sha256(work/'source.mp4'),'matte_sha256':cache.artifact_sha256,'effects':spec['scene']['effects']},cache,assets.__getitem__);original=cache.frame
mean=torch.tensor([.485,.456,.406])[None,:,None,None];std=torch.tensor([.229,.224,.225])[None,:,None,None];rows=[]
for index in map(int,args.indices.split(',')):
    tick=time.monotonic();rgb=Image.open(root/f'outputs/rgb/rgb_{index:04d}.png').convert('RGB')
    resized=rgb.resize((1024,1024),Image.Resampling.BILINEAR)
    pixels=torch.from_numpy(np.asarray(resized).copy()).permute(2,0,1)[None].float()/255
    with torch.inference_mode():pred=model(pixel_values=(pixels-mean)/std)['logits'].sigmoid();pred=torch.nn.functional.interpolate(pred,rgb.size[::-1],mode='bilinear',align_corners=False)[0,0].numpy()
    assert np.isfinite(pred).all();inferred=np.rint(pred.clip(0,1)*255).astype(np.uint8);Image.fromarray(inferred).save(args.out/f'model-alpha-{index:04d}.png')
    prior=original(index);person=np.zeros_like(prior);fixed=np.zeros_like(prior)
    for comp in manifest['components']:
        plane=np.asarray(Image.open(guide/comp['frames'][index]['file']));target=person if comp['selection'].get('propagate',True) else fixed;np.maximum(target,plane,out=target)
    scope=(cv2.dilate((person>=128).astype(np.uint8),np.ones((51,51),np.uint8))>0)&(cv2.dilate((fixed>=24).astype(np.uint8),np.ones((5,5),np.uint8))==0)
    values=prior.copy();values[scope]=inferred[scope];cache.frame=lambda i,v=values:v if i==index else original(i)
    try:rendered=renderer.render(rgb,index)
    finally:cache.frame=original
    rendered.save(args.out/f'composite-{index:04d}.png');Image.fromarray(values).save(args.out/f'protected-alpha-{index:04d}.png')
    for label,box in [('left',(280,240,680,720)),('right',(1040,170,1430,760)),('head',(660,45,1040,480))]:
        w,h=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(w*3,h+24));draw=ImageDraw.Draw(sheet)
        for j,(title,im) in enumerate([('Actual source',rgb),('Current native',Image.open(f'/dev/shm/autopromote-native-click-review-r66-20261104/preview/{index:04d}.png')),('FeyNobg + protected equipment',rendered)]):sheet.paste(im.crop(box),(w*j,24));draw.text((w*j+3,4),title,fill='white')
        sheet.save(args.out/f'{label}-{index:04d}.jpg',quality=97)
    rows.append({'frame':index,'seconds':time.monotonic()-tick});print('ACTUAL_PRIVATE_FEYNOBG',json.dumps(rows[-1]),flush=True)
    (args.out/'evaluation.json').write_text(json.dumps({'rows':rows,'pinnedWeights':lock['weights'],'inferenceNetworkDisabled':True,'strictStateLoad':True,'nativeSizeInference':1024,'privateOnly':True,'visualPass':False,'fourMinuteProof':False},indent=2)+'\n')
