"""Source-guided temporal alpha. No model weights or invented foreground pixels.

Flow is only evidence for adjacent-frame agreement; photometric changes and
forward/backward inconsistency reject it. Corrections are temporal boundaries.
"""
from pathlib import Path
import cv2
import numpy as np
from PIL import Image


def make_trimap(selected, radius, evidence=None, weak_evidence_region=None):
    selected=selected.astype(np.uint8)
    kernel=cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(2*radius+1,)*2)
    core=cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(2*min(radius,3)+1,)*2)
    inside=cv2.erode(selected,core)>0
    # Ordinary erosion removes every known-FG seed from thin microphone rails.
    # Retain medial high-confidence pixels without expanding their silhouette.
    distance=cv2.distanceTransform(selected,cv2.DIST_L2,5)
    medial=(distance>=cv2.dilate(distance,np.ones((3,3),np.uint8))-.01)&(distance>=1)&(distance<=radius)
    inside|=medial
    if evidence is not None:
        # Low SAM logits are not opacity and can cover whole photographed wall
        # panels far from the selected object. Only adjacent weak evidence may
        # widen the band; otherwise matting turns that room into a ghost layer.
        # SAM logits are not calibrated opacity: never make solid selected
        # interiors translucent merely because their logits are modest.
        nearby=cv2.dilate(selected,np.ones((5,5),np.uint8))>0
        if weak_evidence_region is not None:
            if weak_evidence_region.shape!=selected.shape:raise ValueError('Object evidence region must match source geometry')
            nearby|=weak_evidence_region.astype(bool)
        selected=np.maximum(selected,((evidence>=24)&nearby).astype(np.uint8))
    trimap=np.full(selected.shape,128,np.uint8)
    trimap[cv2.dilate(selected,kernel)==0]=0;trimap[inside]=255
    return trimap


def polish_trimap(alpha,radius):
    kernel=cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(2*radius+1,)*2)
    inside=cv2.erode((alpha>=254).astype(np.uint8),np.ones((3,3),np.uint8))>0
    outside=cv2.dilate((alpha>1).astype(np.uint8),kernel)==0
    trimap=np.full(alpha.shape,128,np.uint8);trimap[inside]=255;trimap[outside]=0
    return trimap


def aligned_neighbor(current, neighbor, alpha):
    h,w=current.shape[:2]
    current_gray=cv2.cvtColor(current,cv2.COLOR_RGB2GRAY)
    neighbor_gray=cv2.cvtColor(neighbor,cv2.COLOR_RGB2GRAY)
    flow=cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM).calc(current_gray,neighbor_gray,None)
    reverse=cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM).calc(neighbor_gray,current_gray,None)
    x,y=np.meshgrid(np.arange(w,dtype=np.float32),np.arange(h,dtype=np.float32))
    mx=x+flow[:,:,0];my=y+flow[:,:,1]
    warp=lambda v:cv2.remap(v,mx,my,cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)
    inconsistency=np.linalg.norm(flow+warp(reverse),axis=2)
    photo=np.mean(np.abs(current.astype(np.float32)-warp(neighbor).astype(np.float32)),axis=2)
    confidence=np.exp(-photo/12)*np.exp(-(inconsistency/.8)**2)
    confidence[(mx<0)|(mx>w-1)|(my<0)|(my>h-1)|(photo>32)|(inconsistency>1.5)]=0
    return warp(alpha),confidence


def stabilize(rgb_dir, masks, trimap_dir, count, boundaries=(), repair_outliers=False):
    cv2.setNumThreads(4)
    raw=masks.parent/'independent_alphas';raw.mkdir()
    for f in masks.glob('matte_*.png'):f.rename(raw/f.name)
    changes=[]
    for index in range(count):
        rgb=np.array(Image.open(rgb_dir/f'rgb_{index:04d}.png'))
        alpha=np.array(Image.open(raw/f'matte_{index:04d}.png')).astype(np.float32)/255
        trimap=np.array(Image.open(trimap_dir/f'trimap_{index:04d}.png'))
        total=alpha*2;weight=np.full(alpha.shape,2,np.float32)
        candidates=[]
        neighbors=[index-1,index+1]
        if repair_outliers:
            # At a correction boundary, both votes must come from the same
            # corrected interval. Never pull the old selection across it.
            start=max([0]+[b for b in boundaries if b<=index])
            end=min([count]+[b for b in boundaries if b>index])
            neighbors=sorted([i for i in range(max(start,index-2),min(end,index+3)) if i!=index],key=lambda i:abs(i-index))[:2]
        for neighbor in neighbors:
            if neighbor<0 or neighbor>=count or max(index,neighbor) in boundaries:continue
            other=np.array(Image.open(rgb_dir/f'rgb_{neighbor:04d}.png'))
            other_alpha=np.array(Image.open(raw/f'matte_{neighbor:04d}.png')).astype(np.float32)/255
            aligned,confidence=aligned_neighbor(rgb,other,other_alpha)
            # Large alpha disagreement often marks a missed occlusion. Never
            # invent a ghost by smoothing it into the current authoritative mask.
            if repair_outliers:candidates.append((aligned,confidence.copy()))
            confidence[np.abs(aligned-alpha)>.25]=0
            confidence*=.6*(trimap==128)
            total+=aligned*confidence;weight+=confidence
        fused=total/weight
        if repair_outliers and len(candidates)==2:
            (a,ca),(b,cb)=candidates
            agreement=(ca>.65)&(cb>.65)&(np.abs(a-b)<.12)&(trimap==128)
            consensus=(a*ca+b*cb)/np.maximum(ca+cb,1e-6)
            outlier=agreement&(np.abs(alpha-consensus)>.25)
            fused[outlier]=consensus[outlier]
        fused[trimap==0]=0;fused[trimap==255]=1
        values=np.rint(fused*255).astype(np.uint8)
        Image.fromarray(values).save(masks/f'matte_{index:04d}.png')
        changes.append(float(np.max(np.abs(fused-alpha))))
    return {'algorithm':'source_flow_consensus_v2' if repair_outliers else 'source_flow_consistency_v1','frames':count,'correctionBoundaries':list(boundaries),
            'maximumAlphaChange':max(changes),'visualGate':'requires actual moving/occlusion review'}


def stabilize_stationary_source(rgb_dir, masks, trimap_dir, count, boundaries=(), correction_regions=None):
    """Remove opacity chatter only where the photographed surface stays put.

    A fixed replacement can appear to swim when the independently inferred
    alpha changes on an unchanged chair, rig or original-room pixel. Adjacent
    flow does not establish a stable reference there. Use the robust alpha
    consensus within each correction interval, gated by ALL source RGB frames
    and their immediate neighbourhood. Moving/occluded pixels retain their
    per-frame result. Model-generated trimap seeds can themselves chatter, so
    they are not treated as new human clicks. A corrective interval remains
    independent in its affected object box; other objects use the whole shot.
    The source image itself is never frozen or warped.
    """
    intervals=sorted({0,count,*boundaries}); records=[]
    def apply(start,end,selection=None):
        if end-start<8:
            records.append({'start':start,'end':end,'status':'insufficient_source_frames'});return
        low=high=None; alphas=[]
        for index in range(start,end):
            rgb=np.asarray(Image.open(rgb_dir/f'rgb_{index:04d}.png')).astype(np.int16)
            if low is None:low=rgb.copy();high=rgb.copy()
            else:np.minimum(low,rgb,out=low);np.maximum(high,rgb,out=high)
            alphas.append(np.asarray(Image.open(masks/f'matte_{index:04d}.png')))
        stable=np.max(high-low,axis=2)<=12
        # A stable-colour pixel next to an occlusion is not a stationary
        # surface observation. Reject its entire local boundary neighbourhood.
        stable=cv2.erode(stable.astype(np.uint8),np.ones((3,3),np.uint8))>0
        if selection is not None:stable&=selection
        alphas=np.stack(alphas); reference=np.rint(np.median(alphas,axis=0)).astype(np.uint8)
        changed=0;maximum=0
        for offset,index in enumerate(range(start,end)):
            current=alphas[offset]
            result=np.where(stable,reference,current).astype(np.uint8)
            difference=np.abs(result.astype(np.int16)-current.astype(np.int16))
            changed+=int(np.count_nonzero(difference));maximum=max(maximum,int(difference.max()))
            Image.fromarray(result).save(masks/f'matte_{index:04d}.png')
        records.append({'start':start,'end':end,'status':'applied','stableSourcePixels':int(stable.sum()),
            'changedPixelFrames':changed,'maximumAlphaChange255':maximum})
    # Without object-specific correction metadata, remain conservative and
    # keep every boundary global. With it, never reset the unrelated chair,
    # plant or backdrop just because one microphone received a new click.
    corrected=None
    if boundaries and correction_regions is not None:
        sample=np.asarray(Image.open(masks/'matte_0000.png'));h,w=sample.shape
        corrected=np.zeros((h,w),bool)
        for boundary in boundaries:
            boxes=correction_regions.get(boundary)
            if not boxes:corrected[:]=True;break
            for x0,y0,x1,y1 in boxes:
                margin=16
                corrected[max(0,round(y0*h)-margin):min(h,round(y1*h)+margin),
                    max(0,round(x0*w)-margin):min(w,round(x1*w)+margin)]=True
        apply(0,count,~corrected)
    for start,end in zip(intervals,intervals[1:]):apply(start,end,corrected)
    return {'algorithm':'stationary_source_alpha_consensus_v1','sourceRgbMaximumRange255':12,
        'stableNeighbourhoodPixels':3,'reference':'median within the same corrective interval',
        'sourcePixelsFrozen':False,'modelSeedChatterCorrected':True,
        'objectScopedCorrectionBoundaries':correction_regions is not None,'intervals':records}
