"""Source-photographed opacity refinement for independently tracked details.

No learned weights or foreground RGB are synthesized here. Opaque source
material and repeatedly photographed B provide a bounded alpha posterior;
unknown reference pixels and unrelated deep body interiors remain exact.
The caller restores authored clicks/holdouts after this local correction.
"""
import cv2
import numpy as np
from scipy.sparse import diags
from scipy.sparse.linalg import cg, LinearOperator


def material_posterior(c, b, samples, *, noise=4/255, clusters=6):
    """Marginal RGB likelihood with a Gaussian mixture prior on true F.

    C|a,k ~ N(a*mu_k+(1-a)*B, a*a*Sigma_k+sigma_noise*I).
    Accumulate log probabilities stably over all 65 opacities and clusters;
    recover F from that SAME posterior, rather than an obsolete matte.
    """
    assert samples.shape[0] >= 64 and c.shape == b.shape
    samples = samples.astype(np.float32)
    cv2.setRNGSeed(0)
    _, labels, means = cv2.kmeans(samples, clusters, None,
        (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_MAX_ITER, 50, 1e-5), 1, cv2.KMEANS_PP_CENTERS)
    covariance = []
    count = []
    for number in range(clusters):
        values = samples[labels[:, 0] == number]
        covariance.append(np.cov(values.T) + np.eye(3)*(2/255)**2 if len(values) > 3 else np.eye(3)*(.02**2))
        count.append(len(values))
    n = len(c)
    maximum = np.full(n, -np.inf)
    mass, opacity = np.zeros(n), np.zeros(n)
    foreground = np.zeros((n, 3))
    second = np.zeros(n)
    for mu, sigma, weight in zip(means, covariance, count):
        for a in np.linspace(0, 1, 65):
            matrix = a*a*sigma + noise*noise*np.eye(3)
            inverse = np.linalg.inv(matrix)
            residual = c - (a*mu + (1-a)*b)
            logp = -.5*np.einsum('ni,ij,nj->n', residual, inverse, residual)
            logp -= .5*np.linalg.slogdet(matrix)[1]
            logp += np.log(weight/len(samples))
            # Trapezoid integration preserves the probability of endpoints.
            if a in (0, 1):
                logp += np.log(.5)
            next_maximum = np.maximum(maximum, logp)
            old = np.exp(maximum-next_maximum)
            following = np.exp(logp-next_maximum)
            conditional = mu + a*(residual @ (sigma @ inverse).T)
            mass = mass*old + following
            opacity = opacity*old + following*a
            second = second*old + following*a*a
            # Accumulate premultiplied F, which has a well-defined posterior
            # even when a=0; arbitrary invisible F cannot contaminate edges.
            foreground = foreground*old[:, None] + following[:, None]*a*conditional
            maximum = next_maximum
    a = opacity/mass
    premul = foreground/mass[:, None]
    f = premul/np.maximum(a[:, None], 1e-8)
    variance = np.maximum(second/mass-a*a, 0)
    return a.clip(0, 1), f.clip(0, 1), variance, {
        'clusterMeans': means.tolist(), 'clusterCounts': count,
        'noiseCodeValues': noise*255, 'opacitySamples': 65,
        'meanPosteriorAlphaStd': float(np.sqrt(variance).mean())}


def regularize_opacity(target, prior, domain, rgb, variance, strength):
    """Fit continuous opacity in source RGB edges, with exact exterior seeds.

    Noise amplified by independent per-pixel inversions is not a physical
    finger boundary. A posterior-variance weighted solve joins those pixels;
    photographed edges keep a smaller conductance. No temporal pose is held.
    """
    assert 0 < strength <= 30
    if not domain.any():return target.copy()
    yy,xx=np.where(domain)
    x0,y0=max(0,int(xx.min())-2),max(0,int(yy.min())-2)
    x1,y1=min(domain.shape[1],int(xx.max())+3),min(domain.shape[0],int(yy.max())+3)
    sl=np.s_[y0:y1,x0:x1];mask=domain[sl];C=rgb[sl].astype(float)/255
    h,w=mask.shape;n=h*w
    # Large RGB jumps mark actual edges. At low contrast / motion blur the
    # posterior has greater variance and receives a continuous spatial prior.
    right=np.zeros((h,w));down=np.zeros((h,w))
    right[:,:-1]=np.exp(-np.sum(np.diff(C,axis=1)**2,axis=2)/(.06**2))
    down[:-1]=np.exp(-np.sum(np.diff(C,axis=0)**2,axis=2)/(.06**2))
    rr=right.ravel()[:-1];dd=down.ravel()[:-w]
    adjacency=diags([rr,rr,dd,dd],[1,-1,w,-w],shape=(n,n),format='csr')
    degree=np.asarray(adjacency.sum(1)).ravel()
    confidence=np.clip(.015/(variance[sl]+.003),.25,5)
    confidence[~mask]=10000
    desired=np.where(mask,target[sl],prior[sl])
    matrix=diags(confidence.ravel()+strength*degree)-strength*adjacency
    diagonal=confidence.ravel()+strength*degree
    result,info=cg(matrix,(confidence*desired).ravel(),x0=desired.ravel(),
        M=LinearOperator((n,n),matvec=lambda v:v/diagonal),rtol=1e-6,maxiter=300)
    if info:raise ValueError('Opacity regularizer did not converge')
    output=target.copy();output[sl][mask]=result.reshape(h,w)[mask].clip(0,1)
    return output


def refine_photographed_opacity(rgb, prior, background, observed, primary, moving_components):
    """Subtract unsupported opacity with current independently selected material.

    A nonmatching material or no observed background is an explicit no-op.
    Sparse hand-colour evidence cannot authorize changing unknown B, distant
    foreground, primary-body cores, or another unselected part of a person.
    This is a local qualification candidate, not a general clean-matte claim.
    """
    shape=prior.shape
    if (prior.ndim!=2 or prior.dtype!=np.uint8 or rgb.dtype!=np.uint8
            or rgb.shape!=(*shape,3) or background.shape!=rgb.shape
            or background.dtype!=np.uint8 or primary.shape!=shape or primary.dtype!=np.uint8
            or observed.shape!=shape or observed.dtype!=bool
            or any(p.shape!=shape or p.dtype!=np.uint8 for p in moving_components)):
        raise ValueError('Photographed opacity geometry or type differs')
    result=prior.astype(np.float64)/255
    C=rgb.astype(np.float64)/255;B=background.astype(np.float64)/255
    body=cv2.distanceTransform((primary>=128).astype(np.uint8),cv2.DIST_L2,5)>32
    union=primary.copy()
    for plane in moving_components:np.maximum(union,plane,out=union)
    empty=(cv2.dilate((union>=24).astype(np.uint8),np.ones((31,31),np.uint8))==0)&observed
    rows=[]
    for number,hand in enumerate(moving_components):
        ys,xs=np.where(hand>=64)
        if not len(xs):
            rows.append({'component':number,'status':'empty_selection_no_change'});continue
        if max(int(xs.max()-xs.min()+1),int(ys.max()-ys.min()+1))>1024:
            rows.append({'component':number,'status':'not_a_bounded_detail_no_change'});continue
        depth=cv2.distanceTransform((hand>=224).astype(np.uint8),cv2.DIST_L2,5)
        domain=cv2.dilate((hand>=64).astype(np.uint8),np.ones((31,31),np.uint8))>0
        eligible=domain&observed&~(body&(hand<32))&(depth<32)
        if not eligible.any():
            rows.append({'component':number,'status':'no_photographed_background_no_change'});continue
        # Repeated old observations do not prove that a TV/room is unchanged
        # NOW. Require current unselected source pixels beside this detail to
        # agree with the reference. A changed exposure or too little evidence
        # cannot authorize subtracting opacity from a moving person.
        sl=np.s_[max(0,int(ys.min())-55):min(shape[0],int(ys.max())+56),
                 max(0,int(xs.min())-55):min(shape[1],int(xs.max())+56)]
        known=empty[sl]
        if known.sum()<128:
            rows.append({'component':number,'status':'insufficient_current_background_no_change'});continue
        delta=rgb[sl].astype(np.int16)[known]-background[sl].astype(np.int16)[known]
        offset=np.median(delta,axis=0);p95=np.percentile(np.abs(delta),95,axis=0)
        if np.max(np.abs(offset))>12 or np.max(p95)>24:
            rows.append({'component':number,'status':'current_background_changed_no_change',
                'medianOffset255':offset.tolist(),'p95Residual255':p95.tolist()});continue
        material=(depth>10)&(prior>=254)&(C[...,0]-C[...,2]>.025)
        material&=(C[...,1]-C[...,2]>-.01)&(C.sum(2)>.12)
        if material.sum()<192:
            rows.append({'component':number,'status':'insufficient_current_material_no_change'});continue
        # Colour-model samples and opaque constraints have different roles.
        # A cool-lit wrist can be solid current hand material while failing
        # the warm sampling predicate above. Applying that warm model to its
        # deep, already opaque source pixels washes the wrist into the set.
        # Preserve these current interiors without using them to change the
        # qualified colour model. A photographed background match is still
        # eligible: a coarse hand mask may enclose a genuine finger gap.
        opaque_anchors=(depth>10)&(prior>=254)
        background_match=observed&(np.max(np.abs(
            rgb.astype(np.int16)-background.astype(np.int16)),axis=2)<8)
        opaque_anchors&=~background_match
        opaque_anchors|=material
        eligible&=~opaque_anchors
        if not eligible.any():
            rows.append({'component':number,'status':'no_mixed_current_detail_no_change'});continue
        target,_,variance,detail=material_posterior(C[eligible],B[eligible],C[material][::3])
        estimate=result.copy();estimate[eligible]=target
        uncertainty=np.zeros(shape);uncertainty[eligible]=variance
        estimate=regularize_opacity(estimate,result,eligible,rgb,uncertainty,4)
        target=estimate[eligible]
        weight=np.minimum(cv2.distanceTransform(domain.astype(np.uint8),cv2.DIST_L2,5)[eligible]/8,1)
        weight*=np.clip((32-depth[eligible])/12,0,1)
        old=result[eligible].copy()
        weight*=np.clip((old-target)/.06,0,1)
        target=np.minimum(old,target)
        result[eligible]=old*(1-weight)+target*weight
        rows.append({'component':number,'status':'applied','currentOpaqueMaterialPixels':int(material.sum()),
            'photographedEligiblePixels':int(eligible.sum()),'currentEmptyReferencePixels':int(known.sum()),
            'medianOffset255':offset.tolist(),'p95Residual255':p95.tolist(),**detail})
    output=np.rint(result.clip(0,1)*255).astype(np.uint8)
    if np.any(output>prior):raise ValueError('Photographed opacity cannot add foreground')
    return output,{'algorithm':'photographed_material_colour_independent_opaque_anchors_v3','rows':rows,
        'changedPixels':int(np.count_nonzero(output!=prior)),'sourceRgbChanged':False,
        'currentOpaqueMaterialAnchorsPreserved':True,
        'foregroundColourRecovery':'canonical compositor after final corrected alpha',
        'visualQualification':'actual movement and occlusion review required'}


def refine_photographed_sequence(rgb_dir,masks,guidance,background,observed,holdout,*,count):
    """Run the same operation on saved model masks, then restore human intent."""
    from PIL import Image
    from model_workers.adapters.temporal_alpha import condition_trimap_clicks
    directory,manifest=guidance
    if not 1<=count<=720 or holdout.dtype!=bool or holdout.shape!=observed.shape:
        raise ValueError('Photographed sequence bounds differ')
    rows=[]
    for index in range(count):
        rgb=np.asarray(Image.open(rgb_dir/f'rgb_{index:04d}.png'))
        parts=[(c['selection'],np.asarray(Image.open(directory/c['frames'][index]['file'])))
               for c in manifest['components']]
        alpha=np.asarray(Image.open(masks/f'matte_{index:04d}.png'))
        moving=[plane for selection,plane in parts[1:] if selection.get('propagate',True)]
        values,detail=refine_photographed_opacity(rgb,alpha,background,observed,parts[0][1],moving)
        values=condition_trimap_clicks(values,rgb,manifest['_reference_rgb'],parts,index)
        values[holdout]=255
        Image.fromarray(values).save(masks/f'matte_{index:04d}.png')
        rows.append({'frame':index,**detail})
        if index%12==0:
            import json
            print(json.dumps({'event':'photographed_material_opacity','index':index,'total':count}),flush=True)
    return {'rows':rows,'newLearnedWeights':False,'authoredClicksAndHoldoutsRestored':True,
        'unobservedReferenceCannotAuthorizeChanges':True}

