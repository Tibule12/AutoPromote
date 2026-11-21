"""Canonical programme-space masks for ordinary timed adjustment grades.

Coverage matches studioSelectiveMask.js. Mask files contain coverage only;
all picture grading remains in the shared Finish Rack FFmpeg compiler.
"""
import math
import subprocess
import numpy as np

FIELDS=('x','y','width','height','rotation')
RANGES={'x':(-1,2),'y':(-1,2),'width':(.002,3),'height':(.002,3),'rotation':(-360,360),'feather':(0,.25)}

def validate_selective_mask(mask):
    if not isinstance(mask,dict) or mask.get('space')!='programme' or mask.get('version')!=1 or mask.get('shape') not in ('ellipse','rectangle','polygon'):
        raise ValueError('Invalid selected-area mask')
    for key,(lo,hi) in RANGES.items():
        v=mask.get(key)
        if isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or not lo<=v<=hi:raise ValueError('Invalid selected-area '+key)
    if type(mask.get('inverted')) is not bool:raise ValueError('Invalid mask inversion')
    points=mask.get('points')
    if mask['shape']=='polygon' and (not isinstance(points,list) or not 3<=len(points)<=64 or any(not isinstance(p,list) or len(p)!=2 or any(isinstance(n,bool) or not isinstance(n,(int,float)) or not math.isfinite(n) or not 0<=n<=1 for n in p)for p in points)):
        raise ValueError('Draw a closed outline with 3–64 points')
    keys=mask.get('keyframes')
    if not isinstance(keys,list) or len(keys)>128:raise ValueError('Use at most 128 mask position keys')
    previous=-1
    for key in keys:
        t=key.get('time')
        if isinstance(t,bool) or not isinstance(t,(int,float)) or not math.isfinite(t) or t<0 or t<=previous:raise ValueError('Mask keys need unique increasing programme times')
        previous=t
        for field in FIELDS:
            v=key.get(field);lo,hi=RANGES[field]
            if isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or not lo<=v<=hi:raise ValueError('Invalid mask position key')
        if 'hold' in key and type(key['hold']) is not bool:raise ValueError('Invalid mask key interpolation')
    return mask

def mask_at(mask,time):
    keys=mask['keyframes']
    if not keys:return mask
    left=next((k for k in reversed(keys)if k['time']<=time),keys[0]);right=next((k for k in keys if k['time']>=time),keys[-1])
    p=0 if left is right or left.get('hold') else max(0,min(1,(time-left['time'])/(right['time']-left['time'])))
    return {**mask,**{f:left[f]+(right[f]-left[f])*p for f in FIELDS}}

def mask_coverage(mask,width,height,time=0):
    validate_selective_mask(mask);m=mask_at(mask,time);unit=min(width,height);rx=m['width']*width/unit/2;ry=m['height']*height/unit/2
    angle=m['rotation']*math.pi/180;cs,sn=math.cos(angle),math.sin(angle)
    padding=m['feather']*(max(rx,ry)/min(rx,ry)if m['shape']=='ellipse'else 1)
    bx=abs(rx*cs)+abs(ry*sn)+padding;by=abs(rx*sn)+abs(ry*cs)+padding
    x0=max(0,math.floor(m['x']*width-bx*unit));x1=min(width,math.ceil(m['x']*width+bx*unit))
    y0=max(0,math.floor(m['y']*height-by*unit));y1=min(height,math.ceil(m['y']*height+by*unit))
    result=np.full((height,width),1 if m['inverted']else 0,np.float32)
    if x1<=x0 or y1<=y0:return result
    py,px=np.ogrid[y0:y1,x0:x1];dx=((px+.5)/width-m['x'])*width/unit;dy=((py+.5)/height-m['y'])*height/unit
    x=dx*cs+dy*sn;y=-dx*sn+dy*cs
    if m['shape']=='ellipse':distance=(np.hypot(x/rx,y/ry)-1)*min(rx,ry)
    elif m['shape']=='rectangle':
        qx=np.abs(x)-rx;qy=np.abs(y)-ry;distance=np.hypot(np.maximum(qx,0),np.maximum(qy,0))+np.minimum(np.maximum(qx,qy),0)
    else:
        points=[((p[0]-.5)*rx*2,(p[1]-.5)*ry*2)for p in m['points']];inside=np.zeros((y1-y0,x1-x0),bool);near=np.full((y1-y0,x1-x0),np.inf)
        for i,(bx,by)in enumerate(points):
            ax,ay=points[i-1];vx,vy=bx-ax,by-ay;t=np.clip(((x-ax)*vx+(y-ay)*vy)/(vx*vx+vy*vy or 1),0,1)
            near=np.minimum(near,np.hypot(x-ax-t*vx,y-ay-t*vy))
            if by!=ay:inside^=((ay>y)!=(by>y))&(x<(bx-ax)*(y-ay)/(by-ay)+ax)
        distance=near*np.where(inside,-1,1)
    t=np.clip(.5-distance/m['feather'],0,1)if m['feather'] else (distance<=0).astype(float);alpha=t*t*(3-2*t)
    result[y0:y1,x0:x1]=(1-alpha if m['inverted']else alpha).astype(np.float32)
    return result

def render_selective_mask(mask,path,width,height,duration,fps):
    validate_selective_mask(mask)
    if not 2<=width<=4096 or not 2<=height<=4096 or not 0<fps<=120 or not 0<duration<=21600:raise ValueError('Selected-area mask exceeds the video budget')
    if not mask['keyframes']:
        from PIL import Image
        path=str(path)+'.png'
        Image.fromarray(np.floor(mask_coverage(mask,width,height)*255+.5).astype(np.uint8)).save(path)
        return path
    process=subprocess.Popen(['ffmpeg','-nostdin','-v','error','-y','-f','rawvideo','-pix_fmt','gray','-s',f'{width}x{height}','-r',str(fps),'-i','pipe:0','-an','-c:v','ffv1','-level','3','-threads','2',str(path)],stdin=subprocess.PIPE,stderr=subprocess.PIPE)
    try:
        static=None
        if not mask['keyframes']:static=np.floor(mask_coverage(mask,width,height)*255+.5).astype(np.uint8).tobytes()
        for i in range(max(1,math.ceil(duration*fps-1e-6))):process.stdin.write(static if static is not None else np.floor(mask_coverage(mask,width,height,i/fps)*255+.5).astype(np.uint8).tobytes())
        process.stdin.close();error=process.stderr.read();code=process.wait()
        if code:raise RuntimeError('Selected-area mask encoding failed: '+error.decode()[-500:])
    finally:
        if process.poll()is None:process.kill();process.wait()
    return str(path)

def masked_grade_filter(grade,path,prefix,fps):
    fps=float(fps)
    if not math.isfinite(fps)or not 0<fps<=120:raise ValueError("Invalid selected-area picture clock")
    escaped=str(path).replace('\\','\\\\').replace(':','\\:').replace("'","\\'")
    return (f'format=gbrp,split=2[{prefix}original][{prefix}input];'
            f'[{prefix}input]{grade},format=gbrp[{prefix}graded];'
            f"movie=filename='{escaped}',settb=expr=1/90000,setpts=round(N/({fps:.12f}*TB)),format=gray[{prefix}coverage];"
            f'[{prefix}original][{prefix}graded][{prefix}coverage]maskedmerge=planes=7')


def write_recolor_cube(spec,path,size=33):
    import colorsys,re
    if not isinstance(spec,dict)or not re.fullmatch(r'#[a-fA-F0-9]{6}',spec.get('color','')):raise ValueError('Invalid selected-area colour')
    amount=spec.get('strength',1)
    if isinstance(amount,bool)or not isinstance(amount,(int,float))or not math.isfinite(amount)or not 0<=amount<=1:raise ValueError('Invalid selected-area colour amount')
    target=[int(spec['color'][i:i+2],16)/255 for i in (1,3,5)];target_h,_,target_s=colorsys.rgb_to_hls(*target)
    with open(path,'w')as out:
        out.write(f'LUT_3D_SIZE {size}\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n')
        for b in range(size):
            for g in range(size):
                for r in range(size):
                    h,l,s=colorsys.rgb_to_hls(r/(size-1),g/(size-1),b/(size-1));delta=target_h-h
                    if delta>.5:delta-=1
                    if delta<-.5:delta+=1
                    rgb=colorsys.hls_to_rgb((h+delta*amount)%1,l,s+(target_s-s)*amount)
                    out.write(' '.join(f'{n:.7f}'for n in rgb)+'\n')
    return str(path)
