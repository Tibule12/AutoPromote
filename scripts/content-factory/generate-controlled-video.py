"""Private VACE structural-control experiment; never marks creative acceptance.

Uses the official trained control stream, not SDEdit preservation of CGI pixels.
Pinned, offline inference runs only on the existing authorized NVIDIA L40S.
"""
import argparse, hashlib, json, subprocess, time
from pathlib import Path

MODEL='Wan-AI/Wan2.1-VACE-1.3B-diffusers'
REVISION='ec4d2cb062b548996b179d493fdd05340de702a1'
LARGE_MODEL='Wan-AI/Wan2.1-VACE-14B-diffusers'
LARGE_REVISION='db79b90c60bbb45ceec9e41b9d5a4df934538ac4'

def run(a):
 import numpy as np, torch, diffusers
 from PIL import Image
 from transformers import UMT5EncoderModel
 from diffusers import AutoencoderKLWan, WanVACEPipeline, UniPCMultistepScheduler
 from diffusers.utils import export_to_video
 request=json.loads(a.request.read_text()); root=a.root.resolve()
 large=getattr(a,'model_profile','vace1_3b')=='vace14b'
 model,revision=(LARGE_MODEL,LARGE_REVISION) if large else (MODEL,REVISION)
 def checked(field):
  file=Path(request[field]).resolve()
  if not file.is_relative_to(root) or hashlib.sha256(file.read_bytes()).hexdigest()!=request[field+'Sha256']:
   raise ValueError('Control artifact hash/scope mismatch: '+field)
  return file
 control,first,last=[checked(field) for field in ['controlVideo','firstImage','lastImage']]
 if time.time()+600>=request['deadlineEpoch']:raise RuntimeError('Insufficient authorized NVIDIA window')
 if not torch.cuda.is_available() or torch.cuda.get_device_name(0)!='NVIDIA L40S':raise RuntimeError('Authorized NVIDIA L40S required')
 model_receipt=json.loads((a.models/'model-receipt.json').read_text())
 if model_receipt['model']!=model or model_receipt['revision']!=revision:raise RuntimeError('Pinned VACE model required')
 if large and not a.retained_models:raise ValueError('Retained verified VAE required for prepared 14B profile')
 if (a.output/'receipt.json').exists():raise FileExistsError('Completed control take exists; preserve and review it')
 started=time.monotonic(); a.output.mkdir(parents=True,exist_ok=True)
 width,height,count,fps,steps=832,480,81,16,int(request.get('steps',40))
 if not 20<=steps<=50:raise ValueError('Unsupported bounded step count')
 decoded=subprocess.check_output(['ffmpeg','-v','error','-i',str(control),'-frames:v',str(count),'-pix_fmt','rgb24','-f','rawvideo','pipe:1'])
 arrays=np.frombuffer(decoded,dtype=np.uint8).reshape((-1,height,width,3))
 if len(arrays)!=count:raise ValueError('Incomplete structural guide')
 images=[Image.fromarray(frame) for frame in arrays]
 frame_hashes=[hashlib.sha256(frame.tobytes()).hexdigest() for frame in arrays]
 # Official first/last-frame composition: endpoint pixels are retained,
 # middle control maps are reactive conditions, not copied CGI textures.
 images[0]=Image.open(first).convert('RGB').resize((width,height))
 images[-1]=Image.open(last).convert('RGB').resize((width,height))
 masks=[Image.new('L',(width,height),0 if i in (0,count-1) else 255) for i in range(count)]
 reference_mode=request.get('referenceMode','extra_yacht_reference')
 if reference_mode not in ('extra_yacht_reference','endpoints_only'):
  raise ValueError('Unsupported reference mode')
 text=UMT5EncoderModel.from_pretrained(a.text_encoder,torch_dtype=torch.bfloat16,local_files_only=True)
 vae=AutoencoderKLWan.from_pretrained(a.retained_models if large else a.models,subfolder='vae',torch_dtype=torch.float32,local_files_only=True)
 pipe=WanVACEPipeline.from_pretrained(a.models,text_encoder=text,vae=vae,torch_dtype=torch.bfloat16,local_files_only=True)
 pipe.scheduler=UniPCMultistepScheduler.from_config(pipe.scheduler.config,flow_shift=3.0)
 if vae.config.z_dim!=16:raise RuntimeError('Unexpected VACE latent contract')
 pipe.enable_model_cpu_offload();pipe.vae.enable_tiling();torch.cuda.reset_peak_memory_stats()
 def progress(_pipe,step,_t,kw):
  if time.time()+45>=request['deadlineEpoch']:raise RuntimeError('Authorized NVIDIA window reached')
  if step%5==0:print(json.dumps({'event':'controlled_video_step','step':step+1,'seconds':time.monotonic()-started}),flush=True)
  return kw
 print(json.dumps({'event':'controlled_video_loaded','seconds':time.monotonic()-started}),flush=True)
 with torch.inference_mode():
  result=pipe(video=images,mask=masks,
   reference_images=[images[-1]] if reference_mode=='extra_yacht_reference' else None,conditioning_scale=1.0,
   prompt=request['prompt'],negative_prompt=request['negativePrompt'],height=height,width=width,num_frames=count,
   num_inference_steps=steps,guidance_scale=5.0,generator=torch.Generator(device='cuda').manual_seed(request['seed']),
   callback_on_step_end=progress).frames[0]
 if len(result)!=count:raise RuntimeError('Unexpected generated frame count')
 raw=a.output/'native.mp4';final=a.output/'video.mp4';export_to_video(result,str(raw),fps=fps,quality=9)
 encoder=['-c:v','h264_nvenc','-preset','p6','-rc','vbr','-cq','18','-b:v','0'] if large else ['-c:v','libx264','-crf','17']
 subprocess.run(['ffmpeg','-y','-v','error','-i',str(raw),*encoder,'-pix_fmt','yuv420p','-movflags','+faststart',str(final)],check=True)
 receipt={'status':'GENERATED_PENDING_VISUAL_REVIEW','model':model,'modelRevision':revision,
  'tool':'AutoPromote private structural-control adapter','origin':'video_control_and_endpoint_conditioned_generation',
  'sourceBrief':request['sourceBrief'],'seed':request['seed'],'parentProvenance':request['reference'],
  'settings':{'width':width,'height':height,'frameCount':count,'fps':fps,'steps':steps,'guidanceScale':5.0,'conditioningScale':1.0,
   'dtype':'bfloat16; VAE float32','cpuOffload':True,
   'scheduler':type(pipe.scheduler).__name__,'flowShift':3.0,'referenceFrameHashes':frame_hashes,
   'mask':'Black photographic endpoints, white reactive structural-guide middle',
   'referenceMode':reference_mode,
   'references':{field:request[field+'Sha256'] for field in ['controlVideo','firstImage','lastImage']},
   'prompt':request['prompt'],'negativePrompt':request['negativePrompt']},
  'gpu':torch.cuda.get_device_name(0),'diffusers':diffusers.__version__,'scriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
  'modelProfile':'vace14b' if large else 'vace1_3b','modelPreparationSha256':hashlib.sha256((a.models/'model-receipt.json').read_bytes()).hexdigest(),
  'reusedTextEncoder':model_receipt['reusedComponents']['textEncoder'] if large else model_receipt['reusedTextEncoder'],'seconds':time.monotonic()-started,'peakCudaAllocatedBytes':torch.cuda.max_memory_allocated(),
  'artifact':{'path':str(final),'sha256':hashlib.sha256(final.read_bytes()).hexdigest(),'duration':len(result)/fps},
  'nativeArtifact':{'path':str(raw),'sha256':hashlib.sha256(raw.read_bytes()).hexdigest()},
  'limitation':'Experimental mixed control task. Successful inference does not establish cinematic realism, continuous transformation or marketing acceptance.'}
 (a.output/'receipt.json').write_text(json.dumps(receipt,indent=2));print(json.dumps({'event':'controlled_video_generated','sha256':receipt['artifact']['sha256']}),flush=True)

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);p.add_argument('--models',type=Path,required=True)
 p.add_argument('--text-encoder',type=Path,required=True);p.add_argument('--request',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
 p.add_argument('--model-profile',choices=['vace1_3b','vace14b'],default='vace1_3b');p.add_argument('--retained-models',type=Path);run(p.parse_args())
