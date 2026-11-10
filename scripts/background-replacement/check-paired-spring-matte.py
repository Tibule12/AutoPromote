"""Private source-derived paired-edge matte for the failed fixed spring.

This corrects the rejected probe's wrong diagonal/extent. It is not a new
model artifact, a hand-authored rotoscope, or a native Studio qualification.
The old plate is locally estimated and is explicitly not an empty photograph.
"""
import copy
import argparse
import hashlib
import json
from pathlib import Path
import time
from types import SimpleNamespace

import cv2
import numpy as np
from PIL import Image,ImageDraw
from pymatting import estimate_alpha_cf
from pymatting.preconditioner.ichol import ichol

from model_workers.common import sha,write_json
from recovered_motion_inputs import PRIVATE,RECOVERED,original,load_components
from python_media_worker.studio_vfx_plan import VfxFrameRenderer


def paired_edges(rgb):
    gray=cv2.cvtColor(rgb[720:820,160:850],cv2.COLOR_RGB2GRAY)
    found=cv2.HoughLinesP(cv2.Canny(gray,30,90),1,np.pi/1440,30,minLineLength=80,maxLineGap=12)
    lines=[]
    for x,y,xx,yy in found[:,0]:
        if xx<x:x,y,xx,yy=xx,yy,x,y
        if xx==x:continue
        slope=(yy-y)/(xx-x)
        if .04<slope<.35:
            lines.append({'slope':float(slope),'intercept':float(y+720-slope*(x+160)),
                          'start':int(x+160),'end':int(xx+160)})
    pairs=[]
    for i,a in enumerate(lines):
        for b in lines[i+1:]:
            if abs(a['slope']-b['slope'])>.025:continue
            start=max(a['start'],b['start']);end=min(a['end'],b['end']);middle=(start+end)/2
            separation=abs((a['slope']-b['slope'])*middle+a['intercept']-b['intercept'])
            if end-start<110 or not 6<separation<17:continue
            # A real spring has closely paired edges. A lone long shirt fold
            # cannot supply a second metal boundary or authorize extending it.
            score=(end-start)/(1+15*abs(a['slope']-b['slope']))
            pairs.append({'score':score,'slope':(a['slope']+b['slope'])/2,
                          'intercept':(a['intercept']+b['intercept'])/2,
                          'start':min(a['start'],b['start']),'end':max(a['end'],b['end']),
                          'separation':separation,'edges':[a,b]})
    if not pairs:raise ValueError('No source-supported paired spring edges')
    return max(pairs,key=lambda p:p['score']),pairs


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('out',type=Path)
    parser.add_argument('--body-mode',choices=['inpaint','vertical','corrected','additive'],default='inpaint')
    parser.add_argument('--normal-plate',action='store_true')
    parser.add_argument('--indices',default='6,10,47')
    args=parser.parse_args();out=args.out;out.mkdir(mode=0o700,exist_ok=False)
    (out/'implementation.py').write_bytes(Path(__file__).read_bytes())
    rgb=np.array(original(47));fit,pairs=paired_edges(rgb);write_json(out/'paired-geometry.json',{'selected':fit,'candidates':pairs})
    slope,b=fit['slope'],fit['intercept'];xs=np.arange(fit['start'],fit['end']+1,dtype=np.float32)
    normal=np.arange(-19,20,dtype=np.float32);mx=np.broadcast_to(xs,(len(normal),len(xs))).copy()
    my=(slope*mx+b+normal[:,None]).astype(np.float32)
    strip=cv2.remap(rgb,mx,my,cv2.INTER_LINEAR).astype(np.float64)/255
    kernel=np.ones((9,1),np.uint8) if args.normal_plate else cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(9,9))
    plate=cv2.morphologyEx(strip.astype(np.float32),cv2.MORPH_CLOSE,kernel).astype(float)
    value=strip.mean(2);contrast=(plate-strip).mean(2)
    neutral=np.max(strip,axis=2)-np.min(strip,axis=2)<.13
    inside=(value<.30)&(contrast>.045)&neutral
    outside=(contrast<.012)|(strip[:,:,0]-strip[:,:,2]>.15)
    # The fitted *two* source edges bound the wire. Exterior rows are real
    # background seeds for this isolated hardware layer, not the whole person.
    inside[np.abs(normal)>10]=False;outside[np.abs(normal)>13]=True
    outside[inside]=False
    tri=np.full(value.shape,.5);tri[outside]=0;tri[inside]=1
    alpha=estimate_alpha_cf(strip,tri,laplacian_kwargs={'epsilon':1e-6},
        preconditioner=lambda matrix:ichol(matrix,shifts=[.01,.1,1,10,100,1000]),
        cg_kwargs={'rtol':1e-6,'maxiter':500}).clip(0,1)
    if args.normal_plate:
        half=np.abs((fit['edges'][0]['slope']-fit['edges'][1]['slope'])*xs+
                    fit['edges'][0]['intercept']-fit['edges'][1]['intercept'])/2
        alpha*=np.clip((half[None]+1-np.abs(normal[:,None]))/1.5,0,1)
    for name,arr in [('source-strip',strip),('seed-trimap',tri),('rig-alpha',alpha)]:
        picture=Image.fromarray(np.rint(arr.clip(0,1)*255).astype(np.uint8));picture.save(out/(name+'.png'))
    yy,xx=np.mgrid[:1000,:1430].astype(np.float32);u=xx-xs[0];v=yy-(slope*xx+b)-normal[0]
    rig=cv2.remap(alpha.astype(np.float32),u,v,cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)
    profile=np.clip((15-np.abs(normal))/4,0,1)[:,None]
    weight=cv2.remap(np.broadcast_to(profile,alpha.shape).astype(np.float32),u,v,cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)
    weight*=np.clip((xx-xs[0])/12,0,1)*np.clip((xs[-1]-xx)/12,0,1)
    effects=json.loads((PRIVATE/'native-source-click-footprint-r312-20261107/preview-model-project.autopromote.json').read_text())['snapshot']['subjectVfxScenes'][0]['scene']['effects']
    current=PRIVATE/'product-controls-compositor-r349-20261107';rows=[];started=time.monotonic()
    for index in map(int,args.indices.split(',')):
        image=original(index);C=np.array(image).astype(float)/255
        A=np.array(Image.open(current/f'alpha-{index:04d}.png')).astype(float)/255
        F=np.array(Image.open(current/f'foreground-{index:04d}.png')).astype(float)/255
        person=np.maximum.reduce(load_components(index)[:3])
        if args.body_mode=='corrected':
            root=PRIVATE/'occluded-clothing-track-r352-20261107';checked=json.loads((root/'receipt.json').read_text())
            file=root/f'primary-{index:04d}.png';assert sha(file)==checked['rows'][index]['maskSha256']
            person=np.array(Image.open(file))
        body=(person>=128).astype(np.float32)
        if args.body_mode=='vertical':body=cv2.morphologyEx(body,cv2.MORPH_CLOSE,np.ones((91,1),np.uint8))
        body=cv2.GaussianBlur(body,(0,0),1.5)
        domain=(weight>.01).astype(np.uint8)
        # Remove the isolated hardware from the person's soft silhouette by
        # interpolating current neighboring person evidence across its band.
        if args.body_mode!='vertical':body=cv2.inpaint(body,domain,5,cv2.INPAINT_NS).clip(0,1)
        combined=rig+(1-rig)*body
        nexta=A*(1-weight)+combined*weight
        # No source still is held over movement. Opaque combined foreground
        # uses the current photograph exactly; B only deblends mixed pixels.
        missing=(rig>.02).astype(np.uint8)
        plate=np.stack([cv2.inpaint(C[:,:,c].astype(np.float32),missing,5,cv2.INPAINT_NS)for c in range(3)],axis=2).clip(0,1)
        solved=(C-(1-combined[...,None])*plate)/np.maximum(combined[...,None],.01)
        solved[combined>.995]=C[combined>.995]
        premul=F*A[...,None]*(1-weight[...,None])+solved.clip(0,1)*combined[...,None]*weight[...,None]
        nextf=premul/np.maximum(nexta[...,None],.001)
        if args.body_mode=='additive':
            # Restore only source-supported missing dark metal. A later
            # occlusion supplies current RGB; no static metal picture is pasted
            # over a moving hand. Existing opaque clothing cannot be erased.
            now=cv2.remap(C.astype(np.float32),mx,my,cv2.INTER_LINEAR)
            bg=cv2.morphologyEx(now,cv2.MORPH_CLOSE,np.ones((9,1),np.uint8))
            contrast=np.maximum(0,(bg-now).mean(2))
            reliable=np.clip((contrast-.025)/.06,0,1)
            reliable*=np.clip((.50-np.max(now,axis=2))/.15,0,1)
            reliable*=np.clip((.24-(np.max(now,axis=2)-np.min(now,axis=2)))/.10,0,1)
            current_rig=cv2.remap((alpha*reliable).astype(np.float32),u,v,cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)
            nexta=np.maximum(A,current_rig*weight)
            a=Image.fromarray(np.rint(nexta.clip(0,1)*255).astype(np.uint8))
            from python_media_worker.studio_source_background import load_evidence
            m=json.loads(Path('/dev/shm/autopromote-posterior-posterior-photo-unmix-r314-20261107/manifest.json').read_text())
            identity=hashlib.sha256(np.array(a).tobytes()).hexdigest()
            cache=SimpleNamespace(manifest=m,artifact_sha256=identity,observed_background=load_evidence(Path('/dev/shm/autopromote-posterior-posterior-photo-unmix-r314-20261107'),m),frame=lambda _:np.array(a))
            shared=VfxFrameRenderer({'version':1,'source_sha256':m['source_sha256'],'matte_sha256':identity,'effects':copy.deepcopy(effects)},cache,lambda _:PRIVATE/'replacement.png');shared.foreground_cache.root=None
            f,a=shared._prepare_foreground(image,a,[e for e in effects if e['start']<=index/24<e['end']],1430,1000)
            nexta=np.array(a).astype(float)/255;nextf=np.array(f).astype(float)/255
        a=Image.fromarray(np.rint(nexta.clip(0,1)*255).astype(np.uint8));f=Image.fromarray(np.rint(nextf.clip(0,1)*255).astype(np.uint8))
        m=json.loads(Path('/dev/shm/autopromote-posterior-posterior-photo-unmix-r314-20261107/manifest.json').read_text())
        m['privateDerivedNotModelArtifact']=True
        identity=hashlib.sha256(np.array(a).tobytes()).hexdigest()
        cache=SimpleNamespace(manifest=m,artifact_sha256=identity,frame=lambda _:np.array(a))
        renderer=VfxFrameRenderer({'version':1,'source_sha256':m['source_sha256'],'matte_sha256':cache.artifact_sha256,'effects':copy.deepcopy(effects)},cache,lambda _:PRIVATE/'replacement.png');renderer.foreground_cache.root=None
        renderer._prepare_foreground=lambda *unused,f=f,a=a:(f,a)
        result=renderer.render(image,index);result.save(out/f'actual-composite-{index:04d}.png');a.save(out/f'alpha-{index:04d}.png');f.save(out/f'foreground-{index:04d}.png')
        box=(190,710,700,835);w,h=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(w*3,h+24))
        for n,(label,picture)in enumerate([('Actual source',image),('Current derived hand repair',Image.open(current/f'actual-composite-{index:04d}.png')),('Paired spring / current person',result)]):
            sheet.paste(picture.crop(box),(n*w,24));ImageDraw.Draw(sheet).text((n*w+3,4),label,fill='white')
        sheet.save(out/f'comparison-{index:04d}.jpg',quality=98)
        rows.append({'frame':index,'sourceSha256':sha(RECOVERED/f'rgb/rgb_{index:04d}.png'),'changedAlphaPixels':int(np.count_nonzero(np.rint(A*255)!=np.array(a))),'seconds':time.monotonic()-started})
        write_json(out/'receipt.json',{'rows':rows,'bodyMode':args.body_mode,'normalDirectionPlate':args.normal_plate,'sourceDerivedPairedEdges':fit,'handAuthoredAlphaContour':False,'sourceRgbHeldOverMovement':False,'nativeAdmission':False,'fourMinuteProof':False,'unphotographedPlateExplicitlyEstimated':True,'paidCloudInference':False,'providerUpload':False,'visualReviewPending':True})
        print(json.dumps(rows[-1]),flush=True)


if __name__=='__main__':main()
