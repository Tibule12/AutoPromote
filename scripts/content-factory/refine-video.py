"""Private, bounded full-video conditioning using retained Wan 5B weights.

An experimental raw asset provider. Motion and identity preservation are review
criteria, never guarantees implied by the input or a successful encode.
"""
import argparse,hashlib,json,subprocess,time
from pathlib import Path

def run(a):
 import numpy as np,torch,diffusers
 from PIL import Image
 from diffusers import AutoencoderKLWan,WanVideoToVideoPipeline
 from diffusers.video_processor import VideoProcessor
 from diffusers.utils import export_to_video
 request=json.loads(a.request.read_text());source=Path(request['sourceVideo']).resolve()
 if not source.is_relative_to(a.root.resolve()) or hashlib.sha256(source.read_bytes()).hexdigest()!=request['sourceVideoSha256']:raise ValueError('Video reference hash/scope mismatch')
 strength=float(request['strength'])
 if not .2<=strength<=.85 or not 1<=len(request['prompt'])<=6000:raise ValueError('Invalid refinement requirement')
 if time.time()+1200>=request['deadlineEpoch']:raise RuntimeError('Insufficient authorized NVIDIA window')
 if not torch.cuda.is_available() or torch.cuda.get_device_name(0)!='NVIDIA L40S':raise RuntimeError('Authorized NVIDIA L40S required')
 a.output.mkdir(parents=True,exist_ok=True);started=time.monotonic();width,height,count,fps=1280,704,121,24
 probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_format','-of','json',str(source)]));duration=float(probe['format']['duration'])
 if not 3<=duration<=10:raise ValueError('Reference video duration outside bounded profile')
 # Uniformly sample the whole source, including its final state. Source times
 # and frame hashes bind all conditioning frames to the immutable parent.
 decoded=subprocess.check_output(['ffmpeg','-v','error','-i',str(source),'-vf',f'fps={count/duration},scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height}',
  '-frames:v',str(count),'-pix_fmt','rgb24','-f','rawvideo','pipe:1'])
 arrays=np.frombuffer(decoded,dtype=np.uint8).reshape((-1,height,width,3));images=[Image.fromarray(x) for x in arrays]
 if len(images)!=count:raise ValueError('Incomplete reference video decode')
 frame_hashes=[hashlib.sha256(x.tobytes()).hexdigest() for x in images]
 model=a.models/'wan-ti2v-5b';vae=AutoencoderKLWan.from_pretrained(model,subfolder='vae',torch_dtype=torch.float32,local_files_only=True)
 pipe=WanVideoToVideoPipeline.from_pretrained(model,vae=vae,torch_dtype=torch.bfloat16,local_files_only=True)
 # Diffusers 0.36 V2V predates this VAE's extra spatial patch factor. Derive
 # the actual factor from the retained VAE configuration, as WanPipeline does.
 patch=int(getattr(vae.config,'patch_size',None) or 1)
 pipe.vae_scale_factor_spatial*=patch
 pipe.video_processor=VideoProcessor(vae_scale_factor=pipe.vae_scale_factor_spatial)
 if pipe.vae_scale_factor_spatial!=16 or pipe.transformer.config.in_channels!=48:raise RuntimeError('Unexpected retained 5B model contract')
 pipe.enable_model_cpu_offload();pipe.vae.enable_tiling();torch.cuda.reset_peak_memory_stats()
 print(json.dumps({'event':'full_video_refinement_loaded','strength':strength,'frames':count,'spatialFactor':pipe.vae_scale_factor_spatial}),flush=True)
 def progress(_pipe,step,_t,kw):
  if time.time()+30>=request['deadlineEpoch']:raise RuntimeError('Authorized NVIDIA window reached')
  if step%5==0:print(json.dumps({'event':'full_video_refinement_step','step':step+1,'seconds':time.monotonic()-started}),flush=True)
  return kw
 frames=pipe(video=images,prompt=request['prompt'],negative_prompt=request.get('negativePrompt','cuts, dissolves, duplicate boats, paper yacht at ending, toy, cartoon, flat plastic, flicker, text, watermark'),
  height=height,width=width,num_inference_steps=50,guidance_scale=5,strength=strength,generator=torch.Generator(device='cuda').manual_seed(request['seed']),callback_on_step_end=progress).frames[0]
 if len(frames)!=count:raise RuntimeError('Generated frame count mismatch')
 raw=a.output/'native.mp4';final=a.output/'video.mp4';export_to_video(frames,str(raw),fps=fps,quality=9)
 subprocess.run(['ffmpeg','-y','-v','error','-i',str(raw),'-c:v','libx264','-crf','17','-pix_fmt','yuv420p','-movflags','+faststart',str(final)],check=True)
 receipt={'status':'GENERATED_PENDING_VISUAL_REVIEW','model':'Wan-AI/Wan2.2-TI2V-5B-Diffusers','modelRevision':'b8fff7315c768468a5333511427288870b2e9635','tool':'AutoPromote full-video conditioning adapter',
  'origin':'video_conditioned_generation','sourceBrief':request['sourceBrief'],'seed':request['seed'],'settings':{'pipeline':'WanVideoToVideoPipeline','strength':strength,'steps':50,'guidance':5,'width':width,'height':height,'frameCount':count,'fps':fps,'vaeSpatialFactor':pipe.vae_scale_factor_spatial,'prompt':request['prompt'],'negativePrompt':request.get('negativePrompt'),
  'reference':{'artifactSha256':request['sourceVideoSha256'],'sourceDuration':duration,'sampling':'Uniform whole-source sampling; output time compresses source to 121/24 seconds','frameRgbHashes':frame_hashes,'parent':request['reference']}},
  'gpu':torch.cuda.get_device_name(0),'diffusers':diffusers.__version__,'scriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'seconds':time.monotonic()-started,'peakCudaAllocatedBytes':torch.cuda.max_memory_allocated(),
  'artifact':{'path':str(final),'sha256':hashlib.sha256(final.read_bytes()).hexdigest(),'duration':count/fps},'nativeArtifact':{'path':str(raw),'sha256':hashlib.sha256(raw.read_bytes()).hexdigest()},
  'limitation':'Experimental video conditioning. Actual geometry, identity, temporal continuity, surfaces and story effectiveness require separate decoded-frame and whole-film review.'}
 (a.output/'receipt.json').write_text(json.dumps(receipt,indent=2));print(json.dumps({'event':'full_video_refinement_generated','sha256':receipt['artifact']['sha256']}),flush=True)

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);p.add_argument('--models',type=Path,required=True);p.add_argument('--request',type=Path,required=True);p.add_argument('--output',type=Path,required=True);run(p.parse_args())
