"""Pinned native moving video generation, isolated from Studio edit contracts."""
from model_workers.common import blob,write_json,probe,frame,run

def generate(spec,source,geometry,model_dir,output):
    import torch
    from diffusers import WanPipeline,WanImageToVideoPipeline,AutoencoderKLWan
    from diffusers.utils import export_to_video
    p=spec['request']['parameters'];image_mode=p['mode']=='image_to_video'
    cls=WanImageToVideoPipeline if image_mode else WanPipeline
    vae=AutoencoderKLWan.from_pretrained(model_dir,subfolder='vae',torch_dtype=torch.float32,local_files_only=True)
    pipe=cls.from_pretrained(model_dir,vae=vae,torch_dtype=torch.bfloat16,local_files_only=True).to('cuda')
    pipe.vae.enable_tiling()
    if hasattr(pipe.vae,'enable_slicing'):pipe.vae.enable_slicing()
    args={'prompt':p['prompt'],'negative_prompt':p['negativePrompt'],'height':p['height'],'width':p['width'],
      'num_frames':p['frames'],'num_inference_steps':p['steps'],'guidance_scale':p['guidance'],
      'generator':torch.Generator(device='cuda').manual_seed(p['seed'])}
    if image_mode:args['image']=frame(source,0).resize((p['width'],p['height']))
    with torch.inference_mode(): frames=pipe(**args).frames[0]
    if len(frames)!=p['frames']:raise ValueError('Generation returned the wrong frame clock')
    target=output/'generated_shot.mp4';export_to_video(frames,str(target),fps=p['fps'])
    run(['ffmpeg','-v','error','-xerror','-i',str(target),'-f','null','-'],120)
    info=probe(target)
    if int(info['width'])!=p['width'] or int(info['height'])!=p['height'] or int(info['nb_read_frames'])!=p['frames']:raise ValueError('Generated shot failed independent decode/geometry verification')
    result={'video':blob(target,media_type='video/mp4'),'width':p['width'],'height':p['height'],'fpsNumerator':p['fps'],'fpsDenominator':1,
      'frameCount':p['frames'],'durationTicks':round(p['frames']/p['fps']*90000),'origin':'generated_illustration','reviewRequired':True,'confidence':None}
    write_json(output/'generated_shot.json',result);return result
