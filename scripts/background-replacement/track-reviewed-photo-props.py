"""Track reviewed static-camera prop corrections through CURRENT photographs.

The moving person retains the actual per-frame neural alpha. Only the reviewed
rig/plant camera region uses source-photograph flow, with bidirectional and
photometric rejection. This is an internal source-specific correction review,
not native model admission, arbitrary-motion qualification or a held person.
"""
import argparse
import copy
import json
from pathlib import Path
import time

import cv2
import numpy as np
from PIL import Image, ImageDraw

from model_workers.common import sha, write_json
from python_media_worker.studio_subject_matte import CachedSubjectMatte
from python_media_worker.studio_vfx_plan import VfxFrameRenderer


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('out',type=Path)
    parser.add_argument('--reviewed-camera-anchors',action='store_true')
    args=parser.parse_args()
    args.out.mkdir(exist_ok=False)
    (args.out/'implementation.py').write_bytes(Path(__file__).read_bytes())
    root=Path('reports/background-replacement-20261101/private')
    prep=Path('/dev/shm/autopromote-foreground-recovery-r95-20261105')
    work=Path('/dev/shm/autopromote-foreground-alpha-r95-20261105')
    reviewed=root/'reviewed-prop-material-r102-20261105'
    assert json.loads((reviewed/'receipt.json').read_text())['sourceSha256']==sha(prep/'source.mkv')
    cache=CachedSubjectMatte(work/'alpha-work/outputs/subject_masks',prep/'source.mkv')
    plan=json.loads((reviewed/'actual-plan.json').read_text())
    if args.reviewed_camera_anchors:
        # The actual photographed timber starts at y=752, not y=777.
        # This existing source-camera holdout is explicit authoring, not an
        # inferred object boundary or a claim about arbitrary new footage.
        timber=next(e for e in plan['effects'] if e['id']=='reviewed-opaque-wooden-surface')
        timber['corners']=[[.59,.754],[1,.754],[1,1],[.59,1]]
        clear=next(e for e in plan['effects'] if e.get('clear_paths'))
        clear['clear_paths'][-1]=[[1380/1430,.654],[1,.654],[1,.751],[1380/1430,.751]]
    plan['matte_sha256']=cache.artifact_sha256
    renderer=VfxFrameRenderer(plan,cache,lambda _:root/'replacement.png')
    prepare=renderer._prepare_foreground
    reference=np.array(Image.open(work/'alpha-work/outputs/rgb/rgb_0000.png').convert('RGB'))
    reviewed_alpha=np.array(Image.open(reviewed/'alpha-0000.png'))
    x0,y0,x1,y1=950,400,1430,1000
    ref=reference[y0:y1,x0:x1]
    ref_alpha=reviewed_alpha[y0:y1,x0:x1]
    gray=lambda rgb:cv2.cvtColor(rgb,cv2.COLOR_RGB2GRAY)
    ref_gray=gray(ref)
    sift=cv2.SIFT_create(nfeatures=1800)
    feature_support=cv2.erode((ref_alpha>=224).astype(np.uint8)*255,np.ones((5,5),np.uint8))
    reference_keys,reference_features=sift.detectAndCompute(ref_gray,feature_support)
    guide=prep/'segmentation/component_masks'
    body=json.loads((guide/'manifest.json').read_text())['components'][0]
    flow=cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    cv2.setNumThreads(2)
    yy,xx=np.indices(ref_gray.shape,np.float32)
    # This region contains only photographed fixed equipment/plants in the
    # reviewed reference pose. The source-specific authoring scope is explicit.
    domain=np.zeros(ref_gray.shape,np.uint8)
    domain[50:,50:]=1
    border=np.minimum(cv2.distanceTransform(domain,cv2.DIST_L2,5)/12,1)
    rows=[];started=time.monotonic()
    for index in range(48):
        image=Image.open(work/f'alpha-work/outputs/rgb/rgb_{index:04d}.png').convert('RGB')
        rgb=np.array(image);local=rgb[y0:y1,x0:x1];current_gray=gray(local)
        if index==0:
            backward=np.zeros((*ref_gray.shape,2),np.float32)
            forward=backward.copy()
        else:
            backward=flow.calc(current_gray,ref_gray,None)
            forward=flow.calc(ref_gray,current_gray,None)
        mx,my=xx+backward[:,:,0],yy+backward[:,:,1]
        warped_photo=cv2.remap(ref,mx,my,cv2.INTER_LINEAR,borderMode=cv2.BORDER_REFLECT)
        warped_alpha=cv2.remap(ref_alpha,mx,my,cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)
        reverse=cv2.remap(forward,mx,my,cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)
        cycle=np.linalg.norm(backward+reverse,axis=2)
        error=np.max(np.abs(local.astype(np.int16)-warped_photo.astype(np.int16)),axis=2).astype(np.float32)
        # Smooth confidence avoids one-code-value changes abruptly restoring
        # an old bad matte. Actual changes/occlusions reject the reference.
        confidence=np.clip((28-error)/20,0,1)*np.clip((1.5-cycle)/1.25,0,1)
        confidence*=((mx>=1)&(mx<ref.shape[1]-1)&(my>=1)&(my<ref.shape[0]-1))
        weight=border*confidence
        values=cache.frame(index).copy()
        before=values[y0:y1,x0:x1].astype(np.float32)
        anchor={}
        if args.reviewed_camera_anchors:
            # Source-background animation cannot revive a rejected TV mask.
            # Anchor fallback geometry to photographed opaque prop features,
            # using current RGB and RANSAC rather than noisy background flow.
            if index==0:
                transform=np.float32([[1,0,0],[0,1,0]]);inliers=0;median_error=0.
            else:
                keys,features=sift.detectAndCompute(current_gray,None)
                pairs=cv2.BFMatcher().knnMatch(reference_features,features,k=2)
                matches=[a for a,b in pairs if a.distance<.7*b.distance]
                if len(matches)<12:raise ValueError('Not enough actual fixed-object feature matches')
                start=np.float32([reference_keys[m.queryIdx].pt for m in matches])
                end=np.float32([keys[m.trainIdx].pt for m in matches])
                transform,keep=cv2.estimateAffinePartial2D(start,end,method=cv2.RANSAC,ransacReprojThreshold=1.5)
                if transform is None:raise ValueError('Fixed-object source registration failed')
                errors=np.linalg.norm(cv2.transform(start[None],transform)[0]-end,axis=1)
                inliers=int(keep.sum());median_error=float(np.median(errors[keep[:,0]>0]))
                if inliers<12 or median_error>1:raise ValueError('Fixed-object registration is not precise')
            anchored=cv2.warpAffine(ref_alpha,transform,(ref.shape[1],ref.shape[0]),flags=cv2.INTER_LINEAR)
            # Dense optical flow refines material geometry where current RGB
            # verifies it; rigid photographic registration remains the fallback.
            target=anchored*(1-confidence)+warped_alpha*confidence
            current_body=np.array(Image.open(guide/body['frames'][index]['file']))
            count,labels,stats,_=cv2.connectedComponentsWithStats((current_body>=128).astype(np.uint8),8)
            real_body=np.zeros_like(current_body)
            if count>1:
                largest=1+int(np.argmax(stats[1:,cv2.CC_STAT_AREA]));real_body[labels==largest]=current_body[labels==largest]
            actor=cv2.dilate((real_body[y0:y1,x0:x1]>=128).astype(np.uint8),np.ones((15,15),np.uint8))
            actor_weight=np.clip(cv2.distanceTransform(actor,cv2.DIST_L2,5)/5,0,1)
            corrected=target*(1-actor_weight)+np.maximum(target,before)*actor_weight
            values[y0:y1,x0:x1]=np.rint(before*(1-border)+corrected*border).astype(np.uint8)
            anchor={'sourceFeatureInliers':inliers,'sourceFeatureMedianErrorPixels':median_error,
                'sourceToCurrentTransform':transform.tolist(),'currentActorProtectedPixels':int(actor.sum())}
        else:
            values[y0:y1,x0:x1]=np.rint(before*(1-weight)+warped_alpha*weight).astype(np.uint8)
        outside=border==0
        assert np.array_equal(values[y0:y1,x0:x1][outside],cache.frame(index)[y0:y1,x0:x1][outside])
        def corrected(frame,_alpha,active,width,height,v=values):
            return prepare(frame,Image.fromarray(v),active,width,height)
        renderer._prepare_foreground=corrected
        result=renderer.render(image,index)
        renderer._prepare_foreground=prepare
        Image.fromarray(values).save(args.out/f'alpha-{index:04d}.png')
        result.save(args.out/f'actual-render-{index:04d}.jpg',quality=98)
        if index in [0,1,6,9,12,18,23,24,36,47]:
            box=(1000,450,1430,1000);cw,ch=box[2]-box[0],box[3]-box[1]
            sheet=Image.new('RGB',(cw*3,ch+22))
            for n,(title,picture) in enumerate([('Actual source',image),('Current photo-tracked correction',result),
                ('Current source/flow confidence',Image.fromarray(np.rint(confidence*255).astype(np.uint8)).convert('RGB'))]):
                crop=picture.crop(box) if n<2 else picture.crop((50,50,480,600))
                sheet.paste(crop,(n*cw,22));ImageDraw.Draw(sheet).text((n*cw+3,3),f'{title} | frame {index}',fill='white')
            sheet.save(args.out/f'actual-source-tracked-props-{index:04d}.jpg',quality=98)
        domain_pixels=border>0
        rows.append({'frame':index,'meanCurrentPhotoError255':float(error[domain_pixels].mean()),
            'meanCycleErrorPixels':float(cycle[domain_pixels].mean()),
            'referenceRejectedPixels':int(np.count_nonzero(domain_pixels&(confidence==0))),
            'currentSourceExamined':True,'visualPass':False,**anchor})
        print(json.dumps({'frame':index,'elapsedSeconds':time.monotonic()-started}),flush=True)
    write_json(args.out/'receipt.json',{'sourceSha256':sha(prep/'source.mkv'),
        'referenceAlphaSha256':sha(reviewed/'alpha-0000.png'),'actualFrames':48,'rows':rows,
        'explicitSourceCameraScope':[1000,450,1430,1000],'movingPersonUsesCurrentNeuralAlpha':True,
        'reviewedCameraAnchors':args.reviewed_camera_anchors,'canonicalPlan':plan,
        'arbitraryMotionQualified':False,'nativeAdmission':False,'fourMinuteProof':False,'visualPass':False})


if __name__=='__main__':
    main()
