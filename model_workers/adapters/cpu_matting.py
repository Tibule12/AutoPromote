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
    weights=spec['model']['weights'][0]
    if sha(model_dir/weights['path'])!=weights['sha256']:raise ValueError('Matting checkpoint changed')
    model=VitMatteForImageMatting.from_pretrained(model_dir,local_files_only=True).to('cpu').eval()
    masks=output/'subject_masks';masks.mkdir();rows=[]
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
                inside=cv2.erode(selected,kernel)>0;outside=cv2.dilate(selected,kernel)==0
                trimap=np.full((height,width),128,np.uint8);trimap[inside]=255;trimap[outside]=0
                pixels=torch.from_numpy(rgb).permute(2,0,1).float()/127.5-1
                inputs=torch.cat((pixels,torch.from_numpy(trimap)[None].float()/255),dim=0)[None]
                inputs=torch.nn.functional.pad(inputs,(0,(-width)%32,0,(-height)%32))
                alpha=model(pixel_values=inputs).alphas[0,0,:height,:width].numpy()
                if not np.isfinite(alpha).all():raise ValueError('Nonfinite matting result')
                alpha=np.clip(alpha,0,1);alpha[inside]=1;alpha[outside]=0
                values=np.rint(alpha*255).astype(np.uint8);name=f'matte_{index:04d}.png';Image.fromarray(values).save(masks/name)
                rows.append({'index':index,'time':index/24,'sourceTick':request['sourceRange']['startTick']+index*3750,'file':name,'sha256':sha(masks/name),**mask_geometry(values)})
                if index%12==0:print(json.dumps({'event':'cpu_alpha_refinement','index':index,'total':count}),flush=True)
        if decoder.stdout.read(1) or decoder.wait(timeout=30):raise ValueError('Matting source clock differs')
    finally:
        if decoder.poll() is None:decoder.kill();decoder.wait()
    box=params['initialBox'];prompt={'version':1,'source_sha256':sha(source),'points':[[(box[0]+box[2])*width/2,(box[1]+box[3])*height/2]],'labels':[1],'shot_prompts':[]}
    manifest={**cache.manifest,'model':spec['model']['checkpoint'],'model_revision':spec['model']['revision'],
      'model_weights_sha256':weights['sha256'],'frames':rows,'prompt':prompt,'prompt_sha256':sha_json(prompt),
      'parent_mask_artifact_hash':artifact['artifactHash'],'alpha_semantics':'ViTMatte image-conditioned alpha from source and segmentation-derived trimap; independent per frame, temporal stability requires moving review.',
      'refinement':settings,'quality':'Unapproved model alpha. Not a professional creative-quality guarantee.'}
    write_json(masks/'manifest.json',manifest);write_json(output/'subject_masks_manifest.json',manifest);bundle_masks(masks,output/'subject_masks.tar.gz')
    return {'subjectId':params['subjectId'],'width':width,'height':height,'fpsNumerator':24,'fpsDenominator':1,'frameCount':count,
      'sourceRange':request['sourceRange'],'maskManifest':blob(output/'subject_masks_manifest.json'),'maskBundle':blob(output/'subject_masks.tar.gz',media_type='application/gzip'),
      'coverageBasis':'decoded_frames','confidence':None,'warnings':[]}
