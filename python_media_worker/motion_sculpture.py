"""CPU-only, subject-aware cinematic podcast rendering.

The renderer keeps the real frame as its source of truth, separates the people from
the physical set, and applies restrained depth, light, and polish without replacing
faces or inventing a synthetic background.  Clean and Bold may use faint temporal
gesture echoes; Unreal deliberately disables them so the premium result still looks
like the podcast that was actually recorded.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
import json
import math
import os
import subprocess
from typing import Any, Deque, Dict, Iterable, Mapping, Optional, Sequence, Tuple

import cv2
import numpy as np

try:
    import mediapipe as mp
except ImportError:
    mp = None


CPU_VIDEO_ENCODER = "libx264"


@dataclass(frozen=True)
class MotionSculptureStyle:
    delays: Tuple[int, ...]
    opacities: Tuple[float, ...]
    glow_strength: float
    edge_strength: float
    ribbon_strength: float
    saturation: float
    cinematic_strength: float
    background_blur: float
    depth_push: float
    subject_polish: float
    vignette_strength: float
    light_sweep_strength: float
    echo_strength: float


MOTION_SCULPTURE_STYLES: Dict[str, MotionSculptureStyle] = {
    "clean": MotionSculptureStyle(
        delays=(2, 5),
        opacities=(0.16, 0.08),
        glow_strength=0.10,
        edge_strength=0.16,
        ribbon_strength=0.0,
        saturation=0.32,
        cinematic_strength=0.24,
        background_blur=1.2,
        depth_push=0.006,
        subject_polish=0.10,
        vignette_strength=0.10,
        light_sweep_strength=0.04,
        echo_strength=0.16,
    ),
    "bold": MotionSculptureStyle(
        delays=(3, 8, 15, 24),
        opacities=(0.34, 0.27, 0.20, 0.13),
        glow_strength=0.18,
        edge_strength=0.26,
        ribbon_strength=0.0,
        saturation=0.38,
        cinematic_strength=0.58,
        background_blur=2.2,
        depth_push=0.014,
        subject_polish=0.18,
        vignette_strength=0.18,
        light_sweep_strength=0.09,
        echo_strength=0.10,
    ),
    "unreal": MotionSculptureStyle(
        # At 30 fps these samples span roughly 1.7 seconds.  The wider temporal
        # spacing makes real gesture changes read as distinct sculpted poses,
        # instead of collapsing into a thin RGB fringe around the live subject.
        delays=(3, 8, 15, 24, 36, 50),
        opacities=(0.12, 0.09, 0.07, 0.05, 0.035, 0.02),
        glow_strength=0.0,
        edge_strength=0.0,
        ribbon_strength=0.0,
        saturation=0.16,
        cinematic_strength=1.0,
        background_blur=2.8,
        depth_push=0.012,
        subject_polish=0.20,
        vignette_strength=0.28,
        light_sweep_strength=0.16,
        echo_strength=0.0,
    ),
}

# OpenCV uses BGR ordering.  Cycling the palette by age keeps neighbouring
# silhouettes visually separate without shifting the live subject's colour.
TRAIL_PALETTE: Tuple[Tuple[int, int, int], ...] = (
    (255, 220, 38),   # cyan
    (255, 70, 180),   # violet
    (30, 170, 255),   # amber
    (205, 55, 255),   # magenta
)


@dataclass
class ForegroundLayer:
    image: np.ndarray
    alpha: np.ndarray
    bbox: Tuple[int, int, int, int]
    centroid: Tuple[int, int]


class MediaPipePersonSegmenter:
    """Small CPU person matte with no render-time model download."""

    def __init__(self, *, landscape: bool):
        if mp is None:
            raise RuntimeError(
                "Motion Sculpture requires the bundled MediaPipe person segmentation runtime"
            )
        self.model_selection = 1 if landscape else 0
        self._segmenter = mp.solutions.selfie_segmentation.SelfieSegmentation(
            model_selection=self.model_selection
        )

    def close(self) -> None:
        self._segmenter.close()

    def matte(
        self,
        frame: np.ndarray,
        previous_mask: Optional[np.ndarray],
    ) -> np.ndarray:
        height, width = frame.shape[:2]
        analysis_scale = min(1.0, 640.0 / max(height, width, 1))
        analysis_size = (
            max(2, round(width * analysis_scale)),
            max(2, round(height * analysis_scale)),
        )
        analysis_frame = cv2.resize(frame, analysis_size, interpolation=cv2.INTER_AREA)
        result = self._segmenter.process(
            cv2.cvtColor(analysis_frame, cv2.COLOR_BGR2RGB)
        )
        if result.segmentation_mask is None:
            raise RuntimeError("MediaPipe returned no person segmentation mask")

        probability = np.clip(result.segmentation_mask.astype(np.float32), 0.0, 1.0)
        probability = cv2.bilateralFilter(probability, 7, 0.08, 7)
        probability = cv2.resize(
            probability,
            (width, height),
            interpolation=cv2.INTER_LINEAR,
        )

        # Convert model confidence to a soft alpha while preserving hair and hand
        # edges. The temporal blend prevents the mask from breathing frame to frame.
        matte = np.clip((probability - 0.12) / 0.56, 0.0, 1.0)
        if previous_mask is not None and previous_mask.shape == (height, width):
            previous_probability = previous_mask.astype(np.float32) / 255.0
            matte = matte * 0.78 + previous_probability * 0.22

        binary = (matte >= 0.18).astype(np.uint8)
        component_count, labels, stats, _centroids = cv2.connectedComponentsWithStats(
            binary,
            connectivity=8,
        )
        keep = np.zeros_like(binary)
        frame_area = height * width
        components = sorted(
            range(1, component_count),
            key=lambda component: int(stats[component, cv2.CC_STAT_AREA]),
            reverse=True,
        )
        for component_index, component in enumerate(components):
            area = int(stats[component, cv2.CC_STAT_AREA])
            if component_index == 0 or area >= frame_area * 0.003:
                keep[labels == component] = 1

        if not np.any(keep):
            raise RuntimeError("No human subject was detected in the current frame")
        matte *= keep.astype(np.float32)
        matte = cv2.GaussianBlur(matte, (0, 0), sigmaX=1.8, sigmaY=1.8)
        return np.clip(matte * 255.0, 0, 255).astype(np.uint8)


def get_motion_sculpture_style(intensity: str) -> MotionSculptureStyle:
    return MOTION_SCULPTURE_STYLES.get(str(intensity or "bold").lower(), MOTION_SCULPTURE_STYLES["bold"])


def _safe_media_path(path: str, approved_tmp_dir: str, label: str) -> str:
    resolved_path = os.path.realpath(os.path.abspath(path))
    resolved_tmp = os.path.realpath(os.path.abspath(approved_tmp_dir))
    try:
        common = os.path.commonpath([resolved_path, resolved_tmp])
    except ValueError as error:
        raise ValueError(f"{label} path is invalid") from error
    if common != resolved_tmp:
        raise ValueError(f"{label} path must be within the approved tmp directory")
    return resolved_path


def validate_rendered_media(
    path: str,
    *,
    expected_audio: bool = False,
    minimum_duration: float = 0.05,
) -> Dict[str, Any]:
    """Validate that a render is non-empty, probeable, and browser-compatible."""

    if not os.path.isfile(path) or os.path.getsize(path) < 1024:
        raise RuntimeError("rendered media is missing or empty")
    probe = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration,size:stream=index,codec_type,codec_name,width,height,avg_frame_rate",
            "-of",
            "json",
            path,
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    payload = json.loads(probe.stdout or "{}")
    streams = payload.get("streams") or []
    video_streams = [stream for stream in streams if stream.get("codec_type") == "video"]
    audio_streams = [stream for stream in streams if stream.get("codec_type") == "audio"]
    duration = float((payload.get("format") or {}).get("duration") or 0.0)
    if not video_streams:
        raise RuntimeError("rendered media has no video stream")
    if duration < minimum_duration:
        raise RuntimeError("rendered media duration is invalid")
    if expected_audio and not audio_streams:
        raise RuntimeError("rendered media did not preserve the expected audio stream")
    if video_streams[0].get("codec_name") != "h264":
        raise RuntimeError("rendered media is not H.264")
    return {
        "duration": duration,
        "size": int((payload.get("format") or {}).get("size") or os.path.getsize(path)),
        "video": video_streams[0],
        "audio": audio_streams[0] if audio_streams else None,
    }


def _active_intensity(effects: Sequence[Mapping[str, Any]], timestamp: float) -> Optional[str]:
    for effect in effects:
        if float(effect.get("start_time", 0.0)) <= timestamp <= float(effect.get("end_time", 0.0)):
            return str(effect.get("intensity") or "bold").lower()
    return None


def _clamp_bbox(
    bbox: Tuple[int, int, int, int], width: int, height: int
) -> Tuple[int, int, int, int]:
    x, y, w, h = bbox
    x = max(0, min(width - 1, int(x)))
    y = max(0, min(height - 1, int(y)))
    w = max(1, min(width - x, int(w)))
    h = max(1, min(height - y, int(h)))
    return x, y, w, h


def _blend_bbox(
    previous: Optional[Tuple[int, int, int, int]],
    detected: Optional[Tuple[int, int, int, int]],
    width: int,
    height: int,
) -> Optional[Tuple[int, int, int, int]]:
    if detected is None:
        return previous
    if previous is None:
        return _clamp_bbox(detected, width, height)
    blended = tuple(round(old * 0.66 + new * 0.34) for old, new in zip(previous, detected))
    return _clamp_bbox(blended, width, height)


def _score_person_box(box: Sequence[int], width: int, height: int) -> float:
    x, y, w, h = [int(value) for value in box]
    center_x = x + w / 2.0
    center_penalty = abs(center_x - width / 2.0) / max(width, 1)
    return (w * h) * (1.0 - min(0.65, center_penalty))


def _detect_subject_bbox(
    frame: np.ndarray,
    motion_mask: np.ndarray,
    hog: Optional[Any],
    face_detector: cv2.CascadeClassifier,
    frame_index: int,
) -> Optional[Tuple[int, int, int, int]]:
    height, width = frame.shape[:2]
    candidates = []

    # HOG is model-free at runtime (the detector weights ship with OpenCV) and
    # gives a genuine human localization rather than treating every moving pixel
    # in the frame as the subject.
    if hog is not None and frame_index % 10 == 0:
        boxes, _weights = hog.detectMultiScale(
            frame,
            winStride=(8, 8),
            padding=(8, 8),
            scale=1.05,
        )
        candidates.extend(tuple(int(value) for value in box) for box in boxes)

    if frame_index % 6 == 0:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = face_detector.detectMultiScale(
            gray,
            scaleFactor=1.12,
            minNeighbors=4,
            minSize=(20, 20),
        )
        for face_x, face_y, face_w, face_h in faces:
            body_x = face_x - int(face_w * 2.1)
            body_y = face_y - int(face_h * 0.7)
            body_w = int(face_w * 5.2)
            body_h = int(face_h * 8.0)
            candidates.append(_clamp_bbox((body_x, body_y, body_w, body_h), width, height))

    if candidates:
        return max(candidates, key=lambda box: _score_person_box(box, width, height))

    contours, _hierarchy = cv2.findContours(
        motion_mask,
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE,
    )
    substantial = [
        contour
        for contour in contours
        if cv2.contourArea(contour) >= width * height * 0.0025
    ]
    if not substantial:
        return None
    subject_points = np.vstack(sorted(substantial, key=cv2.contourArea, reverse=True)[:4])
    x, y, w, h = cv2.boundingRect(subject_points)
    padding_x = max(3, int(w * 0.18))
    padding_y = max(3, int(h * 0.12))
    return _clamp_bbox(
        (x - padding_x, y - padding_y, w + padding_x * 2, h + padding_y * 2),
        width,
        height,
    )


def _subject_mask(
    frame: np.ndarray,
    background_subtractor: cv2.BackgroundSubtractor,
    hog: Optional[Any],
    face_detector: cv2.CascadeClassifier,
    previous_bbox: Optional[Tuple[int, int, int, int]],
    previous_mask: Optional[np.ndarray],
    frame_index: int,
) -> Tuple[np.ndarray, Optional[Tuple[int, int, int, int]]]:
    height, width = frame.shape[:2]
    longest_side = max(height, width)
    scale = min(1.0, 640.0 / max(longest_side, 1))
    analysis_size = (max(2, int(width * scale)), max(2, int(height * scale)))
    small = cv2.resize(frame, analysis_size, interpolation=cv2.INTER_AREA)

    learning_rate = 0.045 if frame_index < 18 else 0.012
    foreground = background_subtractor.apply(small, learningRate=learning_rate)
    _unused, foreground = cv2.threshold(foreground, 180, 255, cv2.THRESH_BINARY)
    foreground = cv2.medianBlur(foreground, 5)
    foreground = cv2.morphologyEx(
        foreground,
        cv2.MORPH_OPEN,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)),
    )
    foreground = cv2.morphologyEx(
        foreground,
        cv2.MORPH_CLOSE,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)),
    )

    # Reject the MOG warm-up frame or a global exposure/camera change.  A full
    # frame matte is never allowed to become a Motion Sculpture silhouette.
    coverage = float(np.count_nonzero(foreground)) / max(foreground.size, 1)
    if coverage > 0.58:
        foreground[:] = 0

    detected_small = _detect_subject_bbox(small, foreground, hog, face_detector, frame_index)
    detected = None
    if detected_small is not None:
        inv_scale = 1.0 / max(scale, 1e-6)
        detected = tuple(round(value * inv_scale) for value in detected_small)
    subject_bbox = _blend_bbox(previous_bbox, detected, width, height)

    if subject_bbox is None:
        # Conservative fallback: foreground motion in the central portrait area.
        subject_bbox = (
            int(width * 0.10),
            int(height * 0.04),
            int(width * 0.80),
            int(height * 0.94),
        )

    # Turn real temporal motion into GrabCut foreground seeds. This expands
    # moving hands/shoulders into a coherent person matte while still refusing
    # unrelated static regions outside the localized subject box.
    subject_x, subject_y, subject_w, subject_h = _clamp_bbox(subject_bbox, width, height)
    small_bbox = _clamp_bbox(
        (
            round(subject_x * scale),
            round(subject_y * scale),
            round(subject_w * scale),
            round(subject_h * scale),
        ),
        analysis_size[0],
        analysis_size[1],
    )
    motion_pixels = int(np.count_nonzero(foreground))
    segmented_foreground = foreground
    if motion_pixels >= max(24, round(foreground.size * 0.001)) and frame_index % 2 == 0:
        grabcut_mask = np.full(foreground.shape, cv2.GC_BGD, dtype=np.uint8)
        small_x, small_y, small_w, small_h = small_bbox
        grabcut_mask[small_y : small_y + small_h, small_x : small_x + small_w] = cv2.GC_PR_BGD
        probable = cv2.dilate(
            foreground,
            cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)),
            iterations=1,
        )
        grabcut_mask[probable > 0] = cv2.GC_PR_FGD
        grabcut_mask[foreground > 0] = cv2.GC_FGD
        if previous_mask is not None and previous_mask.shape == (height, width):
            previous_small = cv2.resize(
                previous_mask,
                analysis_size,
                interpolation=cv2.INTER_AREA,
            )
            grabcut_mask[(previous_small > 72) & (grabcut_mask != cv2.GC_FGD)] = cv2.GC_PR_FGD
        background_model = np.zeros((1, 65), np.float64)
        foreground_model = np.zeros((1, 65), np.float64)
        try:
            cv2.grabCut(
                small,
                grabcut_mask,
                None,
                background_model,
                foreground_model,
                1,
                cv2.GC_INIT_WITH_MASK,
            )
            candidate = np.where(
                (grabcut_mask == cv2.GC_FGD) | (grabcut_mask == cv2.GC_PR_FGD),
                255,
                0,
            ).astype(np.uint8)
            # GrabCut may classify a similarly coloured wall or garment-sized
            # rectangle as probable foreground. A temporal sculpture must stay
            # connected to measured motion, so clip the refined matte to a soft,
            # expanded envelope around the actual changed pixels.
            motion_envelope = cv2.dilate(
                foreground,
                cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31)),
                iterations=2,
            )
            candidate = cv2.bitwise_and(candidate, motion_envelope)
            candidate_coverage = float(np.count_nonzero(candidate)) / max(candidate.size, 1)
            if 0.001 <= candidate_coverage <= 0.55:
                segmented_foreground = candidate
        except cv2.error:
            segmented_foreground = foreground
    elif previous_mask is not None and previous_mask.shape == (height, width):
        previous_small = cv2.resize(
            previous_mask,
            analysis_size,
            interpolation=cv2.INTER_AREA,
        )
        motion_envelope = cv2.dilate(
            foreground,
            cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31)),
            iterations=2,
        )
        segmented_foreground = cv2.max(
            foreground,
            cv2.bitwise_and(previous_small, motion_envelope),
        )

    full_foreground = cv2.resize(
        segmented_foreground,
        (width, height),
        interpolation=cv2.INTER_LINEAR,
    )
    roi_mask = np.zeros((height, width), dtype=np.uint8)
    x, y, w, h = _clamp_bbox(subject_bbox, width, height)
    cv2.rectangle(roi_mask, (x, y), (x + w, y + h), 255, thickness=-1)
    subject = cv2.bitwise_and(full_foreground, roi_mask)
    subject = cv2.morphologyEx(
        subject,
        cv2.MORPH_CLOSE,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11)),
    )

    # Occluded microphone booms and table edges appear in temporal differences
    # as long thin bars. They are not plausible human silhouette components.
    component_binary = (subject > 24).astype(np.uint8) * 255
    components, _hierarchy = cv2.findContours(
        component_binary,
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE,
    )
    cleaned_components = np.zeros_like(subject)
    for component in components:
        _comp_x, _comp_y, comp_w, comp_h = cv2.boundingRect(component)
        long_side = max(comp_w, comp_h)
        short_side = max(1, min(comp_w, comp_h))
        is_set_bar = (
            long_side / short_side > 7.0
            and short_side < height * 0.045
            and long_side > width * 0.08
        )
        if not is_set_bar:
            cv2.drawContours(cleaned_components, [component], -1, 255, thickness=-1)
    subject = cv2.bitwise_and(subject, cleaned_components)

    # A light temporal blend suppresses mask flicker without creating a long
    # blurred history—the visible history is composed explicitly below.
    if previous_mask is not None and previous_mask.shape == subject.shape:
        subject = cv2.addWeighted(subject, 0.80, previous_mask, 0.20, 0)
    subject = cv2.GaussianBlur(subject, (0, 0), sigmaX=2.4, sigmaY=2.4)
    return subject, _clamp_bbox(subject_bbox, width, height)


def _layer_from_frame(frame: np.ndarray, alpha: np.ndarray) -> Optional[ForegroundLayer]:
    binary = (alpha > 18).astype(np.uint8)
    points = cv2.findNonZero(binary)
    if points is None:
        return None
    x, y, w, h = cv2.boundingRect(points)
    if w * h < frame.shape[0] * frame.shape[1] * 0.0015:
        return None
    pad = max(3, round(max(w, h) * 0.015))
    x, y, w, h = _clamp_bbox((x - pad, y - pad, w + pad * 2, h + pad * 2), frame.shape[1], frame.shape[0])
    alpha_crop = alpha[y : y + h, x : x + w].copy()
    image_crop = frame[y : y + h, x : x + w].copy()
    moments = cv2.moments(binary[y : y + h, x : x + w])
    if moments["m00"]:
        centroid = (
            x + int(moments["m10"] / moments["m00"]),
            y + int(moments["m01"] / moments["m00"]),
        )
    else:
        centroid = (x + w // 2, y + h // 2)
    return ForegroundLayer(image=image_crop, alpha=alpha_crop, bbox=(x, y, w, h), centroid=centroid)


def _tinted_foreground(image: np.ndarray, colour: Tuple[int, int, int], saturation: float) -> np.ndarray:
    # History images are softened once when inserted into the bounded deque.
    # Reusing that softened crop avoids six redundant full-person blurs per frame.
    luminance = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
    colour_array = np.asarray(colour, dtype=np.float32).reshape(1, 1, 3)
    sculpted = colour_array * (0.46 + luminance[..., None] * 0.48)
    mixed = image.astype(np.float32) * (1.0 - saturation) + sculpted * saturation
    return np.clip(mixed, 0, 255).astype(np.uint8)


def _alpha_composite(
    canvas: np.ndarray,
    layer: np.ndarray,
    alpha: np.ndarray,
    bbox: Tuple[int, int, int, int],
    opacity: float,
) -> None:
    x, y, w, h = bbox
    target = canvas[y : y + h, x : x + w]
    if target.size == 0:
        return
    matte = (alpha.astype(np.float32) / 255.0 * opacity)[..., None]
    target[:] = np.clip(layer.astype(np.float32) * matte + target.astype(np.float32) * (1.0 - matte), 0, 255).astype(np.uint8)


def _add_sculpted_edge(
    canvas: np.ndarray,
    alpha: np.ndarray,
    bbox: Tuple[int, int, int, int],
    colour: Tuple[int, int, int],
    edge_strength: float,
    glow_strength: float,
) -> None:
    x, y, w, h = bbox
    if (edge_strength <= 0 and glow_strength <= 0) or w <= 1 or h <= 1:
        return
    # Derive the edge once, then reuse it for the crisp prism and its soft bloom.
    # This replaces three repeated morphology/blur passes for every history pose.
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    edge = cv2.subtract(cv2.dilate(alpha, kernel), cv2.erode(alpha, kernel))
    colour_layer = np.empty((h, w, 3), dtype=np.uint8)
    colour_layer[:] = colour
    if edge_strength > 0:
        _alpha_composite(canvas, colour_layer, edge, bbox, edge_strength)
    if glow_strength > 0:
        glow = cv2.GaussianBlur(edge, (0, 0), sigmaX=6.0, sigmaY=6.0)
        _alpha_composite(canvas, colour_layer, glow, bbox, glow_strength)


def _draw_motion_ribbon(
    canvas: np.ndarray,
    history: Sequence[ForegroundLayer],
    current: Optional[ForegroundLayer],
    colour: Tuple[int, int, int],
    strength: float,
) -> None:
    if strength <= 0 or current is None or len(history) < 4:
        return
    points = [layer.centroid for layer in list(history)[-10:] if layer is not None]
    points.append(current.centroid)
    if len(points) < 4:
        return
    travel = sum(math.dist(points[index - 1], points[index]) for index in range(1, len(points)))
    if travel < max(canvas.shape[:2]) * 0.035:
        return
    ribbon = np.zeros_like(canvas)
    cv2.polylines(
        ribbon,
        [np.asarray(points, dtype=np.int32)],
        isClosed=False,
        color=colour,
        thickness=max(2, round(min(canvas.shape[:2]) * 0.008)),
        lineType=cv2.LINE_AA,
    )
    ribbon = cv2.GaussianBlur(ribbon, (0, 0), sigmaX=7.0, sigmaY=7.0)
    canvas[:] = cv2.addWeighted(canvas, 1.0, ribbon, strength, 0)


def _full_subject_alpha(
    frame: np.ndarray,
    current_layer: Optional[ForegroundLayer],
) -> np.ndarray:
    alpha = np.zeros(frame.shape[:2], dtype=np.float32)
    if current_layer is None:
        return alpha
    x, y, w, h = current_layer.bbox
    alpha[y : y + h, x : x + w] = current_layer.alpha.astype(np.float32) / 255.0
    return np.clip(alpha, 0.0, 1.0)


def _cinematic_grade(frame: np.ndarray, strength: float) -> np.ndarray:
    if strength <= 0:
        return frame.copy()
    image = frame.astype(np.float32) / 255.0
    luminance = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
    shadows = np.square(1.0 - luminance)[..., None]
    highlights = np.square(luminance)[..., None]

    # Restrained teal shadows and warm highlights give the studio depth without
    # changing skin into a synthetic neon colour.
    cool = np.asarray([0.055, 0.020, -0.012], dtype=np.float32).reshape(1, 1, 3)
    warm = np.asarray([-0.018, 0.020, 0.060], dtype=np.float32).reshape(1, 1, 3)
    image += shadows * cool * strength
    image += highlights * warm * strength
    contrast = 1.0 + 0.10 * strength
    image = (image - 0.43) * contrast + 0.43

    graded = np.clip(image * 255.0, 0, 255).astype(np.uint8)
    hsv = cv2.cvtColor(graded, cv2.COLOR_BGR2HSV).astype(np.float32)
    hsv[..., 1] *= 1.0 + 0.08 * strength
    hsv[..., 2] *= 1.0 + 0.025 * strength
    return cv2.cvtColor(np.clip(hsv, 0, 255).astype(np.uint8), cv2.COLOR_HSV2BGR)


def _selective_set_refinement(
    frame: np.ndarray,
    subject_alpha: np.ndarray,
    strength: float,
) -> np.ndarray:
    """Clean weak set regions while preserving the actual studio geometry."""
    height, width = frame.shape[:2]
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV).astype(np.float32)
    yy = np.arange(height, dtype=np.float32)[:, None]
    safe_background = np.clip(1.0 - subject_alpha * 0.98, 0.0, 1.0)

    # Clean compression noise and uneven white balance only on broad wall areas.
    wall = (
        (hsv[..., 1] < 64)
        & (hsv[..., 2] > 72)
        & (yy < height * 0.72)
    ).astype(np.float32)
    wall = cv2.GaussianBlur(wall, (0, 0), sigmaX=max(2.5, width * 0.006))
    wall *= safe_background
    cleaned = cv2.bilateralFilter(frame, 7, 24, 24).astype(np.float32)
    cleaned += np.asarray([-1.5, 1.0, 4.0], dtype=np.float32).reshape(1, 1, 3) * strength
    output = (
        frame.astype(np.float32) * (1.0 - wall[..., None] * 0.58 * strength)
        + cleaned * wall[..., None] * 0.58 * strength
    )

    # Recover the real red monitor locally so it supports rather than dominates faces.
    red_screen = (
        ((hsv[..., 0] < 13) | (hsv[..., 0] > 170))
        & (hsv[..., 1] > 112)
    ).astype(np.float32)
    red_screen = cv2.GaussianBlur(red_screen, (0, 0), sigmaX=2.0) * safe_background
    controlled_hsv = hsv.copy()
    controlled_hsv[..., 1] *= 0.84
    controlled_hsv[..., 2] = np.where(
        controlled_hsv[..., 2] > 190,
        190 + (controlled_hsv[..., 2] - 190) * 0.42,
        controlled_hsv[..., 2],
    )
    controlled = cv2.cvtColor(
        np.clip(controlled_hsv, 0, 255).astype(np.uint8),
        cv2.COLOR_HSV2BGR,
    ).astype(np.float32)
    screen_alpha = red_screen[..., None] * 0.78 * strength
    output = output * (1.0 - screen_alpha) + controlled * screen_alpha

    # Retain and lightly denoise the dark acoustic panels without changing shape.
    bgr = frame.astype(np.float32)
    panel = (
        (bgr[..., 0] > bgr[..., 2] * 1.08)
        & (hsv[..., 2] < 145)
        & (yy < height * 0.70)
    ).astype(np.float32)
    panel = cv2.GaussianBlur(panel, (0, 0), sigmaX=1.4) * safe_background
    panel_alpha = panel[..., None] * 0.32 * strength
    output = output * (1.0 - panel_alpha) + cleaned * panel_alpha
    return np.clip(output, 0, 255).astype(np.uint8)


def _cinematic_environment(
    frame: np.ndarray,
    current_layer: Optional[ForegroundLayer],
    style: MotionSculptureStyle,
    timestamp: float,
    studio_plate: Optional[np.ndarray] = None,
) -> np.ndarray:
    """Create depth and moving light in the real set while preserving the people."""
    height, width = frame.shape[:2]
    subject_alpha = _full_subject_alpha(frame, current_layer)

    # A generated studio plate is allowed only behind captured people and lower
    # foreground equipment. It never supplies face or body pixels.
    background_source = _selective_set_refinement(
        frame,
        subject_alpha,
        style.cinematic_strength,
    )
    if studio_plate is not None:
        plate_height, plate_width = studio_plate.shape[:2]
        plate_scale = max(width / max(plate_width, 1), height / max(plate_height, 1))
        resized = cv2.resize(
            studio_plate,
            (max(width, round(plate_width * plate_scale)), max(height, round(plate_height * plate_scale))),
            interpolation=cv2.INTER_LANCZOS4,
        )
        x_offset = max(0, (resized.shape[1] - width) // 2)
        y_offset = max(0, (resized.shape[0] - height) // 2)
        background_source = resized[y_offset : y_offset + height, x_offset : x_offset + width].copy()

    # A slow optical push affects only the set plate. The live subject is painted
    # back at native geometry, creating believable lens depth without a cutout zoom.
    pulse = 0.5 + 0.5 * math.sin(timestamp * 0.72 - 0.8)
    scale = 1.0 + style.depth_push * (0.45 + 0.55 * pulse)
    center_x = width * (0.5 + 0.012 * math.sin(timestamp * 0.33))
    center_y = height * (0.48 + 0.008 * math.cos(timestamp * 0.29))
    transform = cv2.getRotationMatrix2D((center_x, center_y), 0.0, scale)
    background = cv2.warpAffine(
        background_source,
        transform,
        (width, height),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_REFLECT_101,
    )
    if style.background_blur > 0:
        background = cv2.GaussianBlur(
            background,
            (0, 0),
            sigmaX=style.background_blur,
            sigmaY=style.background_blur,
        )
    background = _cinematic_grade(background, style.cinematic_strength)

    if studio_plate is not None:
        yy_keep = np.arange(height, dtype=np.float32)[:, None]
        lower_foreground = np.clip(
            (yy_keep - height * 0.60) / max(height * 0.19, 1.0),
            0.0,
            1.0,
        )
        lower_foreground = np.repeat(lower_foreground, width, axis=1)
        source_value = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)[..., 2]
        dark_equipment = np.where(
            # Preserve genuinely black microphone hardware, not saturated blue
            # or red artwork from the old monitor.
            (source_value < 82) & (yy_keep >= height * 0.48),
            1.0,
            0.0,
        ).astype(np.float32)
        dark_equipment = cv2.GaussianBlur(
            cv2.dilate(
                (dark_equipment * 255).astype(np.uint8),
                cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)),
            ).astype(np.float32) / 255.0,
            (0, 0),
            sigmaX=1.2,
        )
        foreground_keep = np.clip(
            np.maximum.reduce((subject_alpha, lower_foreground, dark_equipment)),
            0.0,
            1.0,
        )
        background = np.clip(
            background.astype(np.float32) * (1.0 - foreground_keep[..., None])
            + frame.astype(np.float32) * foreground_keep[..., None],
            0,
            255,
        ).astype(np.uint8)

    # Bloom only existing highlights from the physical set (screen and practical
    # lights). No generated object is introduced into the conversation.
    gray = cv2.cvtColor(background, cv2.COLOR_BGR2GRAY)
    highlight_mask = np.clip((gray.astype(np.float32) - 168.0) / 72.0, 0.0, 1.0)
    highlight_mask = cv2.GaussianBlur(
        highlight_mask,
        (0, 0),
        sigmaX=max(6.0, min(width, height) * 0.026),
    )
    bloom = cv2.GaussianBlur(background, (0, 0), sigmaX=max(4.0, min(width, height) * 0.014))
    bloom_alpha = (highlight_mask * (0.10 + 0.08 * style.cinematic_strength))[..., None]
    background = np.clip(
        background.astype(np.float32) * (1.0 - bloom_alpha)
        + bloom.astype(np.float32) * bloom_alpha,
        0,
        255,
    ).astype(np.uint8)

    # A broad, animated warm shaft lives behind the subject and reads as a studio
    # lighting cue rather than a graphic overlay.
    yy, xx = np.mgrid[0:height, 0:width].astype(np.float32)
    sweep_center = width * (0.18 + 0.64 * (0.5 + 0.5 * math.sin(timestamp * 0.24 - 0.9)))
    diagonal = xx + yy * 0.32
    sigma = max(width * 0.20, 1.0)
    sweep = np.exp(-0.5 * np.square((diagonal - sweep_center) / sigma))
    sweep *= np.clip(1.0 - subject_alpha * 0.92, 0.0, 1.0)
    light_colour = np.asarray([18.0, 42.0, 72.0], dtype=np.float32).reshape(1, 1, 3)
    background = np.clip(
        background.astype(np.float32)
        + sweep[..., None] * light_colour * style.light_sweep_strength,
        0,
        255,
    ).astype(np.uint8)

    # Soft contact shadow separates hair and shoulders without a visible halo.
    shadow_mask = cv2.GaussianBlur(
        cv2.dilate(
            (subject_alpha * 255.0).astype(np.uint8),
            cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11)),
        ).astype(np.float32)
        / 255.0,
        (0, 0),
        sigmaX=max(4.0, min(width, height) * 0.012),
    )
    shadow_mask = np.roll(shadow_mask, max(2, round(height * 0.006)), axis=0)
    background = np.clip(
        background.astype(np.float32)
        * (1.0 - shadow_mask[..., None] * (0.10 + 0.08 * style.cinematic_strength)),
        0,
        255,
    ).astype(np.uint8)

    # Face/body polish is deliberately subtle: light temporal-safe smoothing plus
    # micro-contrast, composited only through the person matte.
    subject = _cinematic_grade(frame, min(0.48, style.cinematic_strength * 0.42))
    if style.subject_polish > 0:
        smoothed = cv2.bilateralFilter(subject, 5, 22, 22)
        subject = cv2.addWeighted(subject, 1.0 - style.subject_polish, smoothed, style.subject_polish, 0)
        soft = cv2.GaussianBlur(subject, (0, 0), sigmaX=1.05, sigmaY=1.05)
        subject = cv2.addWeighted(subject, 1.12, soft, -0.12, 0)

    alpha = np.clip(subject_alpha, 0.0, 1.0)[..., None]
    output = np.clip(
        subject.astype(np.float32) * alpha
        + background.astype(np.float32) * (1.0 - alpha),
        0,
        255,
    ).astype(np.uint8)

    if style.vignette_strength > 0:
        x_norm = (xx - width * 0.5) / max(width * 0.5, 1.0)
        y_norm = (yy - height * 0.48) / max(height * 0.52, 1.0)
        radial = np.clip(np.square(x_norm) + np.square(y_norm), 0.0, 1.45)
        vignette = np.clip(1.0 - radial * style.vignette_strength * 0.48, 0.72, 1.0)
        # Keep faces and clothing from being darkened by the edge treatment.
        vignette = vignette * (1.0 - subject_alpha * 0.82) + subject_alpha * 0.82
        output = np.clip(output.astype(np.float32) * vignette[..., None], 0, 255).astype(np.uint8)
    return output


def _compose_motion_frame(
    frame: np.ndarray,
    current_layer: Optional[ForegroundLayer],
    history: Sequence[ForegroundLayer],
    style: MotionSculptureStyle,
    timestamp: float = 0.0,
    studio_plate: Optional[np.ndarray] = None,
) -> np.ndarray:
    output = _cinematic_environment(
        frame,
        current_layer,
        style,
        timestamp,
        studio_plate=studio_plate,
    )
    chosen_layers = []
    if style.echo_strength > 0:
        for echo_index, (delay, opacity) in enumerate(zip(style.delays, style.opacities)):
            if len(history) < delay:
                continue
            layer = history[-delay]
            colour = TRAIL_PALETTE[echo_index % len(TRAIL_PALETTE)]
            tinted = _tinted_foreground(layer.image, colour, style.saturation)
            _alpha_composite(
                output,
                tinted,
                layer.alpha,
                layer.bbox,
                opacity * style.echo_strength,
            )
            _add_sculpted_edge(
                output,
                layer.alpha,
                layer.bbox,
                colour,
                edge_strength=min(
                    0.92,
                    style.edge_strength * style.echo_strength * (0.72 + opacity),
                ),
                glow_strength=min(
                    0.92,
                    (style.glow_strength + style.edge_strength)
                    * opacity
                    * style.echo_strength,
                ),
            )
            chosen_layers.append(layer)

    if chosen_layers:
        _draw_motion_ribbon(
            output,
            chosen_layers[::-1],
            current_layer,
            TRAIL_PALETTE[0],
            style.ribbon_strength,
        )

    # The cinematic environment has already restored the present-time person
    # through the matte. Repainting the raw crop here would throw away its face
    # polish and create a visible cutout edge.
    return output


def render_motion_sculpture(
    input_path: str,
    output_path: str,
    effects: Iterable[Mapping[str, Any]],
    *,
    approved_tmp_dir: str,
    background_path: Optional[str] = None,
) -> Dict[str, Any]:
    """Stream a subject-aware Motion Sculpture render and preserve source audio."""

    safe_input = _safe_media_path(input_path, approved_tmp_dir, "input")
    safe_output = _safe_media_path(output_path, approved_tmp_dir, "output")
    studio_plate = None
    if background_path:
        safe_background = _safe_media_path(background_path, approved_tmp_dir, "studio background")
        studio_plate = cv2.imread(safe_background, cv2.IMREAD_COLOR)
        if studio_plate is None:
            raise RuntimeError("Motion Sculpture studio background is not decodable")
    normalized_effects = [dict(effect) for effect in effects]
    if not normalized_effects:
        raise ValueError("Motion Sculpture requires at least one timed effect")

    capture = cv2.VideoCapture(safe_input)
    if not capture.isOpened():
        raise RuntimeError("Motion Sculpture could not decode the input video")

    fps = float(capture.get(cv2.CAP_PROP_FPS) or 0.0)
    if not math.isfinite(fps) or fps <= 1.0:
        fps = 30.0
    ok, first_frame = capture.read()
    if not ok or first_frame is None:
        capture.release()
        raise RuntimeError("Motion Sculpture input contains no decodable frames")
    height, width = first_frame.shape[:2]

    has_audio = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "a:0",
            "-show_entries",
            "stream=index",
            "-of",
            "csv=p=0",
            safe_input,
        ],
        capture_output=True,
        text=True,
        check=False,
    ).stdout.strip() != ""

    command = [
        "ffmpeg",
        "-v",
        "error",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "bgr24",
        "-s:v",
        f"{width}x{height}",
        "-r",
        f"{fps:.8f}",
        "-i",
        "pipe:0",
        "-i",
        safe_input,
        "-map",
        "0:v:0",
        "-map",
        "1:a?",
        "-c:v",
        CPU_VIDEO_ENCODER,
        "-preset",
        "veryfast",
        "-crf",
        "19",
        "-pix_fmt",
        "yuv420p",
    ]
    if has_audio:
        command.extend(["-c:a", "aac", "-b:a", "160k"])
    else:
        command.append("-an")
    command.extend(["-shortest", "-movflags", "+faststart", "-y", safe_output])

    max_history = max(
        max(get_motion_sculpture_style(effect.get("intensity", "bold")).delays)
        for effect in normalized_effects
    )
    history: Deque[ForegroundLayer] = deque(maxlen=max_history + 1)
    person_segmenter = MediaPipePersonSegmenter(landscape=width >= height)
    encoder = subprocess.Popen(command, stdin=subprocess.PIPE, stderr=subprocess.PIPE)

    frame = first_frame
    frame_index = 0
    previous_mask = None
    written_frames = 0
    try:
        while frame is not None:
            mask = person_segmenter.matte(frame, previous_mask)
            previous_mask = mask
            current_layer = _layer_from_frame(frame, mask)
            intensity = _active_intensity(normalized_effects, frame_index / fps)
            if intensity:
                rendered = _compose_motion_frame(
                    frame,
                    current_layer,
                    history,
                    get_motion_sculpture_style(intensity),
                    timestamp=frame_index / fps,
                    studio_plate=studio_plate,
                )
            else:
                rendered = frame
            if encoder.stdin is None:
                raise RuntimeError("Motion Sculpture encoder pipe is unavailable")
            encoder.stdin.write(np.ascontiguousarray(rendered).tobytes())
            written_frames += 1
            if current_layer is not None:
                # The current crop was already painted sharp. Store only a
                # softened version so future poses cannot create duplicate sharp
                # faces, and so the blur is paid once rather than per echo.
                current_layer.image = cv2.GaussianBlur(
                    current_layer.image,
                    (0, 0),
                    sigmaX=1.6,
                    sigmaY=1.6,
                )
                history.append(current_layer)

            frame_index += 1
            ok, next_frame = capture.read()
            frame = next_frame if ok else None
        if encoder.stdin is not None:
            encoder.stdin.close()
            encoder.stdin = None
        stderr = encoder.stderr.read().decode("utf-8", errors="replace") if encoder.stderr else ""
        if encoder.stderr is not None:
            encoder.stderr.close()
        return_code = encoder.wait()
        if return_code != 0:
            raise RuntimeError(f"Motion Sculpture encoder failed: {stderr[-1200:]}")
    except Exception:
        if encoder.stdin is not None:
            encoder.stdin.close()
            encoder.stdin = None
        encoder.kill()
        encoder.wait()
        if encoder.stderr is not None:
            encoder.stderr.close()
        if os.path.exists(safe_output):
            os.remove(safe_output)
        raise
    finally:
        capture.release()
        person_segmenter.close()

    if written_frames < 2:
        raise RuntimeError("Motion Sculpture produced too few frames")
    proof = validate_rendered_media(safe_output, expected_audio=has_audio)
    proof.update(
        {
            "frames": written_frames,
            "fps": fps,
            "encoder": CPU_VIDEO_ENCODER,
            "subject_pipeline": "mediapipe_selfie_segmentation_cpu",
            "segmentation_model_selection": person_segmenter.model_selection,
            "history_frames": max_history,
            "visual_treatment": "cinematic_environment_depth_real_subject",
            "face_preservation": "source_pixels_subject_matte",
            "studio_makeover": bool(studio_plate is not None),
        }
    )
    return proof
