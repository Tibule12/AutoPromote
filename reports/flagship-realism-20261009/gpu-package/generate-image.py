"""Individual NVIDIA image assets, with original PNG and timed Studio source."""
import argparse,hashlib,json,subprocess,time
from pathlib import Path
def run(a):
 import torch
 from diffusers import StableDiffusionXLPipeline, StableDiffusionXLImg2ImgPipeline
 from PIL import Image, ImageOps
 data=json.loads(a.request.read_text());receipt=json.loads((a.models/"model-receipt.json").read_text())
 if time.time()+120>=data["deadlineEpoch"]:raise RuntimeError("Insufficient authorized NVIDIA time")
 if not torch.cuda.is_available() or torch.cuda.get_device_name(0)!="NVIDIA L40S":raise RuntimeError("Existing NVIDIA L40S required")
 conditioned=any(item.get('reference_image') for item in data['images'])
 if conditioned and (not a.root or not all(item.get('reference_image') for item in data['images'])):
  raise ValueError('A private artifact root and consistent reference-image profile are required')
 references={}
 for item in data['images']:
  if conditioned:
   source=Path(item['reference_image']).resolve()
   if not source.is_relative_to(a.root.resolve()) or source.stat().st_size>40*1024**2:
    raise ValueError('Reference image outside bounded private artifacts')
   source_sha=hashlib.sha256(source.read_bytes()).hexdigest()
   if source_sha!=item.get('reference_image_sha256') or not .1<=float(item.get('strength',.72))<=.9:
    raise ValueError('Reference hash or image-conditioning strength invalid')
   references[item['id']]=(source,source_sha)
   if (a.output/item['id']/'receipt.json').exists():
    raise FileExistsError('Completed conditioned image exists; preserve and inspect it')
 pipeline=StableDiffusionXLImg2ImgPipeline if conditioned else StableDiffusionXLPipeline
 pipe=pipeline.from_pretrained(a.models,variant="fp16",torch_dtype=torch.float16,use_safetensors=True,local_files_only=True).to("cuda")
 pipe.enable_vae_tiling()
 for item in data["images"]:
  if time.time()+60>=data["deadlineEpoch"]:raise RuntimeError("NVIDIA deadline reached")
  if not item["id"].replace("-","").replace("_","").isalnum() or not 1<=len(item["prompt"])<=6000:raise ValueError("Invalid image asset")
  duration=float(item.get("duration",3))
  if not .5<=duration<=10:raise ValueError("Invalid timed image duration")
  token_counts=[len(t(item['prompt'],truncation=False)['input_ids']) for t in [pipe.tokenizer,pipe.tokenizer_2]]
  if any(n>t.model_max_length for n,t in zip(token_counts,[pipe.tokenizer,pipe.tokenizer_2])):
   raise ValueError(f"Image prompt exceeds model context ({token_counts}); shorten the creative instruction instead of silently dropping its scene, lighting or action")
  out=a.output/item["id"];out.mkdir(parents=True,exist_ok=True);started=time.monotonic()
  conditioning={}
  if conditioned:
   conditioning={'image':ImageOps.fit(Image.open(references[item['id']][0]).convert('RGB'),(1344,768),method=Image.Resampling.LANCZOS),'strength':float(item.get('strength',.72))}
  image=pipe(prompt=item["prompt"],negative_prompt=item.get("negative_prompt","text, logos, watermark, deformed paper, extra boats, blurry, low quality"),**conditioning,**({} if conditioned else {'width':1344,'height':768}),num_inference_steps=35,guidance_scale=7,generator=torch.Generator(device="cuda").manual_seed(item["seed"])).images[0]
  native=out/"image.png";image.save(native)
  # This timed still is an editor input, not a claim of generated video action.
  video=out/"video.mp4"
  subprocess.run(["ffmpeg","-y","-v","error","-loop","1","-i",str(native),"-t",str(duration),"-vf","scale=1280:704:force_original_aspect_ratio=increase,crop=1280:704,setsar=1","-r","24","-c:v","libx264","-crf","17","-pix_fmt","yuv420p","-movflags","+faststart",str(video)],check=True)
  record={"status":"GENERATED_PENDING_REVIEW","sourceBrief":data["sourceBrief"],"prompt":item["prompt"],"model":receipt["model"],"modelRevision":receipt["revision"],"tool":"AutoPromote NVIDIA image adapter","seed":item["seed"],"settings":{"steps":35,"guidance":7,"width":1344,"height":768,"dtype":"float16","encodedTokenCounts":token_counts,"promptTruncated":False},"gpu":torch.cuda.get_device_name(0),"origin":"native_generated_image","artifact":{"path":str(video),"sha256":hashlib.sha256(video.read_bytes()).hexdigest(),"duration":duration},"reusableArtifacts":[{"role":"native_image","path":str(native),"sha256":hashlib.sha256(native.read_bytes()).hexdigest()}],"seconds":time.monotonic()-started}
  if conditioned:
   record.update(referenceImageSha256=references[item['id']][1],origin='reference_conditioned_generated_image')
   record['settings'].update(conditioning='image-to-image',strength=conditioning['strength'],referenceResize='aspect-preserving centre crop')
  (out/"receipt.json").write_text(json.dumps(record,indent=2));print(json.dumps({"event":"image_ready","id":item["id"],"seconds":record["seconds"]}),flush=True)
if __name__=="__main__":
 p=argparse.ArgumentParser();p.add_argument("--request",type=Path,required=True);p.add_argument("--models",type=Path,required=True);p.add_argument("--output",type=Path,required=True);p.add_argument('--root',type=Path);run(p.parse_args())
