"""Source-coordinate SAM2 video components, each with its own temporal memory.

Fixed-object ROIs preserve small equipment detail before the model's fixed-size
image transform. Moving subjects see the full source, including positions beyond
their initial selection. Outputs share the same immutable source clock.
"""
from pathlib import Path
import json
import subprocess
import numpy as np
from PIL import Image
from model_workers.common import sha, write_json, blob, bundle_masks
from model_workers.adapters.segmentation import sha_json


def component_roi(component, width, height):
    # A selection describes the first pose, not the object's future motion.
    # Cropping to it irreversibly removes hands/limbs before tracking or matting.
    if component.get('propagate', True):
        return (0, 0, width, height)
    box = list(component['box'])
    points = list(component['points'])
    for correction in component.get('shotPrompts', []):
        points.extend(correction['points'])
    if points:
        box = [min(box[0], *(p['position'][0] for p in points)),
               min(box[1], *(p['position'][1] for p in points)),
               max(box[2], *(p['position'][0] for p in points)),
               max(box[3], *(p['position'][1] for p in points))]
    margin_x = max(12 / width, (box[2] - box[0]) * .10)
    margin_y = max(12 / height, (box[3] - box[1]) * .10)
    return (max(0, int(np.floor((box[0] - margin_x) * width))),
            max(0, int(np.floor((box[1] - margin_y) * height))),
            min(width, int(np.ceil((box[2] + margin_x) * width))),
            min(height, int(np.ceil((box[3] + margin_y) * height))))


def component_selections(params):
    selections = [{'id': params['subjectId'], 'box': params['initialBox'],
                   'points': params['points'], 'shotPrompts': params['shotPrompts'],
                   'propagate': True}, *params.get('components', [])]
    for component in selections:
        if component.get('shotPrompts') and not component.get('propagate', True):
            raise ValueError('Later-frame corrections require tracking for that object')
    return selections


class ComponentVideoTracker:
    """The shared bounded-memory object tracker; the caller owns cut resets.

    CPU jobs use the default device. Registered refresh keeps the detailed
    fixed ROI while actual current RGB resolves occlusions. The fixed flag
    describes equipment position; it does not make the first exposure valid
    after a person moves. Explicit CUDA remains local review plumbing.
    """
    def __init__(self, spec, geometry, model_dir, *, device='cpu', model=None, refresh_fixed=None, offload_state=False):
        import torch
        from transformers import Sam2VideoModel, Sam2VideoProcessor
        if device not in ('cpu','cuda'):raise ValueError('Explicit inference device must be cpu or cuda')
        torch.set_num_threads(4)
        if torch.get_num_interop_threads()!=1:torch.set_num_interop_threads(1)
        width, height = int(geometry['width']), int(geometry['height'])
        weight = next(f for f in spec['model']['weights'] if f['path'] == 'model.safetensors')
        if sha(model_dir / weight['path']) != weight['sha256']:
            raise ValueError('Segmentation checkpoint changed')
        params = spec['request']['parameters']
        if refresh_fixed is None:
            refresh_fixed = bool(spec['model'].get('limits', {}).get('refreshFixedSourceFrames', False))
        stateless_fixed = bool(spec['model'].get('limits', {}).get('statelessFixedSourceFrames', False))
        if stateless_fixed and not refresh_fixed:
            raise ValueError('Current-image fixed objects require source RGB refresh')
        components = component_selections(params)
        rois = [component_roi(c, width, height) for c in components]
        model = model if model is not None else Sam2VideoModel.from_pretrained(model_dir, local_files_only=True).to(device, dtype=torch.float32).eval()
        processor = Sam2VideoProcessor.__new__(Sam2VideoProcessor)
        config = json.loads((model_dir / 'preprocessor_config.json').read_text())
        processor.target_size = model.config.image_size; processor.point_pad_value = -10
        mean = torch.tensor(config['image_mean'], device=device)[None, :, None, None]
        std = torch.tensor(config['image_std'], device=device)[None, :, None, None]
        # Moving selections share one encoder pass and retain separate object IDs
        # and temporal memory. Fixed small props keep their own detailed source ROI.
        moving=[i for i,c in enumerate(components) if c.get('propagate',True)]
        groups=([moving] if moving else [])+[[i] for i,c in enumerate(components) if not c.get('propagate',True)]
        states=[]
        for indices in groups:
            roi=(min(rois[i][0] for i in indices),min(rois[i][1] for i in indices),
                 max(rois[i][2] for i in indices),max(rois[i][3] for i in indices))
            for i in indices:rois[i]=roi
            session_options={'inference_device':device,'dtype':torch.float32}
            if offload_state:session_options['inference_state_device']='cpu'
            states.append({'indices':indices,'roi':roi,'session':processor.init_video_session(**session_options),
                'session_options':session_options,'fixed':None,'fixed_rgb':None,'neural_frames':0,
                'agreeing_reuses':0,'current_image_frames':0})

        def prompt(state, index):
            x0,y0,x1,y1=state['roi']
            if index==0:
                selected=[components[i] for i in state['indices']]
                processor.add_inputs_to_inference_session(inference_session=state['session'],frame_idx=0,
                    obj_ids=list(range(1,len(selected)+1)),original_size=(y1-y0,x1-x0),
                    input_boxes=[[[c['box'][0]*width-x0,c['box'][1]*height-y0,c['box'][2]*width-x0,c['box'][3]*height-y0] for c in selected]],
                    input_points=[[[[p['position'][0]*width-x0,p['position'][1]*height-y0] for p in c['points']] for c in selected]],
                    input_labels=[[[p['label'] for p in c['points']] for c in selected]])
                return
            for obj,i in enumerate(state['indices']):
                component=components[i]
                correction={'points':component['points']} if index==0 else next((p for p in component.get('shotPrompts',[]) if p['frameIndex']==index),None)
                if correction is None:continue
                points=correction['points']
                kwargs=dict(inference_session=state['session'],frame_idx=index,obj_ids=[obj+1],
                    original_size=(y1-y0,x1-x0))
                # Reusing the first pose's box contradicts a corrective click
                # when the object has moved. Only rebox when explicitly authored.
                # Primary-subject point corrections carry the unchanged box in
                # the saved contract too. That is not a newly authored rebox.
                if 'box' in correction and correction['box'] != component['box']:
                    box=correction['box']
                    kwargs['input_boxes']=[[[box[0]*width-x0,box[1]*height-y0,box[2]*width-x0,box[3]*height-y0]]]
                if points:kwargs.update(input_points=[[[[p['position'][0]*width-x0,p['position'][1]*height-y0] for p in points]]],input_labels=[[[p['label'] for p in points]]])
                # Upstream replaces obj_with_new_inputs on each call. Retain
                # every object's correction submitted for this source frame;
                # otherwise only the last hand's clicks reach the next forward.
                pending=list(state['session'].obj_with_new_inputs)
                processor.add_inputs_to_inference_session(**kwargs)
                state['session'].obj_with_new_inputs=list(dict.fromkeys([*pending,*state['session'].obj_with_new_inputs]))

        self.components,self.rois,self.model=components,rois,model
        self.fixed_roi_diagnostics=states
        def step(rgb,index):
            planes=[None]*len(components)
            union = np.zeros((height,width), np.uint8)
            for state in states:
                x0,y0,x1,y1=state['roi']
                agrees=(refresh_fixed and state['fixed_rgb'] is not None and
                    np.max(np.abs(rgb[y0:y1,x0:x1].astype(np.int16)-state['fixed_rgb'].astype(np.int16)))<=4)
                if state['fixed'] is not None and (not refresh_fixed or agrees):
                    selections=state['fixed']
                    if agrees:state['agreeing_reuses']+=1
                else:
                    fixed = not components[state['indices'][0]].get('propagate',True)
                    model_index = index
                    if fixed and stateless_fixed:
                        # A fixed selection describes source coordinates, not
                        # a video track. Infer its ACTUAL current image with
                        # the authored prompt, without old occlusion memory.
                        if state['neural_frames']:
                            state['session']=processor.init_video_session(**state['session_options'])
                        model_index = 0
                        state['current_image_frames'] += 1
                    prompt(state,model_index)
                    pixels=torch.from_numpy(rgb[y0:y1,x0:x1].copy()).to(device).permute(2,0,1)[None].float()*config['rescale_factor']
                    pixels=torch.nn.functional.interpolate(pixels,(processor.target_size,)*2,mode='bilinear',align_corners=False,antialias=True)
                    result=model(inference_session=state['session'],frame=((pixels-mean)/std)[0],frame_idx=model_index)
                    logits=torch.nn.functional.interpolate(result.pred_masks.float(),(y1-y0,x1-x0),mode='bilinear',align_corners=False)[:,0].cpu().numpy()
                    if not np.isfinite(logits).all():raise ValueError('Nonfinite component mask')
                    selections=np.rint(255/(1+np.exp(-np.clip(logits,-30,30)))).astype(np.uint8)
                    state['neural_frames']+=1
                    if not components[state['indices'][0]].get('propagate',True):
                        state['fixed']=selections.copy()
                        if refresh_fixed:state['fixed_rgb']=rgb[y0:y1,x0:x1].copy()
                    state['session'].processed_frames.pop(model_index,None)
                    keep=max(model.num_maskmem,model.config.max_object_pointers_in_encoder)
                    for history in state['session'].output_dict_per_obj.values():
                        for old in list(history['non_cond_frame_outputs']):
                            if old<model_index-keep:del history['non_cond_frame_outputs'][old]
                for number,selected in zip(state['indices'],selections):
                    full=np.zeros((height,width),np.uint8);full[y0:y1,x0:x1]=selected
                    union=np.maximum(union,full)
                    planes[number]=full
            return union,planes
        self._step=step

    def frame(self,rgb,index):
        import torch
        with torch.inference_mode():return self._step(rgb,index)

def segment(spec, source, geometry, model_dir, output, *, device='cpu', refresh_fixed=None):
    from python_media_worker.studio_subject_matte import detect_shot_cuts, mask_geometry
    width,height,count=(int(geometry[k]) for k in ('width','height','nb_read_frames'))
    if detect_shot_cuts(source,24):raise ValueError('Select one camera shot before tracking foreground objects')
    params=spec['request']['parameters']
    if refresh_fixed is None:
        refresh_fixed = bool(spec['model'].get('limits', {}).get('refreshFixedSourceFrames', False))
    tracker=ComponentVideoTracker(spec,geometry,model_dir,device=device,refresh_fixed=refresh_fixed,
        offload_state=bool(spec['model'].get('limits',{}).get('offloadStateToCpu',False)))
    components,rois=tracker.components,tracker.rois
    weight=next(f for f in spec['model']['weights'] if f['path']=='model.safetensors')
    import torch
    masks = output / 'subject_masks'; masks.mkdir()
    separate = output / 'component_masks'; separate.mkdir()
    rows, component_rows = [], [[] for _ in components]
    decoder = subprocess.Popen(['ffmpeg','-nostdin','-v','error','-threads','1','-i',str(source),
        '-map','0:v:0','-vsync','0','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        with torch.inference_mode():
            for index in range(count):
                data = decoder.stdout.read(width*height*3)
                if len(data) != width*height*3:
                    raise ValueError('Component source ended early')
                rgb = np.frombuffer(data, np.uint8).reshape(height,width,3)
                union,planes=tracker.frame(rgb,index)
                for number,full in enumerate(planes):
                    name=f'component_{number:02d}_{index:04d}.png';Image.fromarray(full).save(separate/name)
                    component_rows[number].append({'index':index,'file':name,'sha256':sha(separate/name),**mask_geometry(full)})
                name = f'matte_{index:04d}.png'; Image.fromarray(union).save(masks/name)
                rows.append({'index':index,'time':index/24,'sourceTick':spec['request']['sourceRange']['startTick']+index*3750,
                             'file':name,'sha256':sha(masks/name),**mask_geometry(union)})
                if index%12 == 0:
                    print(json.dumps({'event':'component_video_masks','index':index,'total':count,'objects':len(components)}),flush=True)
        if decoder.stdout.read(1) or decoder.wait(timeout=30): raise ValueError('Component source clock differs')
    finally:
        if decoder.poll() is None: decoder.kill();decoder.wait()
    source_hash = sha(source)
    initial = params['points']
    box = params['initialBox']
    selection_prompt = {'version':1,'source_sha256':source_hash,
        'points':[[p['position'][0]*width,p['position'][1]*height] for p in initial] or [[(box[0]+box[2])*width/2,(box[1]+box[3])*height/2]],
        'labels':[p['label'] for p in initial] or [1],
        'shot_prompts':[{'frame_index':p['frameIndex'],'points':[[v['position'][0]*width,v['position'][1]*height] for v in p['points']],
                         'labels':[v['label'] for v in p['points']]} for p in params['shotPrompts']]}
    common = {'version':1,'kind':'source_bound_subject_matte','source_sha256':source_hash,
        'width':width,'height':height,'fps':24.0,'fps_fraction':'24/1','frame_count':count,
        'model':spec['model']['checkpoint'],'model_revision':spec['model']['revision'],
        'model_weights_sha256':weight['sha256'],'prompt':selection_prompt,'prompt_sha256':sha_json(selection_prompt),
        'original_source_sha256':spec['request']['sourceSha256'],'sourceRange':spec['request']['sourceRange'],'shot_cuts':[]}
    manifest = {**common,'frames':rows,'components':components,'inference_rois':rois,
        'mask_semantics':'Maximum sigmoid-logit evidence of separately prompted SAM2 video tracks with full-source moving-object inference and detailed fixed-object ROIs; not calibrated alpha or confidence. Later clicks do not reuse the initial pose box. Corrections affect their frame and following frames. '+('Fixed ROIs examine each current RGB frame; a cached prediction is reused only while every ROI channel remains within four code values of its actual inference frame.' if refresh_fixed else 'Explicit fixed objects retain their first-frame outline.'),
        'fixed_roi_current_frame_evaluation':bool(refresh_fixed),
        'fixed_roi_stateless_current_images':bool(spec['model'].get('limits',{}).get('statelessFixedSourceFrames',False)),
        'fixed_roi_evaluation_counts':[{'components':s['indices'],'neuralFrames':s['neural_frames'],'agreeingSourceReuses':s['agreeing_reuses'],
            **({'currentImageFrames':s['current_image_frames']} if spec['model'].get('limits',{}).get('statelessFixedSourceFrames',False) else {})}
            for s in tracker.fixed_roi_diagnostics if not components[s['indices'][0]].get('propagate',True)],
        'quality':'Segmentation guidance only; source-conditioned alpha refinement and moving review required'}
    write_json(masks/'manifest.json',manifest);write_json(output/'subject_masks_manifest.json',manifest)
    details = {**common,'components':[{'selection':c,'roi':roi,'frames':frames}
        for c,roi,frames in zip(components,rois,component_rows)]}
    write_json(separate/'manifest.json',details);write_json(output/'component_masks_manifest.json',details)
    bundle_masks(masks,output/'subject_masks.tar.gz');bundle_masks(separate,output/'component_masks.tar.gz')
    return {'subjectId':params['subjectId'],'width':width,'height':height,'fpsNumerator':24,'fpsDenominator':1,
        'frameCount':count,'sourceRange':spec['request']['sourceRange'],
        'maskManifest':blob(output/'subject_masks_manifest.json'),'maskBundle':blob(output/'subject_masks.tar.gz',media_type='application/gzip'),
        'coverageBasis':'decoded_frames','confidence':None,'warnings':[]}
