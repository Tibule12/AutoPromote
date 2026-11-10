"""Private photographed material-chromaticity key; no product admission.

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
            s,w=chromaticity(skin),chromaticity(cloth);normal=np.cross(s,w);normal/=max(np.linalg.norm(normal),1e-8)
            contrast=B@normal;signal=C@normal
            alpha=np.divide(signal,contrast,out=np.ones_like(A),where=abs(contrast)>.025)
            alpha=1-alpha;alpha=np.clip(alpha,0,1)
            confidence=np.clip((abs(contrast)-.025)/.05,0,1)
            # Source-sized common filtering treats alpha and the recovered
            # premultiplied colour consistently at the moving blurred edge.
            alpha=cv2.GaussianBlur(alpha,(0,0),.75)
            P=C-(1-alpha[:,:,None])*B
            foreground=(P/np.maximum(alpha[:,:,None],.01)).clip(0,1)
            domain=(cv2.dilate((hand>=64).astype(np.uint8),np.ones((31,31),np.uint8))>0)&observed
            weight=np.minimum(cv2.distanceTransform(domain.astype(np.uint8),cv2.DIST_L2,5)/8,1)*confidence
            # Deep actual garment support is not a target of the hand key.
            weight*=np.clip((12-cdepth)/8,0,1)
            nexta=A*(1-weight)+alpha*weight
            premul=F*A[:,:,None]*(1-weight[:,:,None])+foreground*alpha[:,:,None]*weight[:,:,None]
            F=premul/np.maximum(nexta[:,:,None],.001);A=nexta
            diagnostics.append({'component':ci,'currentSkinSamples':int(skin.sum()),'currentCuffSamples':int(cloth.sum()),'chromaticities':[s.tolist(),w.tolist()],'originPlaneNormal':normal.tolist()})
        foreground=Image.fromarray(np.rint(F.clip(0,1)*255).astype(np.uint8));alpha=Image.fromarray(np.rint(A*255).astype(np.uint8))
        renderer._prepare_foreground=lambda *unused,f=foreground,a=alpha:(f,a)
        result=renderer.render(image,index);renderer._prepare_foreground=prepare
        result.save(args.out/f'actual-composite-{index:04d}.png');foreground.save(args.out/f'foreground-{index:04d}.png');alpha.save(args.out/f'alpha-{index:04d}.png')
        for side,box in [('left',(280,240,700,720)),('right',(1040,170,1430,760))]:
            w,h=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(w*3,h+24))
            for column,(title,picture) in enumerate([('Actual source',image),('Earlier paired correction',Image.open(parent/f'actual-composite-{index:04d}.png')),('Photographed origin-plane key',result)]):
                sheet.paste(picture.crop(box),(column*w,24));ImageDraw.Draw(sheet).text((column*w+3,4),title,fill='white')
            sheet.save(args.out/f'actual-{side}-comparison-{index:04d}.jpg',quality=98)
        rows.append({'frame':index,'materials':diagnostics,'visualPass':False});print(json.dumps({'frame':index,'elapsedSeconds':time.monotonic()-started}),flush=True)
    write_json(args.out/'receipt.json',{'sourceSha256':source_sha,'allFrames':args.all_frames,'rightOnly':args.right_only,'rows':rows,
        'sourceMaterialGuidanceReceiptSha256':sha(root/'garment-tracks-r147-20261105/receipt.json'),
        'elapsedSeconds':time.monotonic()-started,'nativeAdmission':False,'fourMinuteProof':False,'visualPass':False})


if __name__=='__main__':main()
