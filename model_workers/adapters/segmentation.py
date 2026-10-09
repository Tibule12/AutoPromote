"""SAM2.1 masks; deterministic object centroids are explicitly distinguished."""
import json
from pathlib import Path
import numpy as np
from PIL import Image,ImageFilter
from model_workers.common import sha,canonical,write_json,blob,bundle_masks,read_dependency,run

def segment(spec,source,geometry,model_dir,output):
    import torch
    from transformers import Sam2VideoModel,Sam2VideoProcessor
    from python_media_worker.studio_subject_matte import detect_shot_cuts,mask_geometry
    p=spec['request']['parameters'];w,h=int(geometry['width']),int(geometry['height']);count=int(geometry['nb_read_frames'])
    cuts=detect_shot_cuts(source,24);prompts={x['frameIndex']:x for x in p['shotPrompts']}
    if any(c not in prompts for c in cuts):raise ValueError('Tracking across shot cuts requires explicit source-bound prompts')
    model=Sam2VideoModel.from_pretrained(model_dir,local_files_only=True).to('cuda',dtype=torch.bfloat16).eval()
    processor=Sam2VideoProcessor.from_pretrained(model_dir,local_files_only=True)
    session=processor.init_video_session(inference_device='cuda',dtype=torch.bfloat16)
    masks=output/'subject_masks';masks.mkdir();rows=[]
    import subprocess
    decoder=subprocess.Popen(['ffmpeg','-nostdin','-v','error','-i',str(source),'-map','0:v:0','-vsync','0','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
    try:
        with torch.inference_mode():
            for i in range(count):
                data=decoder.stdout.read(w*h*3)
                if len(data)!=w*h*3:raise ValueError('Source decode ended before mask clock')
                image=Image.frombytes('RGB',(w,h),data)
                inputs=processor(images=image,device='cuda',return_tensors='pt')
                if i==0 or i in prompts:
                    if i:session=processor.init_video_session(inference_device='cuda',dtype=torch.bfloat16)
                    box=(prompts[i]['box'] if i else p['initialBox']);box=[box[0]*w,box[1]*h,box[2]*w,box[3]*h]
                    opts={'inference_session':session,'frame_idx':0,'obj_ids':1,'input_boxes':[[box]],'original_size':inputs.original_sizes[0]}
                    if not i and p['points']:
                        opts.update(input_points=[[[[x['position'][0]*w,x['position'][1]*h] for x in p['points']]]],input_labels=[[[x['label'] for x in p['points']]]])
                    processor.add_inputs_to_inference_session(**opts)
                predicted=model(inference_session=session,frame=inputs.pixel_values[0])
                values=processor.post_process_masks([predicted.pred_masks],original_sizes=inputs.original_sizes,binarize=False)[0][0,0].float().cpu().numpy()
                if values.shape!=(h,w) or not np.isfinite(values).all():raise ValueError('Invalid model mask')
                # SAM outputs segmentation logits, not hair-matting opacity.
                # Threshold class membership, then feather only the binary edge.
                hard=Image.fromarray((values>0).astype(np.uint8)*255)
                alpha=np.array(hard.filter(ImageFilter.GaussianBlur(.65)),dtype=np.uint8)
                name=f'matte_{i:04d}.png';Image.fromarray(alpha).save(masks/name)
                rows.append({'index':i,'time':i/24,'sourceTick':spec['request']['sourceRange']['startTick']+i*3750,'file':name,'sha256':sha(masks/name),**mask_geometry(alpha)})
                if i%24==0:print(json.dumps({'event':'sam2_frame','index':i,'coverage':rows[-1]['coverage']}),flush=True)
        if decoder.stdout.read(1) or decoder.wait(timeout=30):raise ValueError('Decoded mask clock differs from source')
    finally:
        if decoder.poll() is None:decoder.kill();decoder.wait()
    # Preserve the existing CachedSubjectMatte/render_vfx contract, with additive
    # original-source range and model-runtime provenance. Box prompting is real
    # SAM inference; the point below documents the reviewed box centre for the
    # legacy compositor's prompt validator, not a fabricated model prediction.
    b=p['initialBox'];prompt={'version':1,'source_sha256':sha(source),'points':[[(b[0]+b[2])*w/2,(b[1]+b[3])*h/2]],'labels':[1],
       'shot_prompts':[{'frame_index':x['frameIndex'],'points':[[(x['box'][0]+x['box'][2])*w/2,(x['box'][1]+x['box'][3])*h/2]],'labels':[1]} for x in p['shotPrompts']]}
    manifest={'version':1,'kind':'source_bound_subject_matte','source_sha256':sha(source),'width':w,'height':h,'fps':24.0,'fps_fraction':'24/1','frame_count':count,
       'model':spec['model']['checkpoint'],'model_revision':spec['model']['revision'],'model_weights_sha256':sha(model_dir/'model.safetensors'),
       'prompt':prompt,'prompt_sha256':sha_json(prompt),'frames':rows,'shot_cuts':cuts,'initial_box':p['initialBox'],
       'original_source_sha256':spec['request']['sourceSha256'],'sourceRange':spec['request']['sourceRange'],
       'mask_semantics':'binary segmentation at logit > 0; deterministic 0.65px edge feather',
       'quality':'Segmentation, not dedicated hair matting; visual review required'}
    write_json(masks/'manifest.json',manifest)
    write_json(output/'subject_masks_manifest.json',manifest);bundle_masks(masks,output/'subject_masks.tar.gz')
    return {'subjectId':p['subjectId'],'width':w,'height':h,'fpsNumerator':24,'fpsDenominator':1,'frameCount':count,'sourceRange':spec['request']['sourceRange'],
       'maskManifest':blob(output/'subject_masks_manifest.json'),'maskBundle':blob(output/'subject_masks.tar.gz',media_type='application/gzip'),
       'coverageBasis':'decoded_frames','confidence':None,'warnings':[f"Near-empty foreground at frame {x['index']}" for x in rows if x['coverage']<.005]}

def sha_json(value):
    import hashlib
    # Existing subject compositor's canonical hash uses ensure_ascii=True.
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()

def track(spec,bucket,output):
    dep=read_dependency(spec,'segment_subject');p=spec['request']['parameters']
    if p['maskArtifactHash']!=dep['artifactHash'] or p['mode']!='mask_centroid':raise ValueError('Object mask dependency required')
    ref=dep['output']['maskManifest'];f=next(f for f in dep['files'] if f['name']==ref['name'])
    target=output/'dependency_mask_manifest.json';bucket.blob(f['storagePath'],generation=int(f['generation'])).download_to_filename(str(target))
    if sha(target)!=ref['sha256']:raise ValueError('Mask dependency changed')
    data=json.loads(target.read_text());w,h=data['width'],data['height'];samples=[]
    for row in data['frames']:
        point=row['centroid'];b=row['bbox'];visible=point is not None
        samples.append({'frameIndex':row['index'],'sourceTick':row['sourceTick'],'point':[point[0]/w,point[1]/h] if visible else None,
          'box':[b[0]/w,b[1]/h,b[2]/w,b[3]/h] if b else None,'visible':visible,'confidence':None})
    result={'subjectId':p['subjectId'],'trackingKind':'object_mask_centroid','coordinateSpace':'normalized_source','sourceRange':spec['request']['sourceRange'],
            'samples':samples,'dependencyArtifactHash':dep['artifactHash'],'coverageBasis':'decoded_frames'}
    write_json(output/'tracking_path.json',result);return result
