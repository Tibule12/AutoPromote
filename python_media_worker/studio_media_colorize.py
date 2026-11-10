"""Ordinary media tint: sRGB luma -> gamma -> tint/lift -> original mix; alpha unchanged."""
import math
import re
import numpy as np
from PIL import Image

def validate_colorize(value):
    if value is None:
        return None
    if (not isinstance(value,dict) or set(value)-{'enabled','color','strength','gamma','lift','contrast'} or
        not isinstance(value.get('enabled'),bool) or not isinstance(value.get('color'),str) or
        not re.fullmatch(r'#[a-fA-F0-9]{6}',value['color'])):
        raise ValueError('Invalid ordinary media tint')
    for key,low,high in [('strength',0,1),('gamma',.35,2),('lift',0,.25)]:
        number=value.get(key)
        if isinstance(number,bool) or not isinstance(number,(int,float)) or not math.isfinite(number) or not low<=number<=high:
            raise ValueError('Invalid ordinary media tint '+key)
    contrast=value.get('contrast',1)
    if isinstance(contrast,bool) or not isinstance(contrast,(int,float)) or not math.isfinite(contrast) or not .5<=contrast<=3:
        raise ValueError('Invalid ordinary media tint contrast')
    return value

def colorize_media(image,spec):
    spec=validate_colorize(spec)
    if spec is None or not spec['enabled'] or spec['strength']==0:
        return image
    rgba=np.asarray(image.convert('RGBA'),dtype=np.uint8)
    rgb=rgba[...,:3].astype(np.float64)/255
    luma=rgb @ np.array([.2126,.7152,.0722])
    tone=np.clip(.27+(np.power(np.clip(luma,0,1),spec['gamma'])-.27)*spec.get('contrast',1),0,1)
    tone=spec['lift']+(1-spec['lift'])*tone
    tint=np.array([int(spec['color'][i:i+2],16)/255 for i in (1,3,5)])
    mixed=(1-spec['strength'])*rgb+spec['strength']*tone[...,None]*tint
    out=rgba.copy();out[...,:3]=np.floor(np.clip(mixed,0,1)*255+.5).astype(np.uint8)
    return Image.fromarray(out,'RGBA')
