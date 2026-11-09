"""Private current-frame support/colour repair of the real failed gesture.

Current SAM hand tracks bound a source-motion-dependent unknown band. Separate
current garment tracks and solid primary-person interiors protect kept clothing.
No held person pose, source replacement, new weights, or native admission.
"""
import argparse
import json
from pathlib import Path
import time

import cv2
import numpy as np
from PIL import Image,ImageDraw

from model_workers.adapters.temporal_alpha import source_motion_radius,enclosed_person_interiors
from model_workers.common import sha,write_json
from python_media_worker.studio_subject_matte import CachedSubjectMatte
from python_media_worker.studio_vfx_plan import VfxFrameRenderer


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('out',type=Path)
    p.add_argument('--indices',default='7,10,17,23,30,35')
    p.add_argument('--all-frames',action='store_true')
    p.add_argument('--despill',action='store_true')
    args=p.parse_args();args.out.mkdir(exist_ok=False)
    (args.out/'implementation.py').write_bytes(Path(__file__).read_bytes())
    cv2.setNumThreads(2)
    root=Path('reports/background-replacement-20261101/private')
    upstream=root/'coupled-photo-motion-r143-20261105'
    garments=root/'garment-tracks-r147-20261105'
    work=Path('/dev/shm/autopromote-current-pipeline-r83-20261105')
    source=Path(json.loads((work/'receipt.json').read_text())['source'])
    source_hash=sha(source)
    if source_hash!=json.loads((upstream/'receipt.json').read_text())['sourceSha256']:
        raise ValueError('Joint pair source changed')
    garment_receipt=json.loads((garments/'receipt.json').read_text())
    if garment_receipt['sourceSha256']!=source_hash or len(garment_receipt['rows'])!=48:
        raise ValueError('Expected complete current-source garment tracks')
    guide=work/'alpha-work/component_dependency';manifest=json.loads((guide/'manifest.json').read_text())
    cache=CachedSubjectMatte(work/'alpha-work/outputs/subject_masks',source)
    renderer=VfxFrameRenderer(json.loads((work/'actual-plan.json').read_text()),cache,lambda _:root/'replacement.png')
    renderer.foreground_cache.root=None;prepare=renderer._prepare_foreground
    rows=[];started=time.monotonic()
    for index in (range(48) if args.all_frames else map(int,args.indices.split(','))):
        rgb_path=work/f'alpha-work/outputs/rgb/rgb_{index:04d}.png'
        image=Image.open(rgb_path).convert('RGB');rgb=np.array(image)
        previous=np.array(Image.open(work/f'alpha-work/outputs/rgb/rgb_{max(0,index-1):04d}.png').convert('RGB'))
        following=np.array(Image.open(work/f'alpha-work/outputs/rgb/rgb_{min(47,index+1):04d}.png').convert('RGB'))
        motion=np.maximum(source_motion_radius(rgb,previous,2),source_motion_radius(rgb,following,2))
        radius=np.clip(2*(motion-2),2,24)
        values=np.array(Image.open(upstream/f'alpha-{index:04d}.png')).astype(float)/255
        colours=np.array(Image.open(upstream/f'foreground-{index:04d}.png')).astype(float)/255
        planes=[np.array(Image.open(guide/c['frames'][index]['file'])) for c in manifest['components']]
        cuffs=[np.array(Image.open(garments/f'cuff-{n}-{index:04d}.png')) for n in [0,1]]
        for n,row in enumerate(garment_receipt['rows'][index]['components']):
            if sha(garments/row['file'])!=row['sha256']:raise ValueError('Tracked garment bytes changed')
        primary=planes[0]
        corrections=manifest['components'][0]['selection'].get('shotPrompts',[])
        bg=[p['position'] for row in corrections if row['frameIndex']==index for p in row['points'] if p['label']==0]
        filled=(primary>=128).astype(np.uint8)
        filled[enclosed_person_interiors(primary,12,bg,planes[1:3])]=1
        body_core=cv2.distanceTransform(filled,cv2.DIST_L2,5)>48
        clothing_core=np.maximum.reduce([cv2.distanceTransform((c>=224).astype(np.uint8),cv2.DIST_L2,5) for c in cuffs])>10
        # Another kept part of the same person is still foreground when the
        # hand moves across it. A hand-support restriction cannot subtract a
        # selected shoulder merely because it is near the hand's boundary.
        protected=(primary>=128)|body_core|clothing_core
        protected_weight=np.minimum(cv2.distanceTransform((~protected).astype(np.uint8),cv2.DIST_L2,5)/6,1)
        before=values.copy();changed_colours=0
        for ci,hand in enumerate(planes[1:3]):
            domain=cv2.dilate((hand>=64).astype(np.uint8),np.ones((31,31),np.uint8))>0
            distance=cv2.distanceTransform((hand<128).astype(np.uint8),cv2.DIST_L2,5)
            supported=np.clip((radius+1.5-distance)/1.5,0,1)
            strength=domain*protected_weight
            values*=1-strength*(1-supported)
            if args.despill:
                # Only selected hand material may lose excess source-blue
                # chroma. Cuffs and all unrelated blue objects remain outside
                # this independently tracked colour scope; alpha is unchanged.
                hand_weight=np.clip((hand.astype(float)-64)/128,0,1)
                hand_weight*=np.clip((128-cuffs[ci].astype(float))/96,0,1)
                excess=np.maximum(0,colours[:,:,2]-np.minimum(colours[:,:,0],colours[:,:,1]))
                candidate=colours.copy();candidate[:,:,2]-=excess
                coefficients=np.array([.2126,.7152,.0722])
                luminance=colours@coefficients;new_luminance=candidate@coefficients
                candidate*=np.clip(luminance/np.maximum(new_luminance,.005),.75,1.5)[...,None]
                candidate=candidate.clip(0,1)
                changed_colours+=int(np.count_nonzero((hand_weight>0)&(excess>1/255)))
                colours=colours*(1-hand_weight[...,None])+candidate*hand_weight[...,None]
        alpha=Image.fromarray(np.rint(values.clip(0,1)*255).astype(np.uint8))
        foreground=Image.fromarray(np.rint(colours.clip(0,1)*255).astype(np.uint8))
        renderer._prepare_foreground=lambda *unused,f=foreground,a=alpha:(f,a)
        result=renderer.render(image,index);renderer._prepare_foreground=prepare
        result.save(args.out/f'actual-composite-{index:04d}.png')
        foreground.save(args.out/f'foreground-{index:04d}.png');alpha.save(args.out/f'alpha-{index:04d}.png')
        for side,box in [('left',(280,240,700,720)),('right',(1040,170,1430,760))]:
            w,h=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(w*3,h+24))
            for column,(title,picture) in enumerate([('Actual source',image),('Earlier source-conditioned pair',Image.open(upstream/f'actual-composite-{index:04d}.png')),('Current motion/material support',result)]):
                sheet.paste(picture.crop(box),(column*w,24));ImageDraw.Draw(sheet).text((column*w+3,4),title,fill='white')
            sheet.save(args.out/f'actual-{side}-comparison-{index:04d}.jpg',quality=98)
        row={'frame':index,'sourceRgbSha256':sha(rgb_path),'removedPixelFrames':int(np.count_nonzero(before-values>1/255)),
            'maximumOpacityReduction':float((before-values).max()),'protectedClothingOrBodyPixels':int(protected.sum()),
            'handColourPixels':changed_colours,'radiusP95Pixels':float(np.percentile(radius,95)),'visualPass':False}
        rows.append(row);print(json.dumps(row),flush=True)
    write_json(args.out/'receipt.json',{'sourceSha256':source_hash,'rows':rows,'allFrames':args.all_frames,
        'upstreamJointPairReceiptSha256':sha(upstream/'receipt.json'),'garmentTrackingReceiptSha256':sha(garments/'receipt.json'),
        'despill':args.despill,'onlyCurrentRgbAndSemanticTracks':True,'foregroundAndBodyOutsideCorrectionRetained':True,
        'elapsedSeconds':time.monotonic()-started,'nativeAdmission':False,'fourMinuteProof':False,'visualPass':False})


if __name__=='__main__':main()
