"""Source-resolution moving-detail refinement using observed source background.

Only repeatedly observed, unselected source pixels may constrain background.
No full empty plate, generated pixels, or fixed hand silhouette is assumed.
"""
import json
from pathlib import Path
import cv2
import numpy as np
from PIL import Image


def observed_background(observations, *, minimum_observations=3, tolerance=8):
    """Return photographed RGB and support; never fill unobserved pixels.

    Input pairs are actual RGB frames and their independently unselected masks.
    A reference must agree with separated observations; changing/occluded
    regions cannot become background simply because a temporal median wins.
    """
    if minimum_observations<3 or tolerance<0:raise ValueError('Unsafe background evidence bounds')
    rows=list(observations)
    if len(rows)<minimum_observations:raise ValueError('Insufficient source observations')
    shape=rows[0][1].shape
    reference=np.zeros((*shape,3),np.uint8);present=np.zeros(shape,bool)
    for _,(rgb,known) in reversed(list(enumerate(rows))):
        if rgb.shape!=(*shape,3) or known.shape!=shape or known.dtype!=bool:raise ValueError('Observed source geometry/type differs')
        use=known&~present;reference[use]=rgb[use];present|=known
    counts=np.zeros(shape,np.uint16);first=np.full(shape,65535,np.uint16);last=np.zeros(shape,np.uint16)
    for i,(rgb,known) in enumerate(rows):
        match=known&present&(np.max(np.abs(rgb.astype(np.int16)-reference.astype(np.int16)),axis=2)<=tolerance)
        counts[match]+=1;first[match]=np.minimum(first[match],i);last[match]=i
    valid=(counts>=minimum_observations)&((last.astype(np.int32)-first)>=2)
    return reference,valid,counts


def detail_trimap(base, hand, union, rgb, background, observed):
    if (base.shape!=hand.shape or base.shape!=union.shape or base.shape!=observed.shape
        or rgb.shape!=background.shape or rgb.shape!=(*base.shape,3)):raise ValueError('Detail geometry differs')
    binary=(hand>=128).astype(np.uint8)
    domain=(cv2.dilate(binary,np.ones((31,31),np.uint8))>0)&observed
    tri=base.copy();tri[domain]=128
    difference=np.linalg.norm(rgb.astype(np.float32)-background.astype(np.float32),axis=2)
    tri[domain&(difference<8)]=0
    # A large model seed inside an actual blurred finger gap is not opacity.
    # Small high-confidence interior seeds suffice for the local neural pass;
    # a separate gradual interior restore below preserves solid palms.
    deep_hand=cv2.erode((hand>=224).astype(np.uint8),np.ones((65,65),np.uint8))>0
    # Internal dark print is not an exterior edge. Preserve existing opaque
    # body seeds when a hand-detail tile overlaps an enclosed shirt-mask hole.
    body_mask=(union>=128).astype(np.uint8)
    flood=body_mask.copy();padded=np.pad(flood,1);cv2.floodFill(padded,None,(0,0),1)
    body_mask|=(padded[1:-1,1:-1]==0).astype(np.uint8)
    body=cv2.distanceTransform(body_mask,cv2.DIST_L2,5)>48
    tri[domain&(deep_hand|body)&(base==255)]=255
    return tri,domain


def merge_detail_alpha(prior, inferred, hand, domain, observed):
    if any(x.shape!=prior.shape for x in [inferred,hand,domain,observed]):raise ValueError('Detail merge geometry differs')
    if not np.isfinite(inferred).all():raise ValueError('Nonfinite detail alpha')
    allowed=domain&observed
    weight=np.minimum(cv2.distanceTransform(allowed.astype(np.uint8),cv2.DIST_L2,5)/12,1)
    old=prior.astype(np.float64)/255
    candidate=old*(1-weight)+np.clip(inferred,0,1)*weight
    depth=cv2.distanceTransform((hand>=224).astype(np.uint8),cv2.DIST_L2,5)
    # This smooth interior restoration cannot grow the silhouette or add any
    # foreground outside the original current-frame matte. It does not hold
    # a hand at its earlier pose. Thin blurred fingers retain neural alpha.
    core=np.clip((depth-16)/12,0,1)
    candidate=np.maximum(candidate,old*core)
    result=prior.copy();result[allowed]=np.rint(candidate[allowed]*255).astype(np.uint8)
    return result


def measured_motion_trimap(prior, hand, primary, rgb, background, observed, motion):
    """Release false opaque seeds at an independently tracked moving edge.

    A blurred finger is not solid merely because the tracker labels it so.
    Deep current body/clothing cores and unrelated primary pixels remain
    protected. All constraints come from this frame and observed source RGB.
    """
    from model_workers.adapters.temporal_alpha import polish_trimap
    shape = prior.shape
    if (any(a.shape != shape for a in [hand, primary, observed, motion])
            or rgb.shape != (*shape, 3) or background.shape != rgb.shape
            or not np.isfinite(motion).all()):
        raise ValueError('Measured moving-detail geometry differs')
    tri = polish_trimap(prior, 8)
    domain = (cv2.dilate((hand >= 64).astype(np.uint8), np.ones((31,31), np.uint8)) > 0) & observed
    unrelated = (primary >= 128) & (hand < 32)
    domain &= ~unrelated
    depth = cv2.distanceTransform((hand >= 224).astype(np.uint8), cv2.DIST_L2, 5)
    release = domain & (motion > 4) & (depth < np.maximum(24, motion+8))
    tri[release] = 128
    body = cv2.morphologyEx((primary >= 224).astype(np.uint8), cv2.MORPH_CLOSE, np.ones((7,7), np.uint8))
    keep = (cv2.distanceTransform(body, cv2.DIST_L2, 5) > 48) & (prior >= 254)
    tri[keep] = 255
    delta = np.max(np.abs(rgb.astype(np.int16)-background.astype(np.int16)), axis=2)
    tri[domain & (delta < 8) & ~keep] = 0
    return tri, domain


def foreground_colour_support(rgb,background,colours):
    """Reject alterations to other materials beside an independently kept object.

    Colours are actual positive-click source patches for this component. They
    can bound where a detail model acts, never supply replacement RGB or prove
    that skin-coloured original background must be foreground.
    """
    if rgb.shape!=background.shape or rgb.ndim!=3 or rgb.shape[2]!=3:raise ValueError('Colour-support geometry differs')
    colours=np.asarray(colours,dtype=np.float32)
    if colours.ndim!=2 or colours.shape[1]!=3 or not len(colours):return np.zeros(rgb.shape[:2],bool)
    delta=rgb.astype(np.float32)-background.astype(np.float32);best=np.full(rgb.shape[:2],np.inf,np.float32)
    for colour in np.unique(colours,axis=0):
        vector=colour-background;contrast=np.sum(vector*vector,axis=2)
        alpha=np.clip(np.sum(delta*vector,axis=2)/np.maximum(contrast,1),0,1)
        residual=np.sqrt(np.mean((delta-alpha[...,None]*vector)**2,axis=2))
        best=np.minimum(best,np.where(contrast>30**2,residual,np.inf))
    return best<10


def _detail_source_evidence(parent_cache,directory,components,index,*,independent_source=False,foreground_holdout=None,rgb=None,reference=None):
    """Keep fresh photographed evidence independent of an older alpha result."""
    planes=[np.asarray(Image.open(directory/component['frames'][index]['file']))for component in components]
    if independent_source:
        from model_workers.adapters.temporal_alpha import independent_selection_evidence,condition_trimap_clicks
        holdout=np.zeros(planes[0].shape,bool) if foreground_holdout is None else foreground_holdout
        union=independent_selection_evidence(planes,holdout)
        if rgb is None or reference is None:raise ValueError('Fresh photographed evidence requires current source and click reference')
        union=condition_trimap_clicks(union,rgb,reference,
            [(component['selection'],plane)for component,plane in zip(components,planes)],index)
        union[holdout]=255
        return union
    union=parent_cache.frame(index).copy()
    for plane in planes:np.maximum(union,plane,out=union)
    return union


def refine_moving_details(rgb_dir, masks, trimaps, guidance, parent_cache, model, *, count, device='cpu', measured_motion=False, independent_source=False, foreground_holdout=None):
    """Reuse the pinned ViTMatte model in source-size moving-component tiles."""
    import torch
    from model_workers.adapters.temporal_alpha import condition_trimap_clicks, source_motion_radius
    directory,manifest=guidance
    moving=[c for c in manifest['components'][1:] if c['selection'].get('propagate',True)]
    if getattr(parent_cache,'manifest',{}).get('shot_cuts', []):
        return {'frames':count,'tiles':0,'reason':'Photographed detail evidence requires one camera shot'}
    # Include nearby first/last frames as well as separated observations.
    # Uniform sampling alone can miss a genuine late-revealed finger gap.
    # These are all actual within-shot source frames, never another camera.
    indices=sorted(set(np.linspace(0,count-1,min(16,count)).round().astype(int).tolist())|
        set(range(min(3,count)))|set(range(max(0,count-3),count)))
    if len(indices)<3:return {'frames':count,'tiles':0,'reason':'Insufficient within-shot observations'}
    observations=[]
    for i in indices:
        rgb=np.asarray(Image.open(rgb_dir/f'rgb_{i:04d}.png'))
        union=_detail_source_evidence(parent_cache,directory,manifest['components'],i,
            independent_source=independent_source,foreground_holdout=foreground_holdout,
            rgb=rgb,reference=manifest.get('_reference_rgb'))
        known=cv2.dilate((union>=24).astype(np.uint8),np.ones((21,21),np.uint8))==0
        observations.append((rgb,known))
    reference,observed,support=observed_background(observations)
    evidence=masks.parent/'observed_detail';evidence.mkdir()
    Image.fromarray(reference).save(evidence/'photographed-reference.png');Image.fromarray(observed.astype(np.uint8)*255).save(evidence/'observed-support.png')
    source_diagnostics={'sourceMaskEvidence':'independent_current_component_tracks' if independent_source else 'parent_plus_component_tracks',
        'explicitForegroundHoldoutsExcludedFromBackground':bool(independent_source and foreground_holdout is not None),
        'sourceBoundClicksConditionBackgroundEvidence':independent_source}
    if not moving:
        # The primary person's movement also exposes real background. Keep
        # that evidence even without extra hand selections; opacity does not
        # change and no detail-network inference is needed in this branch.
        return {'frames':count,'tiles':0,'observations':indices,'backgroundEvidenceOnly':True,**source_diagnostics,
            'reason':'No independently tracked moving details; photographed evidence retained'}
    palettes={}
    for component in moving:
        selection=component['selection'];samples=[]
        for prompt in [{'frameIndex':0,'points':selection.get('points',[])},*selection.get('shotPrompts',[])]:
            picture=np.asarray(Image.open(rgb_dir/f"rgb_{prompt['frameIndex']:04d}.png"));h,w=picture.shape[:2]
            for point in prompt['points']:
                if point['label']!=1:continue
                x=min(w-1,round(point['position'][0]*w));y=min(h-1,round(point['position'][1]*h))
                samples.extend(picture[max(0,y-1):min(h,y+2),max(0,x-1):min(w,x+2)].reshape(-1,3))
        palettes[selection['id']]=np.asarray(samples,np.float32)
    tiles=[]
    for index in range(count):
        rgb=np.asarray(Image.open(rgb_dir/f'rgb_{index:04d}.png'))
        prior=np.asarray(Image.open(masks/f'matte_{index:04d}.png')).copy()
        tri=np.asarray(Image.open(trimaps/f'trimap_{index:04d}.png')).copy()
        union=_detail_source_evidence(parent_cache,directory,manifest['components'],index,
            independent_source=independent_source,foreground_holdout=foreground_holdout,
            rgb=rgb,reference=manifest.get('_reference_rgb'))
        motion = None
        if measured_motion:
            neighbour = index-1 if index else 1
            motion = source_motion_radius(rgb,np.asarray(Image.open(rgb_dir/f'rgb_{neighbour:04d}.png')),1)
        primary = np.asarray(Image.open(directory/manifest['components'][0]['frames'][index]['file']))
        click_components=[(c['selection'],np.asarray(Image.open(directory/c['frames'][index]['file'])))
                          for c in manifest['components']]
        for component in moving:
            hand=np.asarray(Image.open(directory/component['frames'][index]['file']))
            ys,xs=np.where(hand >= (64 if measured_motion else 128))
            if not len(xs):continue
            x0,y0=max(0,int(xs.min())-55),max(0,int(ys.min())-55)
            x1,y1=min(rgb.shape[1],int(xs.max())+56),min(rgb.shape[0],int(ys.max())+(76 if measured_motion else 56))
            if max(x1-x0,y1-y0)>1024:continue # Never downscale an oversized body into a detail tile.
            sl=np.s_[y0:y1,x0:x1];local=rgb[sl];base=tri[sl];h,w=base.shape
            # Check current unselected pixels against observed RGB to reject
            # camera/screen changes. Unknown plate regions cannot vote.
            empty=(cv2.dilate((union>=24).astype(np.uint8),np.ones((31,31),np.uint8))==0)[sl]&observed[sl]
            if empty.sum()<128:continue
            offset=np.median(local.astype(np.float32)[empty]-reference[sl].astype(np.float32)[empty],axis=0)
            if np.max(np.abs(offset))>12:continue
            background=np.clip(reference[sl].astype(np.float32)+offset,0,255)
            error=np.linalg.norm(local.astype(np.float32)-background,axis=2)
            if np.median(error[empty])>8:continue
            conditioned,domain=(measured_motion_trimap(prior[sl],hand[sl],primary[sl],local,background,observed[sl],motion[sl])
                if measured_motion else detail_trimap(base,hand[sl],union[sl],local,background,observed[sl]))
            # A dilated hand domain overlaps cuffs and nearby clothing. A
            # hand-colour detail estimate cannot make those other opaque
            # materials translucent. Keep their existing soft alpha exact.
            if not measured_motion:
                colour_supported=foreground_colour_support(local,background,palettes[component['selection']['id']])
                domain&=colour_supported
            conditioned[~domain]=base[~domain]
            if domain.sum()<64:continue
            # The observed-detail pass revokes old model seeds, but must not
            # revoke the user's actual corrections before neural inference.
            # Applying clicks only AFTER prediction creates isolated forced
            # pixels while the network still sees the wrong finger gap.
            # Keep source coordinates and all overlapping-object protections;
            # crop only after resolving the full source-frame constraints.
            full_trimap=tri.copy();full_trimap[sl]=conditioned
            conditioned=condition_trimap_clicks(full_trimap,rgb,manifest['_reference_rgb'],
                click_components,index)[sl]
            inp=torch.cat((torch.from_numpy(local.copy()).to(device).permute(2,0,1).float()/127.5-1,
                torch.from_numpy(conditioned).to(device)[None].float()/255),0)[None]
            inp=torch.nn.functional.pad(inp,(0,(-w)%32,0,(-h)%32),mode='replicate')
            with torch.inference_mode():predicted=model(pixel_values=inp).alphas[0,0,:h,:w].cpu().numpy().clip(0,1)
            predicted[conditioned==0]=0;predicted[conditioned==255]=1
            if measured_motion:
                weight=np.minimum(cv2.distanceTransform(domain.astype(np.uint8),cv2.DIST_L2,5)/8,1)
                prior[sl]=np.rint(prior[sl]*(1-weight)+predicted*255*weight).astype(np.uint8)
            else:
                prior[sl]=merge_detail_alpha(prior[sl],predicted,hand[sl],domain,observed[sl])
            # Revoke stale known-FG seeds for subsequent temporal fusion. The
            # actual authored click constraints are restored by the caller.
            tri[sl][domain]=conditioned[domain]
            tiles.append({'frame':index,'componentId':component['selection']['id'],'crop':[x0,y0,x1,y1],'observedPixels':int(domain.sum()),'backgroundResidual':float(np.median(error[empty]))})
        Image.fromarray(prior).save(masks/f'matte_{index:04d}.png');Image.fromarray(tri).save(trimaps/f'trimap_{index:04d}.png')
        if index%12==0:print(json.dumps({'event':'observed_moving_detail','index':index,'total':count}),flush=True)
    return {'frames':count,'tiles':len(tiles),'observations':indices,'sourceSizeNeuralTiles':True,'measuredMotionSeedRelease':measured_motion,'unobservedPixelsNeverConstrainBackground':True,'rows':tiles,**source_diagnostics}
