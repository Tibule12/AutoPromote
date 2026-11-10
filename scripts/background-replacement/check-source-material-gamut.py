"""Private conservative chroma recovery from current opaque hand samples.

Opacity, local luminance and genuine opaque source pixels stay unchanged.
Only soft-edge colours outside the measured current material distribution are
projected toward nearby photographed material. This is not native admission.
"""
import argparse
import json
from pathlib import Path
import time

import cv2
import numpy as np
from PIL import Image,ImageDraw
from scipy.spatial import cKDTree

from model_workers.common import sha,write_json
from recovered_motion_inputs import PRIVATE,RECOVERED,original,renderer,load_components


def repair(rgb,foreground,alpha,hand,cuff,native,*,domain_radius=3,include_opaque_edge=False):
    C=rgb.astype(float)/255
    F=foreground.copy()
    depth=cv2.distanceTransform((hand>=224).astype(np.uint8),cv2.DIST_L2,5)
    source_y=C@np.array([.2126,.7152,.0722])
    seeds=(depth>8)&(cuff<32)&(native>=254)&(source_y>.05)&(source_y<.85)
    ys,xs=np.where(seeds)
    if len(xs)<32:
        raise ValueError('No independently opaque current material samples')
    values=C[ys,xs]
    chroma=values/np.maximum(values.sum(1,keepdims=True),.001)
    centre=np.median(chroma[:,:2],axis=0)
    # Remove seed outliers before estimating the material gamut. This changes
    # no source pixels; native opacity is an independent anchor, not a colour
    # selection or a claim of ground truth.
    spread=np.maximum(np.median(abs(chroma[:,:2]-centre),axis=0)*1.4826,.007)
    good=np.all(abs(chroma[:,:2]-centre)<4*spread,axis=1)
    ys,xs,values,chroma=ys[good],xs[good],values[good],chroma[good]
    if len(xs)<32:
        raise ValueError('Current material is not sufficiently consistent')
    centre=np.mean(chroma[:,:2],axis=0)
    covariance=np.cov(chroma[:,:2].T)+np.eye(2)*.00004
    inverse=np.linalg.inv(covariance)
    distances=np.sqrt(np.einsum('ni,ij,nj->n',chroma[:,:2]-centre,inverse,chroma[:,:2]-centre))
    bound=max(3.,float(np.percentile(distances,99)))
    Y=F@np.array([.2126,.7152,.0722])
    fc=F/np.maximum(F.sum(2,keepdims=True),.001)
    distance=np.sqrt(np.maximum(np.einsum('hwi,ij,hwj->hw',fc[:,:,:2]-centre,inverse,fc[:,:,:2]-centre),0))
    size=2*domain_radius+1
    opacity_scope=(alpha<.999)|((depth<=16)&include_opaque_edge)
    scope=(cv2.dilate((hand>=64).astype(np.uint8),np.ones((size,size),np.uint8))>0)&(cuff<64)&(alpha>.001)&opacity_scope
    weight=np.clip((distance-bound)/3,0,1)*scope
    yy,xx=np.where(weight>.001)
    if len(xx):
        sy=values@np.array([.2126,.7152,.0722])
        material=values/np.maximum(sy[:,None],.001)
        features=np.stack([ys/60,xs/60,sy/.15],axis=1)
        query=np.stack([yy/60,xx/60,Y[yy,xx]/.15],axis=1)
        distances,near=cKDTree(features[::2]).query(query,k=min(12,len(features[::2])))
        blend=1/np.maximum(distances,.1)**2
        target=(material[::2][near]*blend[:,:,None]).sum(1)/blend.sum(1)[:,None]
        target*=Y[yy,xx,None]
        F[yy,xx]=F[yy,xx]*(1-weight[yy,xx,None])+target*weight[yy,xx,None]
    return F.clip(0,1),{'independentlyOpaqueSourceSamples':len(xs),'materialDistributionBound':bound,
        'softOrOpaqueEdgeOutlierPixels':len(xx),'alphaUnchanged':True,'opaqueRgbUnchanged':not include_opaque_edge,
        'luminancePreservedBeforeQuantization':True}


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('out',type=Path)
    p.add_argument('--parent',type=Path,default=PRIVATE/'photographic-material-motion-r201-20261106')
    p.add_argument('--indices',default='7,15,23,39,10,17,35')
    p.add_argument('--all-frames',action='store_true')
    p.add_argument('--domain-radius',type=int,choices=[3,15],default=3)
    p.add_argument('--include-opaque-edge',action='store_true')
    args=p.parse_args();args.out.mkdir(exist_ok=False)
    cv2.setNumThreads(2)
    (args.out/'implementation.py').write_bytes(Path(__file__).read_bytes())
    garment=PRIVATE/'garment-tracks-r147-20261105'
    guide=json.loads((garment/'receipt.json').read_text())
    render=renderer();prepare=render._prepare_foreground;start=time.monotonic();rows=[]
    for index in (range(48)if args.all_frames else map(int,args.indices.split(','))):
        image=original(index);rgb=np.array(image)
        before=np.array(Image.open(args.parent/f'foreground-{index:04d}.png'))
        F=before.astype(float)/255
        alpha=Image.open(args.parent/f'alpha-{index:04d}.png').convert('L');A=np.array(alpha).astype(float)/255
        components=load_components(index)
        native=np.array(Image.open(RECOVERED/f'native-alpha/matte_{index:04d}.png'))
        diagnostics=[]
        for ci in [1,2]:
            meta=guide['rows'][index]['components'][ci-1];path=garment/meta['file']
            if sha(path)!=meta['sha256']:
                raise ValueError('Current garment selection changed')
            cuff=np.array(Image.open(path))
            F,diag=repair(rgb,F,A,components[ci],cuff,native,domain_radius=args.domain_radius,include_opaque_edge=args.include_opaque_edge)
            diagnostics.append({'component':ci,**diag})
        hand=np.maximum(components[1],components[2])
        outside=cv2.dilate((hand>=64).astype(np.uint8),np.ones((31,31),np.uint8))==0
        protected=outside|((components[0]>=128)&(hand<32))
        if not args.include_opaque_edge:protected|=A>=.999
        F[protected]=before[protected].astype(float)/255
        foreground=Image.fromarray(np.rint(F*255).astype(np.uint8))
        render._prepare_foreground=lambda *unused,f=foreground,a=alpha:(f,a)
        output=render.render(image,index);render._prepare_foreground=prepare
        foreground.save(args.out/f'foreground-{index:04d}.png');alpha.save(args.out/f'alpha-{index:04d}.png')
        output.save(args.out/f'actual-composite-{index:04d}.png')
        for side,box in [('left',(280,240,700,720)),('right',(1040,170,1430,760))]:
            w,h=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(w*3,h+24))
            for col,(title,picture)in enumerate([('Actual source',image),('Earlier paired candidate',Image.open(args.parent/f'actual-composite-{index:04d}.png')),('Measured current-material soft chroma',output)]):
                sheet.paste(picture.crop(box),(col*w,24));ImageDraw.Draw(sheet).text((col*w+3,4),title,fill='white')
            sheet.save(args.out/f'actual-{side}-comparison-{index:04d}.jpg',quality=98)
        rows.append({'frame':index,'components':diagnostics,'visualPass':False})
        print(json.dumps({'frame':index,'seconds':time.monotonic()-start}),flush=True)
    write_json(args.out/'receipt.json',{'rows':rows,'allFrames':args.all_frames,'parent':str(args.parent),
        'parentReceiptSha256':sha(args.parent/'receipt.json'),
        'sourceSha256':json.loads((RECOVERED/'receipt.json').read_text())['sourceSha256'],
        'sourceRecoveryReceiptSha256':sha(RECOVERED/'receipt.json'),'elapsedSeconds':time.monotonic()-start,
        'materialColourDomainRadius':args.domain_radius,
        'opaqueHandEdgeColourAlsoEvaluated':args.include_opaque_edge,
        'nativeAdmission':False,'fourMinuteProof':False,'visualPass':False,'providerUpload':False,'paidCloudInference':False})


if __name__=='__main__':main()
