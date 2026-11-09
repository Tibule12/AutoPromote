"""Private fixed-rig matte from source-local contrast and unoccluded samples.

One explicit inspection box supplies scope, not an alpha contour. Alpha is
inferred from current RGB, then stabilized over independently unoccluded views.
The canonical foreground-colour recovery and compositor remain unchanged.
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
    parser.add_argument('--anchor-weak',action='store_true')
    args=parser.parse_args();args.out.mkdir(mode=0o700,exist_ok=False)
    (args.out/'implementation.py').write_bytes(Path(__file__).read_bytes())
    matte=Path('/dev/shm/autopromote-posterior-posterior-photo-unmix-r314-20261107')
    manifest=json.loads((matte/'manifest.json').read_text());evidence=load_evidence(matte,manifest)
    assert manifest['shot_cuts']==[] and manifest['frame_count']==48
    effects=json.loads((PRIVATE/'native-source-click-footprint-r312-20261107/preview-model-project.autopromote.json').read_text())['snapshot']['subjectVfxScenes'][0]['scene']['effects']
    box=(230,744,490,789);x0,y0,x1,y1=box;sl=np.s_[y0:y1,x0:x1]
    samples=[];ref=np.array(original(0))
    for point in manifest['components'][3]['points']:
        if point['label']:
            x,y=round(point['position'][0]*1430),round(point['position'][1]*1000);samples.append(ref[y,x])
    material=np.median(samples,axis=0)/255
    values=[];blocked=[];started=time.monotonic();cv2.setNumThreads(2)
    kernel=cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(9,9))
    for i in range(48):
        rgb=np.array(original(i));C=rgb[sl].astype(float)/255
        B=cv2.morphologyEx(rgb,cv2.MORPH_CLOSE,kernel)[sl].astype(float)/255
        direction=B-material
        a=(np.sum((B-C)*direction,axis=2)/np.maximum(np.sum(direction*direction,axis=2),.002)).clip(0,1)
        parts=load_components(i)
        person=np.maximum.reduce(parts[:3])
        weak=(person>=24).astype(np.uint8)
        if args.anchor_weak:
            nearby=cv2.dilate((person>=128).astype(np.uint8),np.ones((7,7),np.uint8))
            weak &= nearby
        protect=cv2.dilate(weak,np.ones((7,7),np.uint8))>0
        blocked.append(protect[sl])
        a[protect[sl]]=np.nan;values.append(a)
    values=np.stack(values);observations=np.isfinite(values).sum(0)
    with warnings.catch_warnings():
        warnings.simplefilter('ignore',RuntimeWarning)
        median=np.nanmedian(values,axis=0)
    median=np.nan_to_num(median)
    Image.fromarray(np.rint(median*255).astype(np.uint8)).save(args.out/'source-consensus-alpha-in-inspection-box.png')
    rows=[]
    for index in map(int,args.indices.split(',')):
        image=original(index);prior=np.array(Image.open(matte/f'matte_{index:04d}.png'));alpha=prior.copy()
        use=~blocked[index]&(observations>=16)
        # Taper only the user-visible inspection-box boundary. Independent
        # occlusion holes and reference support are eligibility, not confidence.
        near=np.ones(median.shape,np.uint8);near[[0,-1]]=0;near[:,[0,-1]]=0
        weight=np.minimum(cv2.distanceTransform(near,cv2.DIST_L2,5)/3,1)*use
        alpha[sl]=np.rint(prior[sl]*(1-weight)+median*255*weight).astype(np.uint8)
        identity=hashlib.sha256(alpha.tobytes()).hexdigest()
        cache=SimpleNamespace(manifest=manifest,artifact_sha256=identity,observed_background=evidence,frame=lambda _:alpha)
        renderer=VfxFrameRenderer({'version':1,'source_sha256':manifest['source_sha256'],'matte_sha256':identity,'effects':copy.deepcopy(effects)},cache,lambda _:PRIVATE/'replacement.png');renderer.foreground_cache.root=None
        result=renderer.render(image,index);result.save(args.out/f'actual-composite-{index:04d}.png');Image.fromarray(alpha).save(args.out/f'alpha-{index:04d}.png')
        before=Image.open(PRIVATE/f'native-source-click-footprint-r312-20261107/actual-native-frame-review/actual-preview-{index:04d}.png')
        for name,region in [('rig',(100,690,950,925)),('spring',(230,730,490,810))]:
            w,h=region[2]-region[0],region[3]-region[1];sheet=Image.new('RGB',(w*3,h+24))
            for n,(label,picture)in enumerate([('Actual source',image),('Native current',before),('Source-derived fixed alpha / current F',result)]):
                sheet.paste(picture.crop(region),(w*n,24));ImageDraw.Draw(sheet).text((w*n+3,4),label,fill='white')
            if name=='spring':sheet=sheet.resize((2340,312))
            sheet.save(args.out/f'{name}-{index:04d}.jpg',quality=98)
        outside=np.ones(prior.shape,bool);outside[sl]=False
        rows.append({'frame':index,'sourceSha256':sha(RECOVERED/f'rgb/rgb_{index:04d}.png'),
            'outsideInspectionBoxAlphaExact':bool(np.array_equal(alpha[outside],prior[outside])),
            'currentMovingOccluderAlphaExact':bool(np.array_equal(alpha[sl][blocked[index]],prior[sl][blocked[index]])),
            'changedAlphaPixels':int(np.count_nonzero(alpha!=prior)),'seconds':time.monotonic()-started})
        print(json.dumps(rows[-1]),flush=True)
        write_json(args.out/'receipt.json',{'rows':rows,'inspectionBoxNotAuthoredContour':box,
            'modelWeightsChanged':False,'backgroundEstimateNotPhotographed':True,
            'weakPersonProtectionAnchoredToSelectedSilhouette':args.anchor_weak,
            'sourceRgbFrozen':False,'newLearnedEstimator':False,'sameCanonicalForegroundRecovery':True,
            'nativeAdmission':False,'registeredImplementationChanged':False,'visualReviewPending':True,
            'fourMinuteProof':False,'paidCloudInference':False,'providerUpload':False})


if __name__=='__main__':main()
