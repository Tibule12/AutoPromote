"""Private experiment: full-video SDEdit plus the retained 14B I2V endpoints.

The scheduler starts at the SAME sigma used to noise the motion-guide latents.
This is an experimental asset adapter, not a claim of creative qualification.
"""
import argparse, hashlib, json, subprocess, time
from pathlib import Path

def run(a):
 import numpy as np, torch, diffusers
 from PIL import Image
 from diffusers import AutoencoderKLWan, WanImageToVideoPipeline
 from diffusers.utils import export_to_video
 from diffusers.utils.torch_utils import randn_tensor
 request=json.loads(a.request.read_text()); root=a.root.resolve()
 def checked(field):
  file=Path(request[field]).resolve()
  if not file.is_relative_to(root) or hashlib.sha256(file.read_bytes()).hexdigest()!=request[field+'Sha256']:
   raise ValueError('Conditioning artifact hash/scope mismatch: '+field)
  return file
 source, first, last=[checked(f) for f in ['sourceVideo','firstImage','lastImage']]
 strength=float(request['strength'])
 if not .65<=strength<=.85: raise ValueError('Unsupported experimental strength')
 if time.time()+2400>=request['deadlineEpoch']: raise RuntimeError('Insufficient authorized NVIDIA window')
 if not torch.cuda.is_available() or torch.cuda.get_device_name(0)!='NVIDIA L40S': raise RuntimeError('Authorized NVIDIA L40S required')
 model_receipt=json.loads((a.models/'model-receipt.json').read_text())
 if model_receipt['revision']!='596658fd9ca6b7b71d5057529bbf319ecbc61d74': raise RuntimeError('Pinned model required')
 started=time.monotonic(); a.output.mkdir(parents=True,exist_ok=True)
 width,height,count,fps,base_steps=832,480,81,16,40
 duration=float(json.loads(subprocess.check_output(['ffprobe','-v','error','-show_format','-of','json',str(source)]))['format']['duration'])
 if not 3<=duration<=10: raise ValueError('Unsupported motion guide duration')
 decoded=subprocess.check_output(['ffmpeg','-v','error','-i',str(source),'-vf',f'fps={count/duration},scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height}',
  '-frames:v',str(count),'-pix_fmt','rgb24','-f','rawvideo','pipe:1'])
 arrays=np.frombuffer(decoded,dtype=np.uint8).reshape((-1,height,width,3))
 if len(arrays)!=count: raise ValueError('Incomplete motion guide decode')
 images=[Image.fromarray(frame) for frame in arrays]
 vae=AutoencoderKLWan.from_pretrained(a.models,subfolder='vae',torch_dtype=torch.float32,local_files_only=True)
 pipe=WanImageToVideoPipeline.from_pretrained(a.models,vae=vae,torch_dtype=torch.bfloat16,local_files_only=True)
 if vae.config.z_dim!=16 or pipe.transformer.config.in_channels!=36 or pipe.config.expand_timesteps:
  raise RuntimeError('Unexpected retained I2V model contract')
 pipe.enable_model_cpu_offload();pipe.vae.enable_tiling();torch.cuda.reset_peak_memory_stats()
 device=torch.device('cuda'); generator=torch.Generator(device=device).manual_seed(request['seed'])
 with torch.inference_mode():
  video=pipe.video_processor.preprocess_video(images,height=height,width=width).to(device=device,dtype=torch.float32)
  guide=pipe.vae.encode(video).latent_dist.mode()
  mean=torch.tensor(vae.config.latents_mean,device=device).view(1,16,1,1,1)
  std=torch.tensor(vae.config.latents_std,device=device).view(1,16,1,1,1)
  guide=(guide-mean)/std
  if tuple(guide.shape)!=(1,16,21,60,104):raise RuntimeError('Motion guide latent shape mismatch')
  del video
  original_set=pipe.scheduler.set_timesteps
  start=base_steps-int(base_steps*strength); remaining=base_steps-start
  original_set(base_steps,device=device)
  timestep=pipe.scheduler.timesteps[start].clone(); sigma=float(pipe.scheduler.sigmas[start])
  noise=randn_tensor(guide.shape,generator=generator,device=device,dtype=guide.dtype)
  if pipe.scheduler.config.prediction_type!='flow_prediction' or not pipe.scheduler.config.use_flow_sigmas:
   raise RuntimeError('Expected the retained model flow scheduler')
  noisy=pipe.scheduler.add_noise(guide,noise,timestep.reshape(1))
  expected=(1-sigma)*guide+sigma*noise
  if not torch.allclose(noisy,expected,atol=1e-5,rtol=1e-5):raise RuntimeError('Unexpected flow noise parameterization')
  def guided_schedule(num_inference_steps,device=None,**kwargs):
   if num_inference_steps!=remaining or kwargs:raise RuntimeError('Unexpected scheduler invocation')
   original_set(base_steps,device=device)
   pipe.scheduler.timesteps=pipe.scheduler.timesteps[start:]
   pipe.scheduler.sigmas=pipe.scheduler.sigmas[start:]
   pipe.scheduler.num_inference_steps=remaining
   pipe.scheduler.set_begin_index(0)
   if abs(float(pipe.scheduler.sigmas[0])-sigma)>1e-7:raise RuntimeError('Conditioning/scheduler sigma mismatch')
  pipe.scheduler.set_timesteps=guided_schedule
  print(json.dumps({'event':'guided_i2v_loaded','seconds':time.monotonic()-started,'startIndex':start,'sigma':sigma,'steps':remaining}),flush=True)
  def progress(_pipe,step,_t,kw):
   if time.time()+45>=request['deadlineEpoch']:raise RuntimeError('Authorized NVIDIA window reached')
   if step%4==0: print(json.dumps({'event':'guided_i2v_step','step':step+1,'seconds':time.monotonic()-started}),flush=True)
   return kw
  result=pipe(image=Image.open(first).convert('RGB').resize((width,height)),last_image=Image.open(last).convert('RGB').resize((width,height)),
   prompt=request['prompt'],negative_prompt=request['negativePrompt'],latents=noisy,height=height,width=width,num_frames=count,
   num_inference_steps=remaining,guidance_scale=3.5,guidance_scale_2=3.5,generator=generator,callback_on_step_end=progress).frames[0]
 raw=a.output/'native.mp4';final=a.output/'video.mp4';export_to_video(result,str(raw),fps=fps,quality=9)
 subprocess.run(['ffmpeg','-y','-v','error','-i',str(raw),'-c:v','libx264','-crf','17','-pix_fmt','yuv420p','-movflags','+faststart',str(final)],check=True)
 receipt={'status':'GENERATED_PENDING_VISUAL_REVIEW','model':'Wan-AI/Wan2.2-I2V-A14B-Diffusers','modelRevision':model_receipt['revision'],
  'tool':'AutoPromote experimental video-guided I2V adapter','origin':'full_video_and_endpoint_conditioned_generation','sourceBrief':request['sourceBrief'],'seed':request['seed'],
  'settings':{'width':width,'height':height,'frameCount':count,'fps':fps,'baseSteps':base_steps,'denoiseSteps':remaining,'strength':strength,'startSigma':sigma,
   'scheduler':type(pipe.scheduler).__name__,'flowShift':pipe.scheduler.config.flow_shift,
   'conditioning':'Whole video VAE latents with matched starting noise sigma; photographic first and last frame I2V conditions',
   'referenceFrameHashes':[hashlib.sha256(frame.tobytes()).hexdigest() for frame in images],
   'references':{f:request[f+'Sha256'] for f in ['sourceVideo','firstImage','lastImage']},'prompt':request['prompt'],'negativePrompt':request['negativePrompt']},
  'gpu':torch.cuda.get_device_name(0),'diffusers':diffusers.__version__,'scriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
  'seconds':time.monotonic()-started,'peakCudaAllocatedBytes':torch.cuda.max_memory_allocated(),
  'artifact':{'path':str(final),'sha256':hashlib.sha256(final.read_bytes()).hexdigest(),'duration':len(result)/fps},
  'nativeArtifact':{'path':str(raw),'sha256':hashlib.sha256(raw.read_bytes()).hexdigest()},'parentProvenance':request['reference'],
  'limitation':'Experimental SDEdit adaptation. A completed generation does not establish continuous transformation, realism or whole-film creative success.'}
 (a.output/'receipt.json').write_text(json.dumps(receipt,indent=2));print(json.dumps({'event':'guided_i2v_generated','sha256':receipt['artifact']['sha256']}),flush=True)

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);p.add_argument('--models',type=Path,required=True);p.add_argument('--request',type=Path,required=True);p.add_argument('--output',type=Path,required=True);run(p.parse_args())
