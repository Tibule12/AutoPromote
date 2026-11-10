"""Current-source opaque person interiors; never a held pose or outer matte.

SAM scores are selection evidence, not opacity. A tracked garment can have
moderate scores throughout its opaque interior. This candidate uses the actual
frame's RGB and selected person to restore only deep, connected source material.
It does not change hair, thin fingers, exterior alpha or another object's alpha.
"""
import cv2
import numpy as np


def refine_person_source_boundaries(rgb, alpha, person, motion_radius,
                                    moving_components=(), fixed_components=()):
    """Refine current person edges while preserving rapid exposure blur.

    The source-resolution colour solve operates on current RGB, not a held
    silhouette. Existing flow supplies a continuous reduction in refinement
    strength. Separate moving details and equipment keep their exact alpha.
    This is shared source guidance; it uses no face/skin/garment templates.
    """
    from importlib.metadata import version
    if version('pymatting') != '1.1.16':
        raise ValueError('Person source boundary requires pymatting 1.1.16')
    from pymatting import estimate_alpha_cf
    from pymatting.preconditioner.ichol import ichol
    if (alpha.ndim != 2 or alpha.dtype != np.uint8 or rgb.dtype != np.uint8
            or rgb.shape != (*alpha.shape, 3) or person.shape != alpha.shape
            or person.dtype != np.uint8 or motion_radius.shape != alpha.shape
            or not np.issubdtype(motion_radius.dtype, np.floating)
            or not np.isfinite(motion_radius).all() or (motion_radius < 0).any()
            or any(p.shape != alpha.shape or p.dtype != np.uint8
                   for p in (*moving_components, *fixed_components))):
        raise ValueError('Person source boundary geometry or evidence differs')
    if np.count_nonzero(person >= 128) < 64:
        return alpha.copy()
    selected = (alpha >= 128).astype(np.uint8)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    inside = cv2.erode(selected, kernel) > 0
    outside = cv2.dilate(selected, kernel) == 0
    if not inside.any() or not outside.any():
        return alpha.copy()
    protected = np.zeros(alpha.shape, np.uint8)
    for planes, width in [(moving_components, 31), (fixed_components, 7)]:
        for plane in planes:
            protected |= cv2.dilate((plane >= 24).astype(np.uint8),
                                    np.ones((width, width), np.uint8))
    allowed = (cv2.dilate((person >= 24).astype(np.uint8),
                         np.ones((5, 5), np.uint8)) > 0) & (protected == 0)
    weight = .8 * np.clip((3-motion_radius)/2, 0, 1)
    weight[~allowed] = 0
    if not np.any(weight > 0):
        return alpha.copy()
    trimap = np.full(alpha.shape, .5)
    trimap[inside] = 1
    trimap[outside] = 0
    values = estimate_alpha_cf(rgb.astype(np.float64)/255, trimap,
        laplacian_kwargs={'epsilon': 1e-6},
        preconditioner=lambda matrix: ichol(matrix, shifts=[.01, .1, 1, 10, 100, 1000]),
        cg_kwargs={'rtol': 1e-6, 'maxiter': 1000})
    if not np.isfinite(values).all():
        raise ValueError('Nonfinite person source boundary alpha')
    soft = cv2.GaussianBlur(values.clip(0, 1)*255, (3, 3), .5)
    return np.rint(alpha*(1-weight)+soft*weight).clip(0, 255).astype(np.uint8)


def restore_person_interiors(rgb, alpha, person, points=(), *, preserve=None):
    if (rgb.dtype != np.uint8 or alpha.dtype != np.uint8
            or person.dtype != np.uint8 or alpha.ndim != 2
            or rgb.shape != (*alpha.shape, 3) or person.shape != alpha.shape):
        raise ValueError('Person source geometry or type differs')
    if preserve is not None and (preserve.shape != alpha.shape or preserve.dtype != bool):
        raise ValueError('Person protected-detail geometry or type differs')
    h, w = alpha.shape
    for point in points:
        if (point['label'] not in (0, 1) or len(point['position']) != 2
                or any(not np.isfinite(v) or not 0 <= v <= 1 for v in point['position'])):
            raise ValueError('Invalid current person source click')
    seed = cv2.erode((person >= 224).astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
    support = person >= 64
    # No confident current person or no real source background: abstain.
    if np.count_nonzero(seed) < 64 or support.all():
        return alpha.copy()
    labels = np.full(alpha.shape, cv2.GC_PR_BGD, np.uint8)
    labels[support] = cv2.GC_PR_FGD
    labels[cv2.dilate(support.astype(np.uint8), np.ones((15, 15), np.uint8)) == 0] = cv2.GC_BGD
    labels[seed] = cv2.GC_FGD
    negative = np.zeros(alpha.shape, np.uint8)
    for point in points:
        x = min(w - 1, round(point['position'][0] * w))
        y = min(h - 1, round(point['position'][1] * h))
        cv2.circle(labels, (x, y), 2, cv2.GC_FGD if point['label'] else cv2.GC_BGD, -1)
        if not point['label']:
            cv2.circle(negative, (x, y), 2, 1, -1)
    if not np.any(labels == cv2.GC_BGD):
        return alpha.copy()
    cv2.setRNGSeed(0)
    cv2.grabCut(rgb.copy(), labels, None, np.zeros((1, 65)), np.zeros((1, 65)), 5, cv2.GC_INIT_WITH_MASK)
    selected = np.isin(labels, [cv2.GC_FGD, cv2.GC_PR_FGD]).astype(np.uint8)
    _, components = cv2.connectedComponents(selected, 8)
    touched = np.unique(components[seed & (negative == 0)])
    touched = touched[touched != 0]
    selected = np.isin(components, touched).astype(np.uint8)
    depth = cv2.distanceTransform(selected, cv2.DIST_L2, 5)
    restore = (depth > 12) & (person >= 32) & (negative == 0)
    if preserve is not None:
        # A coarse whole-person selection can connect the spaces between
        # fingers into a mitten. The separate current hand/detail refinement
        # owns its soft silhouette and holes, including photographed BG.
        # Garment opacity repair cannot overwrite that more specific result.
        restore &= ~preserve
    result = alpha.copy()
    result[restore] = 255
    return result
