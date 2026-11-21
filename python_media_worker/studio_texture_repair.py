"""Canonical moving texture repair in the ordinary timed grade filter."""
import math

from studio_selective_mask import mask_at,validate_selective_mask


def validate_repair(clone):
    for field in ('dx','dy','strength'):
        value=clone.get(field)
        if type(value)not in(int,float)or not math.isfinite(value):raise ValueError('Invalid clean patch')
    if abs(clone['dx'])>1 or abs(clone['dy'])>1 or not 0<=clone['strength']<=1:raise ValueError('Invalid clean patch')
    if clone.get('mode','clone')not in('clone','heal'):raise ValueError('Choose clone or heal')
    follow=clone.get('follow')
    if follow is not None:
        if not isinstance(follow,dict):raise ValueError('Invalid repair reference')
        for field,lo,hi in [('width',.002,3),('height',.002,3),('rotation',-360,360)]:
            value=follow.get(field)
            if type(value)not in(int,float)or not math.isfinite(value)or not lo<=value<=hi:raise ValueError('Invalid repair reference '+field)


def repair_offset_at(clone,mask,width,height,time):
    validate_repair(clone)
    if not clone.get('follow'):return clone['dx']*width,clone['dy']*height
    ref=clone['follow'];pose=mask_at(mask,time);angle=math.radians(ref['rotation']);a=math.radians(pose['rotation'])
    u=(clone['dx']*width*math.cos(angle)+clone['dy']*height*math.sin(angle))/(ref['width']*width)
    v=(-clone['dx']*width*math.sin(angle)+clone['dy']*height*math.cos(angle))/(ref['height']*height)
    return u*pose['width']*width*math.cos(a)-v*pose['height']*height*math.sin(a),u*pose['width']*width*math.sin(a)+v*pose['height']*height*math.cos(a)


def pose_expression(mask,field):
    """Balanced expression tree; long clips must not create deep nested IFs."""
    keys=mask['keyframes']
    if not keys:return f'{mask[field]:.10f}'
    if all(key[field]==keys[0][field]for key in keys):return f'{keys[0][field]:.10f}'
    def tree(lo,hi):
        if lo==hi:
            left,right=keys[lo:lo+2]
            if left.get('hold'):return f'{left[field]:.10f}'
            return f"({left[field]:.10f}+({right[field]-left[field]:.10f})*clip((T-{left['time']:.10f})/{right['time']-left['time']:.10f},0,1))"
        mid=(lo+hi)//2
        return f"if(lt(T,{keys[mid+1]['time']:.10f}),{tree(lo,mid)},{tree(mid+1,hi)})"
    return f"if(lte(T,{keys[0]['time']:.10f}),{keys[0][field]:.10f},if(gte(T,{keys[-1]['time']:.10f}),{keys[-1][field]:.10f},{tree(0,len(keys)-2)}))"


def repair_bounds(clone,mask,width,height,padding):
    if mask['inverted']:return 0,0,width,height
    poses=mask['keyframes']or[mask]
    # Conservative for all interpolated positions/sizes/angles, including a
    # rotating offset. The repair is expensive only in this neighbourhood.
    max_w=max(p['width']for p in poses)*width;max_h=max(p['height']for p in poses)*height
    radius=math.hypot(max_w,max_h)/2+mask['feather']*min(width,height)+padding+2
    if clone.get('follow'):
        ref=clone['follow'];a=math.radians(ref['rotation'])
        u=(clone['dx']*width*math.cos(a)+clone['dy']*height*math.sin(a))/(ref['width']*width)
        v=(-clone['dx']*width*math.sin(a)+clone['dy']*height*math.cos(a))/(ref['height']*height)
        extra=abs(u)*max_w+abs(v)*max_h;min_dx=min_dy=-extra;max_dx=max_dy=extra
    else:
        min_dx=min(0,clone['dx']*width);max_dx=max(0,clone['dx']*width)
        min_dy=min(0,clone['dy']*height);max_dy=max(0,clone['dy']*height)
    x0=max(0,math.floor(min(p['x']for p in poses)*width-radius+min_dx))
    x1=min(width,math.ceil(max(p['x']for p in poses)*width+radius+max_dx))
    y0=max(0,math.floor(min(p['y']for p in poses)*height-radius+min_dy))
    y1=min(height,math.ceil(max(p['y']for p in poses)*height+radius+max_dy))
    if x1<=x0 or y1<=y0:return 0,0,width,height
    return x0,y0,x1-x0,y1-y0


def build_texture_repair_filter(effects,prefix):
    clone=effects.get('clone_patch')or{}
    if not clone.get('enabled')or clone.get('strength')==0:return ''
    mask=effects.get('selective_mask')
    if not mask:raise ValueError('Clone correction needs a selected-area mask')
    validate_selective_mask(mask);validate_repair(clone)
    width=effects.get('_worker_width');height=effects.get('_worker_height');verified=type(width)is int and type(height)is int and width>=2 and height>=2
    if clone.get('follow')and not verified:raise ValueError('Moving repair needs verified programme dimensions')
    dx=f"{clone['dx']:.10f}*W";dy=f"{clone['dy']:.10f}*H"
    if verified:
        dx=f"{clone['dx']*width:.10f}";dy=f"{clone['dy']*height:.10f}"
    if clone.get('follow'):
        ref=clone['follow'];a=math.radians(ref['rotation'])
        u=(clone['dx']*width*math.cos(a)+clone['dy']*height*math.sin(a))/(ref['width']*width)
        v=(-clone['dx']*width*math.sin(a)+clone['dy']*height*math.cos(a))/(ref['height']*height)
        w=pose_expression(mask,'width');h=pose_expression(mask,'height');r=f"({pose_expression(mask,'rotation')}*PI/180)"
        dx=f'({u*width:.10f}*{w}*cos({r})-{v*height:.10f}*{h}*sin({r}))'
        dy=f'({u*width:.10f}*{w}*sin({r})+{v*height:.10f}*{h}*cos({r}))'
    strength=clone['strength'];radius=clone.get('radius',.012)
    if type(radius)not in(int,float)or not math.isfinite(radius)or not .001<=radius<=.08:raise ValueError('Invalid healing detail radius')
    radius=max(1,min(80,math.floor(radius*min(width or 1280,height or 720)+.5)))
    box=repair_bounds(clone,mask,width,height,radius*2)if verified else None
    cropped=box and box!=(0,0,width,height)
    head='format=gbrp'
    if cropped:
        x,y,w,h=box
        head+=f',split=2[{prefix}full][{prefix}cropin];[{prefix}cropin]crop={w}:{h}:{x}:{y}'
    channels=':'.join(f"{c}='{c}(clip(X+({dx}),0,W-1),clip(Y+({dy}),0,H-1))'"for c in'rgb')
    if clone.get('mode')=='heal':
        inner=radius//2;outer_area=(2*radius+1)**2;inner_area=(2*inner+1)**2
        outer_weight=outer_area/(outer_area-inner_area);inner_weight=inner_area/(outer_area-inner_area)
        blur=lambda n:f'boxblur=luma_radius={n}:luma_power=1:chroma_radius={n}:chroma_power=1'
        graph=(head+f',split=4[{prefix}base][{prefix}outer][{prefix}inner][{prefix}input];'
            f'[{prefix}outer]{blur(radius)}[{prefix}destinationouter];'
            f'[{prefix}inner]{blur(inner)}[{prefix}destinationinner];'
            f'[{prefix}input]geq={channels},split=3[{prefix}clean][{prefix}cleanouterin][{prefix}cleaninnerin];'
            f'[{prefix}cleanouterin]{blur(radius)}[{prefix}cleanouter];'
            f'[{prefix}cleaninnerin]{blur(inner)}[{prefix}cleaninner];'
            f'[{prefix}base][{prefix}clean][{prefix}destinationouter][{prefix}cleanouter][{prefix}destinationinner][{prefix}cleaninner]'
            f"mix=inputs=6:weights='{1-strength:.9f} {strength:.9f} {strength*outer_weight:.9f} {-strength*outer_weight:.9f} {-strength*inner_weight:.9f} {strength*inner_weight:.9f}':scale=1:duration=first")
    else:
        graph=head+f",split=2[{prefix}base][{prefix}input];[{prefix}input]geq={channels}[{prefix}cloned];[{prefix}base][{prefix}cloned]blend=all_expr='A*(1-{strength:.9f})+B*{strength:.9f}'"
    if cropped:graph+=f'[{prefix}repaired];[{prefix}full][{prefix}repaired]overlay=x={box[0]}:y={box[1]}:format=gbrp:eof_action=pass'
    return graph
