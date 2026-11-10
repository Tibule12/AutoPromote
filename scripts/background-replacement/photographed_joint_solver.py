"""Private diagnostic joint colour/opacity solve; no product admission.

Only actually photographed background and opaque current material constrain the
solution. Foreground is spatially regularised rather than switching between
independent nearest-colour labels on adjacent blurred pixels.
"""
import cv2
import numpy as np
from scipy.ndimage import distance_transform_edt
from scipy.sparse import diags
from scipy.sparse.linalg import cg, LinearOperator


def photographed_texture_opacity(current, background, observed):
    """Estimate transmission of observed fine B texture through a soft edge.

    Remove an independent affine foreground colour field in each Gaussian
    window. Correlation remaining with photographed B estimates transmission.
    Unknown reference pixels cannot participate in the regression.
    """
    C=current.astype(float)/255;B=background.astype(float)/255
    x=np.arange(-8,9,dtype=float);g=np.exp(-x*x/(2*2.5**2));g/=g.sum()
    xg=x*g;variance=float(np.sum(x*x*g))
    smooth=lambda v:cv2.sepFilter2D(v,-1,g,g,borderType=cv2.BORDER_REFLECT)
    def moments(v):
        return smooth(v),cv2.sepFilter2D(v,-1,xg,g),cv2.sepFilter2D(v,-1,g,xg)
    bc,bx,by=moments(B);cc,cx,cy=moments(C)
    var=(smooth(B*B)-bc*bc-(bx*bx+by*by)/variance).sum(2)
    cov=(smooth(C*B)-cc*bc-(cx*bx+cy*by)/variance).sum(2)
    transmission=np.divide(cov,np.maximum(var,1e-8)).clip(0,1)
    complete=cv2.erode(observed.astype(np.uint8),np.ones((17,17),np.uint8))>0
    confidence=np.clip((var-3*(3/255)**2)/(3*(20/255)**2),0,1)*complete
    return 1-transmission,confidence


def photographed_affine_transmission(current, background, observed, prior, *, radius=10):
    """Private shared RGB transmission regression with affine P and opacity.

    C = P + transmission*B, with local affine P and transmission. Photographed
    B structure supplies the regression; a textureless reference falls back to
    the existing current-source neural alpha rather than guessing a key.
    """
    C=current.astype(float)/255;B=background.astype(float)/255
    h,w=C.shape[:2]
    axis=np.arange(-radius,radius+1,dtype=float);sigma=radius/2
    g=np.exp(-axis**2/(2*sigma*sigma));g/=g.sum()
    kx=axis*g;var=float(np.sum(axis**2*g))
    avg=lambda v:cv2.sepFilter2D(v,-1,g,g,borderType=cv2.BORDER_REFLECT)
    # Schur complement removes independent per-channel affine foreground.
    cov=np.zeros((h,w));variance=np.zeros((h,w))
    for c,b in zip(C.transpose(2,0,1),B.transpose(2,0,1)):
        cb=avg(c*b);bb=avg(b*b);mc=avg(c);mb=avg(b)
        cx=cv2.sepFilter2D(c,-1,kx,g);cy=cv2.sepFilter2D(c,-1,g,kx)
        bx=cv2.sepFilter2D(b,-1,kx,g);by=cv2.sepFilter2D(b,-1,g,kx)
        cov+=cb-mc*mb-(cx*bx+cy*by)/var
        variance+=bb-mb*mb-(bx*bx+by*by)/var
    transmission=np.clip(cov/np.maximum(variance,1e-8),0,1)
    complete=cv2.erode(observed.astype(np.uint8),np.ones((2*radius+1,)*2,np.uint8))>0
    # Only a genuinely contrasted photographed structure can override the
    # current neural opacity. Both increases and decreases are possible.
    weight=np.clip((variance-3*(4/255)**2)/(3*(12/255)**2),0,1)*complete
    alpha=prior*(1-weight)+(1-transmission)*weight
    return alpha.clip(0,1),weight,variance


def regularize_photographed_opacity(current,prior,target,confidence,background,observed):
    """Propagate measured transmission with current-source edge conductance."""
    height,width=prior.shape;n=height*width
    C=current.astype(float)/255;B=background.astype(float)/255
    dx=np.sum(np.diff(C,axis=1)**2,axis=2);dy=np.sum(np.diff(C,axis=0)**2,axis=2)
    right=np.zeros((height,width));down=np.zeros((height,width))
    right[:,:-1]=np.exp(-dx/.003)
    down[:-1,:]=np.exp(-dy/.003)
    r=right.ravel()[:-1];d=down.ravel()[:-width]
    adjacent=diags([r,r,d,d],[-1,1,-width,width],shape=(n,n),format='csr')
    lap=diags(np.asarray(adjacent.sum(axis=1)).ravel())-adjacent
    # Uncertain source alpha remains a weak prior; strong source-B agreement
    # and genuine photographed high-frequency evidence anchor the solve.
    empty=observed&(np.max(np.abs(C-B),axis=2)<6/255)
    unary=.002+confidence*30
    unary[empty]=100;target=target.copy();target[empty]=0
    rhs=.002*prior+confidence*30*target;rhs[empty]=0
    matrix=diags(unary.ravel())+.5*lap
    diagonal=unary.ravel()+.5*np.asarray(lap.diagonal())
    result,info=cg(matrix,rhs.ravel(),x0=prior.ravel(),
        M=LinearOperator((n,n),matvec=lambda v:v/diagonal),rtol=1e-5,maxiter=400)
    if info:raise ValueError('Photo-transmission opacity propagation did not converge')
    return result.reshape(height,width).clip(0,1)


def photographed_local_pair(current,background,observed,prior,foreground):
    """Use the same local RGB regression to recover opacity AND P colour."""
    target,confidence,_=photographed_affine_transmission(current,background,observed,prior,radius=5)
    C=current.astype(float)/255;B=background.astype(float)/255
    # The affine intercept is the window centre's premultiplied foreground.
    # Using raw C again after this regression would reintroduce rejected B
    # texture; both estimated channels must come from the common local fit.
    meanC=cv2.GaussianBlur(C,(11,11),2.5)
    meanB=cv2.GaussianBlur(B,(11,11),2.5)
    pure=np.clip(meanC-(1-target[...,None])*meanB,0,target[...,None])
    nexta=prior*(1-confidence)+target*confidence
    premul=foreground*prior[...,None]*(1-confidence[...,None])+pure*confidence[...,None]
    return nexta,premul/np.maximum(nexta[...,None],.001),confidence


def solve_layered_exposure(current,background,prior,hand,cuff,observed):
    """Private spatially coupled, four-vertex exposure decomposition.

    Unlike the earlier three-coordinate simplex, optimize all FOUR probability
    weights, including photographed B, in the same Euclidean metric.
    """
    C=current.astype(np.float64)/255;B=background.astype(np.float64)/255
    depth=cv2.distanceTransform((hand>=224).astype(np.uint8),cv2.DIST_L2,5)
    cdepth=cv2.distanceTransform((cuff>=224).astype(np.uint8),cv2.DIST_L2,5)
    source=current.astype(float)
    skin=(depth>10)&(source[:,:,0]-source[:,:,1]>8)&(source[:,:,1]>=source[:,:,2]-3)
    cloth=cdepth>10
    if skin.sum()<32 or cloth.sum()<32:raise ValueError('No independent photographed material seeds')
    s=C[skin];l=s@np.array([.2126,.7152,.0722])
    dark=s[l<=np.percentile(l,8)].mean(0);bright=s[l>=np.percentile(l,92)].mean(0)
    f=C[cloth];l=f@np.array([.2126,.7152,.0722]);lightcloth=f[l>=np.percentile(l,75)].mean(0)
    materials=np.array([dark,bright,lightcloth])
    height,width=prior.shape
    matrix=np.concatenate([np.broadcast_to(materials,(height,width,3,3)),B[:,:,None,:]],axis=2)
    def project(z):
        sorted_values=np.sort(z,axis=2)[:,:,::-1]
        cumulative=np.cumsum(sorted_values,axis=2)-1
        n=np.arange(1,5)[None,None,:]
        rho=np.sum(sorted_values-cumulative/n>0,axis=2)-1
        theta=np.take_along_axis(cumulative,rho[:,:,None],axis=2)[:,:,0]/(rho+1)
        return np.maximum(z-theta[:,:,None],0)
    x=np.zeros((height,width,4));x[:,:,:3]=prior[:,:,None]/3;x[:,:,3]=1-prior
    z=x.copy();acceleration=1.;strength=.008
    lipschitz=float(np.max(np.linalg.eigvalsh(np.einsum('hwic,hwjc->hwij',matrix,matrix))))+8*strength+.001
    for _ in range(250):
        residual=np.einsum('hwic,hwi->hwc',matrix,z)-C
        gradient=np.einsum('hwic,hwc->hwi',matrix,residual)
        gradient-=strength*cv2.Laplacian(z,cv2.CV_64F,ksize=1,borderType=cv2.BORDER_REFLECT)
        gradient[:,:,3]+=.0003*(z[:,:,3]-(1-prior))
        following=project(z-gradient/lipschitz)
        next_acceleration=(1+np.sqrt(1+4*acceleration**2))/2
        z=following+(acceleration-1)/next_acceleration*(following-x)
        x=following;acceleration=next_acceleration
    a=1-x[:,:,3];P=np.einsum('hwi,ic->hwc',x[:,:,:3],materials)
    F=P/np.maximum(a[:,:,None],.001)
    return a.clip(0,1),F.clip(0,1),{'actualMaterialVertices':materials.tolist(),'iterations':250,
        'correctFourCoordinateSimplexProjection':True,'independentCuffSamples':int(cloth.sum()),'currentHandSamples':int(skin.sum())}


def solve_material_simplex(current, background, alpha, hand, observed, *, linear=False, release_cores=False):
    """Joint nonnegative exposure weights for photographed shade/skin/cuff/B.

    All foreground vertices are measured in opaque current source regions.
    Spatially coupled continuous weights avoid independent per-pixel palette
    winners. This is a bounded private diagnostic, not model admission.
    """
    C=current.astype(np.float64)/255;B=background.astype(np.float64)/255
    if linear:
        convert=lambda v:np.where(v<.081,v/4.5,((v+.099)/1.099)**(1/.45))
        C,B=convert(C),convert(B)
    depth=cv2.distanceTransform((hand>=224).astype(np.uint8),cv2.DIST_L2,5)
    bodydepth=cv2.distanceTransform((alpha>=254).astype(np.uint8),cv2.DIST_L2,5)
    hsv=cv2.cvtColor(current,cv2.COLOR_RGB2HSV).astype(float)
    deep=(depth>max(14,float(depth.max())*.6))&(alpha>=254)
    if deep.sum()<16:raise ValueError('No photographed opaque hand')
    angles=hsv[:,:,0]*np.pi/90
    hue=np.arctan2(np.sin(angles[deep]).mean(),np.cos(angles[deep]).mean())
    distance=np.abs(np.arctan2(np.sin(angles-hue),np.cos(angles-hue)))
    skin=(depth>10)&(alpha>=254)&(distance<np.pi/8)&(hsv[:,:,1]>35)
    cloth=(bodydepth>18)&(alpha>=254)&(hand<128)&(hsv[:,:,1]<80)&(hsv[:,:,2]>110)
    if skin.sum()<64 or cloth.sum()<64:raise ValueError('Insufficient photographed materials')
    values=C[skin];lum=values@np.array([.2126,.7152,.0722])
    dark=values[lum<=np.percentile(lum,8)].mean(0)
    bright=values[lum>=np.percentile(lum,92)].mean(0)
    whites=C[cloth];wl=whites@np.array([.2126,.7152,.0722])
    white=whites[wl>=np.percentile(wl,65)].mean(0)
    materials=np.array([dark,bright,white])
    matrix=materials[None,None,:,:]-B[:,:,None,:]
    target=C-B
    # Four barycentric weights (the last is actual photographed background).
    # Projection uses the exact Euclidean probability-simplex algorithm.
    def project(x):
        z=np.concatenate([x,1-x.sum(2,keepdims=True)],axis=2)
        sorted_values=np.sort(z,axis=2)[:,:,::-1]
        cumulative=np.cumsum(sorted_values,axis=2)-1
        count=np.arange(1,5)[None,None,:]
        valid=sorted_values-cumulative/count>0
        rho=valid.sum(2)-1
        theta=np.take_along_axis(cumulative,(rho[...,None]),axis=2)[:,:,0]/(rho+1)
        return np.maximum(z-theta[...,None],0)[:,:,:3]
    # Normal equations use all channels; avoid arbitrary one-channel keys.
    gram=np.einsum('hwic,hwjc->hwij',matrix,matrix)
    rhs=np.einsum('hwic,hwc->hwi',matrix,target)
    x=np.linalg.solve(gram+np.eye(3)*1e-4,rhs[...,None])[...,0]
    x=project(x);z=x.copy();acceleration=1.
    strength=.012
    lipschitz=float(np.max(np.linalg.eigvalsh(gram)))+8*strength+.0003
    for _ in range(100):
        reconstruction=np.einsum('hwic,hwi->hwc',matrix,z)
        gradient=np.einsum('hwic,hwc->hwi',matrix,reconstruction-target)
        lap=-cv2.Laplacian(z,cv2.CV_64F,ksize=1,borderType=cv2.BORDER_REFLECT)
        gradient+=strength*lap
        gradient+=.0003*(z.sum(2)-alpha/255)[...,None]
        following=project(z-gradient/lipschitz)
        next_acceleration=(1+np.sqrt(1+4*acceleration**2))/2
        z=following+(acceleration-1)/next_acceleration*(following-x)
        x=following;acceleration=next_acceleration
    value=x.sum(2).clip(0,1)
    premul=np.einsum('hwi,ic->hwc',x,materials)
    foreground=premul/np.maximum(value[...,None],.001)
    domain=(cv2.dilate((hand>=64).astype(np.uint8),np.ones((31,31),np.uint8))>0)&observed
    residual=np.linalg.norm(C-B,axis=2)
    value[domain&(residual<5/255)]=0
    stable=(depth>30)&(alpha>=254)&(residual>.15)
    if not release_cores:
        value[stable]=1;foreground[stable]=C[stable]
    if linear:
        foreground=np.where(foreground<.018,foreground*4.5,1.099*np.maximum(foreground,0)**.45-.099)
    value[~domain]=alpha[~domain]/255;foreground[~domain]=current[~domain]/255
    return value,foreground,domain,{'verticesActualRgb':materials.tolist(),'iterations':100,
        'linearBt709':linear,'releasedSemanticOpacityCores':release_cores,
        'photographedSkinSamples':int(skin.sum()),'photographedCuffSamples':int(cloth.sum())}


def solve_material_plane(current, background, alpha, hand, observed, *, linear=False):
    """Private generalized colour-difference key on photographed materials.

    A shared affine colour plane accommodates both the hand and its light cuff.
    Unlike choosing one palette entry per pixel, projection onto this plane is
    continuous through exposure mixtures of these two foreground materials.
    The plane comes from current opaque source pixels, never replacement RGB.
    """
    C=current.astype(np.float64)/255;B=background.astype(np.float64)/255
    if linear:
        convert=lambda v:np.where(v<.081,v/4.5,((v+.099)/1.099)**(1/.45))
        C,B=convert(C),convert(B)
    prior=alpha.astype(float)/255
    depth=cv2.distanceTransform((hand>=224).astype(np.uint8),cv2.DIST_L2,5)
    bodydepth=cv2.distanceTransform((alpha>=254).astype(np.uint8),cv2.DIST_L2,5)
    hsv=cv2.cvtColor(current,cv2.COLOR_RGB2HSV).astype(float)
    deep=(depth>max(14,float(depth.max())*.60))&(alpha>=254)
    if deep.sum()<16:raise ValueError('No actual opaque hand material')
    angles=hsv[:,:,0]*np.pi/90
    hue=np.arctan2(np.sin(angles[deep]).mean(),np.cos(angles[deep]).mean())
    distance=np.abs(np.arctan2(np.sin(angles-hue),np.cos(angles-hue)))
    skin=(depth>10)&(alpha>=254)&(distance<np.pi/8)&(hsv[:,:,1]>35)
    cloth=(bodydepth>18)&(alpha>=254)&(hand<128)&(hsv[:,:,1]<80)&(hsv[:,:,2]>110)
    if skin.sum()<32 or cloth.sum()<32:raise ValueError('Insufficient actual hand/cuff samples')
    # Balance materials rather than allowing the much larger shirt to dominate.
    samples=np.concatenate([C[skin][np.linspace(0,int(skin.sum())-1,1024).astype(int)],
                            C[cloth][np.linspace(0,int(cloth.sum())-1,1024).astype(int)]])
    centre=np.mean(samples,axis=0)
    for _ in range(4):
        eigenvalues,eigenvectors=np.linalg.eigh(np.cov(samples.T))
        normal=eigenvectors[:,0]
        residual=np.abs((samples-centre)@normal)
        valid=residual<=np.percentile(residual,95)
        samples=samples[valid];centre=np.mean(samples,axis=0)
    normal=eigenvectors[:,0];offset=float(centre@normal)
    denominator=offset-np.einsum('hwc,c->hw',B,normal)
    numerator=np.einsum('hwc,c->hw',C-B,normal)
    usable=np.abs(denominator)>.035
    value=np.divide(numerator,denominator,out=prior.copy(),where=usable).clip(0,1)
    domain=(cv2.dilate((hand>=64).astype(np.uint8),np.ones((31,31),np.uint8))>0)&observed&usable
    # A small continuous noise floor replaces hard per-pixel material labels.
    photo=np.linalg.norm(current.astype(float)-background.astype(float),axis=2)
    value[domain&(photo<5)]=0
    value=cv2.GaussianBlur(value,(0,0),.55)
    stable=(skin|cloth)&(bodydepth>18)&(photo>40)
    value[stable]=1
    # Recover the photographed premultiplied colour with exactly this opacity.
    premul=C-(1-value[...,None])*B
    foreground=np.divide(premul,np.maximum(value[...,None],.01)).clip(0,1)
    if linear:
        foreground=np.where(foreground<.018,foreground*4.5,1.099*np.maximum(foreground,0)**.45-.099)
    value[~domain]=prior[~domain];foreground[~domain]=current[~domain]/255
    return value,foreground,domain,{'normal':normal.tolist(),'offset':offset,
        'planeEigenvalues':eigenvalues.tolist(),'photographedSkinPixels':int(skin.sum()),
        'photographedClothPixels':int(cloth.sum()),'planeResidualP95':float(np.percentile(np.abs((samples-centre)@normal),95)),
        'linearBt709':linear}


def solve_two_material(current, background, alpha, hand, observed):
    """Fit photographed hand+cuff mixtures, rather than one skin colour line."""
    C=current.astype(np.float32)/255;B=background.astype(np.float32)/255
    prior=alpha.astype(np.float32)/255
    depth=cv2.distanceTransform((hand>=224).astype(np.uint8),cv2.DIST_L2,5)
    bodydepth=cv2.distanceTransform((alpha>=254).astype(np.uint8),cv2.DIST_L2,5)
    hsv=cv2.cvtColor(current,cv2.COLOR_RGB2HSV).astype(float)
    deep=(depth>max(14,float(depth.max())*.6))&(alpha>=254)
    if deep.sum()<16:raise ValueError('No actual opaque current hand material')
    angles=hsv[:,:,0]*np.pi/90
    hue=np.arctan2(np.sin(angles[deep]).mean(),np.cos(angles[deep]).mean())
    hue_distance=np.abs(np.arctan2(np.sin(angles-hue),np.cos(angles-hue)))
    skin=(depth>10)&(alpha>=254)&(hue_distance<np.pi/8)&(hsv[:,:,1]>35)
    cloth=(bodydepth>15)&(alpha>=254)&(hand<128)&(hsv[:,:,1]<80)&(hsv[:,:,2]>110)
    if skin.sum()<32 or cloth.sum()<32:raise ValueError('No actual current two-material support')
    cv2.setRNGSeed(0)
    def palette(mask,count):
        samples=C[mask][::3].astype(np.float32)
        _,_,centres=cv2.kmeans(samples,count,None,(cv2.TERM_CRITERIA_EPS+cv2.TERM_CRITERIA_COUNT,50,1e-4),2,cv2.KMEANS_PP_CENTERS)
        return centres
    S=palette(skin,8);W=palette(cloth,6)
    # Project the actual colour onto each photographed B/skin/cuff triangle.
    # Nonnegative barycentric weights describe exposure-time mixtures of both
    # foreground materials and the observed empty background.
    delta=C-B;denominator=np.zeros(prior.shape,np.float64)
    alpha_sum=np.zeros(prior.shape,np.float64);premul_sum=np.zeros_like(C,np.float64)
    error_sum=np.zeros(prior.shape,np.float64)
    for s in S:
        v=s-B;vv=np.sum(v*v,axis=2);dv=np.sum(delta*v,axis=2)
        for w in W:
            u=w-B;uu=np.sum(u*u,axis=2);vu=np.sum(v*u,axis=2);du=np.sum(delta*u,axis=2)
            det=vv*uu-vu*vu
            a=(dv*uu-du*vu)/np.maximum(det,1e-9)
            b=(du*vv-dv*vu)/np.maximum(det,1e-9)
            valid=(det>1e-8)&(a>=0)&(b>=0)&(a+b<=1)
            residual=np.sum((delta-a[...,None]*v-b[...,None]*u)**2,axis=2)
            best=np.where(valid,residual,np.inf)
            for aa,bb in [(np.clip(dv/np.maximum(vv,1e-6),0,1),np.zeros_like(a)),
                          (np.zeros_like(a),np.clip(du/np.maximum(uu,1e-6),0,1))]:
                err=np.sum((delta-aa[...,None]*v-bb[...,None]*u)**2,axis=2)
                take=err<best;best[take]=err[take];a[take]=aa[take];b[take]=bb[take]
            line=s-w;t=np.clip(np.sum((C-w)*line,axis=2)/max(float(line@line),1e-6),0,1)
            err=np.sum((C-t[...,None]*s-(1-t[...,None])*w)**2,axis=2)
            take=err<best;best[take]=err[take];a[take]=t[take];b[take]=1-t[take]
            opacity=a+b;score=best+.00015*(opacity-prior)**2
            weight=np.exp(-np.minimum(score/.0007,80))
            denominator+=weight;alpha_sum+=weight*opacity
            premul_sum+=weight[...,None]*(a[...,None]*s+b[...,None]*w)
            error_sum+=weight*best
    value=alpha_sum/np.maximum(denominator,1e-20)
    premul=premul_sum/np.maximum(denominator[...,None],1e-20)
    # A modest common blur stabilises alpha and premultiplication together.
    # It cannot create independent colour/opacity boundaries or alter source
    # pixels outside the independently selected hand's observed-background ROI.
    value=cv2.GaussianBlur(value,(0,0),.7)
    premul=cv2.GaussianBlur(premul,(0,0),.7)
    foreground=premul/np.maximum(value[...,None],.001)
    domain=(cv2.dilate((hand>=64).astype(np.uint8),np.ones((31,31),np.uint8))>0)&observed
    photo=np.linalg.norm(current.astype(float)-background.astype(float),axis=2)
    value[domain&(photo<8)]=0
    stable=skin&(depth>26)&(photo>40)
    value[stable]=1;foreground[stable]=C[stable]
    return value.clip(0,1),foreground.clip(0,1),domain,{'photographedSkinSamples':int(skin.sum()),
        'photographedCuffSamples':int(cloth.sum()),'materialPairs':48,
        'meanPhotoResidual':float(np.mean(error_sum[domain]/np.maximum(denominator[domain],1e-20)))}


def solve(current, background, alpha, hand, observed, *, strength=.02, linear=False, material_weight=.025,
          include_cloth=False, fixed_alpha=False, cuff_in_hand=False):
    C=current.astype(np.float64)/255
    B=background.astype(np.float64)/255
    if linear:
        convert=lambda v:np.where(v<=.04045,v/12.92,((v+.055)/1.055)**2.4)
        C,B=convert(C),convert(B)
    prior=alpha.astype(np.float64)/255
    depth=cv2.distanceTransform((hand>=224).astype(np.uint8),cv2.DIST_L2,5)
    hsv=cv2.cvtColor(current,cv2.COLOR_RGB2HSV).astype(float)
    deep=(depth>max(14,float(depth.max())*.60))&(prior>.99)
    if deep.sum()<16:raise ValueError('Insufficient opaque current material')
    angles=hsv[:,:,0]*np.pi/90
    hue=np.arctan2(np.sin(angles[deep]).mean(),np.cos(angles[deep]).mean())
    distance=np.abs(np.arctan2(np.sin(angles-hue),np.cos(angles-hue)))
    core=(depth>10)&(prior>.99)&(distance<np.pi/8)&(hsv[:,:,1]>35)
    if include_cloth:
        body_depth=cv2.distanceTransform((alpha>=254).astype(np.uint8),cv2.DIST_L2,5)
        cloth=(body_depth>20)&(hsv[:,:,1]<80)&(hsv[:,:,2]>110)
        if not cuff_in_hand:cloth&=hand<128
        core|=cloth
    if core.sum()<32:raise ValueError('No verified current material seeds')
    _,nearest=distance_transform_edt(~core,return_indices=True)
    material=C[nearest[0],nearest[1]].copy()
    material=cv2.GaussianBlur(material,(0,0),3)
    height,width=prior.shape;n=height*width
    right=np.ones(n-1);right[np.arange(n-1)%width==width-1]=0
    down=np.ones(n-width)
    adjacent=diags([right,right,down,down],[-1,1,-width,width],shape=(n,n),format='csr')
    lap=diags(np.asarray(adjacent.sum(axis=1)).ravel())-adjacent
    domain=(cv2.dilate((hand>=64).astype(np.uint8),np.ones((31,31),np.uint8))>0)&observed
    photo=np.linalg.norm(current.astype(float)-background.astype(float),axis=2)
    empty=domain&(photo<9)
    stable=core&(depth>22)&(photo>35)
    # Stable source interiors anchor colour, but neither a semantic finger core
    # nor a hue assumption can force uncertain moving gaps opaque.
    anchors=np.where(core,10.,0.)
    diag=anchors+.002+strength*np.asarray(lap.diagonal()).reshape(height,width)
    matrix=diags((anchors+.002).ravel())+strength*lap
    precondition=LinearOperator((n,n),matvec=lambda x:x/diag.ravel())
    foreground=material.copy()
    residuals=[]
    for channel in range(3):
        rhs=anchors*C[:,:,channel]+.002*material[:,:,channel]
        result,info=cg(matrix,rhs.ravel(),x0=material[:,:,channel].ravel(),M=precondition,rtol=1e-5,maxiter=300)
        if info:raise ValueError('Foreground material solve did not converge')
        foreground[:,:,channel]=result.reshape(height,width)
    initial=foreground.copy()
    alpha=prior.copy()
    if fixed_alpha:
        # Isolate foreground-colour error from the alpha model: keep the
        # actual moving opacity byte-for-byte and solve only photographed F.
        # Reliable opaque material anchors exclude source-blue mixed samples.
        data_weight=.25*alpha**2*domain
        colour_unary=anchors+material_weight+data_weight
        A=diags(colour_unary.ravel())+strength*lap
        diagonal=colour_unary.ravel()+strength*np.asarray(lap.diagonal())
        M=LinearOperator((n,n),matvec=lambda x:x/diagonal)
        rhs=anchors[...,None]*C+material_weight*initial+(.25*alpha*domain)[...,None]*(C-(1-alpha[...,None])*B)
        for channel in range(3):
            result,info=cg(A,rhs[:,:,channel].ravel(),x0=foreground[:,:,channel].ravel(),M=M,rtol=1e-5,maxiter=250)
            if info:raise ValueError('Fixed-opacity colour solve did not converge')
            foreground[:,:,channel]=result.reshape(height,width)
        foreground=foreground.clip(0,1)
        if linear:foreground=np.where(foreground<=.0031308,foreground*12.92,1.055*np.maximum(foreground,0)**(1/2.4)-.055)
        return alpha,foreground,domain,{'fixedAlpha':True,'knownCurrentMaterialPixels':int(core.sum())}
    for iteration in range(10):
        vector=foreground-B;delta=C-B
        contrast=np.sum(vector*vector,axis=2)
        target=np.clip(np.sum(delta*vector,axis=2)/np.maximum(contrast,1e-6),0,1)
        # Smooth alpha only through a confidence-weighted solve, not an erosion
        # or a hard threshold on the blurred silhouette.
        unary=np.where(domain,np.maximum(contrast,.02),100.)
        target[~domain]=prior[~domain]
        unary[empty|stable]=100.;target[empty]=0;target[stable]=1
        adiag=unary.ravel()+.008*np.asarray(lap.diagonal())
        A=diags(unary.ravel())+.008*lap
        result,info=cg(A,(unary*target).ravel(),x0=alpha.ravel(),
            M=LinearOperator((n,n),matvec=lambda x:x/adiag),rtol=1e-5,maxiter=250)
        if info:raise ValueError('Opacity solve did not converge')
        alpha=result.reshape(height,width).clip(0,1)
        alpha[empty]=0;alpha[stable]=1;alpha[~domain]=prior[~domain]
        # Real colour variation is allowed, while a smooth material prior
        # prevents the old blue curtain becoming a new foreground island.
        data_weight=.25*alpha**2*domain
        colour_unary=anchors+material_weight+data_weight
        A=diags(colour_unary.ravel())+strength*lap
        diagonal=colour_unary.ravel()+strength*np.asarray(lap.diagonal())
        M=LinearOperator((n,n),matvec=lambda x:x/diagonal)
        rhs=anchors[...,None]*C+material_weight*initial+(.25*alpha*domain)[...,None]*(C-(1-alpha[...,None])*B)
        for channel in range(3):
            result,info=cg(A,rhs[:,:,channel].ravel(),x0=foreground[:,:,channel].ravel(),M=M,rtol=1e-5,maxiter=250)
            if info:raise ValueError('Joint foreground solve did not converge')
            foreground[:,:,channel]=result.reshape(height,width)
        foreground=foreground.clip(0,1)
        residuals.append(float(np.mean(np.abs((alpha[...,None]*foreground+(1-alpha[...,None])*B-C)[domain]))))
    alpha[~domain]=prior[~domain]
    if linear:foreground=np.where(foreground<=.0031308,foreground*12.92,1.055*np.maximum(foreground,0)**(1/2.4)-.055)
    return alpha,foreground,domain,{'iterations':10,'photoResiduals':residuals,
        'knownCurrentMaterialPixels':int(core.sum()),'knownEmptyPixels':int(empty.sum())}


def affine_opacity_and_foreground(current, background, observed, prior, foreground, radius=14):
    """Fit BOTH opacity and premultiplied foreground as local affine fields.

    This is a private diagnostic. Unlike constant-transmission regressions, the
    shared RGB background coefficient has spatial x/y terms. Eliminate the
    independent per-channel affine foreground via a Schur complement, then
    solve the remaining three shared transmission coefficients.
    """
    C=current.astype(float)/255;B=background.astype(float)/255
    sigma=radius/2
    axis=np.arange(-radius,radius+1)/sigma
    g=np.exp(-axis*axis/2);g/=g.sum()
    variance=float(np.sum(g*axis*axis))
    def moment(v,nx=0,ny=0):
        return cv2.sepFilter2D(v,-1,g*axis**nx,g*axis**ny,borderType=cv2.BORDER_REFLECT)
    b=[moment(B),moment(B,1),moment(B,0,1),moment(B,2),moment(B,1,1),moment(B,0,2)]
    c=[moment(C),moment(C,1),moment(C,0,1)]
    bc=[moment(B*C),moment(B*C,1),moment(B*C,0,1)]
    bb=[moment(B*B),moment(B*B,1),moment(B*B,0,1),moment(B*B,2),moment(B*B,1,1),moment(B*B,0,2)]
    mapping=[[0,1,2],[1,3,4],[2,4,5]]
    H=np.stack([np.stack([b[mapping[i][k]] for k in range(3)],axis=-1) for i in range(3)],axis=-2)
    inverse=np.array([1,1/variance,1/variance])
    G=np.stack([np.stack([bb[mapping[i][j]].sum(2) for j in range(3)],axis=-1) for i in range(3)],axis=-2)
    G-=np.einsum('hwcik,k,hwcjk->hwij',H,inverse,H)
    rhs=np.stack([v.sum(2) for v in bc],axis=-1)
    rhs-=np.einsum('hwcik,k,hwck->hwi',H,inverse,np.stack(c,axis=-1))
    ridge=2e-4
    G+=np.eye(3)*ridge
    rhs[:,:,0]+=ridge*(1-prior)
    t=np.linalg.solve(G,rhs[:,:,:,None])[:,:,:,0]
    nexta=np.clip(1-t[:,:,0],0,1)
    P=c[0]-np.einsum('hwi,hwci->hwc',t,np.stack(b[:3],axis=-1))
    complete=cv2.erode(observed.astype(np.uint8),np.ones((2*radius+1,)*2,np.uint8))>0
    texture=(bb[0]-b[0]*b[0]-(b[1]*b[1]+b[2]*b[2])/variance).sum(2)
    confidence=np.clip((texture-3*(4/255)**2)/(3*(12/255)**2),0,1)*complete
    # Return a common pair, never reintroduce the rejected raw B texture.
    newP=foreground*prior[:,:,None]*(1-confidence[:,:,None])+P*confidence[:,:,None]
    nexta=prior*(1-confidence)+nexta*confidence
    return nexta,newP/np.maximum(nexta[:,:,None],.001),confidence
