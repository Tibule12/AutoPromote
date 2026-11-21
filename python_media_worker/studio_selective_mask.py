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
    if 'opacity'in mask and (type(mask['opacity'])not in(int,float)or not math.isfinite(mask['opacity'])or not 0<=mask['opacity']<=1):raise ValueError('Invalid mask visibility')
    material=mask.get('material')
    if material is not None:validate_material(material)
    if 'subtract' in mask:
        if not isinstance(mask['subtract'],list)or len(mask['subtract'])>8:raise ValueError('Use up to eight exclusion outlines per region')
        for child in mask['subtract']:
            if not isinstance(child,dict):raise ValueError('Invalid exclusion outline')
            validate_selective_mask({**child,'space':'programme','version':1,'inverted':False,'keyframes':[],'subtract':[],'material':None})
    previous=-1
    for key in keys:
        t=key.get('time')
        if isinstance(t,bool) or not isinstance(t,(int,float)) or not math.isfinite(t) or t<0 or t<=previous:raise ValueError('Mask keys need unique increasing programme times')
        previous=t
        for field in FIELDS:
            v=key.get(field);lo,hi=RANGES[field]
            if isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or not lo<=v<=hi:raise ValueError('Invalid mask position key')
        if 'hold' in key and type(key['hold']) is not bool:raise ValueError('Invalid mask key interpolation')
        if 'opacity' in key and (type(key['opacity'])not in(int,float)or not math.isfinite(key['opacity'])or not 0<=key['opacity']<=1):raise ValueError('Invalid mask visibility key')
        if 'points' in key and (mask['shape']!='polygon'or not isinstance(key['points'],list)or len(key['points'])!=len(points)or any(not isinstance(p,list)or len(p)!=2 or any(type(v)not in(int,float)or not math.isfinite(v)or not 0<=v<=1 for v in p)for p in key['points'])):raise ValueError('Outline keys must keep matching points')
    return mask

def mask_at(mask,time):
    keys=mask['keyframes']
    if not keys:return mask
    left=next((k for k in reversed(keys)if k['time']<=time),keys[0]);right=next((k for k in keys if k['time']>=time),keys[-1])
    p=0 if left is right or left.get('hold') else max(0,min(1,(time-left['time'])/(right['time']-left['time'])))
    result={**mask,**{f:left[f]+(right[f]-left[f])*p for f in FIELDS},'opacity':left.get('opacity',1)+(right.get('opacity',1)-left.get('opacity',1))*p}
    if mask.get('points'):
        lp=left.get('points',mask['points']);rp=right.get('points',mask['points'])
        result['points']=[[v+(rp[i][j]-v)*p for j,v in enumerate(point)]for i,point in enumerate(lp)]
    return result

def mask_coverage(mask,width,height,time=0,_validated=False):
    if not _validated:validate_selective_mask(mask)
    m=mask_at(mask,time);unit=min(width,height);rx=m['width']*width/unit/2;ry=m['height']*height/unit/2
    angle=m['rotation']*math.pi/180;cs,sn=math.cos(angle),math.sin(angle)
    padding=m['feather']*(max(rx,ry)/min(rx,ry)if m['shape']=='ellipse'else 1)
    bx=abs(rx*cs)+abs(ry*sn)+padding;by=abs(rx*sn)+abs(ry*cs)+padding
    x0=max(0,math.floor(m['x']*width-bx*unit));x1=min(width,math.ceil(m['x']*width+bx*unit))
    y0=max(0,math.floor(m['y']*height-by*unit));y1=min(height,math.ceil(m['y']*height+by*unit))
    result=np.full((height,width),1 if m['inverted']else 0,np.float32)
    if x1<=x0 or y1<=y0:return result*m.get('opacity',1)
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
    for child in m.get('subtract',[]):
        lx=(child['x']-.5)*m['width']*width;ly=(child['y']-.5)*m['height']*height
        transformed={**child,'space':'programme','version':1,'inverted':False,'keyframes':[],
            'x':m['x']+(lx*cs-ly*sn)/width,'y':m['y']+(lx*sn+ly*cs)/height,
            'width':child['width']*m['width'],'height':child['height']*m['height'],
            'rotation':child['rotation']+m['rotation'],
            'feather':child['feather']*min(m['width']*width,m['height']*height)/unit}
        exclusion=mask_coverage(transformed,width,height,0,True)
        result=(1-(1-result)*(1-exclusion)if m['inverted']else result*(1-exclusion)).astype(np.float32)
    if 'opacity' in m:result*=m['opacity']
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

def masked_grade_filter(grade,path,prefix,fps,material_path=None):
    fps=float(fps)
    if not math.isfinite(fps)or not 0<fps<=120:raise ValueError("Invalid selected-area picture clock")
    escaped=str(path).replace('\\','\\\\').replace(':','\\:').replace("'","\\'")
    original=f'{prefix}original'
    matte=(f"movie=filename='{escaped}',settb=expr=1/90000,setpts=round(N/({fps:.12f}*TB)),format=gray[{prefix}coverage];")
    if material_path:
        material_escaped=str(material_path).replace('\\','\\\\').replace(':','\\:').replace("'","\\'")
        return (f'format=gbrp,split=3[{original}][{prefix}input][{prefix}materialin];'
            f'[{prefix}input]{grade},format=gbrp[{prefix}graded];'+matte+
            f"[{prefix}materialin]lut3d=file='{material_escaped}':interp=trilinear,format=gray[{prefix}material];"
            f'[{prefix}coverage][{prefix}material]blend=all_mode=multiply[{prefix}combined];'
            f'[{original}][{prefix}graded][{prefix}combined]maskedmerge=planes=7')
    return (f'format=gbrp,split=2[{original}][{prefix}input];'
            f'[{prefix}input]{grade},format=gbrp[{prefix}graded];'+matte+
            f'[{original}][{prefix}graded][{prefix}coverage]maskedmerge=planes=7')


def validate_material(material):
    import re
    if not isinstance(material,dict)or type(material.get('enabled'))is not bool or not isinstance(material.get('samples'),list)or len(material['samples'])>8 or any(not isinstance(s,str)or not re.fullmatch(r'#[a-fA-F0-9]{6}',s)for s in material['samples']):raise ValueError('Pick up to eight material colours')
    for field,lo,hi in [('hueRange',.01,.5),('saturationRange',.02,1),('lightnessRange',.02,1),('softness',.05,1)]:
        v=material.get(field)
        if type(v)not in(int,float)or not math.isfinite(v)or not lo<=v<=hi:raise ValueError('Invalid material '+field)
    if material['enabled']and not material['samples']:raise ValueError('Pick a material colour first')


def write_material_cube(material,path,size=33):
    import colorsys
    validate_material(material)
    samples=[]
    for sample in material['samples']:
        h,l,s=colorsys.rgb_to_hls(*(int(sample[i:i+2],16)/255 for i in (1,3,5)));samples.append((h,s,l))
    with open(path,'w')as out:
        out.write(f'LUT_3D_SIZE {size}\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n')
        for b in range(size):
            for g in range(size):
                for r in range(size):
                    h,l,s=colorsys.rgb_to_hls(r/(size-1),g/(size-1),b/(size-1));alpha=0
                    for sh,ss,sl in samples:
                        hue=min(abs(h-sh),1-abs(h-sh))
                        distance=max(0 if ss<.08 else hue/material['hueRange'],abs(s-ss)/material['saturationRange'],abs(l-sl)/material['lightnessRange'])
                        t=max(0,min(1,(1-distance)/material['softness']));alpha=max(alpha,t*t*(3-2*t))
                    out.write(' '.join([f'{alpha:.9f}']*3)+'\n')
    return str(path)



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
