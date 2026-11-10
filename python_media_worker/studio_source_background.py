"""Verified, photographed background evidence for source-bound matting.

Unknown pixels are never an empty plate. Evidence is optional for older masks,
single-shot only, and bound to the same immutable source and mask manifest.
"""
import hashlib
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image


FILES = {"rgb": "observed_background.png", "support": "observed_background_support.png"}


@lru_cache(maxsize=1)
def _colour_step_kernel():
    # Matting already supplies numba. Compile only when photographed mixed
    # pixels actually need colour recovery; older/plain masks need no compiler.
    # No fast-math or disk cache: retain the original float64 operation order.
    from numba import njit

    @njit(cache=False, nogil=True)
    def step(f, rhs, base, strength):
        h, w, channels = f.shape
        following = np.empty_like(f)
        change = 0.
        for y in range(h):
            top, bottom = max(0, y-1), min(h-1, y+1)
            for x in range(w):
                left, right = max(0, x-1), min(w-1, x+1)
                denominator = base[y, x] + 4*strength
                for channel in range(channels):
                    # BORDER_REFLECT repeats the boundary pixel at +/-1.
                    near = (f[top, x, channel] + f[y, left, channel]
                            + f[y, right, channel] + f[bottom, x, channel])
                    value = min(1., max(0., (rhs[y, x, channel] + strength*near)/denominator))
                    following[y, x, channel] = value
                    change = max(change, abs(value-f[y, x, channel]))
        return following, change

    return step


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def evidence_files(manifest):
    evidence = manifest.get("observed_background")
    if evidence is None:
        return set()
    if (not isinstance(evidence, dict) or set(evidence) != {"version", "source_sha256", "method", "files"}
            or type(evidence["version"]) is not int or evidence["version"] != 1 or evidence["method"] != "separated_unselected_source_rgb_v1"
            or evidence["source_sha256"] != manifest.get("source_sha256")
            or manifest.get("shot_cuts") != [] or not isinstance(evidence["files"], dict)
            or set(evidence["files"]) != set(FILES)):
        raise ValueError("Invalid photographed background evidence")
    for key, name in FILES.items():
        row = evidence["files"][key]
        if (not isinstance(row, dict) or set(row) != {"file", "sha256"} or row["file"] != name
                or not isinstance(row["sha256"], str) or len(row["sha256"]) != 64
                or any(c not in "0123456789abcdef" for c in row["sha256"])):
            raise ValueError("Invalid photographed background file")
    return set(FILES.values())


def load_evidence(directory, manifest):
    if not evidence_files(manifest):
        return None
    directory = Path(directory).resolve()
    values = {}
    for key, name in FILES.items():
        path = directory / name
        if path.resolve().parent != directory or digest(path) != manifest["observed_background"]["files"][key]["sha256"]:
            raise ValueError("Photographed background hash or path changed")
        with Image.open(path) as picture:
            if (picture.format != "PNG" or picture.mode != ("RGB" if key == "rgb" else "L")
                    or picture.size != (manifest["width"], manifest["height"])):
                raise ValueError("Photographed background geometry or mode changed")
            values[key] = np.array(picture)
    if not np.isin(values["support"], [0, 255]).all() or not values["support"].any():
        raise ValueError("Invalid photographed background support")
    return values["rgb"], values["support"] > 0


def recover_foreground(rgb, alpha, background, observed, fallback, *, iterations=300, strength=.7):
    """Solve C = alpha F + (1-alpha) B using only observed source B.

    Current opaque pixels anchor a smooth colour field. Alpha, opaque source
    detail and unsupported pixels stay exact; no background is synthesized.
    The caller supplies alpha AFTER all corrections and object holdouts.
    """
    import cv2
    from scipy.ndimage import distance_transform_edt
    shape = alpha.shape
    if (rgb.shape != (*shape, 3) or background.shape != rgb.shape or fallback.shape != rgb.shape
            or observed.shape != shape or observed.dtype != bool or alpha.dtype != np.uint8):
        raise ValueError("Photographed foreground geometry or type differs")
    if not np.isfinite(fallback).all() or not 1 <= iterations <= 300 or not 0 < strength <= 1:
        raise ValueError("Invalid photographed foreground solve")
    opaque = alpha >= 254
    eligible = observed & (alpha > 0) & ~opaque
    if opaque.sum() < 32 or not eligible.any():
        return fallback.copy()
    # Solve only components near mixed edges; whole opaque regions do not
    # need hundreds of iterations at full frame resolution.
    domain = cv2.dilate(eligible.astype(np.uint8), np.ones((49, 49), np.uint8))
    count, labels, stats, _ = cv2.connectedComponentsWithStats(domain, 8)
    result = fallback.copy()
    colour_step = _colour_step_kernel()
    for label in range(1, count):
        x, y, w, h = stats[label, :4]
        sl = np.s_[y:y+h, x:x+w]
        anchors = opaque[sl]
        if anchors.sum() < 32:
            continue
        c = rgb[sl].astype(np.float64) / 255
        b = background[sl].astype(np.float64) / 255
        a = alpha[sl].astype(np.float64) / 255
        _, nearest = distance_transform_edt(~anchors, return_indices=True)
        initial = c[nearest[0], nearest[1]]
        f = initial.copy()
        anchor_weight = anchors.astype(np.float64) * 50
        data = a*a*observed[sl]
        rhs = a[..., None]*(c-(1-a[..., None])*b)*observed[sl][..., None]
        rhs += anchor_weight[..., None]*c + .001*initial
        base = data + anchor_weight + .001
        for _ in range(iterations):
            f, change = colour_step(f, rhs, base, strength)
            if change < 1e-5:
                break
        use = eligible[sl] & (labels[sl] == label)
        result[sl][use] = f[use]
    return result
