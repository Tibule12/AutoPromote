"""Exact camera projection for the unlit single-plane scene specialization.

Reuse the ordinary compositor's homography sampler. Complex geometry/material
scenes retain Blender; no independent editing state or animation clock exists.
"""
import math
import sys
from pathlib import Path
import numpy as np
from PIL import Image
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from python_media_worker.studio_perspective import inverse_projection
from scene_motion import pose, delivery_frame_count


def plane_corners(scene, local, width, height):
    p=pose(scene,local)
    x,y,z=[math.radians(v) for v in p['rotation']]
    rx=np.array([[1,0,0],[0,math.cos(x),-math.sin(x)],[0,math.sin(x),math.cos(x)]])
    ry=np.array([[math.cos(y),0,math.sin(y)],[0,1,0],[-math.sin(y),0,math.cos(y)]])
    rz=np.array([[math.cos(z),-math.sin(z),0],[math.sin(z),math.cos(z),0],[0,0,1]])
    half=3.4;hh=half/scene['assetAspect']
    points=np.array([[-half,hh,.18],[half,hh,.18],[half,-hh,.18],[-half,-hh,.18]])
    points=(points*p['scale'])@(rz@ry@rx).T+np.array(p['position'])
    aspect=width/height
    distance=max(13,(8.5/2)/(math.tan(math.radians(43)/2)*aspect)*1.17)
    camera_x=math.sin(local*.6)*scene['cameraMotion']*.22
    depth=distance-points[:,2]
    if np.any(depth<=.1):raise ValueError('A media plane crosses the camera near plane; use the complex scene renderer')
    focal=scene['focalLength']*max(width,height)/36
    result=np.column_stack((.5+(points[:,0]-camera_x)*focal/depth/width,
                            .5-points[:,1]*focal/depth/height))
    if not np.isfinite(result).all():raise ValueError('Non-finite media plane projection')
    return result,p['opacity']


def render_plane_scene(spec, texture_first, destination):
    width,height=spec['width'],spec['height'];scene=spec['scene']
    for index in range(delivery_frame_count(spec)):
        corners,opacity=plane_corners(scene,index/spec['fps'],width,height)
        texture=Image.open(Path(texture_first).parent/f'texture_{index+1:04d}.png').convert('RGBA')
        # Texture UV rectangle maps onto the whole reference canvas, then onto
        # the camera quad; premultiplied sampling preserves transparent edges.
        source=texture.resize((width,height),Image.Resampling.LANCZOS)
        edge_x,edge_y=corners[1]-corners[0],corners[3]-corners[0]
        area=abs(float(edge_x[0]*edge_y[1]-edge_x[1]*edge_y[0]))
        if opacity<=0 or area<1e-10:frame=Image.new('RGBA',(width,height))
        else:
            inverse=inverse_projection(corners,width,height)
            frame=source.convert('RGBa').transform((width,height),Image.Transform.PERSPECTIVE,inverse,Image.Resampling.BICUBIC).convert('RGBA')
            if opacity<1:frame.putalpha(frame.getchannel('A').point(lambda a:round(a*opacity)))
        frame.save(Path(destination)/f'frame_{index:04d}.png')
