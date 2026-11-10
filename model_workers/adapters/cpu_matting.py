"""Pinned ViTMatte refinement from one owned immutable segmentation artifact.

The default CPU and explicit guarded local CUDA runners share this adapter.
No rendering, generation, or new segmentation is performed here.
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
        from python_media_worker.studio_source_background import evidence_files
        manifests=[m for m in members if m.name=='manifest.json']
        if len(manifests)!=1 or not manifests[0].isfile() or not 0<manifests[0].size<=8*1024**2:
            raise ValueError('Invalid matting dependency manifest')
        manifest_bytes=archive.extractfile(manifests[0]).read()
        if hashlib.sha256(manifest_bytes).hexdigest()!=artifact['output']['maskManifest']['sha256']:
            raise ValueError('Matting dependency manifest changed')
        names|=evidence_files(json.loads(manifest_bytes))
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
    if device not in ('cpu','cuda'):raise ValueError('Explicit local inference device must be cpu or cuda')
    source_workers=spec['model'].get('limits',{}).get('localSourceFrameParallelism',1)
    if type(source_workers)is not int or source_workers not in(1,2) or (source_workers!=1 and device!='cuda'):
        raise ValueError('Source frame parallelism requires explicit local CUDA evaluation')
    import cv2
    import torch
    from transformers import VitMatteForImageMatting
    from python_media_worker.studio_subject_matte import mask_geometry
    from model_workers.adapters.temporal_alpha import make_trimap, stabilize, polish_trimap, stabilize_stationary_source, source_motion_radius, condition_trimap_clicks, independent_selection_evidence
    request=spec['request'];params=request['parameters'];settings=params['refinement']
    count=int(geometry['nb_read_frames']);width,height=int(geometry['width']),int(geometry['height'])
    temporal=spec['model'].get('limits',{}).get('temporalAlpha',False)
    if source_workers==2:cv2.setNumThreads(1)
    torch.set_num_threads(4)
    if torch.get_num_interop_threads()!=1:torch.set_num_interop_threads(1)
    weights=spec['model']['weights'][0]
    if sha(model_dir/weights['path'])!=weights['sha256']:raise ValueError('Matting checkpoint changed')
    reuse_alpha=bool(temporal and spec['model'].get('limits',{}).get('reuseSourceAlpha') and
        isinstance(spec['model'].get('modelVersion'),str) and bool(spec['model']['modelVersion']) and
        cache.manifest.get('model')==spec['model']['checkpoint'] and
        cache.manifest.get('model_version')==spec['model'].get('modelVersion') and
        cache.manifest.get('model_weights_sha256')==weights['sha256'] and
        cache.manifest.get('alpha_semantics','').startswith('ViTMatte'))
    source_edges=spec['model'].get('limits',{}).get('sourceResolutionEdges',False)
    guidance=None
    if source_edges:
        from model_workers.adapters.source_edge_alpha import load_guidance
        guidance=load_guidance(spec,output.parent,source,count)
    moving_detail=bool(temporal and guidance and spec['model'].get('limits',{}).get('observedMovingDetail'))
    fixed_source_polish=bool(temporal and guidance and settings.get('colourComponentIds')
        and spec['model'].get('limits',{}).get('sourceClassifiedObjectNeuralPolish',False))
    fixed_source_inference_calls=0
    model=None if reuse_alpha and not moving_detail and not fixed_source_polish else VitMatteForImageMatting.from_pretrained(model_dir,local_files_only=True).to(device).eval()
    masks=output/'subject_masks';masks.mkdir();rows=[]
    trimap_dir=output/'trimaps';rgb_dir=output/'rgb'
    if temporal:trimap_dir.mkdir();rgb_dir.mkdir()
    holdout=Image.new('L',(width,height));draw=ImageDraw.Draw(holdout)
    for polygon in settings['holdouts']:draw.polygon([(round(x*width),round(y*height)) for x,y in polygon],fill=255)
    holdout=np.array(holdout)>127
    radius=settings['radius'];kernel=cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(2*radius+1,)*2)
    decoder=subprocess.Popen(['ffmpeg','-nostdin','-v','error','-i',str(source),'-map','0:v:0','-vsync','0','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
    previous_rgb=None
    try:
        with torch.inference_mode():
            for index in range(count):
                data=decoder.stdout.read(width*height*3)
                if len(data)!=width*height*3:raise ValueError('Matting source ended early')
                rgb=np.frombuffer(data,np.uint8).reshape(height,width,3).copy()
                source_evidence=cache.frame(index)
                selected=((source_evidence>=128)|holdout).astype(np.uint8)
                if temporal:
                    object_evidence=None
                    fixed_evidence=None
                    moving_components=[]
                    click_components=[]
                    primary_evidence=None
                    if guidance:
                        directory,manifest=guidance;object_evidence=np.zeros(selected.shape,bool)
                        fixed_evidence=np.zeros(selected.shape,np.uint8)
                        primary=manifest['components'][0]
                        primary_evidence=np.asarray(Image.open(directory/primary['frames'][index]['file']))
                        click_components.append((primary['selection'],primary_evidence))
                        for component in manifest['components'][1:]:
                            component_values=np.asarray(Image.open(directory/component['frames'][index]['file']))
                            click_components.append((component['selection'],component_values))
                            object_evidence|=component_values>=24
                            if not component['selection'].get('propagate',True):np.maximum(fixed_evidence,component_values,out=fixed_evidence)
                            else:moving_components.append(component_values)
                        if not reuse_alpha and spec['model'].get('limits',{}).get('freshComponentTrimap',False):
                            source_evidence=independent_selection_evidence(
                                [plane for _,plane in click_components],holdout)
                            selected=(source_evidence>=128).astype(np.uint8)
                    motion_radius=source_motion_radius(rgb,previous_rgb,radius) if guidance and previous_rgb is not None and not reuse_alpha else None
                    primary_background_points=[]
                    if guidance:
                        selection=guidance[1]['components'][0]['selection']
                        primary_clicks=selection.get('points',[]) if index==0 else next((p['points'] for p in selection.get('shotPrompts',[]) if p['frameIndex']==index),[])
                        primary_background_points=[p['position'] for p in primary_clicks if p['label']==0]
                    trimap=polish_trimap(cache.frame(index),radius) if reuse_alpha else make_trimap(selected,radius,evidence=np.maximum(source_evidence,holdout.astype(np.uint8)*255),weak_evidence_region=object_evidence,fixed_evidence=fixed_evidence,motion_radius=motion_radius,moving_components=moving_components,primary_evidence=primary_evidence,primary_background_points=primary_background_points)
                    if guidance and not reuse_alpha:
                        trimap=condition_trimap_clicks(trimap,rgb,manifest['_reference_rgb'],click_components,index)
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
                previous_rgb=rgb
                if index%12==0:print(json.dumps({'event':'cpu_alpha_refinement','index':index,'total':count}),flush=True)
        if decoder.stdout.read(1) or decoder.wait(timeout=30):raise ValueError('Matting source clock differs')
    finally:
        if decoder.poll() is None:decoder.kill();decoder.wait()
        decoder.stdout.close()
    if temporal:
        detail_diagnostics=None
        if moving_detail:
            from model_workers.adapters.moving_detail_alpha import refine_moving_details
            detail_diagnostics=refine_moving_details(rgb_dir,masks,trimap_dir,guidance,cache,model,count=count,device=device,
                measured_motion=spec['model'].get('limits',{}).get('measuredMotionDetail',False),
                independent_source=not reuse_alpha and spec['model'].get('limits',{}).get('freshComponentBackground',False),
                foreground_holdout=holdout)
            # Both the local neural pass and subsequent temporal fusion honour
            # the actual authored FG/BG constraints on their source frames.
            directory,manifest=guidance
            for index in range(count):
                rgb=np.asarray(Image.open(rgb_dir/f'rgb_{index:04d}.png'))
                components=[(c['selection'],np.asarray(Image.open(directory/c['frames'][index]['file']))) for c in manifest['components']]
                for target in [masks/f'matte_{index:04d}.png',trimap_dir/f'trimap_{index:04d}.png']:
                    values=condition_trimap_clicks(np.asarray(Image.open(target)),rgb,manifest['_reference_rgb'],components,index)
                    values[holdout]=255;Image.fromarray(values).save(target)
        boundaries=sorted({p['frameIndex'] for p in params['shotPrompts']} | {p['frameIndex'] for c in params.get('components',[]) for p in c.get('shotPrompts',[])})
        diagnostics=stabilize(rgb_dir,masks,trimap_dir,count,boundaries,repair_outliers=spec['model'].get('limits',{}).get('repairTemporalOutliers',False))
        if detail_diagnostics is not None:diagnostics['observedMovingDetail']=detail_diagnostics
        if spec['model'].get('limits',{}).get('stationarySourceConsensus',False):
            regions={boundary:[] for boundary in boundaries}
            for correction in params['shotPrompts']:
                regions[correction['frameIndex']].append([0,0,1,1])
            for component in params.get('components',[]):
                for correction in component.get('shotPrompts',[]):
                    regions[correction['frameIndex']].append(component['box'])
            diagnostics['stationarySource']=stabilize_stationary_source(rgb_dir,masks,trimap_dir,count,boundaries,regions)
        if source_edges:
            from model_workers.adapters.source_edge_alpha import refine_source_edge, source_frame_results
            def solve_source_edge_frame(index):
                rgb=np.asarray(Image.open(rgb_dir/f'rgb_{index:04d}.png'))
                alpha=np.asarray(Image.open(masks/f'matte_{index:04d}.png'))
                values=refine_source_edge(rgb,alpha,guidance,index,
                    colour_component_ids=settings.get('colourComponentIds',[]) if spec['model'].get('limits',{}).get('correctFixedObjectColours',False) else (),
                    classify_fixed_objects=spec['model'].get('limits',{}).get('classifyCorrectedFixedObjects',False),
                    source_seeded_foreground=spec['model'].get('limits',{}).get('sourceSeededFixedForeground',False),
                    bounded_source_growth=spec['model'].get('limits',{}).get('boundSourceMaterialGrowth',False),
                    reference_fixed_evidence=spec['model'].get('limits',{}).get('sourceBoundFixedEvidence',False))
                if guidance and not reuse_alpha:
                    directory,manifest=guidance
                    click_components=[(component['selection'],np.asarray(Image.open(directory/component['frames'][index]['file'])))
                        for component in manifest['components']]
                    values=condition_trimap_clicks(values,rgb,manifest['_reference_rgb'],click_components,index)
                # Authored foreground holdouts remain authoritative. Component
                # background clicks condition SAM and the original trimap.
                values[holdout]=255
                return values
            for index,values in source_frame_results(count,solve_source_edge_frame,source_workers):
                Image.fromarray(values).save(masks/f'matte_{index:04d}.png')
                if index%12==0:print(json.dumps({'event':'source_resolution_edges','index':index,'total':count}),flush=True)
            diagnostics['sourceEdges']={'algorithm':'component_corrective_colour_source_bounded_clicks_v4' if spec['model'].get('limits',{}).get('correctFixedObjectColours',False) else 'component_scoped_closed_form_v1','pymatting':'1.1.16','radiusPixels':3,
                'personAlphaPreserved':True,'componentArtifactHash':spec.get('componentDependency',{}).get('artifact',{}).get('artifactHash')}
            if spec['model'].get('limits',{}).get('sourceSeededFixedForeground',False):
                diagnostics['sourceEdges']['algorithm']='component_current_source_seeded_material_v5'
                diagnostics['sourceEdges']['newForegroundRequiresConnectedAuthoredMaterial']=True
            if spec['model'].get('limits',{}).get('boundSourceMaterialGrowth',False):
                diagnostics['sourceEdges']['algorithm']='component_current_source_bounded_material_v6'
                diagnostics['sourceEdges']['unpromptedColourGrowthBounded']=True
            if spec['model'].get('limits',{}).get('sourceBoundFixedEvidence',False):
                diagnostics['sourceEdges']['algorithm']='component_current_source_classified_reference_v8'
                diagnostics['sourceEdges']['referenceEvidenceRequiresCurrentRgbAgreement']=True
                diagnostics['sourceEdges']['referenceEvidenceRequiresFirstSourceForeground']=True
                diagnostics['sourceEdges']['referenceOccludingForegroundExcluded']=True
                diagnostics['sourceEdges']['currentOccludingForegroundPreserved']=True
            if spec['model'].get('limits',{}).get('stationarySourceConsensus',False):
                diagnostics['sourceEdges']['stationaryConsensus']=stabilize_stationary_source(rgb_dir,masks,trimap_dir,count,boundaries,regions)
            if guidance and spec['model'].get('limits',{}).get('fixedObjectPostConsensus',False):
                directory,manifest=guidance
                fixed=np.zeros((height,width),np.uint8);moving=np.zeros_like(fixed)
                for component in manifest['components']:
                    if component['selection'].get('propagate',True):
                        # Any observed person/hand pose excludes this pixel from
                        # fixed-prop consensus, even against a similar colour.
                        for row in component['frames']:
                            moving|=(np.asarray(Image.open(directory/row['file']))>=64).astype(np.uint8)
                    else:fixed|=(np.asarray(Image.open(directory/component['frames'][0]['file']))>=24).astype(np.uint8)
                kernel=np.ones((7,7),np.uint8)
                # Include the uncertain moving boundary with a 15px margin,
                # rather than treating very weak remote SAM logits as a person.
                domain=(cv2.dilate(fixed,kernel)>0)&(cv2.dilate(moving,np.ones((31,31),np.uint8))==0)
                # Fine source-codec noise on a fixed stand can exceed the
                # general 12-level condition. Its independent fixed selection,
                # whole-shot RGB/neighbourhood test and exclusion of ALL moving
                # foreground poses permit this bounded prop-only consensus.
                diagnostics['sourceEdges']['fixedObjectConsensus']=stabilize_stationary_source(
                    rgb_dir,masks,trimap_dir,count,selection_domain=domain,maximum_source_range=32,
                    preserve_current_background=spec['model'].get('limits',{}).get('freshComponentTrimap',False))
                for index in range(count):
                    rgb=np.asarray(Image.open(rgb_dir/f'rgb_{index:04d}.png'))
                    components=[(c['selection'],np.asarray(Image.open(directory/c['frames'][index]['file']))) for c in manifest['components']]
                    values=condition_trimap_clicks(np.asarray(Image.open(masks/f'matte_{index:04d}.png')),rgb,manifest['_reference_rgb'],components,index)
                    values[holdout]=255;Image.fromarray(values).save(masks/f'matte_{index:04d}.png')
        # The compositor needs opacity and foreground colour to describe the
        # same exposure. Correct the saved alpha from current material and
        # repeatedly observed source B before the canonical F solve. Never
        # replace unknown reference pixels or weaken actual authored clicks.
        evidence_dir=masks.parent/'observed_detail'
        if (guidance and spec['model'].get('limits',{}).get('photographedMaterialOpacity',False)
                and not cache.manifest.get('shot_cuts',[]) and evidence_dir.is_dir()):
            from model_workers.adapters.photographed_opacity import refine_photographed_sequence
            background=np.asarray(Image.open(evidence_dir/'photographed-reference.png').convert('RGB'))
            observed=np.asarray(Image.open(evidence_dir/'observed-support.png').convert('L'))>0
            diagnostics['photographedMaterialOpacity']=refine_photographed_sequence(
                rgb_dir,masks,guidance,background,observed,holdout,count=count,workers=source_workers)
        if guidance and spec['model'].get('limits',{}).get('restoreSourcePersonInteriors',False):
            from model_workers.adapters.person_material_alpha import restore_person_interiors
            directory,manifest=guidance
            primary=manifest['components'][0]
            restored=0
            def solve_person_interior_frame(index):
                rgb=np.asarray(Image.open(rgb_dir/f'rgb_{index:04d}.png'))
                target=masks/f'matte_{index:04d}.png'
                prior=np.asarray(Image.open(target))
                evidence=np.asarray(Image.open(directory/primary['frames'][index]['file']))
                preserve_detail=None
                if spec['model'].get('limits',{}).get('preserveMovingDetailRefinement',False):
                    import cv2
                    detail=np.zeros((height,width),np.uint8)
                    for component in manifest['components'][1:]:
                        if component['selection'].get('propagate',True):
                            plane=np.asarray(Image.open(directory/component['frames'][index]['file']))
                            detail|=(plane>=24).astype(np.uint8)
                    preserve_detail=cv2.dilate(detail,np.ones((31,31),np.uint8))>0
                selection=primary['selection']
                points=selection.get('points',[]) if index==0 else next((
                    p['points'] for p in selection.get('shotPrompts',[]) if p['frameIndex']==index),[])
                values=restore_person_interiors(rgb,prior,evidence,points,preserve=preserve_detail)
                restored_pixels=int(np.count_nonzero(values!=prior))
                components=[(c['selection'],np.asarray(Image.open(directory/c['frames'][index]['file'])))
                            for c in manifest['components']]
                values=condition_trimap_clicks(values,rgb,manifest['_reference_rgb'],components,index)
                values[holdout]=255
                return values,restored_pixels
            for index,(values,restored_pixels) in source_frame_results(count,solve_person_interior_frame,source_workers):
                restored+=restored_pixels
                Image.fromarray(values).save(masks/f'matte_{index:04d}.png')
                if index%12==0:print(json.dumps({'event':'source_person_interiors','index':index,'total':count}),flush=True)
            diagnostics['sourcePersonInteriors']={'algorithm':'current_source_connected_material_core_v1',
                'changedPixelFrames':restored,'sourceRgbAlwaysCurrent':True,'outerMatteReplaced':False,
                'newModelWeights':False,'visualQualification':False}
            if spec['model'].get('limits',{}).get('preserveMovingDetailRefinement',False):
                diagnostics['sourcePersonInteriors'].update(
                    algorithm='current_source_detail_owned_material_core_v2',
                    separateMovingDetailRefinementPreserved=True,detailMarginPixels=15)
        if guidance and spec['model'].get('limits',{}).get('motionAwarePersonSourceEdges',False):
            from model_workers.adapters.person_material_alpha import refine_person_source_boundaries
            directory,manifest=guidance
            changed=0
            def solve_person_boundary_frame(index):
                rgb=np.asarray(Image.open(rgb_dir/f'rgb_{index:04d}.png'))
                target=masks/f'matte_{index:04d}.png'
                prior=np.asarray(Image.open(target))
                components=[(c['selection'],np.asarray(Image.open(directory/c['frames'][index]['file'])))
                            for c in manifest['components']]
                motion=np.zeros((height,width),np.float32)
                for neighbor in [max(0,index-1),min(count-1,index+1)]:
                    if neighbor!=index:
                        other=np.asarray(Image.open(rgb_dir/f'rgb_{neighbor:04d}.png'))
                        motion=np.maximum(motion,source_motion_radius(rgb,other,0))
                moving=[plane for selection,plane in components[1:] if selection.get('propagate',True)]
                fixed=[plane for selection,plane in components[1:] if not selection.get('propagate',True)]
                values=refine_person_source_boundaries(rgb,prior,components[0][1],motion,moving,fixed)
                values=condition_trimap_clicks(values,rgb,manifest['_reference_rgb'],components,index)
                values[holdout]=255
                return values,int(np.count_nonzero(values!=prior))
            for index,(values,changed_pixels) in source_frame_results(count,solve_person_boundary_frame,source_workers):
                changed+=changed_pixels
                Image.fromarray(values).save(masks/f'matte_{index:04d}.png')
                if index%12==0:print(json.dumps({'event':'motion_aware_person_source_edges','index':index,'total':count}),flush=True)
            diagnostics['motionAwarePersonSourceEdges']={
                'algorithm':'current_person_source_band_with_measured_motion_v1',
                'changedPixelFrames':changed,'sourceRgbReplaced':False,
                'separateCurrentDetailAndFixedObjectAlphaPreserved':True,
                'rapidSourceDisplacementAlphaPreserved':True,
                'newModelWeights':False,'visualQualification':False}
        if guidance and settings.get('colourComponentIds') and spec['model'].get('limits',{}).get('independentFixedObjectAlpha',False):
            from model_workers.adapters.source_edge_alpha import refine_independent_fixed_objects
            directory,manifest=guidance
            fixed=np.zeros((height,width),np.uint8);moving=np.zeros_like(fixed)
            selected_ids=settings.get('colourComponentIds',[])
            for component in manifest['components']:
                selection=component['selection']
                if selection.get('propagate',True):
                    for row in component['frames']:
                        moving|=(np.asarray(Image.open(directory/row['file']))>=64).astype(np.uint8)
                elif selection['id'] in selected_ids:
                    fixed|=(np.asarray(Image.open(directory/component['frames'][0]['file']))>=24).astype(np.uint8)
            changed=0
            def solve_independent_fixed_frame(index):
                rgb=np.asarray(Image.open(rgb_dir/f'rgb_{index:04d}.png'))
                prior=np.asarray(Image.open(masks/f'matte_{index:04d}.png'))
                values=refine_independent_fixed_objects(rgb,prior,guidance,index,selected_ids)
                components=[(c['selection'],np.asarray(Image.open(directory/c['frames'][index]['file'])))
                            for c in manifest['components']]
                values=condition_trimap_clicks(values,rgb,manifest['_reference_rgb'],components,index)
                values[holdout]=255
                return values,int(np.count_nonzero(values!=prior))
            for index,(values,pixel_count)in source_frame_results(count,solve_independent_fixed_frame,source_workers):
                changed+=pixel_count
                Image.fromarray(values).save(masks/f'matte_{index:04d}.png')
                if index%12==0:print(json.dumps({'event':'independent_fixed_object_alpha','index':index,'total':count}),flush=True)
            # Reuse the existing all-source-neighbourhood check. Every moving
            # foreground pose is excluded, and exact current BG stays zero.
            domain=(cv2.dilate(fixed,np.ones((7,7),np.uint8))>0)&(cv2.dilate(moving,np.ones((31,31),np.uint8))==0)
            consensus=stabilize_stationary_source(rgb_dir,masks,trimap_dir,count,
                selection_domain=domain,maximum_source_range=32,preserve_current_background=True)
            for index in range(count):
                rgb=np.asarray(Image.open(rgb_dir/f'rgb_{index:04d}.png'))
                components=[(c['selection'],np.asarray(Image.open(directory/c['frames'][index]['file'])))
                            for c in manifest['components']]
                values=condition_trimap_clicks(np.asarray(Image.open(masks/f'matte_{index:04d}.png')),rgb,manifest['_reference_rgb'],components,index)
                values[holdout]=255;Image.fromarray(values).save(masks/f'matte_{index:04d}.png')
            diagnostics['independentFixedObjects']={'algorithm':'current_object_owned_source_alpha_v1',
                'changedPixelFrames':changed,'sourceRgbReplaced':False,'unionAlphaUsedAsObjectSeed':False,
                'currentMovingForegroundProtected':True,'classifiedReferenceRequiresCurrentRgbAgreement':True,
                'fixedSourceConsensus':consensus,'visualQualification':False}
        if fixed_source_polish:
            from model_workers.adapters.fixed_source_neural import polish_fixed_source_objects
            directory,manifest=guidance
            limit=spec['model'].get('limits',{}).get('alphaInferenceMaxSide',1024)
            def infer_fixed_source(picture,trimap,max_side):
                nonlocal fixed_source_inference_calls
                h,w=trimap.shape;scale=min(1,max_side/max(h,w))
                ih,iw=max(32,round(h*scale)),max(32,round(w*scale))
                pixels=torch.from_numpy(picture.copy()).to(device).permute(2,0,1)[None].float()/127.5-1
                trims=torch.from_numpy(trimap.copy()).to(device)[None,None].float()/255
                if (ih,iw)!=(h,w):
                    pixels=torch.nn.functional.interpolate(pixels,(ih,iw),mode='bilinear',align_corners=False,antialias=True)
                    trims=torch.nn.functional.interpolate(trims,(ih,iw),mode='nearest')
                inputs=torch.nn.functional.pad(torch.cat((pixels,trims),1),(0,(-iw)%32,0,(-ih)%32))
                with torch.inference_mode():values=model(pixel_values=inputs).alphas[:,:,:ih,:iw].clamp(0,1)
                fixed_source_inference_calls+=1
                if (ih,iw)!=(h,w):values=torch.nn.functional.interpolate(values,(h,w),mode='bilinear',align_corners=False)
                return values[0,0].cpu().numpy()
            records=[]
            for index in range(count):
                rgb=np.asarray(Image.open(rgb_dir/f'rgb_{index:04d}.png'))
                target=masks/f'matte_{index:04d}.png';prior=np.asarray(Image.open(target))
                values,objects=polish_fixed_source_objects(rgb,prior,guidance,index,
                    settings['colourComponentIds'],infer_fixed_source,max_side=limit)
                values[holdout]=255;Image.fromarray(values).save(target)
                records.append({'index':index,'objects':objects})
                if index%12==0:print(json.dumps({'event':'source_classified_object_neural_polish','index':index,'total':count}),flush=True)
            diagnostics['sourceClassifiedObjectNeuralPolish']={
                'algorithm':'current_source_classified_object_trimap_v1','frames':records,
                'modelInferenceCalls':fixed_source_inference_calls,
                'samePinnedMattingWeights':True,'alphaInferenceMaxSide':limit,
                'currentSourceRgb':True,'currentMovingForegroundProtected':True,
                'olderPublishedArtifactsUsedAsAnnotations':False,'visualQualification':False}
        if fixed_source_polish and spec['model'].get('limits',{}).get('pruneUnsupportedFixedFragments',False):
            from model_workers.adapters.fixed_source_neural import prune_unsupported_fixed_islands
            records=[]
            for index in range(count):
                rgb=np.asarray(Image.open(rgb_dir/f'rgb_{index:04d}.png'))
                target=masks/f'matte_{index:04d}.png';prior=np.asarray(Image.open(target))
                values,objects=prune_unsupported_fixed_islands(rgb,prior,guidance,index,settings['colourComponentIds'])
                values[holdout]=255;Image.fromarray(values).save(target)
                records.append({'index':index,'objects':objects})
                if index%12==0:print(json.dumps({'event':'unsupported_fixed_fragments','index':index,'total':count}),flush=True)
            diagnostics['unsupportedFixedFragments']={'algorithm':'source_qualified_empty_gap_and_bounded_moving_ownership_v2',
                'frames':records,'currentMovingForegroundProtected':True,
                'independentCurrentAndReferenceSupportPreserved':True,
                'authoredForegroundPreserved':True,'referenceBackgroundCannotCreateForeground':True,
                'weakMovingLogitsHaveBoundedSpatialOwnership':True,'visualQualification':False}
        if source_workers!=1:
            diagnostics['localSourceFrameParallelism']={'workers':source_workers,
                'firstReferenceFrameSequential':True,'gpuAndTemporalStagesParallelized':False}
        write_json(output/'temporal_diagnostics.json',diagnostics)
        for row in rows:
            values=np.array(Image.open(masks/row['file']))
            row.update(sha256=sha(masks/row['file']),**mask_geometry(values))
    box=params['initialBox'];prompt={'version':1,'source_sha256':sha(source),'points':[[(box[0]+box[2])*width/2,(box[1]+box[3])*height/2]],'labels':[1],'shot_prompts':[]}
    manifest={**cache.manifest,'model':spec['model']['checkpoint'],'model_revision':spec['model']['revision'],
      'model_version':spec['model'].get('modelVersion'),
      'model_weights_sha256':weights['sha256'],'frames':rows,'prompt':cache.manifest['prompt'] if temporal else prompt,'prompt_sha256':cache.manifest['prompt_sha256'] if temporal else sha_json(prompt),
      'parent_mask_artifact_hash':artifact['artifactHash'],'alpha_semantics':('ViTMatte source-conditioned alpha with occlusion-rejected adjacent-frame optical-flow fusion in unknown trimap regions. Known foreground/background and correction boundaries remain authoritative.' if temporal else 'ViTMatte image-conditioned alpha from source and segmentation-derived trimap; independent per frame, temporal stability requires moving review.'),
      'refinement':settings,'matting_stage':{'mode':'source_temporal_detail' if reuse_alpha and moving_detail else 'source_temporal_polish' if reuse_alpha else 'source_conditioned_image_alpha','modelInferencePerformed':not reuse_alpha or bool(fixed_source_inference_calls) or bool(moving_detail and detail_diagnostics.get('tiles')),'observedMovingDetail':bool(moving_detail),'sourceResolutionEdges':bool(source_edges),'componentArtifactHash':spec.get('componentDependency',{}).get('artifact',{}).get('artifactHash'), 'freshNeuralTrimapSource':'independent_source_bound_component_tracks' if guidance and not reuse_alpha and spec['model'].get('limits',{}).get('freshComponentTrimap',False) else 'existing_parent_mask'},'alpha_inference_max_side':spec['model'].get('limits',{}).get('alphaInferenceMaxSide'),'quality':'Unapproved model alpha. Not a professional creative-quality guarantee.'}
    if fixed_source_polish:manifest['matting_stage']['sourceClassifiedObjectNeuralPolish']=True
    # Keep real photographed evidence inside the immutable mask artifact. The
    # compositor verifies it and recovers foreground only after final alpha.
    # It is not a clean plate, and never crosses a camera cut.
    evidence_dir=masks.parent/'observed_detail'
    if (moving_detail and not cache.manifest.get('shot_cuts',[]) and evidence_dir.is_dir()
            and np.asarray(Image.open(evidence_dir/'observed-support.png')).any()):
        import shutil
        from python_media_worker.studio_source_background import FILES
        originals={'rgb':'photographed-reference.png','support':'observed-support.png'}
        files={}
        for key,name in FILES.items():
            shutil.copyfile(evidence_dir/originals[key],masks/name)
            files[key]={'file':name,'sha256':sha(masks/name)}
        manifest['observed_background']={'version':1,'source_sha256':manifest['source_sha256'],
            'method':'separated_unselected_source_rgb_v1','files':files}
    else:
        # Reused parent evidence must not survive without this job's checks.
        manifest.pop('observed_background',None)
    write_json(masks/'manifest.json',manifest);write_json(output/'subject_masks_manifest.json',manifest);bundle_masks(masks,output/'subject_masks.tar.gz')
    return {'subjectId':params['subjectId'],'width':width,'height':height,'fpsNumerator':24,'fpsDenominator':1,'frameCount':count,
      'sourceRange':request['sourceRange'],'maskManifest':blob(output/'subject_masks_manifest.json'),'maskBundle':blob(output/'subject_masks.tar.gz',media_type='application/gzip'),
      'coverageBasis':'decoded_frames','confidence':None,'warnings':[]}
