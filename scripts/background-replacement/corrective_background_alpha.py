"""Revoke false foreground with photographed, source-frame background clicks.

This consumes existing corrective points, not a held silhouette. A correction
may only lower alpha near its source location while its current photograph
still agrees. Independent selected objects and ambiguous foreground colours
remain protected. The caller owns source/frame binding and final click stamps.
"""
import cv2
import numpy as np


def refine_background_click(rgb, alpha, reference, evidence, point, foreground_colours, *, radius=48):
    from pymatting import estimate_alpha_cf
    from pymatting.preconditioner.ichol import ichol
    if (rgb.dtype != np.uint8 or alpha.dtype != np.uint8 or reference.shape != rgb.shape
            or rgb.shape != (*alpha.shape, 3) or not 8 <= radius <= 64
            or any(p.shape != alpha.shape or p.dtype != np.uint8 for p in evidence)):
        raise ValueError('Background correction source geometry differs')
    h, w = alpha.shape
    x, y = point
    if type(x) is not int or type(y) is not int or not (0 <= x < w and 0 <= y < h):
        raise ValueError('Background correction must name a source pixel')
    result = alpha.copy()
    maximum = np.maximum.reduce(evidence) if evidence else np.zeros_like(alpha)
    # A background example is invalidated by a newly selected occluder or by
    # changed photographed RGB. It never persists as a circle over a hand.
    if maximum[y, x] >= 128 or np.max(np.abs(rgb[y, x].astype(int)-reference[y, x].astype(int))) > 12:
        return result
    x0, x1 = max(0, x-radius), min(w, x+radius+1)
    y0, y1 = max(0, y-radius), min(h, y+radius+1)
    sl = np.s_[y0:y1, x0:x1]
    pixels = rgb[sl]
    prior = alpha[sl]
    membership = maximum[sl]
    anchors = np.asarray(foreground_colours)
    if anchors.ndim != 2 or anchors.shape[1] != 3 or anchors.dtype != np.uint8 or len(anchors) > 4096:
        raise ValueError('Correction requires bounded authored foreground colours')
    if len(anchors) < 3:
        return result
    # Bound the colour comparison with deterministic, actual opaque examples.
    anchors = np.unique(anchors, axis=0)
    anchors = anchors[np.linspace(0, len(anchors)-1, min(256, len(anchors)), dtype=int)]
    patch = reference[max(0, y-1):min(h, y+2), max(0, x-1):min(w, x+2)].reshape(-1, 3)
    examples = patch[np.max(np.abs(patch.astype(int)-reference[y, x].astype(int)), axis=1) <= 12]

    def distance(colours):
        best = np.full(prior.shape, np.inf, np.float32)
        for colour in colours:
            best = np.minimum(best, np.linalg.norm(pixels.astype(np.float32)-colour, axis=2))
        return best

    background = distance(examples.astype(np.float32))
    foreground = distance(anchors.astype(np.float32))
    # A semantic mask is precisely what the corrective BG point disputes.
    # Protect its photographed FG colours, rather than making every false
    # orange-screen prediction an irrevocable opaque foreground seed.
    protected = (membership >= 128) & (foreground <= background+24)
    agrees = np.max(np.abs(pixels.astype(np.int16)-reference[sl].astype(np.int16)), axis=2) <= 12
    reject = (background < 18) & (background+24 < foreground) & agrees & ~protected
    # A matching garment/logo elsewhere in the box is not part of this click.
    _, labels = cv2.connectedComponents(reject.astype(np.uint8), 8)
    touched = labels[max(0,y-y0-1):y-y0+2,max(0,x-x0-1):x-x0+2]
    touched = np.unique(touched[touched != 0])
    reject &= np.isin(labels, touched)
    if not np.any(reject & (prior > 8)):
        return result
    trimap = np.full(prior.shape, .5)
    trimap[prior <= 8] = 0
    trimap[cv2.erode((prior >= 245).astype(np.uint8), np.ones((3, 3), np.uint8)) > 0] = 1
    trimap[reject] = 0
    if not (trimap == 0).any() or not (trimap == 1).any():
        return result
    values = estimate_alpha_cf(pixels.astype(np.float64)/255, trimap,
        laplacian_kwargs={'epsilon': 1e-6},
        preconditioner=lambda matrix: ichol(matrix, shifts=[.01, .1, 1, 10, 100, 1000]),
        cg_kwargs={'rtol': 1e-6, 'maxiter': 500})
    if not np.isfinite(values).all():
        raise ValueError('Nonfinite corrective background alpha')
    eligible = (cv2.dilate(reject.astype(np.uint8), np.ones((7, 7), np.uint8)) > 0) & agrees & ~protected
    candidate = np.rint(values.clip(0, 1)*255).astype(np.uint8)
    result[sl][eligible] = np.minimum(prior, candidate)[eligible]
    return result
