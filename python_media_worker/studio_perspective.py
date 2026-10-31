"""The ordinary native media-plane mapping, matching studioPerspective.js."""
import math

import numpy as np
from PIL import Image

IDENTITY = [[0, 0], [100, 0], [100, 100], [0, 100]]


def projected_overlay_options(start, duration):
    """Hold only through the declared cue when an intermediate rounds PTS."""
    end=float(start)+float(duration)
    return f"eof_action=repeat:repeatlast=1:enable='gte(t,{float(start):.9f})*lt(t,{end:.9f})'"


def validate_perspective(value):
    if not isinstance(value, dict) or set(value) != {'version', 'corners'} or type(value['version']) is not int or value['version'] != 1:
        raise ValueError('Perspective needs version 1 and four ordered corners')
    p = value['corners']
    if isinstance(p,list) and len(p)==8:
        p=[p[i:i+2] for i in range(0,8,2)]
    if not isinstance(p, list) or len(p) != 4 or any(
        not isinstance(row, list) or len(row) != 2 or any(
            isinstance(n, bool) or not isinstance(n, (int, float)) or not math.isfinite(n) or not 0 <= n <= 100
            for n in row) for row in p):
        raise ValueError('Perspective corners need finite percentages from 0 to 100')
    for i in range(4):
        a,b,c = p[i],p[(i+1)%4],p[(i+2)%4]
        if (b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]) < 500:
            raise ValueError('Perspective needs a convex clockwise plane with separated edges')
    return {'version':1,'corners':p}


def validate_perspective_layer(layer, grouped=False):
    keys = layer.get('motion_keyframes') or []
    value = layer.get('perspective')
    if value is None:
        if any(k.get('property') == 'perspectiveProgress' for k in keys):
            raise ValueError('Perspective keys need a media plane')
        return
    validate_perspective(value)
    effects = layer.get('effects') or {}
    base = layer.get('base_transform') or {}
    if (layer.get('type') not in ('image', 'video') or layer.get('id') == 'main-video' or
            'vector_shape' in layer or grouped or effects.get('mask', {}).get('enabled') or
            base.get('crop_x') or base.get('crop_y') or effects.get('motion_blur', {}).get('enabled') or
            any(k.get('property') in ('cropX', 'cropY') and k.get('value') != 0 for k in keys)):
        raise ValueError('Perspective supports ungrouped ordinary image/video without masks, crop or motion blur')
    values = [base.get('perspective_progress', 100)] + [k.get('value') for k in keys if k.get('property') == 'perspectiveProgress']
    if any(isinstance(n, bool) or not isinstance(n,(int,float)) or not math.isfinite(n) or not 0 <= n <= 100 for n in values):
        raise ValueError('Perspective progress must be from 0 to 100')


def perspective_corners(value, progress=100):
    value=validate_perspective(value)
    if not math.isfinite(progress) or not 0 <= progress <= 100:
        raise ValueError('Invalid perspective progress')
    p = [[IDENTITY[i][j] + (n-IDENTITY[i][j])*progress/100 for j,n in enumerate(row)]
         for i,row in enumerate(value['corners'])]
    validate_perspective({'version':1,'corners':p})
    return np.asarray(p, dtype=float)/100


def project_media(artwork, value, progress):
    corners = perspective_corners(value,progress)
    if np.max(np.abs(corners-np.asarray(IDENTITY)/100)) < 1e-10:
        return artwork
    width,height = artwork.size
    src = np.asarray([[0,0],[width,0],[width,height],[0,height]],dtype=float)
    dst = corners * [width,height]
    equations, values = [], []
    for (u,v),(x,y) in zip(dst,src):
        equations.extend([[u,v,1,0,0,0,-x*u,-x*v],[0,0,0,u,v,1,-y*u,-y*v]])
        values.extend([x,y])
    inverse = np.linalg.solve(np.asarray(equations),np.asarray(values))
    # Premultiplied sampling keeps dark transparent edges from bleeding inward.
    return artwork.convert('RGBa').transform(artwork.size,Image.Transform.PERSPECTIVE,
        inverse.tolist(),Image.Resampling.BICUBIC).convert('RGBA')
