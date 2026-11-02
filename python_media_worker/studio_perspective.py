"""The ordinary native media-plane mapping, matching studioPerspective.js."""
import math

import numpy as np
from PIL import Image, ImageDraw, ImageChops

IDENTITY = [[0, 0], [100, 0], [100, 100], [0, 100]]


def projected_overlay_options(start, duration):
    """Hold only through the declared cue when an intermediate rounds PTS."""
    end=float(start)+float(duration)
    return f"eof_action=repeat:repeatlast=1:enable='gte(t,{float(start):.9f})*lt(t,{end:.9f})'"


def validate_perspective(value):
    if not isinstance(value, dict) or not {'version','corners'} <= set(value) or set(value)-{'version','corners','sourceRect'} or type(value['version']) is not int or value['version'] != 1:
        raise ValueError('Perspective needs version 1 and four ordered corners')
    p = value['corners']
    region=value.get('sourceRect')
    if region is not None:
        if (not isinstance(region,list) or len(region)!=4 or any(isinstance(n,bool) or not isinstance(n,(float,int)) or not math.isfinite(n) or not 0<=n<=100 for n in region)
                or region[2]-region[0]<1 or region[3]-region[1]<1):
            raise ValueError('Source region needs left/top/right/bottom percentages with at least 1% width and height')
    if isinstance(p,list) and len(p)==8:
        p=[p[i:i+2] for i in range(0,8,2)]
    if not isinstance(p, list) or len(p) != 4 or any(
        not isinstance(row, list) or len(row) != 2 or any(
            isinstance(n, bool) or not isinstance(n, (int, float)) or not math.isfinite(n) or not 0 <= n <= 100
            for n in row) for row in p):
        raise ValueError('Perspective corners need finite percentages from 0 to 100')
    for i in range(4):
        a,b,c = p[i],p[(i+1)%4],p[(i+2)%4]
        if ((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]) < (25 if region is not None else 500)
                or (region is not None and math.hypot(b[0]-a[0],b[1]-a[1])<2)):
            raise ValueError('Perspective needs a convex clockwise plane with separated edges')
    return {'version':1,'corners':p,**({'sourceRect':region} if region is not None else {})}


def validate_perspective_layer(layer, grouped=False):
    keys = layer.get('motion_keyframes') or []
    value = layer.get('perspective')
    if value is None:
        if any(k.get('property') == 'perspectiveProgress' or str(k.get('property','')).startswith('planeCorner') for k in keys):
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
    validate_corner_keys(value,keys,base.get('perspective_progress',100))


def validate_corner_keys(value, keys, base_progress=100):
    import re
    rows=[k for k in keys if str(k.get('property','')).startswith('planeCorner')]
    if not rows:return
    if base_progress!=100 or any(k.get('property')=='perspectiveProgress' and k.get('value')!=100 for k in keys):
        raise ValueError('Keep Perspective progress at 100 when animating plane corners')
    for k in rows:
        if (not re.fullmatch(r'planeCorner[0-3][XY]',str(k.get('property'))) or k.get('easing') not in ('linear','hold') or
                any(isinstance(k.get(f),bool) or not isinstance(k.get(f),(int,float)) or not math.isfinite(k[f]) for f in ('time','value')) or not 0<=k['value']<=100):
            raise ValueError('Plane corner keys need finite 0–100 coordinates and Linear or Hold interpolation')
    def read(prop,t,fallback):
        channel=sorted([k for k in rows if k['property']==prop],key=lambda k:k['time'])
        if not channel:return fallback
        if t<=channel[0]['time']:return channel[0]['value']
        for a,b in zip(channel,channel[1:]):
            if t==b['time']:return b['value']
            if t<b['time']:return a['value'] if b['easing']=='hold' else a['value']+(b['value']-a['value'])*(t-a['time'])/(b['time']-a['time'])
        return channel[-1]['value']
    corners=validate_perspective(value)['corners']
    def at(t):return [[read(f'planeCorner{i}{axis}',t,p[j]) for j,axis in enumerate(('X','Y'))] for i,p in enumerate(corners)]
    times=sorted({k['time'] for k in rows})
    for t in times:validate_perspective({**value,'corners':at(t)})
    for start,end in zip(times,times[1:]):
        a,b=np.asarray(at(start)),np.asarray(at(end-min(1e-8,(end-start)/1e6)))
        for i in range(4):
            def cross(u):
                p=a+(b-a)*u;x,y,z=p[i],p[(i+1)%4],p[(i+2)%4]
                return (y[0]-x[0])*(z[1]-y[1])-(y[1]-x[1])*(z[0]-y[0])
            c,last,mid=cross(0),cross(1),cross(.5);aa=2*(last+c-2*mid);bb=last-c-aa
            u=-bb/(2*aa) if aa>0 else -1
            if min(c,last,cross(u) if 0<u<1 else math.inf)<(25 if value.get('sourceRect') is not None else 500)-1e-7:raise ValueError('Plane corner animation folds or collapses between keys')
            if value.get('sourceRect') is not None:
                edge0=a[(i+1)%4]-a[i];edge1=b[(i+1)%4]-b[i];delta=edge1-edge0;den=float(np.dot(delta,delta))
                edge_u=max(0,min(1,-float(np.dot(edge0,delta))/den)) if den else 0
                if float(np.linalg.norm(edge0+delta*edge_u))<2-1e-7:raise ValueError('Plane edge collapses between keys')


def perspective_corners(value, progress=100):
    value=validate_perspective(value)
    if not math.isfinite(progress) or not 0 <= progress <= 100:
        raise ValueError('Invalid perspective progress')
    p = [[IDENTITY[i][j] + (n-IDENTITY[i][j])*progress/100 for j,n in enumerate(row)]
         for i,row in enumerate(value['corners'])]
    validate_perspective({**value,'corners':p})
    return np.asarray(p, dtype=float)/100


def inverse_projection(corners, width, height):
    # Same normalized homography as the native preview, with the analytic
    # inverse. Avoid dispatching a threaded linear solver for an 8x8 system on
    # every bitmap/frame/shutter sample.
    (x0,y0),(x1,y1),(x2,y2),(x3,y3) = corners
    dx1,dx2,dy1,dy2 = x1-x2,x3-x2,y1-y2,y3-y2
    dx3,dy3 = x0-x1+x2-x3,y0-y1+y2-y3
    det = dx1*dy2-dx2*dy1
    g,h = (dx3*dy2-dx2*dy3)/det,(dx1*dy3-dx3*dy1)/det
    a,b,c,d,e,f = x1-x0+g*x1,x3-x0+h*x3,x0,y1-y0+g*y1,y3-y0+h*y3,y0
    z = a*e-b*d
    if not math.isfinite(z) or abs(z) < 1e-12:
        raise ValueError('Perspective inverse is not finite at the picture origin')
    return [(e-f*h)/z,(c*h-b)*width/height/z,(b*f-c*e)*width/z,
            (f*g-d)*height/width/z,(a-c*g)/z,(c*d-a*f)*height/z,
            (d*h-e*g)/width/z,(b*g-a*h)/height/z]


def project_media(artwork, value, progress):
    corners = perspective_corners(value,progress)
    region=value.get('sourceRect')
    if region is None and np.max(np.abs(corners-np.asarray(IDENTITY)/100)) < 1e-10:
        return artwork
    inverse = inverse_projection(corners, *artwork.size)
    if region is not None:
        # Compose source UV selection into the inverse homography. A separate
        # crop/resize introduced a one-pixel drift and two texture resamplings.
        a,b,c,d,e,f,g,h=inverse;x0,y0,x1,y1=region;rw,rh=(x1-x0)/100,(y1-y0)/100
        ox,oy=x0/100*artwork.width,y0/100*artwork.height
        inverse=[rw*a+ox*g,rw*b+ox*h,rw*c+ox,rh*d+oy*g,rh*e+oy*h,rh*f+oy,g,h]
    # Premultiplied sampling keeps dark transparent edges from bleeding inward.
    result=artwork.convert('RGBa').transform(artwork.size,Image.Transform.PERSPECTIVE,
        inverse,Image.Resampling.BICUBIC).convert('RGBA')
    if region is not None:
        # UVs outside this piece can still fall inside the original source.
        # Clip to the projected piece, as the browser's source viewport does.
        clip=Image.new('L',artwork.size)
        ImageDraw.Draw(clip).polygon([tuple(p) for p in corners*np.asarray(artwork.size)],fill=255)
        result.putalpha(ImageChops.multiply(result.getchannel('A'),clip))
    return result
