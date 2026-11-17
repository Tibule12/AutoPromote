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
            h,s=_hue(rgb);kh,ks=_hue(screen);dh=np.abs(h-kh);distance=np.hypot(np.minimum(dh,1-dh)*2,s-ks)/math.sqrt(2)
        else:
            cb=np.array([-.168736,-.331264,.5]);cr=np.array([.5,-.418688,-.081312])
            distance=np.hypot(rgb@cb-screen@cb,rgb@cr-screen@cr)
        a=np.clip((distance-key['similarity'])/max(.000001,key['smoothness']),0,1);a=a*a*(3-2*a)
        if key['invert']: a=1-a
        alpha=a*data[:,:,3]
        if key['mode']!='luma' and key['spill']:
            channel=int(np.argmax(screen));other=np.maximum(data[:,:,(channel+1)%3],data[:,:,(channel+2)%3]).astype(float)
            own=data[:,:,channel].astype(float);data[:,:,channel]=_byte(own-np.maximum(0,own-other)*key['spill']*(1-a))
        radius=math.floor(abs(key['choke'])*units+.5)
        if radius:
            from scipy.ndimage import minimum_filter, maximum_filter
            alpha=(minimum_filter if key['choke']>0 else maximum_filter)(alpha,size=2*radius+1,mode='nearest')
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
