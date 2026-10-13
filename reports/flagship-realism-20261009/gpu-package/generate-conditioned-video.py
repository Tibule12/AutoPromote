"""Bounded, pinned larger NVIDIA image-to-video provider; no editor logic.

Uses the official two-expert Wan I2V model by default, or the explicitly selected
trained first/last-frame model. Output remains raw material pending visual
inspection. The existing 5B provider and CPU renderer remain.
"""
import argparse,hashlib,json,time,subprocess
from pathlib import Path
from datetime import datetime,timezone

MODEL='Wan-AI/Wan2.2-I2V-A14B-Diffusers'
REVISION='596658fd9ca6b7b71d5057529bbf319ecbc61d74'
FLF_MODEL='Wan-AI/Wan2.1-FLF2V-14B-720P-diffusers'
FLF_REVISION='17c30769b1e0b5dcaa1799b117bf20a9c31f59d7'

def run(a):
 import torch
 import diffusers
 from PIL import Image, ImageOps
 from diffusers import WanImageToVideoPipeline,AutoencoderKLWan
 from diffusers.utils import export_to_video
 data=json.loads(a.request.read_text());receipt=json.loads((a.models/'model-receipt.json').read_text())
 flf=getattr(a,'model_profile','i2v')=='flf2v'
 model,revision=(FLF_MODEL,FLF_REVISION) if flf else (MODEL,REVISION)
 if receipt['model']!=model or receipt['revision']!=revision:raise RuntimeError('Pinned official model required')
 if flf and (not a.retained_models or any(not shot.get('last_reference_image') for shot in data['shots'])):
  raise ValueError('Trained FLF task requires both endpoint images and retained encoder/VAE models')
 if not torch.cuda.is_available() or torch.cuda.get_device_name(0)!='NVIDIA L40S':raise RuntimeError('Authorized NVIDIA L40S required')
 if time.time()+180>=data['deadlineEpoch']:raise RuntimeError('Insufficient authorized time')
 settings=data.get('settings',{});width=int(settings.get('width',832));height=int(settings.get('height',480));frames=int(settings.get('frames',81));steps=int(settings.get('steps',40));fps=16
 if (width,height) not in [(832,480),(1280,720)] or frames not in [49,65,81,121] or not 20<=steps<=50:raise ValueError('Unsupported generation settings')
 resize=settings.get('referenceResize','aspect_fit' if flf else 'resize')
 if resize not in ('resize','aspect_fit'):raise ValueError('Unsupported reference resize')
 # Reject an accidental repeat before loading two large experts onto the GPU.
 for shot in data['shots']:
  name=shot['name']
  if not name.replace('-','').replace('_','').isalnum() or len(name)>141:raise ValueError('Invalid shot name')
  if (a.output/name/'receipt.json').exists() or (a.output/name/'video.mp4').exists():
   raise FileExistsError('Existing generated take must be inspected, not overwritten or submitted twice')
  source=Path(shot['reference_image']).resolve()
  if not source.is_relative_to(a.root.resolve()) or source.stat().st_size>40*1024**2:
   raise ValueError('Reference outside bounded private artifacts')
  if shot.get('reference_image_sha256') and hashlib.sha256(source.read_bytes()).hexdigest()!=shot['reference_image_sha256']:
   raise ValueError('Reference image no longer matches the reviewed source')
 started=time.monotonic()
 vae_root=a.retained_models if flf else a.models
 vae=AutoencoderKLWan.from_pretrained(vae_root,subfolder='vae',torch_dtype=torch.float32,local_files_only=True)
 components={'vae':vae}
 if flf:
  from transformers import CLIPVisionModel,UMT5EncoderModel
  retained_receipt=json.loads((a.retained_models/'model-receipt.json').read_text())
  if (retained_receipt['model'],retained_receipt['revision'])!=(MODEL,REVISION):raise RuntimeError('Pinned retained components required')
  components['image_encoder']=CLIPVisionModel.from_pretrained(a.models,subfolder='image_encoder',torch_dtype=torch.float32,local_files_only=True)
  components['text_encoder']=UMT5EncoderModel.from_pretrained(a.retained_models,subfolder='text_encoder',torch_dtype=torch.bfloat16,local_files_only=True)
 pipe=WanImageToVideoPipeline.from_pretrained(a.models,**components,torch_dtype=torch.bfloat16,local_files_only=True)
 pipe.enable_model_cpu_offload();pipe.vae.enable_tiling()
 print(json.dumps({'stage':'MODEL_LOADED','model':model,'profile':'trained_flf2v' if flf else 'i2v','seconds':time.monotonic()-started,'gpu':torch.cuda.get_device_name(0)}),flush=True)
 for shot in data['shots']:
  if time.time()+120>=data['deadlineEpoch']:raise RuntimeError('NVIDIA window expired')
  name=shot['name']
  if not name.replace('-','').replace('_','').isalnum() or len(name)>141:raise ValueError('Invalid shot name')
  source=Path(shot['reference_image']).resolve()
  if not source.is_relative_to(a.root.resolve()):raise ValueError('Reference outside private artifacts')
  if source.stat().st_size>40*1024**2:raise ValueError('Oversized reference image')
  reference_sha=hashlib.sha256(source.read_bytes()).hexdigest();image=Image.open(source).convert('RGB')
  image=ImageOps.fit(image,(width,height),method=Image.Resampling.LANCZOS) if resize=='aspect_fit' else image.resize((width,height))
  ending=None;ending_sha=None
  if shot.get('last_reference_image'):
   end_source=Path(shot['last_reference_image']).resolve()
   if not end_source.is_relative_to(a.root.resolve()) or end_source.stat().st_size>40*1024**2:raise ValueError('Invalid ending reference')
   ending_sha=hashlib.sha256(end_source.read_bytes()).hexdigest();ending=Image.open(end_source).convert('RGB')
   ending=ImageOps.fit(ending,(width,height),method=Image.Resampling.LANCZOS) if resize=='aspect_fit' else ending.resize((width,height))
  out=a.output/name;out.mkdir(parents=True,exist_ok=True);clock=time.monotonic();torch.cuda.reset_peak_memory_stats()
  def progress(_pipe,step,_timestep,values):
   if time.time()+45>=data['deadlineEpoch']:raise RuntimeError('Authorized NVIDIA window reached')
   if step%5==0:print(json.dumps({'stage':'DENOISE','shot':name,'step':step+1,'steps':steps,'seconds':time.monotonic()-clock}),flush=True)
   if step==steps-1:torch.save(values['latents'].detach().cpu(),out/'latents.pt')
   return values
  result=pipe(image=image,**({'last_image':ending} if ending is not None else {}),prompt=shot['prompt'],negative_prompt=shot.get('negative_prompt','text, watermark, logo, bird, crane, deformed hull, melting paper, flicker, still image, duplicate boats, cartoon, blurry'),
   height=height,width=width,num_frames=frames,num_inference_steps=steps,guidance_scale=5.5 if flf else 3.5,
   **({} if flf else {'guidance_scale_2':3.5}),
   generator=torch.Generator(device='cuda').manual_seed(shot['seed']),callback_on_step_end=progress).frames[0]
  raw=out/'raw.mp4';video=out/'video.mp4';export_to_video(result,str(raw),fps=fps,quality=9)
  subprocess.run(['ffmpeg','-y','-v','error','-i',str(raw),'-c:v','h264_nvenc','-preset','p6','-rc','vbr','-cq','18','-b:v','0','-pix_fmt','yuv420p','-movflags','+faststart',str(video)],check=True)
  record={'status':'GENERATED_PENDING_VISUAL_REVIEW','model':model,'modelRevision':revision,'modelProfile':'trained_flf2v' if flf else 'i2v','sourceBrief':data['sourceBrief'],'shot':shot,'prompt':shot['prompt'],'seed':shot['seed'],
   'tool':'AutoPromote NVIDIA conditioned-video adapter','referenceImageSha256':reference_sha,'lastReferenceImageSha256':ending_sha,'settings':{'width':width,'height':height,'frames':frames,'fps':fps,'steps':steps,'guidance':5.5 if flf else 3.5,'dtype':'bfloat16; VAE float32','cpuOffload':True,'conditioning':'first_and_last_frame' if ending is not None else 'first_frame','referenceResize':'aspect-preserving centre crop' if resize=='aspect_fit' else 'resize'},
   'scriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'modelPreparationSha256':hashlib.sha256((a.models/'model-receipt.json').read_bytes()).hexdigest(),
   **({'reusedComponents':receipt['reusedComponents']} if flf else {}),
   'gpu':torch.cuda.get_device_name(0),'torch':torch.__version__,'diffusers':diffusers.__version__,'seconds':time.monotonic()-clock,
   'peakCudaAllocatedBytes':torch.cuda.max_memory_allocated(),'peakCudaReservedBytes':torch.cuda.max_memory_reserved(),
   'artifact':{'path':str(video),'sha256':hashlib.sha256(video.read_bytes()).hexdigest(),'duration':len(result)/fps,'bytes':video.stat().st_size},'completedAt':datetime.now(timezone.utc).isoformat()}
  (out/'receipt.json').write_text(json.dumps(record,indent=2));print(json.dumps({'stage':'SHOT_READY','shot':name,'seconds':record['seconds']}),flush=True)
  del result;torch.cuda.empty_cache()

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--request',type=Path,required=True);p.add_argument('--models',type=Path,required=True);p.add_argument('--root',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
 p.add_argument('--model-profile',choices=['i2v','flf2v'],default='i2v');p.add_argument('--retained-models',type=Path);run(p.parse_args())
