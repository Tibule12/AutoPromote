"""Private joint brightness and transmission fit; no product admission.

Independent current cuff and hand tracks supply two observed foreground
chromaticities. Their shared origin plane models shade and exposure mixtures,
unlike an affine plane through arbitrary three-dimensional colour clusters.
"""
import argparse
import json
from pathlib import Path
import time

import cv2
import numpy as np
from PIL import Image,ImageDraw

from model_workers.common import sha,write_json
from python_media_worker.studio_subject_matte import CachedSubjectMatte
from python_media_worker.studio_vfx_plan import VfxFrameRenderer


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('out',type=Path)
    p.add_argument('--indices',default='7,23,10,17,35');p.add_argument('--all-frames',action='store_true')
    p.add_argument('--right-only',action='store_true')
    p.add_argument('--neutral-shading',action='store_true')
    p.add_argument('--retain-opacity-relight',action='store_true')
    p.add_argument('--remove-photographed-seams',action='store_true')
    p.add_argument('--seam-radius',type=int,default=2)
    p.add_argument('--horizontal-pair-interpolation',action='store_true')
    args=p.parse_args();args.out.mkdir(exist_ok=False);cv2.setNumThreads(2)
    (args.out/'implementation.py').write_bytes(Path(__file__).read_bytes())
    root=Path('reports/background-replacement-20261101/private');parent=root/'coupled-photo-motion-r143-20261105'
    work=Path('/dev/shm/autopromote-current-pipeline-r83-20261105')
    guide=work/'alpha-work/component_dependency';manifest=json.loads((guide/'manifest.json').read_text())
    source=Path(json.loads((work/'receipt.json').read_text())['source']);source_sha=sha(source)
    if json.loads((parent/'receipt.json').read_text())['sourceSha256']!=source_sha:raise ValueError('Source changed')
    B=np.array(Image.open(parent/'actual-photographed-reference.png')).astype(float)/255
    observed=np.array(Image.open(parent/'actual-photographed-support.png'))>0
    cache=CachedSubjectMatte(work/'alpha-work/outputs/subject_masks',source)
    renderer=VfxFrameRenderer(json.loads((work/'actual-plan.json').read_text()),cache,lambda _:root/'replacement.png')
    prepare=renderer._prepare_foreground;renderer.foreground_cache.root=None;started=time.monotonic();rows=[]
    for index in (range(48) if args.all_frames else map(int,args.indices.split(','))):
        image=Image.open(work/f'alpha-work/outputs/rgb/rgb_{index:04d}.png').convert('RGB');rgb=np.array(image);C=rgb.astype(float)/255
        A=np.array(Image.open(parent/f'alpha-{index:04d}.png')).astype(float)/255
        F=np.array(Image.open(parent/f'foreground-{index:04d}.png')).astype(float)/255
        diagnostics=[]
        for ci in ([2] if args.right_only else [1,2]):
            hand=np.array(Image.open(guide/manifest['components'][ci]['frames'][index]['file']))
            cuff=np.array(Image.open(root/f'garment-tracks-r147-20261105/cuff-{ci-1}-{index:04d}.png'))
            depth=cv2.distanceTransform((hand>=224).astype(np.uint8),cv2.DIST_L2,5)
            cdepth=cv2.distanceTransform((cuff>=224).astype(np.uint8),cv2.DIST_L2,5)
            skin=(depth>10)&(C[:,:,0]-C[:,:,1]>8/255)&(C[:,:,1]>=C[:,:,2]-3/255)
            cloth=cdepth>10
            if skin.sum()<32 or cloth.sum()<32:raise ValueError('No independent photographed material samples')
            def chromaticity(mask):
                v=C[mask];v=v[np.sum(v,axis=1)>.18];return np.median(v/np.maximum(v.sum(1,keepdims=True),.001),axis=0)
            s,w=chromaticity(skin),chromaticity(cloth)
            # Independently tracked garments determine the foreground material;
            # solve only one material's brightness plus photographed-background
            # transmission at a pixel. The previous three-colour origin plane
            # let skin and cloth trade against B without a unique solution.
            garment=cv2.GaussianBlur(cuff.astype(float)/255,(0,0),3)
            selected=cv2.GaussianBlur(hand.astype(float)/255,(0,0),3)
            mix=garment/np.maximum(garment+selected,.01)
            mix=np.clip((mix-.15)/.7,0,1)
            U=s[None,None,:]*(1-mix[:,:,None])+w[None,None,:]*mix[:,:,None]
            uu=np.sum(U*U,axis=2);bb=np.sum(B*B,axis=2);ub=np.sum(U*B,axis=2)
            uc=np.sum(U*C,axis=2);bc=np.sum(B*C,axis=2)
            determinant=uu*bb-ub*ub
            t=(bc*uu-uc*ub)/np.maximum(determinant,1e-8)
            alpha=np.clip(1-t,0,1)
            # Joint filtering of P and alpha avoids independent colour rims.
            alpha=cv2.GaussianBlur(alpha,(0,0),.65)
            P=C-(1-alpha[:,:,None])*B
            if args.retain_opacity_relight:
                alpha=A.copy()
                old=F.copy();brightness=np.sum(old*U,axis=2)/np.maximum(uu,1e-8)
                neutral=U*brightness[:,:,None]
                old_y=old@np.array([.2126,.7152,.0722])
                new_y=neutral@np.array([.2126,.7152,.0722])
                neutral*=np.maximum(old_y,.001)[:,:,None]/np.maximum(new_y[:,:,None],.001)
                excess=(old[:,:,2]-neutral[:,:,2])-(old[:,:,0]-neutral[:,:,0])
                use=np.clip((excess-.015)/.06,0,1)
                use=cv2.GaussianBlur(use,(0,0),1.4)
                F_repaired=old*(1-use[:,:,None])+neutral*use[:,:,None]
                P=F_repaired*alpha[:,:,None]
            if args.neutral_shading:
                brightness=np.maximum(np.sum(U*P,axis=2)/np.maximum(uu,1e-8),0)
                P=U*brightness[:,:,None]
            if args.remove_photographed_seams:
                # Old-screen texture can be imprinted in the foreground colour
                # as well as opacity. Only narrow, photographed B structures
                # INSIDE the tracked hand are removed. No invented background
                # pixels, manual rotoscope or global blur is used.
                gray=cv2.cvtColor((B*255).astype(np.uint8),cv2.COLOR_RGB2GRAY).astype(float)
                gx=cv2.Sobel(gray,cv2.CV_64F,1,0,ksize=3)/4
                gy=cv2.Sobel(gray,cv2.CV_64F,0,1,ksize=3)/4
                high=np.sqrt(gx*gx+gy*gy)>35
                high=cv2.dilate(high.astype(np.uint8),np.ones((2*args.seam_radius+1,2*args.seam_radius+1),np.uint8))>0
                seam=high&observed&(hand>=64)&(cdepth<4)&(alpha>.05)
                # Inpaint common premultiplied colour and opacity through the
                # same tiny source-observed seam, retaining the surrounding
                # real finger silhouette and its motion blur.
                if args.horizontal_pair_interpolation:
                    values=np.concatenate([P,alpha[:,:,None]],axis=2)
                    from scipy.ndimage import label
                    for yy in np.where(seam.any(1))[0]:
                        labels,count=label(seam[yy])
                        for part in range(1,count+1):
                            xs=np.where(labels==part)[0];left,right=int(xs[0])-1,int(xs[-1])+1
                            if left<6 or right>=values.shape[1]-6 or right-left>70:continue
                            # Interpolate a COMMON P/alpha field through the
                            # photographed narrow line, using actual neighbours
                            # and their slopes rather than repeating a column.
                            start,end=values[yy,left].copy(),values[yy,right].copy()
                            m0=(values[yy,left]-values[yy,left-5])/5
                            m1=(values[yy,right+5]-values[yy,right])/5
                            t=np.arange(1,right-left)/(right-left);span=right-left
                            v=(2*t**3-3*t**2+1)[:,None]*start+(t**3-2*t**2+t)[:,None]*m0*span
                            v+=(-2*t**3+3*t**2)[:,None]*end+(t**3-t**2)[:,None]*m1*span
                            values[yy,left+1:right]=v
                    alpha=values[:,:,3].clip(0,1);P=values[:,:,:3]
                else:
                    for ch in range(3):P[:,:,ch]=cv2.inpaint(P[:,:,ch].astype(np.float32),seam.astype(np.uint8)*255,max(5,args.seam_radius),cv2.INPAINT_NS)
                    alpha=cv2.inpaint(alpha.astype(np.float32),seam.astype(np.uint8)*255,max(5,args.seam_radius),cv2.INPAINT_NS).clip(0,1)
            foreground=(P/np.maximum(alpha[:,:,None],.01)).clip(0,1)
            confidence=np.ones_like(A) if args.retain_opacity_relight else np.clip((determinant/(uu*bb+1e-8)-.015)/.08,0,1)
            domain=(cv2.dilate((hand>=64).astype(np.uint8),np.ones((31,31),np.uint8))>0)&observed
            weight=np.minimum(cv2.distanceTransform(domain.astype(np.uint8),cv2.DIST_L2,5)/8,1)*confidence
            # Deep actual garment support is not a target of the hand key.
            weight*=np.clip((12-cdepth)/8,0,1)
            nexta=A*(1-weight)+alpha*weight
            premul=F*A[:,:,None]*(1-weight[:,:,None])+foreground*alpha[:,:,None]*weight[:,:,None]
            F=premul/np.maximum(nexta[:,:,None],.001);A=nexta
            diagnostics.append({'component':ci,'currentSkinSamples':int(skin.sum()),'currentCuffSamples':int(cloth.sum()),'chromaticities':[s.tolist(),w.tolist()],'twoCoefficientBrightnessAndTransmission':True})
        foreground=Image.fromarray(np.rint(F.clip(0,1)*255).astype(np.uint8));alpha=Image.fromarray(np.rint(A*255).astype(np.uint8))
        renderer._prepare_foreground=lambda *unused,f=foreground,a=alpha:(f,a)
        result=renderer.render(image,index);renderer._prepare_foreground=prepare
        result.save(args.out/f'actual-composite-{index:04d}.png');foreground.save(args.out/f'foreground-{index:04d}.png');alpha.save(args.out/f'alpha-{index:04d}.png')
        for side,box in [('left',(280,240,700,720)),('right',(1040,170,1430,760))]:
            w,h=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(w*3,h+24))
            for column,(title,picture) in enumerate([('Actual source',image),('Earlier paired correction',Image.open(parent/f'actual-composite-{index:04d}.png')),('Independent material + brightness fit',result)]):
                sheet.paste(picture.crop(box),(column*w,24));ImageDraw.Draw(sheet).text((column*w+3,4),title,fill='white')
            sheet.save(args.out/f'actual-{side}-comparison-{index:04d}.jpg',quality=98)
        rows.append({'frame':index,'materials':diagnostics,'visualPass':False});print(json.dumps({'frame':index,'elapsedSeconds':time.monotonic()-started}),flush=True)
    write_json(args.out/'receipt.json',{'sourceSha256':source_sha,'allFrames':args.all_frames,'rightOnly':args.right_only,'neutralShading':args.neutral_shading,'retainOpacityRelight':args.retain_opacity_relight,'removePhotographedSeams':args.remove_photographed_seams,'seamRadiusPixels':args.seam_radius,'horizontalPairInterpolation':args.horizontal_pair_interpolation,'rows':rows,
        'sourceMaterialGuidanceReceiptSha256':sha(root/'garment-tracks-r147-20261105/receipt.json'),
        'elapsedSeconds':time.monotonic()-started,'nativeAdmission':False,'fourMinuteProof':False,'visualPass':False})


if __name__=='__main__':main()
