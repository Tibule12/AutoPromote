"""Source-guided temporal alpha. No model weights or invented foreground pixels.

Flow is only evidence for adjacent-frame agreement; photometric changes and
forward/backward inconsistency reject it. Corrections are temporal boundaries.
"""
from pathlib import Path
import cv2
import numpy as np
from PIL import Image


def source_click_footprint(reference, x, y, radius, foreground=False):
    """A fixed-object FG point cannot harden contrasting neighboring RGB."""
    h,w=reference.shape[:2]
    if reference.ndim!=3 or reference.shape[2]!=3 or not(0<=x<w and 0<=y<h):
        raise ValueError('Source click must be inside its RGB reference')
    x0,y0=max(0,x-radius),max(0,y-radius)
    x1,y1=min(w,x+radius+1),min(h,y+radius+1)
    footprint=np.zeros((y1-y0,x1-x0),np.uint8)
    cv2.circle(footprint,(x-x0,y-y0),radius,1,-1)
    allowed=footprint.astype(bool)
    if foreground:
        colour=np.max(np.abs(reference[y0:y1,x0:x1].astype(np.int16)
                             -reference[y,x].astype(np.int16)),axis=2)
        allowed&=colour<=32
    return x0,y0,x1,y1,allowed


def condition_trimap_clicks(trimap, rgb, reference, components, index):
    """Apply authored component clicks without erasing another kept object.

    Fixed-object clicks persist only while those photographed pixels agree.
    Moving clicks constrain their actual source frame; the tracker propagates
    the correction rather than leaving static circles on a moving subject.
    """
    result=trimap.copy();h,w=trimap.shape
    if rgb.shape!=reference.shape or rgb.shape[:2]!=trimap.shape:raise ValueError('Click source geometry differs')
    # Resolve sparse authored constraints before consulting overlapping model
    # masks. Otherwise two tracks that BOTH explicitly exclude a finger gap
    # veto each other's background correction with their stale FG evidence.
    # A genuine positive click wins, and an uncorrected overlapping object
    # still protects its pixels. Labels never persist at a moving frame's old
    # position; only the existing tracker propagates the correction.
    negative=[];positive=[]
    for number,(selection,evidence) in enumerate(components):
        if evidence.shape!=trimap.shape:raise ValueError('Click component geometry differs')
        excluded=set();included=set()
        if index==0 or not selection.get('propagate',True):points=selection.get('points',[])
        else:points=next((p['points'] for p in selection.get('shotPrompts',[]) if p['frameIndex']==index),[])
        for point in points:
            x=min(w-1,round(point['position'][0]*w));y=min(h-1,round(point['position'][1]*h))
            fixed=not selection.get('propagate',True)
            x0,y0,x1,y1,allowed=source_click_footprint(reference,x,y,2,fixed and point['label']==1)
            if fixed:allowed&=np.max(np.abs(rgb[y0:y1,x0:x1].astype(np.int16)-reference[y0:y1,x0:x1].astype(np.int16)),axis=2)<=12
            ys,xs=np.nonzero(allowed)
            (included if point['label'] else excluded).update(((ys+y0)*w+xs+x0).tolist())
        negative.append(excluded);positive.append(included)
    protected=set().union(*positive)
    for number,excluded in enumerate(negative):
        for pixel in excluded-protected:
            y,x=divmod(pixel,w)
            # A prop's negative point means "not this prop", not "erase the
            # person behind it". Moderate current clothing evidence is still
            # another kept selection; these scores are not calibrated opacity.
            # Matching explicit exclusions continue to resolve true gaps.
            if any(other!=number and plane[y,x]>=24 and pixel not in negative[other]
                   for other,(_,plane) in enumerate(components)):continue
            result[y,x]=0
    for pixel in protected:
        y,x=divmod(pixel,w);result[y,x]=255
    return result


def source_motion_radius(current, previous, radius):
    """Conservatively widen the unknown band using source-frame displacement.

    This changes no opacity by itself. Flow can only release moving-edge seeds;
    it cannot add foreground or replace current photographed pixels.
    """
    if current.shape!=previous.shape or current.ndim!=3 or current.shape[2]!=3:
        raise ValueError('Motion source geometry must agree')
    h,w=current.shape[:2];scale=min(1,720/max(h,w))
    shape=(max(12,round(w*scale)),max(12,round(h*scale)))
    gray=lambda rgb:cv2.resize(cv2.cvtColor(rgb,cv2.COLOR_RGB2GRAY),shape,interpolation=cv2.INTER_AREA)
    flow=cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM).calc(gray(current),gray(previous),None)
    magnitude=np.hypot(flow[:,:,0]*w/shape[0],flow[:,:,1]*h/shape[1])
    magnitude=cv2.resize(magnitude,(w,h),interpolation=cv2.INTER_LINEAR)
    moving=cv2.dilate(magnitude*.25,np.ones((17,17),np.uint8))
    return np.clip(moving,radius,max(radius,40)).astype(np.float32)


def enclosed_person_interiors(evidence, radius, background_points=(), moving_evidence=()):
    """Repair bounded internal semantic-mask holes, never the outer silhouette.

    Printed dark fabric can have lower SAM logits than the wall. Passing those
    enclosed pixels as known background makes an opaque shirt transparent.
    Only small enclosed holes deep inside the current person silhouette qualify.
    A real authored background example excludes its entire connected hole.
    Thin finger webs, open arm gaps and large enclosed gaps stay untouched.
    """
    binary=(evidence>=128).astype(np.uint8);h,w=binary.shape
    count,labels,stats,_=cv2.connectedComponentsWithStats(1-binary,connectivity=8)
    enclosed=np.ones(count,bool);enclosed[0]=False
    enclosed[np.unique(np.r_[labels[0],labels[-1],labels[:,0],labels[:,-1]])]=False
    for point in background_points:
        x=min(w-1,max(0,round(point[0]*w)));y=min(h-1,max(0,round(point[1]*h)))
        enclosed[labels[y,x]]=False
    filled=binary.copy();filled[enclosed[labels]]=1
    depth=cv2.distanceTransform(filled,cv2.DIST_L2,5)
    repaired=np.zeros(binary.shape,bool)
    moving=np.zeros(binary.shape,np.uint8)
    for plane in moving_evidence:
        if plane.shape!=binary.shape:raise ValueError('Moving-detail protection geometry differs')
        moving|=(plane>=128).astype(np.uint8)
    moving=cv2.dilate(moving,np.ones((31,31),np.uint8))>0
    area_limit=min(12000,max(64,round(h*w*.006)))
    for label in np.flatnonzero(enclosed):
        if stats[label,cv2.CC_STAT_AREA]>area_limit:continue
        domain=labels==label
        if np.any(domain&moving):continue
        if np.median(depth[domain])<=max(32,radius*2):continue
        repaired|=domain
    return repaired


def make_trimap(selected, radius, evidence=None, weak_evidence_region=None, fixed_evidence=None, motion_radius=None, moving_components=(), primary_evidence=None, primary_background_points=()):
    selected=selected.astype(np.uint8)
    kernel=cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(2*radius+1,)*2)
    core=cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(2*min(radius,3)+1,)*2)
    solid_person_core=np.zeros(selected.shape,bool)
    opaque_interiors=np.zeros(selected.shape,bool)
    if primary_evidence is not None:
        if primary_evidence.shape!=selected.shape:raise ValueError('Person evidence must match source geometry')
        opaque_interiors=enclosed_person_interiors(primary_evidence,radius,primary_background_points,moving_components)
        selected[opaque_interiors]=1
        # Separately selected equipment can leave a few uncertain pixels where
        # its outline meets the person's mask. Eroding those seams treats an
        # entire strip of real shirt between boom rails as a translucent edge.
        # Close only narrow seams for measuring depth, then seed only pixels
        # already strongly selected by the person track. No hole is filled in
        # the actual silhouette and no background pixel becomes a FG seed.
        joined=cv2.morphologyEx(selected,cv2.MORPH_CLOSE,
            cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(9,9)))
        solid_person_core=(cv2.distanceTransform(joined,cv2.DIST_L2,5)>max(48,radius*3))&(primary_evidence>=224)&(selected>0)
    if fixed_evidence is None:
        inside=cv2.erode(selected,core)>0
        rigid=selected
    else:
        if fixed_evidence.shape!=selected.shape:raise ValueError('Fixed-object evidence must match source geometry')
        # A tracked finger can be translucent across its entire narrow width.
        # Segmentation probability and a medial ridge cannot establish opacity.
        # Keep a full unknown band on moving subjects; only explicitly selected
        # fixed equipment may retain thin opaque seeds.
        rigid=((fixed_evidence>=128)&(selected>0)).astype(np.uint8)
        inside=(cv2.erode(selected,kernel)>0)|(cv2.erode(rigid,core)>0)
        if motion_radius is not None:
            if motion_radius.shape!=selected.shape or not np.isfinite(motion_radius).all() or np.any(motion_radius<radius):
                raise ValueError('Motion band must match source geometry and cannot narrow the edge')
            inside&=(cv2.distanceTransform(selected,cv2.DIST_L2,5)>motion_radius)|(cv2.erode(rigid,core)>0)
        inside|=solid_person_core
    # Ordinary erosion removes every known-FG seed from thin microphone rails.
    # Retain medial high-confidence pixels without expanding their silhouette.
    distance=cv2.distanceTransform(rigid,cv2.DIST_L2,5)
    medial=(distance>=cv2.dilate(distance,np.ones((3,3),np.uint8))-.01)&(distance>=1)&(distance<=radius)
    inside|=medial
    unknown_motion=np.zeros(selected.shape,bool)
    if motion_radius is not None and fixed_evidence is not None:
        for component in moving_components:
            if component.shape!=selected.shape:raise ValueError('Moving-object evidence must match source geometry')
            object_pixels=component>=128
            if not object_pixels.any() or np.percentile(motion_radius[object_pixels],50)<=max(radius,20):continue
            # An overlapping person mask must not make a blurred hand opaque
            # merely by bridging its fingers to the forearm. The independently
            # selected moving object's own core conditions that local region.
            # Weak whole-frame logits must not turn distant photographed room
            # pixels into a moving unknown region. Anchor to this object's
            # actual selected silhouette and a bounded surrounding band.
            domain=cv2.dilate(object_pixels.astype(np.uint8),np.ones((31,31),np.uint8))>0
            object_core=cv2.erode((component>=224).astype(np.uint8),np.ones((49,49),np.uint8))>0
            inside[domain]=(object_core|solid_person_core)[domain]
            unknown_motion|=domain
        # A stationary opaque mic remains foreground when a blurred hand
        # crosses it. The hand may release its own seeds, not equipment seeds.
        inside|=(cv2.erode(rigid,core)>0)|medial
    if evidence is not None:
        # Low SAM logits are not opacity and can cover whole photographed wall
        # panels far from the selected object. Only adjacent weak evidence may
        # widen the band; otherwise matting turns that room into a ghost layer.
        # SAM logits are not calibrated opacity: never make solid selected
        # interiors translucent merely because their logits are modest.
        nearby=cv2.dilate(selected,np.ones((5,5),np.uint8))>0
        weak=(evidence>=24)&nearby
        if weak_evidence_region is not None:
            if weak_evidence_region.shape!=selected.shape:raise ValueError('Object evidence region must match source geometry')
            # Separately selected fine stems may have moderate evidence away
            # from a solid core. Very weak 24–63 logits on a distant TV bezel
            # are still background, even inside an object's broad source ROI.
            weak|=(evidence>=64)&weak_evidence_region.astype(bool)
        selected=np.maximum(selected,weak.astype(np.uint8))
    trimap=np.full(selected.shape,128,np.uint8)
    trimap[cv2.dilate(selected,kernel)==0]=0
    trimap[unknown_motion]=128;trimap[inside]=255
    trimap[opaque_interiors]=255
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


def independent_selection_evidence(components, holdout):
    """Rebuild a fresh alpha solve from source-bound tracks, never old alpha.

    A previously refined mask may contain opacity/classification errors. Its
    output is not a new foreground annotation when a fresh model solve runs.
    Current person/object evidence and explicit holdouts retain ownership.
    """
    if holdout.ndim != 2 or holdout.dtype != bool or not components:
        raise ValueError('Independent selection evidence or holdout differs')
    evidence = np.zeros(holdout.shape, np.uint8)
    for plane in components:
        if plane.shape != holdout.shape or plane.dtype != np.uint8:
            raise ValueError('Independent selection evidence geometry or type differs')
        np.maximum(evidence, plane, out=evidence)
    evidence[holdout] = 255
    return evidence


def stabilize_stationary_source(rgb_dir, masks, trimap_dir, count, boundaries=(), correction_regions=None, *, selection_domain=None, maximum_source_range=12, preserve_current_background=False):
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
    if not 0<=maximum_source_range<=32:raise ValueError('Unsafe stationary source range')
    if selection_domain is not None:
        shape=np.asarray(Image.open(masks/'matte_0000.png')).shape
        if selection_domain.shape!=shape or selection_domain.dtype!=bool:raise ValueError('Stationary selection domain differs')
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
        stable=np.max(high-low,axis=2)<=maximum_source_range
        # A stable-colour pixel next to an occlusion is not a stationary
        # surface observation. Reject its entire local boundary neighbourhood.
        stable=cv2.erode(stable.astype(np.uint8),np.ones((3,3),np.uint8))>0
        if selection is not None:stable&=selection
        if selection_domain is not None:stable&=selection_domain
        alphas=np.stack(alphas); reference=np.rint(np.median(alphas,axis=0)).astype(np.uint8)
        changed=0;maximum=0
        for offset,index in enumerate(range(start,end)):
            current=alphas[offset]
            eligible=stable & (current>0) if preserve_current_background else stable
            result=np.where(eligible,reference,current).astype(np.uint8)
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
    return {'algorithm':'stationary_source_alpha_consensus_v1','sourceRgbMaximumRange255':maximum_source_range,
        'stableNeighbourhoodPixels':3,'reference':'median within the same corrective interval',
        'sourcePixelsFrozen':False,'modelSeedChatterCorrected':True,
        'currentKnownBackgroundPreserved':preserve_current_background,
        'objectScopedCorrectionBoundaries':correction_regions is not None,'explicitSelectionDomain':selection_domain is not None,'intervals':records}
