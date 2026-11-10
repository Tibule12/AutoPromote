"""Private per-frame source-colour refinement of the same rejected shot.

Existing matte supplies the body; reviewed head ROI and colour seeds refine ears,
scalp and jewellery against each full-resolution source frame. No engine change.
"""
from pathlib import Path
import json
import cv2
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parent
WORK=ROOT/'private/attempt-2'
OUT=WORK/'presenter'
OUT.mkdir(exist_ok=True)
cv2.setNumThreads(1)
records=[]
for index in range(72):
    rgb=np.array(Image.open(WORK/'raw'/f'{index+1:06d}.png').convert('RGB'))
    original=rgb.copy()
    old=np.array(Image.open(ROOT/'private/presenter'/f'{index+1:06d}.png').convert('RGBA'))
    alpha=cv2.resize(old[:,:,3],(1110,1000),interpolation=cv2.INTER_CUBIC).astype(np.float32)/255
    roi=rgb[125:375,390:660].copy();prior=alpha[125:375,390:660]
    mask=np.full(prior.shape,cv2.GC_PR_BGD,np.uint8)
    mask[prior>.07]=cv2.GC_PR_FGD
    solid=cv2.erode((prior>.98).astype(np.uint8),np.ones((9,9),np.uint8))>0
    mask[solid]=cv2.GC_FGD
    mask[:,:3]=cv2.GC_BGD;mask[:3,:]=cv2.GC_BGD;mask[:,-3:]=cv2.GC_BGD
    skin=(roi[:,:,0]>roi[:,:,1]*1.18)&(roi[:,:,0]>roi[:,:,2]*1.12)&(roi.max(2)<205)
    mask[skin]=cv2.GC_FGD
    bg,fg=np.zeros((1,65)),np.zeros((1,65))
    cv2.grabCut(cv2.cvtColor(roi,cv2.COLOR_RGB2BGR),mask,None,bg,fg,3,cv2.GC_INIT_WITH_MASK)
    refined=np.isin(mask,[cv2.GC_FGD,cv2.GC_PR_FGD]).astype(np.float32)
    refined=cv2.GaussianBlur(refined,(3,3),.6)
    alpha[125:355,390:660]=refined[:230]
    # Blend back inside the photographed neck rather than making a seam through
    # the shoulder/collar, as the rejected manual contour did.
    mix=np.linspace(0,1,10)[:,None]
    alpha[355:365,390:660]=refined[230:240]*(1-mix)+alpha[355:365,390:660]*mix
    alpha[:125]=0
    yy,xx=np.mgrid[:1000,:1110]
    hardware=(xx>650)&(yy>420)&(yy<620)&(rgb.max(2)<120)&((rgb.max(2).astype(float)-rgb.min(2))<65)
    neutral=np.rint(rgb[hardware].astype(float)@np.array([.2126,.7152,.0722])).astype(np.uint8)
    rgb[hardware]=neutral[:,None]
    opaque=alpha>.98
    _,labels=cv2.distanceTransformWithLabels((~opaque).astype(np.uint8),cv2.DIST_L2,5,labelType=cv2.DIST_LABEL_PIXEL)
    lookup=np.zeros((labels.max()+1,3),np.uint8);lookup[labels[opaque]]=rgb[opaque]
    edges=(alpha>.01)&(alpha<.98)
    rgb[edges]=np.rint(.15*rgb[edges]+.85*lookup[labels[edges]]).astype(np.uint8)
    col=rgb.astype(np.float32)/255
    luma=(col*np.array([.2126,.7152,.0722])).sum(2,keepdims=True)
    col=np.clip((luma+(col-luma)*.88-.025)*1.025,0,1)
    rgba=np.dstack([np.rint(col*255).astype(np.uint8),np.rint(alpha*255).astype(np.uint8)])
    Image.fromarray(rgba).save(OUT/f'{index+1:06d}.png')
    if index in [0,18,36,54,71]:
        plate=np.array([.15,.13,.15])
        review=col*alpha[:,:,None]+plate*(1-alpha[:,:,None])
        Image.fromarray(np.rint(review*255).astype(np.uint8)).save(WORK/f'matte-review-{index:02d}.png')
    records.append({'frame':index,'headForegroundPixels':int((refined>.5).sum())})
(WORK/'roto-tracking.json').write_text(json.dumps({'frames':records,'originalRGB':[1110,1000],
    'headROIInCrop':[390,125,660,375],'sourceSpecificSkinSeeds':True,'grabCutIterations':3,
    'rejected':'Whole-head affine manual contour displaced ear outlines; preserved privately, not rendered',
    'scope':'Private per-frame source-guided refinement, not a new product capability'},indent=2)+'\n')
print('Full-resolution source-guided frames:',len(records),flush=True)
