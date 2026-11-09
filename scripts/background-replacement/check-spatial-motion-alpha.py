"""Private spatially regularized measured-background matte diagnostic."""
import importlib.util, json, os, sys
from pathlib import Path
import cv2, numpy as np
from pymatting.laplacian.cf_laplacian import cf_laplacian
from pymatting.preconditioner.ichol import ichol
from scipy.sparse import diags
from scipy.sparse.linalg import cg, LinearOperator
from model_workers.adapters.moving_detail_alpha import measured_motion_trimap


def spatial_alpha(rgb, background, observed, prior, hand, primary, motion, palette):
    tri, domain = measured_motion_trimap(prior, hand, primary, rgb, background, observed, motion)
    ys, xs = np.where(domain)
    if not len(xs): return prior.copy(), domain, np.zeros(prior.shape)
    x0, y0 = max(0, int(xs.min())-12), max(0, int(ys.min())-12)
    x1, y1 = min(rgb.shape[1], int(xs.max())+13), min(rgb.shape[0], int(ys.max())+13)
    sl = np.s_[y0:y1, x0:x1]; c = rgb[sl].astype(np.float64); b = background[sl].astype(np.float64)
    delta = c-b; shape = c.shape[:2]; error = np.full(shape, np.inf); target = prior[sl].astype(float)/255; nearest = np.full(shape, np.inf)
    for colour in np.unique(np.asarray(palette, float), axis=0):
        vector = colour-b; contrast = np.sum(vector*vector, axis=2)
        a = np.sum(delta*vector, axis=2)/np.maximum(contrast, 1)
        residual = np.sqrt(np.mean((delta-a[...,None]*vector)**2, axis=2))
        nearest = np.minimum(nearest, np.linalg.norm(c-colour, axis=2))
        use = (contrast > 48**2) & (a >= 0) & (a <= 1) & (residual < error)
        target[use] = a[use]; error[use] = residual[use]
    # Real skin shadows resembling the sampled hand more than background are
    # not evidence for lower opacity. Mixed colour is only a soft observation.
    confidence = np.clip((nearest-np.linalg.norm(delta, axis=2)-4)/20, 0, 1)*np.clip((10-error)/4, 0, 1)
    if os.environ.get('AUTOPROMOTE_PRIVATE_MIXED_CONFIDENCE') == 'foreground-residual':
        confidence = np.clip((nearest-6)/12,0,1)*np.clip((8-error)/4,0,1)
    depth = cv2.distanceTransform((hand[sl] >= 224).astype(np.uint8), cv2.DIST_L2, 5)
    eligible = domain[sl] & (motion[sl] > 4) & (depth < np.maximum(24, motion[sl]+8))
    if os.environ.get('AUTOPROMOTE_PRIVATE_RELEASE_MIXED_SEEDS') == '1':
        # A SAM-filled finger gap can lie deeper than the geometric unknown
        # band. Only an actual photographed colour mixture can revoke it.
        body = cv2.morphologyEx((primary[sl] >= 224).astype(np.uint8), cv2.MORPH_CLOSE, np.ones((7,7),np.uint8))
        protected = (cv2.distanceTransform(body,cv2.DIST_L2,5)>48)&(prior[sl]>=254)
        release = domain[sl] & (motion[sl]>4) & (confidence>.5) & ~protected & (prior[sl]>=128)
        tri[sl][release] = 128
        eligible |= release
    confidence *= eligible
    known = (tri[sl] != 128) | ~domain[sl]
    prior_values = prior[sl].astype(float)/255
    hard = known.astype(float)*100
    data_weight = float(os.environ.get('AUTOPROMOTE_PRIVATE_ALPHA_DATA_WEIGHT', '.2'))
    if not .2 <= data_weight <= 20: raise ValueError('Private diagnostic data weight outside bounds')
    soft = confidence*data_weight
    diagonal = hard + soft + .002
    rhs = hard*prior_values + soft*np.minimum(target, prior_values) + .002*prior_values
    laplacian = cf_laplacian(c/255, epsilon=1e-7)
    matrix = laplacian + diags(diagonal.ravel())
    pre = ichol(matrix, shifts=[.01,.1,1,10,100,1000])
    values, status = cg(matrix, rhs.ravel(), x0=prior_values.ravel(), M=LinearOperator(matrix.shape, matvec=pre, dtype=np.float64), rtol=1e-6, maxiter=1500)
    if status or not np.isfinite(values).all(): raise ValueError('Spatial measured-alpha solve did not converge')
    result = prior.copy(); candidate = np.rint(values.reshape(shape).clip(0,1)*255).astype(np.uint8)
    # Leave every outside-domain and hard source constraint exact.
    allowed = domain[sl] & ~known
    if os.environ.get('AUTOPROMOTE_PRIVATE_LOCALIZE_PHOTO_DATA') == '1':
        supported = eligible & (confidence > .25) & (target < prior_values - .15)
        weight = np.clip(cv2.GaussianBlur(supported.astype(np.float32), (0,0), 2)*1.5,0,1)
        weight *= allowed
        blended = np.rint(prior[sl]*(1-weight)+candidate*weight).clip(0,255).astype(np.uint8)
        result[sl][allowed] = blended[allowed]
    else:
        result[sl][allowed] = candidate[allowed]
    return result, domain, error


if __name__ == '__main__':
    path = Path(__file__).with_name('check-observed-motion-alpha.py')
    spec = importlib.util.spec_from_file_location('observed_motion_private', path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    module.measured_alpha = spatial_alpha
    # Bounded actual gesture first; no four-minute gate is implied.
    original = path.read_text().replace('for index in [6, 10, 15, 23, 39, 47]:', 'for index in [15, 6, 23]:')
    scope = dict(vars(module)); exec(compile(original, str(path), 'exec'), scope)
    scope['measured_alpha'] = spatial_alpha; scope['main']()
