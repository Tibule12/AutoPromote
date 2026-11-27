"""Grade masks use native branch rasters on the canonical programme clock."""
import copy
import os
from PIL import Image


def validate_node_mask(ref,overlays,composition):
    if not ref:return None
    if not isinstance(ref,dict) or not {'layer_id','operation'}<=set(ref) or set(ref)-{'layer_id','operation','invert'} or ('invert' in ref and type(ref['invert']) is not bool) or ref['operation'] not in ('PolygonMask','ChromaKeyer','MediaIn','Transform','CornerPin','GlowBlur'):
        raise ValueError('Invalid grade mask reference')
    source=next((o for o in overlays if str(o.id)==str(ref['layer_id'])),None)
    layer=next((l for l in (composition or {}).get('layers',[]) if str(l['id'])==str(ref['layer_id'])),None)
    if not source or source.type not in ('image','video','text') or not layer:raise ValueError('Grade mask source is missing')
    if source.type=='text' and ref['operation'] in ('ChromaKeyer','CornerPin'):raise ValueError('Keyer and Corner Pin need media pixels')
    return source,copy.deepcopy(layer)


async def render_node_masked_finish(*,source_path,output_path,request,width,height,duration,fps,job_id,
                                  directory,temp_paths,run,materialize_video,materialize_image,build_finish,zoom_filter,probe,main_grade_filter=None):
    try:
        from .studio_layer_motion import render_image_layer_motion, render_video_layer_motion
        from .studio_broll import overlay_commands
        from .studio_adjustment_grade import adjustment_grade_filter
    except ImportError:
        from studio_layer_motion import render_image_layer_motion,render_video_layer_motion
        from studio_broll import overlay_commands
        from studio_adjustment_grade import adjustment_grade_filter
    import asyncio
    try:
        from .studio_finish_texture import finish_texture_filter, finish_texture_shift_filter, prepare_finish_texture_noise
    except ImportError:
        from studio_finish_texture import finish_texture_filter, finish_texture_shift_filter, prepare_finish_texture_noise
    plan=request.finish_plan or {};stages=[]
    stages.append((main_grade_filter if main_grade_filter is not None else build_finish({**plan,'texture':{}}),plan.get('node_mask'),0,duration))
    texture_plan=plan.get('texture') or {}
    has_texture=any(float(texture_plan.get(key,0) or 0)>.005 for key in (
        'film_grain','chromatic_aberration','vhs_tracking','light_leak',
        'lens_blur','halation','dream_glow','anamorphic_flare'))
    # A neutral Finish filter still negotiates YUV420. Do not run another
    # colour conversion and encode for an absent texture/motion operation.
    texture=build_finish({'enabled':True,'texture':texture_plan}) if has_texture else ''
    if texture or zoom_filter:stages.append((','.join(x for x in [texture,zoom_filter] if x),None,0,duration))
    for i,adj in enumerate(plan.get('adjustment_layers') or []):
        if adj.get('enabled') is False:continue
        start=max(0,float(adj.get('startTime',adj.get('start_time',0))));end=min(duration,start+float(adj.get('duration',0)))
        if end<=start:continue
        fx=adj.get('effects') or {};stages.append((adjustment_grade_filter(fx,build_finish,f'nodeadj{i}_'),fx.get('node_mask'),start,end))
    stages=[stage for stage in stages if stage[0]]
    current=source_path;cache={};render_stages=[]
    for index,(grade,ref,start,end) in enumerate(stages):
        if not grade:continue
        mask_path=None;receipt=None
        if ref:
            key=(ref['layer_id'],ref['operation'])
            if key in cache:mask_path,receipt,projected_mask=cache[key]
            else:
                overlay,layer=validate_node_mask(ref,request.overlays,request.composition_plan);kind=ref['operation'];raw=overlay.model_dump();effects=layer.setdefault('effects',{})
                if kind not in ('CornerPin','GlowBlur'):
                    layer.pop('perspective',None)
                    layer['motion_keyframes']=[k for k in layer.get('motion_keyframes',[]) if k.get('property')!='perspectiveProgress' and not str(k.get('property','')).startswith('planeCorner')]
                if kind in ('MediaIn','ChromaKeyer','PolygonMask'):
                    effects.update({'glow':{'enabled':False},'shadow':{'enabled':False},'blur':0})
                    if effects.get('node'):
                        effects['node']['optical']={'halation':0,'streak':0};effects['node']['warp']['enabled']=False;effects['node']['defocus']=0
                if kind in ('MediaIn','ChromaKeyer','CornerPin'):effects['mask']={'enabled':False}
                if kind=='MediaIn':
                    if effects.get('node'): effects['node']['key']['enabled']=False
                    layer['base_transform'].update({'x':50,'y':50,'scale':1,'rotation':0});layer['motion_keyframes']=[]
                title_animator=None
                asset=os.path.join(directory,f'{job_id}_grade_mask_{index}_source'+('.mp4' if overlay.type=='video' else '.png'));temp_paths.add(asset)
                if kind=='PolygonMask':
                    Image.new('RGBA',(16,16),'white').save(asset,format='PNG');layer.pop('vector_shape',None);layer.pop('text_animator',None);raw['type']='image';raw['mediaFit']='stretch';raw['frameShape']='edge'
                elif overlay.type=='text':
                    try:
                        from .studio_text import render_title_asset
                        from .studio_text_animator import AnimatedTitle
                    except ImportError:
                        from studio_text import render_title_asset
                        from studio_text_animator import AnimatedTitle
                    if layer.get('text_animator'):
                        title_animator=AnimatedTitle(raw,width,height,layer['text_animator']);geometry=title_animator.geometry;title_animator.frame(100).save(asset)
                    else:geometry=render_title_asset(raw,asset,width,height)
                    layer.update(anchor_x=geometry['anchorX'],anchor_y=geometry['anchorY'],clip_box=geometry['clipBox'])
                    raw.update({key:value for key,value in geometry.items() if key not in ('lines','clipBox')})
                    if kind=='MediaIn':raw['animation']={}
                elif overlay.type=='image':await asyncio.to_thread(materialize_image,overlay.src,asset,{})
                else:await materialize_video(overlay.src,asset,keep_audio=False)
                mask_path=os.path.join(directory,f'{job_id}_grade_mask_{index}'+('.mkv' if layer.get('perspective') else '.mov'));temp_paths.add(mask_path)
                if raw['type']=='video':
                    # Reuse B-roll's existing source interval and end behaviour.
                    from_probe=probe
                    commands,asset,visible,_=overlay_commands(asset,asset+'_prepared',from_probe(asset),overlay.sourceStartTime,float(overlay.duration),overlay.sourceEndBehavior,float(overlay.start_time),[],False,overlay.sourceOffsetTime)
                    for cmd in commands:temp_paths.add(cmd[-1]);await run(cmd,check=True)
                    raw['duration']=visible
                renderer=render_video_layer_motion if raw['type']=='video' else render_image_layer_motion
                kwargs={'title_animator':title_animator} if title_animator else {}
                receipt=await asyncio.to_thread(renderer,asset,mask_path,raw,layer,width,height,duration,[],fps,**kwargs)
                projected_mask=bool(layer.get('perspective'));cache[key]=(mask_path,receipt,projected_mask)
        render_stages.append((grade,ref,start,end,mask_path,receipt,projected_mask if mask_path else False))
    if not render_stages:return source_path
    noise_path=None
    kernel=finish_texture_filter(texture_plan) if texture_plan.get('pixel_version')==1 else ''
    if kernel and float(texture_plan.get('film_grain',0) or 0)>.005:
        noise_path=os.path.join(directory,f'{job_id}_finish_noise.mkv');temp_paths.add(noise_path)
        await asyncio.to_thread(prepare_finish_texture_noise,noise_path,width,height,duration,fps,texture_plan['film_grain'])
    # All grades share one decoded RGB chain and one delivery encode. Keeping
    # the graph in-process also avoids timestamp and audio priming changes.
    command=['ffmpeg','-nostdin','-v','error','-filter_complex_threads','4','-i',source_path]
    graph=f'[0:v]fps={fps:.8f},settb=AVTB,setpts=N/({fps:.8f}*TB),format=gbrp[node_input];'
    previous='node_input';input_index=1
    if noise_path:
        command+=['-i',noise_path];input_index+=1
    for index,(grade,ref,start,end,mask_path,receipt,projected_mask) in enumerate(render_stages):
        prefix=f'node_stage{index}_'
        graph+=f'[{previous}]split=3[{prefix}raw][{prefix}gradein][{prefix}unchanged];'
        if noise_path and kernel in grade:
            before,after=grade.split(kernel,1)
            graph+=f'[{prefix}gradein]{before}{finish_texture_shift_filter(texture_plan)}[{prefix}shifted];'
            graph+=f'[1:v]setparams=range=full,format=gbrp[{prefix}noise];'
            graph+=f"[{prefix}shifted][{prefix}noise]blend=all_mode=grainmerge{after},format=gbrp[{prefix}graded];"
        else:
            graph+=f'[{prefix}gradein]{grade},format=gbrp[{prefix}graded];'
        if mask_path:
            command+=['-i',mask_path]
            pad=max(0,float(receipt['start_time']));stop=max(0,duration-pad-float(receipt['duration']))
            alpha_input=f'[{input_index}:v:1]' if projected_mask else f'[{input_index}:v]alphaextract,'
            input_index+=1
            graph+=alpha_input+f'fps={fps:.8f},settb=AVTB,setpts=N/({fps:.8f}*TB),format=gbrp,tpad=start_duration={pad:.8f}:stop_duration={stop+1/fps:.8f}:color=black,trim=duration={duration:.8f}'+(',negate' if ref.get('invert') else '')+f'[{prefix}mask];[{prefix}raw][{prefix}graded][{prefix}mask]maskedmerge[{prefix}changed];'
        else:graph+=f'[{prefix}raw]nullsink;[{prefix}graded]null[{prefix}changed];'
        previous=prefix+'out'
        graph+=f"[{prefix}unchanged][{prefix}changed]blend=all_mode=normal:all_opacity=0:enable='gte(t,{start:.8f})*lt(t,{end:.8f})'[{previous}];"
    graph=graph.rstrip(';')
    try:
        from .studio_sequence_video import preserve_reviewed_sequence_samples
    except ImportError:
        from studio_sequence_video import preserve_reviewed_sequence_samples
    # This is an intermediate below the graphic composite, not delivery.
    # Re-quantising masked grades and grain here before the selected export
    # profile runs discards detail that the native inspection still contains.
    preserve_samples=preserve_reviewed_sequence_samples(width,height,fps,duration,True)
    command+=['-filter_complex',graph,'-map',f'[{previous}]','-map','0:a?','-c:v','libx264','-preset','veryfast','-crf','0' if preserve_samples else '18','-pix_fmt','yuv444p' if preserve_samples else 'yuv420p','-c:a','copy','-t',str(duration),'-movflags','+faststart','-y',output_path]
    temp_paths.add(output_path)
    await run(command,check=True)
    return output_path
