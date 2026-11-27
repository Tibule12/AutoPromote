"""Version 1 node pixels, shared with studioNodeEffects.js in the native preview.

Runs inside the existing layer compositor, before perspective/mask/shadow/glow.
No additional render dispatch or editing engine.
"""
import math
import numpy as np
from PIL import Image


def validate_node_effects(spec):
    if spec is None:
        return None
    if not isinstance(spec, dict) or set(spec) != {'version', 'key', 'optical', 'warp', 'defocus', 'depth'} or spec['version'] != 1:
        raise ValueError('Invalid node effect contract')
    def bounded(o, k, lo, hi):
        v = o.get(k)
        if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or not lo <= v <= hi:
            raise ValueError('Invalid node effect ' + k)
    key, op, warp = spec['key'], spec['optical'], spec['warp']
    if not isinstance(key, dict) or set(key) != {'enabled','mode','color','similarity','smoothness','spill','choke','invert'}:
        raise ValueError('Invalid keyer fields')
    if key['mode'] not in ('chroma','luma','hsl_delta') or not isinstance(key['color'], str) or len(key['color']) != 7 or key['color'][0] != '#':
        raise ValueError('Invalid keyer mode/colour')
    try: int(key['color'][1:], 16)
    except ValueError: raise ValueError('Invalid keyer colour')
    if type(key['enabled']) is not bool or type(key['invert']) is not bool:
        raise ValueError('Invalid keyer switches')
    for k, lo, hi in [('similarity',.02,1),('smoothness',0,1),('spill',0,1),('choke',-20,20)]: bounded(key,k,lo,hi)
    if not isinstance(op,dict) or set(op) != {'halation','streak'}: raise ValueError('Invalid optical fields')
    for k in op: bounded(op,k,0,1)
    if not isinstance(warp,dict) or set(warp) != {'enabled','x','y','frequency'} or type(warp['enabled']) is not bool: raise ValueError('Invalid warp fields')
    for k, lo, hi in [('x',0,40),('y',0,40),('frequency',.1,10)]: bounded(warp,k,lo,hi)
    bounded(spec,'defocus',0,20); bounded(spec,'depth',-100,100)
    return spec


def _mean(src, rx, ry):
    out = src.astype(np.float64)
    for axis, r in [(1,rx),(0,ry)]:
        if not r: continue
        pads=[(0,0)]*out.ndim; pads[axis]=(r,r)
        work=np.pad(out,pads,mode='edge')
        sums=np.cumsum(work,axis=axis)
        zeros=list(sums.shape);zeros[axis]=1
        sums=np.concatenate([np.zeros(zeros),sums],axis=axis)
        a=[slice(None)]*out.ndim;b=a.copy();a[axis]=slice(2*r+1,None);b[axis]=slice(None,-(2*r+1))
        out=(sums[tuple(a)]-sums[tuple(b)])/(2*r+1)
    return out


def _hue(rgb):
    maximum=rgb.max(axis=-1);minimum=rgb.min(axis=-1);d=maximum-minimum
    safe=np.where(d==0,1,d)
    r,g,b=np.moveaxis(rgb,-1,0)
    h=np.where(maximum==r,(g-b)/safe,np.where(maximum==g,(b-r)/safe+2,(r-g)/safe+4))
    return np.where(d==0,0,np.mod(h/6,1)),np.divide(d,maximum,out=np.zeros_like(d),where=maximum!=0)


def _morphology(alpha, radius, erode):
    try:
        from scipy.ndimage import minimum_filter, maximum_filter
        return (minimum_filter if erode else maximum_filter)(alpha, size=2 * radius + 1, mode='nearest')
    except ImportError:
        h, w = alpha.shape
        out = alpha.astype(np.float64, copy=True)
        for axis, length in [(1, w), (0, h)]:
            pads = [(0, 0), (0, 0)]
            pads[axis] = (radius, radius)
            padded = np.pad(out, pads, mode='edge')
            acc = padded.copy()
            for shift in range(1, 2 * radius + 1):
                sl_cur = [slice(None), slice(None)]
                sl_cur[axis] = slice(0, length)
                sl_sh = [slice(None), slice(None)]
                sl_sh[axis] = slice(shift, shift + length)
                fn = np.minimum if erode else np.maximum
                acc[tuple(sl_cur)] = fn(acc[tuple(sl_cur)], padded[tuple(sl_sh)])
            sl_fin = [slice(None), slice(None)]
            sl_fin[axis] = slice(0, length)
            out = acc[tuple(sl_fin)]
        return out


def _byte(x): return np.clip(np.floor(x+.5),0,255).astype(np.uint8)


def apply_node_effects(image, spec, time=0, units=1):
    if not spec: return image
    # Admission validates once; public unit callers also receive the full check.
    validate_node_effects(spec)
    data=np.array(image.convert('RGBA'),copy=True);height,width=data.shape[:2];key=spec['key']
    if key['enabled']:
        rgb=data[:,:,:3].astype(np.float64)/255
        screen=np.array([int(key['color'][i:i+2],16)/255 for i in (1,3,5)])
        if key['mode']=='luma': distance=rgb@np.array([.2126,.7152,.0722])
        elif key['mode']=='hsl_delta':
            h,s=_hue(rgb);kh,ks=_hue(screen);dh=np.abs(h-kh)
            v=rgb.max(axis=-1);kv=float(screen.max());dv=v-kv
            distance=np.sqrt((np.minimum(dh,1-dh)*2)**2*0.48+(s-ks)**2*0.42+dv**2*0.30)/math.sqrt(1.2)
        else:
            cb=np.array([-.168736,-.331264,.5]);cr=np.array([.5,-.418688,-.081312])
            distance=np.hypot(rgb@cb-screen@cb,rgb@cr-screen@cr)
        raw_a=np.clip((distance-key['similarity'])/max(.000001,key['smoothness']),0,1);raw_a=raw_a*raw_a*(3-2*raw_a)
        a=1-raw_a if key['invert'] else raw_a
        alpha=a*data[:,:,3]
        max_s,min_s=float(screen.max()),float(screen.min())
        if key['mode']!='luma' and key['spill'] and max_s>.01 and min_s<.75*max_s:
            screen_chs=[c for c in range(3) if screen[c]>=.9*max_s]
            non_screen=[c for c in range(3) if c not in screen_chs]
            if screen_chs and non_screen:
                other=data[:,:,non_screen].max(axis=2).astype(float)
                for ch in screen_chs:
                    own=data[:,:,ch].astype(float)
                    data[:,:,ch]=_byte(own-np.maximum(0,own-other)*key['spill'])
        radius=math.floor(abs(key['choke'])*units+.5)
        if radius:
            alpha=_morphology(alpha,radius,key['choke']>0)
        data[:,:,3]=_byte(alpha)
    warp=spec['warp']
    if warp['enabled'] and (warp['x'] or warp['y']):
        y,x=np.mgrid[:height,:width];f=warp['frequency']*2*math.pi
        xx=np.clip(np.floor(x+warp['x']*units*np.sin(y/height*f+time*1.7)+.5),0,width-1).astype(int)
        yy=np.clip(np.floor(y+warp['y']*units*np.sin(x/width*f+time*1.3)+.5),0,height-1).astype(int)
        data=data[yy,xx]
    if spec['defocus']:
        premul=data.astype(float);premul[:,:,:3]*=premul[:,:,3:4]/255
        radius=max(1,math.floor(spec['defocus']*units+.5));blur=_mean(premul,radius,radius);a=blur[:,:,3:4]
        data[:,:,:3]=_byte(np.divide(blur[:,:,:3]*255,a,out=np.zeros_like(blur[:,:,:3]),where=a>0));data[:,:,3]=_byte(a[:,:,0])
    op=spec['optical']
    if op['halation'] or op['streak']:
        light=np.maximum(0,data[:,:,:3].max(axis=2).astype(float)-160)*data[:,:,3]/255
        halo=_mean(light,max(1,math.floor(12*units+.5)),max(1,math.floor(12*units+.5)))*op['halation'] if op['halation'] else np.zeros((height,width))
        streak=_mean(light,max(1,math.floor(48*units+.5)),max(0,math.floor(units+.5)))*op['streak'] if op['streak'] else np.zeros((height,width))
        a=data[:,:,3:4]/255;alpha=np.maximum(a,np.clip((halo+streak)[:,:,None]/255,0,1))
        rgb=data[:,:,:3]*a+halo[:,:,None]*[1,.3,.12]+streak[:,:,None]*[.65,.8,1]
        data[:,:,:3]=_byte(np.divide(rgb,alpha,out=np.zeros_like(rgb),where=alpha>0));data[:,:,3]=_byte(alpha[:,:,0]*255)
    return Image.fromarray(data,'RGBA')


def apply_edge_light_wrap_and_linear(fg_image, bg_image, *, intensity=0.45, radius=14, linear_light=False, units=1.0):
    fg = np.array(fg_image.convert('RGBA'), dtype=np.float64, copy=True)
    bg = np.array(bg_image.convert('RGBA').resize(fg_image.size, Image.Resampling.BILINEAR), dtype=np.float64)
    wrap_amt = max(0.0, min(1.0, float(intensity)))
    r = max(1, min(60, round(float(radius) * max(0.25, float(units)))))
    alpha = fg[:, :, 3:4] / 255.0
    if wrap_amt > 0.005:
        inv_alpha = 1.0 - alpha[:, :, 0]
        soft_inv = _mean(inv_alpha, r, r)[:, :, None]
        soft_bg = _mean(bg[:, :, :3], r, r) / 255.0
        w = np.clip(soft_inv * wrap_amt, 0.0, 1.0)
        f = fg[:, :, :3] / 255.0
        scr = 1.0 - (1.0 - f) * (1.0 - soft_bg)
        if linear_light:
            f_lin = np.power(np.clip(f, 0.0, 1.0), 2.2)
            scr_lin = np.power(np.clip(scr, 0.0, 1.0), 2.2)
            mixed = np.power(np.clip(f_lin * (1.0 - w) + scr_lin * w, 0.0, 1.0), 1.0 / 2.2)
        else:
            mixed = f * (1.0 - w) + scr * w
        fg[:, :, :3] = np.where(alpha > 0.002, mixed * 255.0, fg[:, :, :3])
    elif linear_light:
        f_lin = np.power(np.clip(fg[:, :, :3] / 255.0, 0.0, 1.0), 2.2)
        b_lin = np.power(np.clip(bg[:, :, :3] / 255.0, 0.0, 1.0), 2.2)
        fg[:, :, :3] = np.power(np.clip(b_lin * (1.0 - alpha) + f_lin * alpha, 0.0, 1.0), 1.0 / 2.2) * 255.0
    fg[:, :, :3] = _byte(fg[:, :, :3])
    return Image.fromarray(fg.astype(np.uint8), 'RGBA')


def apply_mesh_grid_warp(image, mesh_warp, time=0.0, units=1.0):
    if not isinstance(mesh_warp, dict) or not mesh_warp.get('enabled'):
        return image
    strength = max(-1.0, min(1.0, float(mesh_warp.get('strength', 0.35) or 0.0)))
    pinch = max(-1.0, min(1.0, float(mesh_warp.get('pinch', 0.0) or 0.0)))
    if abs(strength) < 0.005 and abs(pinch) < 0.005:
        return image
    cols = max(2, min(8, round(float(mesh_warp.get('cols', 4) or 4))))
    rows = max(2, min(8, round(float(mesh_warp.get('rows', 4) or 4))))
    arr = np.array(image.convert('RGBA'), copy=True)
    h, w, _ = arr.shape
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5
    amp = 14.0 * max(0.25, float(units))
    y, x = np.mgrid[:h, :w].astype(np.float64)
    ny = y / max(1, h - 1)
    nx = x / max(1, w - 1)
    dx_c = (x - cx) / max(1.0, cx)
    dy_c = (y - cy) / max(1.0, cy)
    r2 = np.minimum(1.5, dx_c * dx_c + dy_c * dy_c)
    shift_x = strength * amp * np.sin(ny * math.pi * rows + float(time) * 1.1) * np.sin(nx * math.pi)
    shift_y = strength * amp * np.sin(nx * math.pi * cols + float(time) * 0.9) * np.sin(ny * math.pi)
    pinch_scale = 1.0 + pinch * 0.38 * (1.0 - r2)
    sx = np.clip(np.rint(cx + (x - cx) * pinch_scale + shift_x), 0, w - 1).astype(int)
    sy = np.clip(np.rint(cy + (y - cy) * pinch_scale + shift_y), 0, h - 1).astype(int)
    return Image.fromarray(arr[sy, sx], 'RGBA')
