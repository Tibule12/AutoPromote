"""Real-frame subject segmentation, face/head/body safety, and clutter-aware Smart Safe caption zoning.

Combines:
1. Robust Video Matting ONNX (`rvm_mobilenetv3_fp32.onnx`) CPU person segmentation
   when available locally (pixel-accurate head, hair, shoulders, raised hands, limbs),
2. OpenCV YuNet face detection + Haar frontal/profile fallback,
3. Visual clutter & bright illuminated-screen saliency (avoids glowing TV graphics,
   busy posters, mic booms, and high-frequency text textures), and
4. Temporal multi-frame union per cue + aspect-aware dense pocket search so captions
   consistently land in calm open background space with clean edge margins.
"""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
import logging
import os
from pathlib import Path
from typing import Any, Callable, Dict, List, Mapping, Optional, Sequence, Tuple

import cv2
import numpy as np

try:
    import onnxruntime as ort
except ImportError:  # pragma: no cover - optional runtime guard
    ort = None  # type: ignore[assignment]

logger = logging.getLogger(__name__)

_MODEL_DIR = Path(__file__).resolve().parent / "models" / "yunet"
YUNET_MODEL_PATH = str(_MODEL_DIR / "face_detection_yunet_2023mar.onnx")

_RVM_CANDIDATES = (
    os.environ.get("AUTOPROMOTE_RVM_ONNX", "").strip(),
    str(
        Path.home()
        / ".cache"
        / "autopromote-model-runtime"
        / "rvm-private-cpu-evaluation-v1"
        / "rvm_mobilenetv3_fp32.onnx"
    ),
    str(Path(__file__).resolve().parent / "models" / "rvm_mobilenetv3_fp32.onnx"),
)

# Canonical zones used across both Smart Safe zoning and creator stage presets.
# Format: (x_center_norm, y_center_norm, box_width_norm, box_height_norm)
CANDIDATE_ZONES: Dict[str, Tuple[float, float, float, float]] = {
    "background_center": (0.50, 0.16, 0.56, 0.14),
    "background_left": (0.20, 0.17, 0.28, 0.15),
    "background_right": (0.80, 0.17, 0.28, 0.15),
    "top_center": (0.50, 0.14, 0.54, 0.13),
    "top_left": (0.19, 0.16, 0.26, 0.15),
    "top_right": (0.81, 0.16, 0.26, 0.15),
    "side_left": (0.18, 0.44, 0.24, 0.17),
    "side_right": (0.82, 0.44, 0.24, 0.17),
    "shoulder_left": (0.22, 0.52, 0.26, 0.16),
    "shoulder_right": (0.78, 0.52, 0.26, 0.16),
    "bottom_left": (0.22, 0.80, 0.28, 0.15),
    "bottom_right": (0.78, 0.80, 0.28, 0.15),
    "bottom_center": (0.50, 0.83, 0.58, 0.13),
    "lower_center": (0.50, 0.82, 0.58, 0.13),
}

ZONE_TO_ASS_ALIGN: Dict[str, int] = {
    "background_center": 8,
    "background_left": 7,
    "background_right": 9,
    "top_center": 8,
    "top_left": 7,
    "top_right": 9,
    "side_left": 4,
    "side_right": 6,
    "shoulder_left": 4,
    "shoulder_right": 6,
    "bottom_left": 1,
    "bottom_right": 3,
    "bottom_center": 2,
    "lower_center": 2,
    "custom": 5,
}

# Soft stylistic preferences broken automatically whenever subjects or clutter occupy the pocket.
STYLE_ZONE_AFFINITIES: Dict[str, Dict[str, float]] = {
    "wall_type": {
        "background_center": 0.24,
        "background_left": 0.22,
        "background_right": 0.22,
        "top_left": 0.16,
        "top_right": 0.16,
        "top_center": 0.12,
    },
    "editorial_duo": {
        "side_left": 0.18,
        "side_right": 0.18,
        "top_left": 0.14,
        "top_right": 0.14,
        "shoulder_left": 0.10,
        "shoulder_right": 0.10,
    },
    "watch_me": {
        "side_left": 0.15,
        "side_right": 0.15,
        "top_center": 0.12,
        "bottom_center": 0.10,
    },
    "story_pop": {
        "bottom_center": 0.14,
        "bottom_left": 0.10,
        "bottom_right": 0.10,
        "top_center": 0.08,
    },
    "sticker": {
        "side_left": 0.12,
        "side_right": 0.12,
        "bottom_right": 0.12,
        "bottom_left": 0.12,
    },
    "glass": {
        "bottom_center": 0.14,
        "top_center": 0.10,
        "bottom_left": 0.08,
        "bottom_right": 0.08,
    },
    "kinetic_bar": {
        "bottom_center": 0.18,
        "top_center": 0.10,
    },
}


@dataclass
class DetectorBank:
    yunet_path: Optional[str]
    frontal_cascade: Optional[cv2.CascadeClassifier]
    profile_cascade: Optional[cv2.CascadeClassifier]
    rvm_session: Optional[Any] = None


def _resolve_rvm_model_path() -> Optional[str]:
    for cand in _RVM_CANDIDATES:
        if cand and os.path.isfile(cand):
            return cand
    return None


@lru_cache(maxsize=1)
def _get_detectors() -> DetectorBank:
    yunet_path = YUNET_MODEL_PATH if os.path.isfile(YUNET_MODEL_PATH) else None
    haar_base = getattr(cv2.data, "haarcascades", "")
    frontal = None
    profile = None
    if haar_base:
        f_path = os.path.join(haar_base, "haarcascade_frontalface_default.xml")
        p_path = os.path.join(haar_base, "haarcascade_profileface.xml")
        if os.path.isfile(f_path):
            frontal = cv2.CascadeClassifier(f_path)
        if os.path.isfile(p_path):
            profile = cv2.CascadeClassifier(p_path)

    rvm_session = None
    rvm_path = _resolve_rvm_model_path()
    if ort is not None and rvm_path:
        try:
            opts = ort.SessionOptions()
            opts.inter_op_num_threads = 2
            opts.intra_op_num_threads = 4
            rvm_session = ort.InferenceSession(
                rvm_path, sess_options=opts, providers=["CPUExecutionProvider"]
            )
        except Exception as exc:  # pragma: no cover - runtime safety
            logger.debug("Unable to load RVM ONNX model %s: %s", rvm_path, exc)
            rvm_session = None

    return DetectorBank(
        yunet_path=yunet_path,
        frontal_cascade=frontal,
        profile_cascade=profile,
        rvm_session=rvm_session,
    )


class RvmMatteTracker:
    """Stateful recurrent Robust Video Matting runner for video sequences on CPU."""

    def __init__(self, target_long_edge: int = 384, downsample_ratio: float = 0.5) -> None:
        self.session = _get_detectors().rvm_session
        self.target_long_edge = int(max(256, target_long_edge))
        self.downsample_ratio = float(downsample_ratio)
        self.rec = [np.zeros([1, 1, 1, 1], dtype=np.float32) for _ in range(4)]

    @property
    def available(self) -> bool:
        return self.session is not None

    def reset(self) -> None:
        self.rec = [np.zeros([1, 1, 1, 1], dtype=np.float32) for _ in range(4)]

    def step(self, frame_bgr: np.ndarray, warmup_passes: int = 1) -> Optional[np.ndarray]:
        """Return full-resolution [0..1] float32 foreground person alpha for `frame_bgr`."""
        if self.session is None or frame_bgr is None or frame_bgr.size == 0:
            return None
        fh, fw = frame_bgr.shape[:2]
        scale = float(self.target_long_edge) / float(max(fh, fw))
        nh = max(32, int(round(fh * scale / 16.0) * 16))
        nw = max(32, int(round(fw * scale / 16.0) * 16))
        resized = cv2.resize(frame_bgr, (nw, nh), interpolation=cv2.INTER_LINEAR)
        rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        inp = np.ascontiguousarray(rgb.transpose(2, 0, 1)[None])
        ds = np.array([self.downsample_ratio], dtype=np.float32)

        pha = None
        for _ in range(max(1, int(warmup_passes))):
            outputs = self.session.run(
                None,
                {
                    "src": inp,
                    "r1i": self.rec[0],
                    "r2i": self.rec[1],
                    "r3i": self.rec[2],
                    "r4i": self.rec[3],
                    "downsample_ratio": ds,
                },
            )
            pha = outputs[1]
            self.rec = list(outputs[2:6])

        if pha is None:
            return None
        alpha_small = np.clip(pha[0, 0], 0.0, 1.0).astype(np.float32)
        if (alpha_small.shape[0], alpha_small.shape[1]) != (fh, fw):
            return cv2.resize(alpha_small, (fw, fh), interpolation=cv2.INTER_LINEAR)
        return alpha_small


def segment_person_alpha_rvm(
    frame_bgr: np.ndarray, target_long_edge: int = 384, passes: int = 2
) -> Optional[np.ndarray]:
    """Run stateless 2-pass RVM matte inference on a single BGR frame."""
    tracker = RvmMatteTracker(target_long_edge=target_long_edge, downsample_ratio=0.5)
    if not tracker.available:
        return None
    return tracker.step(frame_bgr, warmup_passes=passes)


def _create_yunet(yunet_path: str, w: int, h: int) -> Optional[Any]:
    try:
        return cv2.FaceDetectorYN.create(
            yunet_path,
            "",
            (int(w), int(h)),
            score_threshold=0.52,
            nms_threshold=0.3,
            top_k=500,
        )
    except Exception as exc:  # pragma: no cover
        logger.debug("Unable to init YuNet: %s", exc)
        return None


def detect_faces_in_frame(frame_bgr: np.ndarray) -> List[Tuple[float, float, float, float, float]]:
    """Detect faces in a BGR frame and return normalized [(x1, y1, x2, y2, score), ...]."""
    if frame_bgr is None or frame_bgr.size == 0:
        return []
    orig_h, orig_w = frame_bgr.shape[:2]
    max_side = max(orig_w, orig_h)
    scale = 1.0
    work = frame_bgr
    if max_side > 640:
        scale = 640.0 / float(max_side)
        work = cv2.resize(
            frame_bgr,
            (max(32, round(orig_w * scale)), max(32, round(orig_h * scale))),
            interpolation=cv2.INTER_AREA,
        )
    wh, ww = work.shape[:2]
    bank = _get_detectors()
    boxes: List[Tuple[float, float, float, float, float]] = []

    if bank.yunet_path:
        det = _create_yunet(bank.yunet_path, ww, wh)
        if det is not None:
            _, raw = det.detect(work)
            if raw is not None and len(raw) > 0:
                for row in raw:
                    x, y, bw, bh = float(row[0]), float(row[1]), float(row[2]), float(row[3])
                    conf = float(row[14]) if len(row) > 14 else 0.85
                    if bw > 4 and bh > 4:
                        boxes.append(
                            (
                                max(0.0, x / ww),
                                max(0.0, y / wh),
                                min(1.0, (x + bw) / ww),
                                min(1.0, (y + bh) / wh),
                                conf,
                            )
                        )

    if not boxes:
        gray = cv2.cvtColor(work, cv2.COLOR_BGR2GRAY)
        gray = cv2.equalizeHist(gray)
        min_dim = max(18, round(min(ww, wh) * 0.06))
        for cascade in (bank.frontal_cascade, bank.profile_cascade):
            if cascade is None or cascade.empty():
                continue
            found = cascade.detectMultiScale(
                gray, scaleFactor=1.12, minNeighbors=4, minSize=(min_dim, min_dim)
            )
            if found is not None and len(found) > 0:
                for x, y, bw, bh in found:
                    boxes.append(
                        (
                            max(0.0, float(x) / ww),
                            max(0.0, float(y) / wh),
                            min(1.0, float(x + bw) / ww),
                            min(1.0, float(y + bh) / wh),
                            0.72,
                        )
                    )
            if boxes:
                break

    # Non-maximum deduplication
    deduped: List[Tuple[float, float, float, float, float]] = []
    for box in sorted(boxes, key=lambda item: item[4], reverse=True):
        x1, y1, x2, y2, _ = box
        overlaps = False
        for ox1, oy1, ox2, oy2, _ in deduped:
            ix1, iy1 = max(x1, ox1), max(y1, oy1)
            ix2, iy2 = min(x2, ox2), min(y2, oy2)
            if ix2 > ix1 and iy2 > iy1:
                inter = (ix2 - ix1) * (iy2 - iy1)
                a1 = max(1e-6, (x2 - x1) * (y2 - y1))
                if inter / a1 > 0.4:
                    overlaps = True
                    break
        if not overlaps:
            deduped.append(box)
    return deduped


def _estimate_skin_and_edge_maps(work_bgr: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    """Compute human skin plausibility + multi-signal graphic/TV-screen clutter map in [0..1]."""
    ycrcb = cv2.cvtColor(work_bgr, cv2.COLOR_BGR2YCrCb)
    skin_ycrcb = cv2.inRange(ycrcb, (28, 132, 74), (242, 178, 130))
    hsv = cv2.cvtColor(work_bgr, cv2.COLOR_BGR2HSV)
    skin_hsv = cv2.inRange(hsv, (0, 26, 38), (28, 195, 255))
    skin_mask = cv2.bitwise_and(skin_ycrcb, skin_hsv)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    skin_mask = cv2.morphologyEx(skin_mask, cv2.MORPH_OPEN, k)
    skin_mask = cv2.morphologyEx(skin_mask, cv2.MORPH_DILATE, k)

    gray = cv2.cvtColor(work_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    # 1. Text/stroke/mic high-frequency detail
    edges = cv2.Canny(gray.astype(np.uint8), 55, 145).astype(np.float32) / 255.0
    lap = np.clip(np.abs(cv2.Laplacian(gray, cv2.CV_32F)) / 42.0, 0.0, 1.0)
    # 2. Local luminance contrast variance (screens/posters/stripes)
    blur_l = cv2.GaussianBlur(gray, (15, 15), 0)
    local_std = np.clip(
        np.sqrt(np.maximum(0.0, cv2.GaussianBlur(gray * gray, (15, 15), 0) - blur_l * blur_l))
        / 45.0,
        0.0,
        1.0,
    )
    # 3. Bright illuminated TV/billboard chromatic salience (high saturation + brightness)
    sat = hsv[:, :, 1].astype(np.float32) / 255.0
    val = hsv[:, :, 2].astype(np.float32) / 255.0
    glow_graphic = np.clip((sat - 0.36) * 2.1, 0.0, 1.0) * np.clip((val - 0.50) * 2.2, 0.0, 1.0)
    # Also penalize harsh bright white text/UI elements inside bright regions
    bright_text = ((val > 0.78) & (lap > 0.25)).astype(np.float32)

    raw_clutter = np.clip(
        edges * 0.24 + lap * 0.20 + local_std * 0.22 + glow_graphic * 1.15 + bright_text * 0.85,
        0.0,
        1.0,
    )
    # Smooth clutter density slightly over nearby graphic neighborhood so text stays off screen edges
    clutter_map = cv2.GaussianBlur(raw_clutter, (23, 23), 0)
    # Penalize TV/screen perimeter bleed explicitly by taking partial max with blurred peak
    peak_clutter = cv2.dilate(raw_clutter, cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9)))
    clutter_map = np.clip(np.maximum(clutter_map, peak_clutter * 0.68), 0.0, 1.0)
    return (skin_mask > 0).astype(np.uint8), clutter_map.astype(np.float32)


def estimate_subject_occupancy(
    frame_bgr: np.ndarray,
    rvm_alpha: Optional[np.ndarray] = None,
) -> Dict[str, Any]:
    """Build pixel masks at working resolution for `face`, `body`, and `clutter`."""
    orig_h, orig_w = frame_bgr.shape[:2]
    scale = min(1.0, 384.0 / float(max(orig_w, orig_h)))
    ww = max(64, round(orig_w * scale))
    wh = max(64, round(orig_h * scale))
    work = (
        cv2.resize(frame_bgr, (ww, wh), interpolation=cv2.INTER_AREA)
        if scale < 1.0
        else frame_bgr.copy()
    )

    faces = detect_faces_in_frame(work)
    face_mask = np.zeros((wh, ww), dtype=np.uint8)
    skin_mask, clutter_map = _estimate_skin_and_edge_maps(work)

    # 1. Exact face + hairline/chin envelope from detected face boxes
    for x1, y1, x2, y2, _ in faces:
        fw = x2 - x1
        fh = y2 - y1
        hx1 = max(0, int(round((x1 - fw * 0.16) * ww)))
        hy1 = max(0, int(round((y1 - fh * 0.24) * wh)))
        hx2 = min(ww, int(round((x2 + fw * 0.16) * ww)))
        hy2 = min(wh, int(round((y2 + fh * 0.12) * wh)))
        face_mask[hy1:hy2, hx1:hx2] = 1

    # 2. Primary human silhouette via Robust Video Matting (RVM ONNX)
    alpha_work = rvm_alpha
    if alpha_work is None:
        alpha_work = segment_person_alpha_rvm(work, target_long_edge=384, passes=2)
    elif alpha_work.shape[:2] != (wh, ww):
        alpha_work = cv2.resize(alpha_work.astype(np.float32), (ww, wh), interpolation=cv2.INTER_LINEAR)

    body_mask = np.zeros((wh, ww), dtype=np.uint8)
    has_rvm_person = (
        alpha_work is not None
        and float(alpha_work.max()) >= 0.45
        and float((alpha_work > 0.35).mean()) >= 0.012
    )

    if has_rvm_person and alpha_work is not None:
        raw_person = (alpha_work > 0.28).astype(np.uint8)
        pad_px = max(5, round(min(ww, wh) * 0.022))
        close_k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        dil_k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (pad_px * 2 + 1, pad_px * 2 + 1))
        raw_person = cv2.morphologyEx(raw_person, cv2.MORPH_CLOSE, close_k)
        body_mask = cv2.dilate(raw_person, dil_k, iterations=1)
        body_mask = np.maximum(body_mask, face_mask)
        # Ensure face_mask also captures the upper head blob if YuNet missed extreme profile/cap
        if not faces and float(raw_person.mean()) >= 0.025:
            ys, xs = np.where(raw_person > 0)
            if len(ys) > 0:
                py1, py2 = int(ys.min()), int(ys.max())
                head_cutoff = py1 + max(12, round((py2 - py1) * 0.34))
                head_slice = raw_person[py1:head_cutoff, :]
                hys, hxs = np.where(head_slice > 0)
                if len(hxs) > 0:
                    fx1 = max(0, int(hxs.min()) - 4)
                    fx2 = min(ww, int(hxs.max()) + 4)
                    fy1 = max(0, py1 - 4)
                    fy2 = min(wh, head_cutoff)
                    face_mask[fy1:fy2, fx1:fx2] = 1
    else:
        # Fallback for synthetic frames / no-RVM environments: proportionate silhouette under YuNet faces
        for x1, y1, x2, y2, _ in faces:
            fw = x2 - x1
            fh = y2 - y1
            cx = (x1 + x2) * 0.5
            # Tight shoulder oval directly under face (never bleeding wide 1.25*fw across corners!)
            bx1 = max(0.0, cx - fw * 0.85)
            bx2 = min(1.0, cx + fw * 0.85)
            by1 = max(0.0, y2 - fh * 0.05)
            by2 = min(1.0, y2 + fh * 3.2)
            px1, py1 = int(round(bx1 * ww)), int(round(by1 * wh))
            px2, py2 = int(round(bx2 * ww)), int(round(by2 * wh))
            if px2 > px1 + 6 and py2 > py1 + 6:
                body_mask[py1:py2, px1:px2] = 1

        # GrabCut / center-person fallback when neither RVM nor face detector matched
        if not faces:
            try:
                bgd = np.zeros((1, 65), np.float64)
                fgd = np.zeros((1, 65), np.float64)
                margin_x = max(8, round(ww * 0.14))
                margin_y = max(8, round(wh * 0.10))
                gc_mask = np.full((wh, ww), cv2.GC_PR_BGD, dtype=np.uint8)
                gc_mask[:margin_y, :] = cv2.GC_BGD
                gc_mask[-margin_y // 2 :, :] = cv2.GC_BGD
                gc_mask[:, :margin_x] = cv2.GC_BGD
                gc_mask[:, -margin_x:] = cv2.GC_BGD
                cx1, cx2 = round(ww * 0.30), round(ww * 0.70)
                cy1, cy2 = round(wh * 0.14), round(wh * 0.90)
                gc_mask[cy1:cy2, cx1:cx2] = cv2.GC_PR_FGD
                gc_mask[(skin_mask > 0)] = cv2.GC_FGD
                cv2.grabCut(work, gc_mask, None, bgd, fgd, 2, cv2.GC_INIT_WITH_MASK)
                fg = np.where((gc_mask == cv2.GC_FGD) | (gc_mask == cv2.GC_PR_FGD), 1, 0).astype(
                    np.uint8
                )
                k3 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
                fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, k3)
                fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, k3)
                body_mask = np.maximum(body_mask, fg)
            except Exception:
                body_mask = np.maximum(body_mask, skin_mask)

        if float(skin_mask.mean()) < 0.35:
            body_mask = np.maximum(body_mask, skin_mask)
        body_mask = np.maximum(body_mask, face_mask)

    # Also evaluate wall/background smoothness & luminance for scrim decisions
    gray_norm = cv2.cvtColor(work, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0

    return {
        "work_w": ww,
        "work_h": wh,
        "faces": faces,
        "face_mask": face_mask,
        "body_mask": body_mask,
        "clutter_map": clutter_map,
        "luma_map": gray_norm,
        "used_rvm": bool(has_rvm_person),
    }


def _estimate_caption_box_fractions(
    w: int,
    h: int,
    style_name: str,
    caption_scale: float,
    cue_text: str,
    base_wf: float,
    base_hf: float,
) -> Tuple[float, float]:
    """Scale candidate evaluation rectangle realistically to rendered caption size and aspect."""
    aspect = float(w) / float(max(1, h))
    text_clean = str(cue_text or "").strip()
    word_count = max(1, len(text_clean.split())) if text_clean else 4
    char_count = max(8, len(text_clean)) if text_clean else 18

    scale = max(0.75, min(1.35, float(caption_scale or 1.0)))
    # Side/corner pills wrap across 2-3 compact lines; wide top/bottom/square bars take 1-2 lines.
    if aspect >= 1.25:
        # 16:9 / landscape: compact pocket width (`0.22..0.44` depending on wide vs side zone)
        wf_factor = min(1.12, max(0.76, (char_count / 24.0) * 0.92))
        hf_factor = 1.0 + (0.14 if word_count >= 5 else 0.0)
    elif aspect >= 0.88:
        # 1:1 square: keep captions wider so text fits in 1-2 lines cleanly above/below speaker
        wf_factor = min(1.45, max(1.08, 0.56 / max(0.24, base_wf)))
        hf_factor = 1.02
    else:
        # 9:16 & 4:5 portrait: narrower pixel frame needs wider normalized span
        wf_factor = min(1.45, max(1.05, 0.58 / max(0.24, base_wf)))
        hf_factor = 1.06

    if style_name in {"headline", "spring_slam", "wall_type"}:
        scale *= 1.06
    wf = max(0.24 if aspect >= 1.25 else 0.48, min(0.84, base_wf * scale * wf_factor * (1.12 if aspect >= 1.25 else 1.0)))
    hf = max(0.16 if aspect >= 1.25 else 0.14, min(0.30, base_hf * scale * hf_factor * (1.16 if aspect >= 1.25 else 1.06)))
    return wf, hf


def _zone_rect_pixels(
    xc: float,
    yc: float,
    wf: float,
    hf: float,
    w: int,
    h: int,
    scale: float = 1.0,
) -> Tuple[int, int, int, int]:
    sw = max(0.14, min(0.84, wf * scale))
    sh = max(0.09, min(0.34, hf * scale))
    # Keep 5.5% inside horizontal edges & 6% vertical edges so captions avoid rounded black letterbox bezels
    margin_x = 0.055
    margin_y = 0.060
    x1 = max(round(w * margin_x), round((xc - sw * 0.5) * w))
    y1 = max(round(h * margin_y), round((yc - sh * 0.5) * h))
    x2 = min(w - round(w * margin_x), round((xc + sw * 0.5) * w))
    y2 = min(h - round(h * margin_y), round((yc + sh * 0.5) * h))
    return (x1, y1, max(x1 + 4, x2), max(y1 + 4, y2))


def _measure_region(
    face_mask: np.ndarray,
    body_mask: np.ndarray,
    clutter_map: np.ndarray,
    rect: Tuple[int, int, int, int],
) -> Tuple[float, float, float]:
    x1, y1, x2, y2 = rect
    face_ov = float(face_mask[y1:y2, x1:x2].mean()) if face_mask.size else 0.0
    body_ov = float(body_mask[y1:y2, x1:x2].mean()) if body_mask.size else 0.0
    clutter = float(clutter_map[y1:y2, x1:x2].mean()) if clutter_map.size else 0.0
    return face_ov, body_ov, clutter


def score_candidate_zones(
    face_mask: np.ndarray,
    body_mask: np.ndarray,
    clutter_mask: np.ndarray,
    style_name: str = "word_pill",
    caption_scale: float = 1.0,
    cue_index: int = 0,
    preferred_mode: str = "smart_safe",
    previous_zone: Optional[str] = None,
    cue_text: str = "",
) -> Dict[str, Any]:
    """Score named zones + dense fine-grid fallback; never settle over a face or noisy TV screen."""
    h, w = face_mask.shape[:2]
    style_key = str(style_name or "").strip().lower()
    mode_key = str(preferred_mode or "smart_safe").strip().lower()
    affinities = STYLE_ZONE_AFFINITIES.get(style_key, {})
    is_portrait = w < h

    candidate_names = list(CANDIDATE_ZONES.keys())
    if mode_key == "bottom":
        candidate_names = ["bottom_center", "bottom_left", "bottom_right", "side_left", "side_right"]
    elif mode_key in {"background_wall", "wall"}:
        candidate_names = [
            "background_center",
            "background_left",
            "background_right",
            "top_left",
            "top_right",
            "top_center",
        ]
    elif mode_key in {"side_by_side", "split"}:
        candidate_names = [
            "side_left",
            "side_right",
            "top_left",
            "top_right",
            "shoulder_left",
            "shoulder_right",
            "bottom_left",
            "bottom_right",
        ]

    best: Optional[Dict[str, Any]] = None
    all_scores: List[Dict[str, Any]] = []

    def evaluate_box(
        zone_name: str,
        xc: float,
        yc: float,
        wf: float,
        hf: float,
        affinity_override: Optional[float] = None,
    ) -> Dict[str, Any]:
        ewf, ehf = _estimate_caption_box_fractions(w, h, style_key, caption_scale, cue_text, wf, hf)
        rect = _zone_rect_pixels(xc, yc, ewf, ehf, w, h, scale=1.0)
        face_ov, body_ov, clutter = _measure_region(face_mask, body_mask, clutter_mask, rect)
        rx1, ry1, rx2, ry2 = rect
        rcx = round(((rx1 + rx2) * 0.5 / w) * 100.0, 2)
        rcy = round(((ry1 + ry2) * 0.5 / h) * 100.0, 2)

        affinity = affinity_override if affinity_override is not None else affinities.get(zone_name, 0.0)
        if mode_key in {"smart_safe", "auto_safe", "face_safe"}:
            affinity *= 0.25

        # Encourage gentle rhythm across opposite safe pockets when both are clean
        variety_bonus = 0.0
        if (
            previous_zone
            and zone_name != previous_zone
            and style_key in {"editorial_duo", "watch_me", "sticker", "story_pop"}
            and mode_key in {"creative", "side_by_side"}
        ):
            variety_bonus = 0.06

        # Strict hierarchy: 0.00 face > 0.00 body > zero glowing TV/graphic clutter > aesthetic preference
        face_pen = face_ov * 48.0 + (4.0 if face_ov > 0.005 else 0.0)
        body_pen = body_ov * 18.0 + (2.8 if body_ov > 0.020 else 0.0)
        clutter_excess = max(0.0, clutter - 0.14)
        clutter_pen = clutter * 5.2 + (clutter_excess * clutter_excess) * 38.0
        edge_bias = 0.14 if abs(rcx - 50.0) > 36 and abs(rcy - 50.0) > 36 else 0.0
        portrait_margin_pen = 0.22 if (is_portrait and zone_name in {"side_left", "side_right"}) else 0.0

        cost = face_pen + body_pen + clutter_pen + edge_bias + portrait_margin_pen - affinity - variety_bonus
        return {
            "zone": zone_name,
            "x": rcx,
            "y": rcy,
            "rect": [round(rx1 / w, 4), round(ry1 / h, 4), round(rx2 / w, 4), round(ry2 / h, 4)],
            "faceOverlap": round(face_ov, 4),
            "bodyOverlap": round(body_ov, 4),
            "clutterScore": round(clutter, 4),
            "needsScrim": bool(clutter > 0.21),
            "cost": round(cost, 4),
            "assAlign": ZONE_TO_ASS_ALIGN.get(zone_name, 5),
        }

    for zone_name in candidate_names:
        xc, yc, wf, hf = CANDIDATE_ZONES[zone_name]
        entry = evaluate_box(zone_name, xc, yc, wf, hf)
        all_scores.append(entry)
        if best is None or entry["cost"] < best["cost"]:
            best = entry

    assert best is not None

    # Dense interior grid scan whenever named anchor wasn't crystal clear
    # (catches Beat 4 lower-left/lower-right pockets, tight 9:16 top/bottom gaps, and room margins)
    if (
        best["faceOverlap"] > 0.0
        or best["bodyOverlap"] > 0.015
        or best["clutterScore"] > 0.15
        or mode_key in {"smart_safe", "auto_safe", "face_safe"}
    ):
        aspect_wh = float(w) / float(max(1, h))
        if aspect_wh >= 1.25:
            width_probes = [(0.34, 0.15), (0.42, 0.16)]
        elif aspect_wh >= 0.88:
            # Square 1:1: wider horizontal bar keeps text at <=2 lines above/below subjects
            width_probes = [(0.52, 0.15), (0.64, 0.16)]
        else:
            width_probes = [(0.50, 0.14), (0.64, 0.15)]
        for probe_wf, probe_hf in width_probes:
            for gy in np.linspace(0.13, 0.85, 9):
                for gx in np.linspace(0.15, 0.85, 13):
                    custom_entry = evaluate_box(
                        "custom",
                        float(gx),
                        float(gy),
                        probe_wf,
                        probe_hf,
                        affinity_override=0.0,
                    )
                    # Prefer clean discrete named zone on near-ties so labels remain meaningful
                    if custom_entry["cost"] + 0.06 < best["cost"]:
                        best = custom_entry

    safety_score = round(
        max(
            0.0,
            1.0 - min(1.0, best["faceOverlap"] * 2.2 + best["bodyOverlap"] * 0.9 + best["clutterScore"] * 0.35),
        ),
        3,
    )
    top_candidates = sorted(all_scores, key=lambda r: r["cost"])[:5]
    return {
        "placement": best["zone"],
        "xPct": best["x"],
        "yPct": best["y"],
        "rect": best["rect"],
        "assAlign": best["assAlign"],
        "faceOverlap": best["faceOverlap"],
        "bodyOverlap": best["bodyOverlap"],
        "clutterScore": best["clutterScore"],
        "needsScrim": best["needsScrim"],
        "safetyScore": safety_score,
        "safe": bool(best["faceOverlap"] <= 0.01 and best["bodyOverlap"] <= 0.08),
        "chosen": best,
        "candidates": top_candidates,
    }


def _parse_aspect_ratio(aspect: Optional[str]) -> Optional[float]:
    raw = str(aspect or "").strip()
    if not raw:
        return None
    if ":" in raw:
        parts = raw.split(":", 1)
        try:
            a, b = float(parts[0]), float(parts[1])
            if a > 0 and b > 0:
                return a / b
        except ValueError:
            return None
    try:
        v = float(raw)
        return v if v > 0 else None
    except ValueError:
        return None


def apply_reframe_preview_crop(
    frame_bgr: np.ndarray,
    aspect: Optional[str] = None,
    crop_x: float = 50.0,
    crop_y: float = 50.0,
) -> np.ndarray:
    """Crop source frame to match active Studio export aspect (`9:16`, `1:1`, `4:5`, etc.)."""
    ratio = _parse_aspect_ratio(aspect)
    if not ratio or frame_bgr is None or frame_bgr.size == 0:
        return frame_bgr
    h, w = frame_bgr.shape[:2]
    src_ratio = w / max(1, h)
    if abs(src_ratio - ratio) < 0.02:
        return frame_bgr
    cx_frac = max(0.0, min(1.0, float(crop_x) / 100.0))
    cy_frac = max(0.0, min(1.0, float(crop_y) / 100.0))
    if src_ratio > ratio:
        crop_w = max(16, int(round(h * ratio)))
        x0 = max(0, min(w - crop_w, int(round((w - crop_w) * cx_frac))))
        return frame_bgr[:, x0 : x0 + crop_w]
    crop_h = max(16, int(round(w / ratio)))
    y0 = max(0, min(h - crop_h, int(round((h - crop_h) * cy_frac))))
    return frame_bgr[y0 : y0 + crop_h, :]


def analyze_caption_safety_for_segments(
    video_path: str,
    segments: Sequence[Mapping[str, Any]],
    style_name: str = "word_pill",
    caption_scale: float = 1.0,
    preferred_mode: str = "smart_safe",
    aspect: Optional[str] = None,
    crop_x: float = 50.0,
    crop_y: float = 50.0,
    progress_cb: Optional[Callable[[int, int], None]] = None,
) -> Dict[str, Any]:
    """Analyze real video frames across every cue's temporal window and return safe placement."""
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video for caption safety analysis: {video_path}")

    fps = float(cap.get(cv2.CAP_PROP_FPS) or 30.0)
    if fps <= 0.1 or fps > 120.0:
        fps = 30.0
    frame_count = max(1, int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 1))
    duration_s = frame_count / fps

    results: List[Dict[str, Any]] = []
    previous_zone: Optional[str] = None
    faces_total = 0
    adjusted_cues = 0
    rvm_frames_used = 0
    safety_sum = 0.0
    total_segs = len(segments)
    rvm_tracker = RvmMatteTracker(target_long_edge=384, downsample_ratio=0.5)

    try:
        for idx, seg in enumerate(segments):
            if progress_cb:
                progress_cb(idx, total_segs)
            s_time = float(seg.get("start_time", seg.get("start", 0.0)) or 0.0)
            e_time = float(seg.get("end_time", seg.get("end", s_time + 1.0)) or (s_time + 1.0))
            span = max(0.05, e_time - s_time)
            # Sample up to 3 points across cue duration (start + mid + end) for motion-safe envelope
            if span >= 0.45:
                sample_times = [
                    s_time + span * 0.16,
                    s_time + span * 0.50,
                    s_time + span * 0.84,
                ]
            else:
                sample_times = [s_time + span * 0.50]

            occ_list: List[Dict[str, Any]] = []
            rvm_tracker.reset()
            for t_idx, raw_t in enumerate(sample_times):
                t_clamped = max(0.0, min(duration_s - 0.02, raw_t))
                frame_idx = max(0, min(frame_count - 1, int(round(t_clamped * fps))))
                cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
                ok, frame_bgr = cap.read()
                if not ok or frame_bgr is None:
                    continue
                if aspect:
                    frame_bgr = apply_reframe_preview_crop(frame_bgr, aspect, crop_x, crop_y)
                rvm_alpha = (
                    rvm_tracker.step(frame_bgr, warmup_passes=2 if t_idx == 0 else 1)
                    if rvm_tracker.available
                    else None
                )
                occ_list.append(estimate_subject_occupancy(frame_bgr, rvm_alpha=rvm_alpha))

            if not occ_list:
                fallback_safety = {
                    "placement": "bottom_center",
                    "zone": "bottom_center",
                    "xPct": 50.0,
                    "yPct": 83.0,
                    "assAlign": 2,
                    "facesDetected": 0,
                    "faces": [],
                    "faceOverlap": 0.0,
                    "bodyOverlap": 0.0,
                    "clutterScore": 0.0,
                    "safetyScore": 1.0,
                    "needsScrim": False,
                    "safe": True,
                    "detector": "fallback-unreadable-frame",
                }
                results.append(
                    {
                        **dict(seg),
                        "index": idx,
                        "start": round(s_time, 3),
                        "end": round(e_time, 3),
                        "captionPlacement": "bottom_center",
                        "captionX": 50.0,
                        "captionY": 83.0,
                        "captionSafety": fallback_safety,
                    }
                )
                safety_sum += 1.0
                continue

            # Temporal union across sampled frames inside the cue window
            face_union = np.max(np.stack([o["face_mask"] for o in occ_list], axis=0), axis=0)
            body_union = np.max(np.stack([o["body_mask"] for o in occ_list], axis=0), axis=0)
            clutter_max = np.max(np.stack([o["clutter_map"] for o in occ_list], axis=0), axis=0)
            mid_occ = occ_list[len(occ_list) // 2]
            mid_faces = mid_occ["faces"]
            if mid_faces or any(o["faces"] for o in occ_list):
                faces_total += 1
            used_rvm = any(o.get("used_rvm") for o in occ_list)
            if used_rvm:
                rvm_frames_used += 1

            cue_text = str(seg.get("text") or "").strip()
            scored = score_candidate_zones(
                face_union,
                body_union,
                clutter_max,
                style_name=style_name,
                caption_scale=caption_scale,
                cue_index=idx,
                preferred_mode=preferred_mode,
                previous_zone=previous_zone,
                cue_text=cue_text,
            )
            chosen = scored["chosen"]
            if seg.get("captionPlacement") != chosen["zone"]:
                adjusted_cues += 1
            previous_zone = chosen["zone"]
            safety_sum += float(scored["safetyScore"])
            rep_faces = mid_faces or next((o["faces"] for o in occ_list if o["faces"]), [])

            safety_payload = {
                "placement": chosen["zone"],
                "zone": chosen["zone"],
                "xPct": chosen["x"],
                "yPct": chosen["y"],
                "rect": chosen["rect"],
                "assAlign": chosen["assAlign"],
                "faceOverlap": chosen["faceOverlap"],
                "bodyOverlap": chosen["bodyOverlap"],
                "clutterScore": chosen["clutterScore"],
                "safetyScore": scored["safetyScore"],
                "needsScrim": chosen["needsScrim"],
                "safe": bool(chosen["faceOverlap"] <= 0.04 and chosen["bodyOverlap"] <= 0.12),
                "facesDetected": len(rep_faces),
                "faces": [
                    {
                        "x1": round(f[0], 4),
                        "y1": round(f[1], 4),
                        "x2": round(f[2], 4),
                        "y2": round(f[3], 4),
                        "score": round(f[4], 3),
                    }
                    for f in rep_faces
                ],
                "alternatives": scored["candidates"],
                "detector": "rvm-onnx+yunet+clutter"
                if used_rvm
                else ("yunet+clutter" if rep_faces else "grabcut-clutter"),
            }

            results.append(
                {
                    **dict(seg),
                    "index": idx,
                    "start": round(s_time, 3),
                    "end": round(e_time, 3),
                    "captionPlacement": chosen["zone"],
                    "captionX": chosen["x"],
                    "captionY": chosen["y"],
                    "captionSafety": safety_payload,
                }
            )
    finally:
        cap.release()

    if progress_cb:
        progress_cb(total_segs, total_segs)

    clear_cues = sum(1 for r in results if float(r["captionSafety"].get("faceOverlap", 0.0)) < 0.04)
    summary = {
        "cuesAnalyzed": len(results),
        "facesDetectedCues": faces_total,
        "cuesWithRvmMatte": rvm_frames_used,
        "zeroFaceOverlapCues": clear_cues,
        "adjustedCues": adjusted_cues,
        "averageSafetyScore": round(safety_sum / max(1, len(results)), 3),
        "clearRatio": round(clear_cues / max(1, len(results)), 3),
        "preferredMode": preferred_mode,
        "styleName": style_name,
        "engine": "python-rvm-yunet-body-worker" if rvm_frames_used else "python-yunet-body-worker",
    }
    return {
        "videoPath": str(video_path),
        "summary": summary,
        "segmentsAnalyzed": len(results),
        "cuesWithDetectedFaces": faces_total,
        "cuesWithRvmMatte": rvm_frames_used,
        "clearOfFacesCues": clear_cues,
        "clearRatio": summary["clearRatio"],
        "preferredMode": preferred_mode,
        "styleName": style_name,
        "segments": results,
    }


def draw_safety_debug_overlay(frame_bgr: np.ndarray, safety: Mapping[str, Any]) -> np.ndarray:
    """Draw face/person protection boxes and chosen caption safe zone for visual verification."""
    out = frame_bgr.copy()
    h, w = out.shape[:2]
    for f in safety.get("faces") or []:
        x1, y1 = int(f["x1"] * w), int(f["y1"] * h)
        x2, y2 = int(f["x2"] * w), int(f["y2"] * h)
        cv2.rectangle(out, (x1, y1), (x2, y2), (0, 65, 255), 3)
        cv2.putText(
            out,
            f"FACE {f.get('score', 0):.2f}",
            (x1, max(22, y1 - 8)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (0, 65, 255),
            2,
        )
    rect = safety.get("rect")
    if rect and len(rect) == 4:
        rx1, ry1, rx2, ry2 = (
            int(rect[0] * w),
            int(rect[1] * h),
            int(rect[2] * w),
            int(rect[3] * h),
        )
        cv2.rectangle(out, (rx1, ry1), (rx2, ry2), (90, 235, 110), 3)
        zone_lbl = safety.get("zone") or safety.get("placement")
        label = (
            f"SAFE: {zone_lbl} "
            f"(face:{safety.get('faceOverlap', 0):.2f}, "
            f"body:{safety.get('bodyOverlap', 0):.2f}, "
            f"clutter:{safety.get('clutterScore', 0):.2f})"
        )
        cv2.putText(
            out,
            label,
            (rx1, max(24, ry1 - 8)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (90, 235, 110),
            2,
        )
    return out
