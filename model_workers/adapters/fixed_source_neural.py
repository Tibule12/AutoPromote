"""Source-resolution neural polishing of already classified fixed objects.

This is a post-matting operation, not fresh segmentation or a held silhouette.
The caller supplies the existing pinned matter. Current people, other selected
objects, changed source pixels and authored click ownership remain protected.
"""
import cv2
import numpy as np
from PIL import Image

from model_workers.adapters.temporal_alpha import condition_trimap_clicks


def prune_unsupported_fixed_islands(rgb, alpha, guidance, index, component_ids):
    """Remove small detached prop fragments lacking current/reference support.

    This is deliberately narrower than a mask opening or size filter: real
    thin connected parts, any independently supported island, authored FG,
    changed photographed pixels and every moving foreground stay exact.
    A crop boundary cannot establish that a component is detached.
    """
    if (rgb.dtype != np.uint8 or alpha.dtype != np.uint8 or alpha.ndim != 2
            or rgb.shape != (*alpha.shape, 3) or type(index) is not int
            or index < 0):
        raise ValueError('Fixed-fragment source geometry differs')
    if not guidance or not component_ids:
        return alpha.copy(), []
    directory, manifest = guidance
    reference = manifest.get('_reference_rgb')
    if reference is None or reference.shape != rgb.shape or reference.dtype != np.uint8:
        raise ValueError('Fixed-fragment reference geometry differs')
    components = manifest['components']
    planes = [np.asarray(Image.open(directory / c['frames'][index]['file']))
              for c in components]
    first = [np.asarray(Image.open(directory / c['frames'][0]['file']))
             for c in components]
    if any(p.shape != alpha.shape or p.dtype != np.uint8 for p in [*planes, *first]):
        raise ValueError('Fixed-fragment component geometry differs')
    moving = np.zeros(alpha.shape, np.uint8)
    for component, plane in zip(components, planes):
        if component['selection'].get('propagate', True):
            binary = (plane >= 128).astype(np.uint8)
            if binary.any():
                cv2.fillConvexPoly(moving, cv2.convexHull(cv2.findNonZero(binary)), 1)
                # Weak logits disconnected from every strong moving pixel can
                # describe the old TV, rather than another observed limb.
                # Keep the connected soft boundary; actual hands have their
                # own current tracks and authored/current-RGB protections.
                _, labels = cv2.connectedComponents((plane >= 24).astype(np.uint8), 8)
                anchors = np.unique(labels[binary > 0])
                moving |= np.isin(labels, anchors[anchors != 0]).astype(np.uint8)
    if not moving.any():
        return alpha.copy(), []
    protected = cv2.dilate(moving, np.ones((31, 31), np.uint8)) > 0
    protected |= np.max(np.abs(rgb.astype(np.int16) - reference.astype(np.int16)), axis=2) > 24
    # Use the same source/frame/colour ownership checks as actual matting.
    protected |= condition_trimap_clicks(np.zeros_like(alpha), rgb, reference,
        [(c['selection'], p) for c, p in zip(components, planes)], index) > 0
    result, records = alpha.copy(), []
    h, w = alpha.shape
    for number, component in enumerate(components):
        selection, roi = component['selection'], component.get('roi')
        if selection.get('propagate', True) or selection['id'] not in component_ids:
            continue
        if (not isinstance(roi, (list, tuple)) or len(roi) != 4
                or any(type(v) not in (int, float) or not np.isfinite(v)
                       or int(v) != v for v in roi)):
            raise ValueError('Fixed-fragment ROI differs')
        x0, y0, x1, y1 = map(int, roi)
        if not (0 <= x0 < x1 <= w and 0 <= y0 < y1 <= h):
            raise ValueError('Fixed-fragment ROI is outside source')
        region = np.s_[y0:y1, x0:x1]
        blocked = protected[region].copy()
        for other, plane in enumerate(planes):
            if other != number and not components[other]['selection'].get('propagate', True):
                blocked |= cv2.dilate((plane[region] >= 24).astype(np.uint8),
                                      np.ones((7, 7), np.uint8)) > 0
        support = cv2.dilate(np.maximum(planes[number][region], first[number][region]),
                             np.ones((3, 3), np.uint8)) >= 24
        count, labels, stats, _ = cv2.connectedComponentsWithStats(
            (alpha[region] > 8).astype(np.uint8), 8)
        removed, pixels = 0, 0
        for label in range(1, count):
            x, y, width, height, area = stats[label]
            if (area > 64 or x == 0 or y == 0
                    or x + width == x1 - x0 or y + height == y1 - y0):
                continue
            island = labels == label
            if blocked[island].any() or support[island].any():
                continue
            result[region][island] = 0
            removed += 1
            pixels += int(area)
        records.append({'componentId': selection['id'], 'removedIslands': removed,
                        'changedPixels': pixels, 'roi': list(roi)})
    return result, records


def polish_fixed_source_objects(rgb, alpha, guidance, index, component_ids,
                               infer, *, max_side=1024):
    """Call ``infer(current_rgb_crop, trimap)`` only on verified source ROIs.

    The callback returns float alpha in [0, 1]. Its trimap is built from this
    execution's source-classified alpha, rather than treating raw SAM scores
    as opacity. Nothing from an older published artifact is a new annotation.
    """
    if (rgb.dtype != np.uint8 or alpha.dtype != np.uint8 or alpha.ndim != 2
            or rgb.shape != (*alpha.shape, 3) or type(index) is not int
            or index < 0 or type(max_side) is not int or max_side < 32):
        raise ValueError('Fixed-source neural geometry differs')
    if not guidance or not component_ids:
        return alpha.copy(), []
    directory, manifest = guidance
    reference = manifest.get('_reference_rgb')
    if reference is None or reference.shape != rgb.shape or reference.dtype != np.uint8:
        raise ValueError('Fixed-source reference geometry differs')
    components = manifest['components']
    planes = [np.asarray(Image.open(directory / c['frames'][index]['file']))
              for c in components]
    if any(p.shape != alpha.shape or p.dtype != np.uint8 for p in planes):
        raise ValueError('Fixed-source component geometry differs')
    moving = np.zeros(alpha.shape, np.uint8)
    for component, plane in zip(components, planes):
        if not component['selection'].get('propagate', True):
            continue
        binary = (plane >= 128).astype(np.uint8)
        if binary.any():
            cv2.fillConvexPoly(moving, cv2.convexHull(cv2.findNonZero(binary)), 1)
        moving |= (plane >= 24).astype(np.uint8)
    if not moving.any():
        return alpha.copy(), []
    moving = cv2.dilate(moving, np.ones((31, 31), np.uint8)) > 0
    changed = np.max(np.abs(rgb.astype(np.int16) - reference.astype(np.int16)), axis=2) > 24
    result = alpha.copy()
    records = []
    h, w = alpha.shape
    for number, component in enumerate(components):
        selection = component['selection']
        if selection.get('propagate', True) or selection['id'] not in component_ids:
            continue
        roi = component.get('roi')
        if (not isinstance(roi, (list, tuple)) or len(roi) != 4
                or any(type(v) not in (int, float) or not np.isfinite(v)
                       or int(v) != v for v in roi)):
            raise ValueError('Fixed-source inference ROI differs')
        x0, y0, x1, y1 = map(int, roi)
        if not (0 <= x0 < x1 <= w and 0 <= y0 < y1 <= h):
            raise ValueError('Fixed-source inference ROI is outside source')
        region = np.s_[y0:y1, x0:x1]
        protected = moving.copy()
        for other, plane in enumerate(planes):
            if other != number:
                protected |= cv2.dilate((plane >= 64).astype(np.uint8),
                                        np.ones((7, 7), np.uint8)) > 0
        allowed = ~protected[region] & ~changed[region]
        if not allowed.any():
            continue
        prior = alpha[region]
        inside = cv2.erode((prior >= 250).astype(np.uint8),
                           np.ones((5, 5), np.uint8)) > 0
        outside = cv2.dilate((prior >= 8).astype(np.uint8),
                            np.ones((15, 15), np.uint8)) == 0
        if not inside.any() or not outside.any():
            continue
        trimap = np.full(alpha.shape, 0, np.uint8)
        local = np.full(prior.shape, 128, np.uint8)
        local[inside] = 255
        local[outside] = 0
        trimap[region] = local
        # Existing source-bound clicks persist under the same ownership and
        # RGB agreement checks as the rest of the alpha pipeline.
        trimap = condition_trimap_clicks(trimap, rgb, reference,
            [(c['selection'], p) for c, p in zip(components, planes)], index)
        local = trimap[region]
        if not (local == 255).any() or not (local == 0).any():
            continue
        # The inference callback owns registered resizing/padding. Passing the
        # original source crop here never enlarges or synthesizes source RGB.
        values = infer(rgb[region], local, max_side)
        if (not isinstance(values, np.ndarray) or values.shape != prior.shape
                or not np.issubdtype(values.dtype, np.floating)
                or not np.isfinite(values).all() or (values < 0).any()
                or (values > 1).any()):
            raise ValueError('Invalid fixed-source neural alpha')
        candidate = np.rint(values * 255).astype(np.uint8)
        candidate[local == 255] = 255
        candidate[local == 0] = 0
        result[region][allowed] = candidate[allowed]
        records.append({'componentId': selection['id'], 'roi': list(roi),
                        'changedPixels': int(np.count_nonzero(result[region] != prior)),
                        'currentSourceRgb': True})
    return result, records
