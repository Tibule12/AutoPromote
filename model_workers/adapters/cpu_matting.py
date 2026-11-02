"""Pinned CPU ViTMatte refinement from one owned immutable segmentation artifact.

No rendering, generation, GPU access, or new segmentation is performed here.
The trimap and real source frames condition every output alpha.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import tarfile
from urllib.parse import urlparse, parse_qs

import numpy as np
from PIL import Image, ImageDraw
import requests

from model_workers.common import sha, canonical, write_json, blob, bundle_masks
from model_workers.adapters.segmentation import sha_json


def segment(spec, source, geometry, model_dir, output):
    import cv2
    import torch
    from transformers import VitMatteForImageMatting
    from python_media_worker.studio_subject_matte import mask_geometry, CachedSubjectMatte
    torch.set_num_threads(4)
    torch.set_num_interop_threads(1)
    request=spec['request']; params=request['parameters']; settings=params['refinement']
    dependency=spec['maskDependency']; artifact=dependency['artifact']; file=dependency['file']
    artifact_core={key:value for key,value in artifact.items() if key!='artifactHash'}
    if (hashlib.sha256(canonical(artifact_core).encode()).hexdigest()!=settings['maskArtifactHash'] or
        artifact['ownerUid']!=spec['ownerUid'] or artifact['projectId']!=request['projectId'] or
        artifact['sourceSha256']!=request['sourceSha256'] or artifact['sourceAssetId']!=request['sourceAssetId'] or
        artifact['sourceRange']!=request['sourceRange'] or artifact['capability']!='segment_subject' or
        artifact['output']['maskBundle']['sha256']!=file['sha256']):
        raise ValueError('Matting dependency differs from owned segmentation')
    parsed=urlparse(file['url'])
    if parsed.hostname!='storage.googleapis.com' or parsed.scheme!='https' or parse_qs(parsed.query).get('generation')!=[file['generation']]:
        raise ValueError('Matting dependency read must be generation pinned')
    bundle=output.parent/'dependency.tar.gz'; total=0; digest=hashlib.sha256()
    response=requests.get(file['url'],stream=True,timeout=(15,60),allow_redirects=False);response.raise_for_status()
    with bundle.open('xb') as target:
        for block in response.iter_content(1024*1024):
            total+=len(block)
            if total>min(file['bytes'],75*1024**2):raise ValueError('Oversized matting dependency')
            target.write(block);digest.update(block)
    if total!=file['bytes'] or digest.hexdigest()!=file['sha256']:raise ValueError('Matting dependency bytes changed')
    count=int(geometry['nb_read_frames']);width,height=int(geometry['width']),int(geometry['height'])
    names={'manifest.json'}|{f'matte_{i:04d}.png' for i in range(count)}
    previous=output.parent/'dependency';previous.mkdir()
    with tarfile.open(bundle,'r:gz') as archive:
        members=archive.getmembers()
        if ({m.name for m in members}!=names or len(members)!=len(names) or
            any(not m.isfile() or Path(m.name).name!=m.name or m.size>8*1024**2 for m in members) or
            sum(m.size for m in members)>75*1024**2):raise ValueError('Invalid matting mask archive')
        archive.extractall(previous,members=members,filter='data')
    cache=CachedSubjectMatte(previous,source)
    if cache.artifact_sha256!=artifact['output']['maskManifest']['sha256']:raise ValueError('Matting dependency manifest changed')
    if spec.get('componentDependency'):
        file=spec['componentDependency']['file'];parsed=urlparse(file['url'])
        if parsed.hostname!='storage.googleapis.com' or parsed.scheme!='https' or parse_qs(parsed.query).get('generation')!=[file['generation']]:raise ValueError('Component read must be generation pinned')
        response=requests.get(file['url'],timeout=(15,60),allow_redirects=False,stream=True);response.raise_for_status()
        total=0;digest=hashlib.sha256()
        with (output.parent/'component_dependency.tar.gz').open('xb') as target:
            for block in response.iter_content(1024*1024):
                total+=len(block)
                if total>min(file['bytes'],75*1024**2):raise ValueError('Oversized component guidance')
                target.write(block);digest.update(block)
        if total!=file['bytes'] or digest.hexdigest()!=file['sha256']:raise ValueError('Component guidance changed')
    return refine(spec, source, geometry, model_dir, output, cache, artifact)


def refine(spec, source, geometry, model_dir, output, cache, artifact, *, device='cpu'):
    import cv2
    import torch
    from transformers import VitMatteForImageMatting
    from python_media_worker.studio_subject_matte import mask_geometry
    from model_workers.adapters.temporal_alpha import make_trimap, stabilize, polish_trimap, stabilize_stationary_source
    if device not in ('cpu','cuda'):raise ValueError('Explicit local inference device must be cpu or cuda')
    request=spec['request'];params=request['parameters'];settings=params['refinement']
    count=int(geometry['nb_read_frames']);width,height=int(geometry['width']),int(geometry['height'])
    temporal=spec['model'].get('limits',{}).get('temporalAlpha',False)
    torch.set_num_threads(4)
    if torch.get_num_interop_threads()!=1:torch.set_num_interop_threads(1)
    weights=spec['model']['weights'][0]
    if sha(model_dir/weights['path'])!=weights['sha256']:raise ValueError('Matting checkpoint changed')
    reuse_alpha=bool(temporal and spec['model'].get('limits',{}).get('reuseSourceAlpha') and
        cache.manifest.get('model')==spec['model']['checkpoint'] and
        cache.manifest.get('model_weights_sha256')==weights['sha256'] and
        cache.manifest.get('alpha_semantics','').startswith('ViTMatte'))
    source_edges=spec['model'].get('limits',{}).get('sourceResolutionEdges',False)
    guidance=None
    if source_edges:
        from model_workers.adapters.source_edge_alpha import load_guidance
        guidance=load_guidance(spec,output.parent,source,count)
    model=None if reuse_alpha else VitMatteForImageMatting.from_pretrained(model_dir,local_files_only=True).to(device).eval()
    masks=output/'subject_masks';masks.mkdir();rows=[]
    trimap_dir=output/'trimaps';rgb_dir=output/'rgb'
    if temporal:trimap_dir.mkdir();rgb_dir.mkdir()
    holdout=Image.new('L',(width,height));draw=ImageDraw.Draw(holdout)
    for polygon in settings['holdouts']:draw.polygon([(round(x*width),round(y*height)) for x,y in polygon],fill=255)
    holdout=np.array(holdout)>127
    radius=settings['radius'];kernel=cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(2*radius+1,)*2)
    decoder=subprocess.Popen(['ffmpeg','-nostdin','-v','error','-i',str(source),'-map','0:v:0','-vsync','0','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
    try:
        with torch.inference_mode():
            for index in range(count):
                data=decoder.stdout.read(width*height*3)
                if len(data)!=width*height*3:raise ValueError('Matting source ended early')
                rgb=np.frombuffer(data,np.uint8).reshape(height,width,3).copy()
                selected=((cache.frame(index)>=128)|holdout).astype(np.uint8)
                if temporal:
                    object_evidence=None
                    if guidance:
                        directory,manifest=guidance;object_evidence=np.zeros(selected.shape,bool)
                        for component in manifest['components'][1:]:
                            object_evidence|=np.asarray(Image.open(directory/component['frames'][index]['file']))>=24
                    trimap=polish_trimap(cache.frame(index),radius) if reuse_alpha else make_trimap(selected,radius,evidence=np.maximum(cache.frame(index),holdout.astype(np.uint8)*255),weak_evidence_region=object_evidence)
                    inside=trimap==255;outside=trimap==0
                    Image.fromarray(trimap).save(trimap_dir/f'trimap_{index:04d}.png')
                    Image.fromarray(rgb).save(rgb_dir/f'rgb_{index:04d}.png')
                else:
                    inside=cv2.erode(selected,kernel)>0;outside=cv2.dilate(selected,kernel)==0
                    trimap=np.full((height,width),128,np.uint8);trimap[inside]=255;trimap[outside]=0
                if reuse_alpha:
                    alpha=cache.frame(index).astype(np.float32)/255
                    alpha[holdout]=1
                    trimap[holdout]=255;inside=trimap==255;outside=trimap==0
                    Image.fromarray(trimap).save(trimap_dir/f'trimap_{index:04d}.png')
                else:
                    pixels=torch.from_numpy(rgb).to(device).permute(2,0,1).float()/127.5-1
                    inputs=torch.cat((pixels,torch.from_numpy(trimap).to(device)[None].float()/255),dim=0)[None]
                    limit=spec['model'].get('limits',{}).get('alphaInferenceMaxSide')
                    infer_h,infer_w=height,width
                    if limit and max(height,width)>limit:
                        scale=limit/max(height,width);infer_h=max(32,round(height*scale));infer_w=max(32,round(width*scale))
                        rgb_tensor=torch.nn.functional.interpolate(inputs[:,:3],(infer_h,infer_w),mode='bilinear',align_corners=False,antialias=True)
                        tri_tensor=torch.nn.functional.interpolate(inputs[:,3:],(infer_h,infer_w),mode='nearest')
                        inputs=torch.cat((rgb_tensor,tri_tensor),1)
                    inputs=torch.nn.functional.pad(inputs,(0,(-infer_w)%32,0,(-infer_h)%32))
                    predicted=model(pixel_values=inputs).alphas[:,:,:infer_h,:infer_w]
                    if (infer_h,infer_w)!=(height,width):predicted=torch.nn.functional.interpolate(predicted,(height,width),mode='bilinear',align_corners=False)
                    alpha=predicted[0,0].cpu().numpy()
                if not np.isfinite(alpha).all():raise ValueError('Nonfinite matting result')
                alpha=np.clip(alpha,0,1);alpha[inside]=1;alpha[outside]=0
                values=np.rint(alpha*255).astype(np.uint8);name=f'matte_{index:04d}.png';Image.fromarray(values).save(masks/name)
                rows.append({'index':index,'time':index/24,'sourceTick':request['sourceRange']['startTick']+index*3750,'file':name,'sha256':sha(masks/name),**mask_geometry(values)})
                if index%12==0:print(json.dumps({'event':'cpu_alpha_refinement','index':index,'total':count}),flush=True)
        if decoder.stdout.read(1) or decoder.wait(timeout=30):raise ValueError('Matting source clock differs')
    finally:
        if decoder.poll() is None:decoder.kill();decoder.wait()
    if temporal:
        boundaries=sorted({p['frameIndex'] for p in params['shotPrompts']} | {p['frameIndex'] for c in params.get('components',[]) for p in c.get('shotPrompts',[])})
        diagnostics=stabilize(rgb_dir,masks,trimap_dir,count,boundaries,repair_outliers=spec['model'].get('limits',{}).get('repairTemporalOutliers',False))
        if spec['model'].get('limits',{}).get('stationarySourceConsensus',False):
            regions={boundary:[] for boundary in boundaries}
            for correction in params['shotPrompts']:
                regions[correction['frameIndex']].append([0,0,1,1])
            for component in params.get('components',[]):
                for correction in component.get('shotPrompts',[]):
                    regions[correction['frameIndex']].append(component['box'])
            diagnostics['stationarySource']=stabilize_stationary_source(rgb_dir,masks,trimap_dir,count,boundaries,regions)
        if source_edges:
            from model_workers.adapters.source_edge_alpha import refine_source_edge
            for index in range(count):
                rgb=np.asarray(Image.open(rgb_dir/f'rgb_{index:04d}.png'))
                alpha=np.asarray(Image.open(masks/f'matte_{index:04d}.png'))
                values=refine_source_edge(rgb,alpha,guidance,index,
                    colour_component_ids=settings.get('colourComponentIds',[]) if spec['model'].get('limits',{}).get('correctFixedObjectColours',False) else ())
                # Authored foreground holdouts remain authoritative. Component
                # background clicks condition SAM and the original trimap.
                values[holdout]=255
                Image.fromarray(values).save(masks/f'matte_{index:04d}.png')
                if index%12==0:print(json.dumps({'event':'source_resolution_edges','index':index,'total':count}),flush=True)
            diagnostics['sourceEdges']={'algorithm':'component_corrective_colour_closed_form_v2' if spec['model'].get('limits',{}).get('correctFixedObjectColours',False) else 'component_scoped_closed_form_v1','pymatting':'1.1.16','radiusPixels':3,
                'personAlphaPreserved':True,'componentArtifactHash':spec.get('componentDependency',{}).get('artifact',{}).get('artifactHash')}
            if spec['model'].get('limits',{}).get('stationarySourceConsensus',False):
                diagnostics['sourceEdges']['stationaryConsensus']=stabilize_stationary_source(rgb_dir,masks,trimap_dir,count,boundaries,regions)
        write_json(output/'temporal_diagnostics.json',diagnostics)
        for row in rows:
            values=np.array(Image.open(masks/row['file']))
            row.update(sha256=sha(masks/row['file']),**mask_geometry(values))
    box=params['initialBox'];prompt={'version':1,'source_sha256':sha(source),'points':[[(box[0]+box[2])*width/2,(box[1]+box[3])*height/2]],'labels':[1],'shot_prompts':[]}
    manifest={**cache.manifest,'model':spec['model']['checkpoint'],'model_revision':spec['model']['revision'],
      'model_weights_sha256':weights['sha256'],'frames':rows,'prompt':cache.manifest['prompt'] if temporal else prompt,'prompt_sha256':cache.manifest['prompt_sha256'] if temporal else sha_json(prompt),
      'parent_mask_artifact_hash':artifact['artifactHash'],'alpha_semantics':('ViTMatte source-conditioned alpha with occlusion-rejected adjacent-frame optical-flow fusion in unknown trimap regions. Known foreground/background and correction boundaries remain authoritative.' if temporal else 'ViTMatte image-conditioned alpha from source and segmentation-derived trimap; independent per frame, temporal stability requires moving review.'),
      'refinement':settings,'matting_stage':{'mode':'source_temporal_polish' if reuse_alpha else 'source_conditioned_image_alpha','modelInferencePerformed':not reuse_alpha,'sourceResolutionEdges':bool(source_edges),'componentArtifactHash':spec.get('componentDependency',{}).get('artifact',{}).get('artifactHash')},'alpha_inference_max_side':spec['model'].get('limits',{}).get('alphaInferenceMaxSide'),'quality':'Unapproved model alpha. Not a professional creative-quality guarantee.'}
    write_json(masks/'manifest.json',manifest);write_json(output/'subject_masks_manifest.json',manifest);bundle_masks(masks,output/'subject_masks.tar.gz')
    return {'subjectId':params['subjectId'],'width':width,'height':height,'fpsNumerator':24,'fpsDenominator':1,'frameCount':count,
      'sourceRange':request['sourceRange'],'maskManifest':blob(output/'subject_masks_manifest.json'),'maskBundle':blob(output/'subject_masks.tar.gz',media_type='application/gzip'),
      'coverageBasis':'decoded_frames','confidence':None,'warnings':[]}
