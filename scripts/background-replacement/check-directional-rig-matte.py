"""Private directional thin-rig separation on the actual failed shot.

Source Hough evidence estimates the dominant diagonal hardware orientation.
Source-local closing estimates its old plate; this is explicitly NOT measured
empty-background RGB. Static opacity is fitted over unoccluded frames, retaining
current photographed metal variation. No authored contour or model admission.
"""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import time
from types import SimpleNamespace
import warnings

import cv2
import numpy as np
from PIL import Image,ImageDraw

from model_workers.common import sha,write_json
from python_media_worker.studio_source_background import load_evidence
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
from recovered_motion_inputs import PRIVATE,RECOVERED,original,load_components


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('out',type=Path)
    parser.add_argument('--indices',default='6,10,47')
    parser.add_argument('--all-frames',action='store_true')
    parser.add_argument('--wide-corridor',action='store_true')
    parser.add_argument('--soft-occlusion',action='store_true')
    parser.add_argument('--interpolate-plate',action='store_true')
    parser.add_argument('--protect-horizontal-rails',action='store_true')
    parser.add_argument('--strong-metal',action='store_true')
    parser.add_argument('--local-kernel',type=int,choices=[5,7,9,19],default=19)
    parser.add_argument('--temporal-regression',action='store_true')
    parser.add_argument('--two-axis-plate',action='store_true')
    args=parser.parse_args();args.out.mkdir(mode=0o700,exist_ok=False)
    (args.out/'implementation.py').write_bytes(Path(__file__).read_bytes())
    matte=Path('/dev/shm/autopromote-posterior-posterior-photo-unmix-r314-20261107')
    manifest=json.loads((matte/'manifest.json').read_text());evidence=load_evidence(matte,manifest)
    assert manifest['shot_cuts']==[] and manifest['frame_count']==48
    effects=json.loads((PRIVATE/'native-source-click-footprint-r312-20261107/preview-model-project.autopromote.json').read_text())['snapshot']['subjectVfxScenes'][0]['scene']['effects']
    # Existing object's ROI, with source edge detection, supplies line evidence.
    crop=(160,720,850,820);x0,y0,x1,y1=crop
    reference=np.array(original(0));gray=cv2.cvtColor(reference[y0:y1,x0:x1],cv2.COLOR_RGB2GRAY)
    lines=cv2.HoughLinesP(cv2.Canny(gray,30,90),1,np.pi/720,50,minLineLength=140,maxLineGap=20)
    candidates=[]
    horizontal=[]
    for x,y,xx,yy in lines[:,0]:
        if xx<x:x,y,xx,yy=xx,yy,x,y
        slope=(yy-y)/(xx-x)
        if abs(slope)<.015:horizontal.append([int(x+x0),int(y+y0),int(xx+x0),int(yy+y0)])
        if .06<slope<.16:
            candidates.append((float(np.hypot(xx-x,yy-y)),slope,float(y+y0-slope*(x+x0))))
    assert candidates,'No diagonal source hardware evidence'
    _,slope,intercept=max(candidates)
    # Fit the whole source line, not a hand-drawn alpha. Cropping to the source
    # object's existing region prevents the line from reaching unrelated media.
    x=np.arange(225,755,dtype=np.float32);offset=np.arange(-22,23,dtype=np.float32)
    mx=np.broadcast_to(x,(len(offset),len(x))).copy()
    my=((slope*mx+intercept)+offset[:,None]).astype(np.float32)
    samples=[]
    for point in manifest['components'][3]['points']:
        if point['label']:
            px,py=round(point['position'][0]*1430),round(point['position'][1]*1000);samples.append(reference[py,px])
    material=np.median(samples,axis=0)/255
    observed=[];backgrounds=[];blocked=[];source=[]
    started=time.monotonic();cv2.setNumThreads(2)
    for i in range(48):
        rgb=np.array(original(i));src=cv2.remap(rgb,mx,my,cv2.INTER_LINEAR).astype(np.float32)/255
        # The smaller local probes test whether the old estimate swallowed
        # changing cloth shadows. Their plate is still inferred, not observed.
        plate_kernel=cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(args.local_kernel,)*2) if args.two_axis_plate else np.ones((args.local_kernel,1),np.uint8)
        bg=cv2.morphologyEx(src,cv2.MORPH_CLOSE,plate_kernel)
        if args.interpolate_plate:
            upper,lower=19,35  # actual normal offsets -3 and +13
            coefficient=np.clip((np.arange(len(offset))-upper)/(lower-upper),0,1)[:,None,None]
            upper_colour=np.median(src[upper-1:upper+2],axis=0)
            lower_colour=np.median(src[lower-1:lower+2],axis=0)
            bg=upper_colour[None]*(1-coefficient)+lower_colour[None]*coefficient
        person=np.maximum.reduce(load_components(i)[:3]);near=cv2.dilate((person>=128).astype(np.uint8),np.ones((9,9),np.uint8))
        protect=cv2.dilate(((person>=24)&(near>0)).astype(np.uint8),np.ones((5,5),np.uint8))
        block=cv2.remap(protect,mx,my,cv2.INTER_NEAREST)>0
        direction=bg-material
        alpha=(np.sum((bg-src)*direction,axis=2)/np.maximum(np.sum(direction*direction,axis=2),.002)).clip(0,1)
        alpha[block]=np.nan;observed.append(alpha);backgrounds.append(bg);blocked.append(block);source.append(src)
    stack=np.stack(observed);count=np.isfinite(stack).sum(0)
    with warnings.catch_warnings():
        warnings.simplefilter('ignore',RuntimeWarning)
        alpha=np.nanmedian(stack,axis=0)
    alpha=np.nan_to_num(alpha)
    if args.temporal_regression:
        # Independently changing photographed content behind fixed hardware
        # supplies C_t = a*F + (1-a)*B_t. Regress that exposure over the shot;
        # do not freeze a changing person or treat a mean RGB as a new frame.
        S=np.stack(source);G=np.stack(backgrounds);valid=~np.stack(blocked)
        # An overbroad person mask would veto the very observations needed to
        # recover the foreground wire. These are source-stationary pixels,
        # not a claimed semantic separation of the entire person's clothes.
        valid[:]=True
        c=S.mean(0);b=G.mean(0)
        variance=np.sum((G-b)**2,axis=(0,3))
        covariance=np.sum((S-c)*(G-b),axis=(0,3))
        beta=np.clip(covariance/np.maximum(variance,1e-8),0,1)
        predicted=c[None]+beta[None,...,None]*(G-b)
        residual=np.sqrt(np.mean((S-predicted)**2,axis=(0,3)))
        learned=(variance>48*3*(10/255)**2)&(residual<9/255)
        alpha[learned]=1-beta[learned]
        stationary=(np.max(np.std(S,axis=0),axis=2)<10/255)
        dark=(np.max(c,axis=2)<80/255)&(np.linalg.norm(c-material,axis=2)<.22)
        alpha[stationary&dark]=1
    if args.strong_metal:
        # The observed dark wire is opaque metal. Plate estimation is poorly
        # conditioned where a TV edge is also dark; do not turn a supported
        # wire core into transparency merely because the inferred B is dark.
        with warnings.catch_warnings():
            warnings.simplefilter('ignore',RuntimeWarning)
            current_median=np.nanmedian(np.where(np.stack(blocked)[...,None],np.nan,np.stack(source)),axis=0)
        colour=np.linalg.norm(current_median-material,axis=2)
        core=(alpha>.2)&(colour<.22)&(np.nanmax(current_median,axis=2)<.43)
        alpha[core]=1
    # Locate the actual spring in the source normal profile. Its dark ridge
    # is small and continuous; old screen behind it is not a fixed metal layer.
    profile=np.median(alpha,axis=1)
    ridge=int(np.argmax(profile[16:31])+16)
    band=np.clip((22-np.abs(np.arange(len(offset))-ridge))/3,0,1)[:,None] if args.wide_corridor else np.clip((9-np.abs(np.arange(len(offset))-ridge))/2,0,1)[:,None]
    if not args.wide_corridor:alpha*=band
    recovered=[]
    for C,B,block in zip(source,backgrounds,blocked):
        F=(C-(1-alpha[...,None])*B)/np.maximum(alpha[...,None],.02)
        F[block]=np.nan;recovered.append(F)
    with warnings.catch_warnings():
        warnings.simplefilter('ignore',RuntimeWarning)
        f0=np.nanmedian(np.stack(recovered),axis=0)
    f0=np.nan_to_num(f0).clip(0,1)
    Image.fromarray(np.rint(alpha*255).astype(np.uint8)).save(args.out/'rectified-source-consensus-alpha.png')
    Image.fromarray(np.rint(f0*255).astype(np.uint8)).save(args.out/'rectified-estimated-metal-rgb.png')
    # Scatter via inverse remap for a source-resolution matte, no rectangular
    # joins. Confidence tapers on the small band and object endpoints.
    yy,xx=np.mgrid[:1000,:1430].astype(np.float32)
    u=(xx-x[0]).astype(np.float32);v=(yy-(slope*xx+intercept)-offset[0]).astype(np.float32)
    static_alpha=cv2.remap(alpha.astype(np.float32),u,v,cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)
    fixed_f=cv2.remap(f0.astype(np.float32),u,v,cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)
    weight=cv2.remap(np.broadcast_to(band,alpha.shape).astype(np.float32),u,v,cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)
    weight*=np.clip((xx-x[0])/12,0,1)*np.clip((x[-1]-xx)/12,0,1)
    enough=cv2.remap((count>=16).astype(np.uint8),u,v,cv2.INTER_NEAREST)>0
    weight*=enough
    rows=[]
    indices=range(48)if args.all_frames else map(int,args.indices.split(','))
    for index in indices:
        image=original(index);rgb=np.array(image);raw=np.array(Image.open(matte/f'matte_{index:04d}.png'))
        identity=hashlib.sha256(raw.tobytes()).hexdigest();cache=SimpleNamespace(manifest=manifest,artifact_sha256=identity,observed_background=evidence,frame=lambda _:raw)
        renderer=VfxFrameRenderer({'version':1,'source_sha256':manifest['source_sha256'],'matte_sha256':identity,'effects':copy.deepcopy(effects)},cache,lambda _:PRIVATE/'replacement.png');renderer.foreground_cache.root=None
        active=[e for e in effects if e['start']<=index/24<e['end']]
        f,a=renderer._prepare_foreground(image,Image.fromarray(raw),active,1430,1000);F=np.array(f).astype(float)/255;A=np.array(a).astype(float)/255
        person=np.maximum.reduce(load_components(index)[:3]);near=cv2.dilate((person>=128).astype(np.uint8),np.ones((9,9),np.uint8));protected=cv2.dilate(((person>=24)&(near>0)).astype(np.uint8),np.ones((5,5),np.uint8))>0
        if args.soft_occlusion:
            body=cv2.GaussianBlur((person>=128).astype(np.float32),(0,0),3)
            use=weight*(1-body)
        else:use=weight*(~protected)
        # Current source variation remains in the metal, shrunk toward the
        # independent temporal material estimate to avoid TV colour grain.
        current_f=(source[index]-(1-alpha[...,None])*backgrounds[index])/np.maximum(alpha[...,None],.02)
        rectified_f=(f0+.2*(current_f-f0)).clip(0,1)
        newf=cv2.remap(rectified_f.astype(np.float32),u,v,cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)
        nexta=A*(1-use)+static_alpha*use
        P=F*A[...,None]*(1-use[...,None])+newf*static_alpha[...,None]*use[...,None]
        if args.protect_horizontal_rails:
            # Source-derived rail evidence is independent of the spring band.
            # Known dark metal restores its own opaque photographed texture;
            # a local plate interpolation must not punch through an arm rail.
            rail=np.zeros(A.shape,np.uint8)
            groups=[]
            for line in sorted(horizontal,key=lambda l:(l[1]+l[3])/2):
                y=(line[1]+line[3])/2
                if groups and y-np.mean([.5*(l[1]+l[3])for l in groups[-1]])<4:groups[-1].append(line)
                else:groups.append([line])
            level=[np.mean([.5*(l[1]+l[3])for l in g])for g in groups]
            for upper,lower in zip(level,level[1:]):
                if 8<lower-upper<24:
                    cv2.rectangle(rail,(int(x[0]),round(upper)),(int(x[-1]),round(lower)),1,-1)
            keep=(rail>0)&(rgb.max(2)<90)
            nexta[keep]=1;P[keep]=rgb[keep]/255
        nextf=P/np.maximum(nexta[...,None],.001)
        f=Image.fromarray(np.rint(nextf.clip(0,1)*255).astype(np.uint8));a=Image.fromarray(np.rint(nexta.clip(0,1)*255).astype(np.uint8));renderer._prepare_foreground=lambda *unused,f=f,a=a:(f,a)
        result=renderer.render(image,index);result.save(args.out/f'actual-composite-{index:04d}.png');a.save(args.out/f'alpha-{index:04d}.png');f.save(args.out/f'foreground-{index:04d}.png')
        if index in [6,10,15,17,23,47]:
            before=Image.open(PRIVATE/f'native-source-click-footprint-r312-20261107/actual-native-frame-review/actual-preview-{index:04d}.png')
            for name,box in [('rig',(100,690,950,925)),('spring',(230,730,755,825))]:
                w,h=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(w*3,h+24))
                for n,(label,picture)in enumerate([('Actual source',image),('Native parent',before),('Directional source estimate',result)]):sheet.paste(picture.crop(box),(w*n,24));ImageDraw.Draw(sheet).text((w*n+3,4),label,fill='white')
                sheet.save(args.out/f'{name}-{index:04d}.jpg',quality=98)
        rows.append({'frame':index,'sourceSha256':sha(RECOVERED/f'rgb/rgb_{index:04d}.png'),'changedAlphaPixels':int(np.count_nonzero(np.rint(A*255)!=np.rint(nexta*255))),'protectedCurrentPersonAlphaExact':bool(np.array_equal(np.rint(A[protected]*255),np.rint(nexta[protected]*255))),'seconds':time.monotonic()-started})
        print(json.dumps(rows[-1]),flush=True)
        write_json(args.out/'receipt.json',{'rows':rows,'sourceLine':[slope,intercept],'normalRidgeOffset':int(offset[ridge]),'lineEvidence':candidates,'horizontalRailEvidence':horizontal,'protectHorizontalRails':args.protect_horizontal_rails,'wideCorridor':args.wide_corridor,'softOcclusion':args.soft_occlusion,'interpolatedLocalPlate':args.interpolate_plate,'sourceMaterialRgb':(material*255).tolist(),'estimatedOldBackgroundNotPhotographed':True,'sourcePixelVariationRetained':.2,'handAuthoredAlphaContour':False,'nativeAdmission':False,'fourMinuteProof':False,'all48FrameProof':args.all_frames,'registeredImplementationChanged':False,'paidCloudInference':False,'providerUpload':False,'visualReviewPending':True})


if __name__=='__main__':main()
