"""Bounded, source-pixel face following. No audio-speaker identification claims."""
import math
import re
import subprocess
from pathlib import Path
import cv2
import numpy as np


def detect_source_cuts(path, start, end):
    """Decode every source frame so a cut isn't rounded to an analysis sample."""
    result = subprocess.run([
        "ffmpeg", "-hide_banner", "-nostats", "-threads", "2", "-ss", str(start),
        "-i", str(path), "-t", str(end-start), "-vf", "select='gt(scene,0.3)',showinfo",
        "-an", "-f", "null", "-",
    ], capture_output=True, text=True, timeout=120)
    if result.returncode:
        raise RuntimeError("Unable to inspect source camera cuts")
    timebase = re.search(r"config in time_base: (\d+)/(\d+)", result.stderr)
    if not timebase:
        raise RuntimeError("Source cut timestamps are unavailable")
    tick = int(timebase[1]) / int(timebase[2])
    # showinfo's printed pts_time is rounded and can place a cut one frame late.
    return sorted({math.floor((start + int(value)*tick)*1e6)/1e6
                   for value in re.findall(r"\bn:\s*\d+\s+pts:\s*(-?\d+)", result.stderr)
                   if start < start + int(value)*tick < end})


def track_faces(path, anchors, start=0, end=None, interval=.5, mode="anchored"):
    if not isinstance(anchors, dict) or not 1 <= len(anchors) <= 2:
        raise ValueError("Choose one or two speaker anchors")
    if mode not in {"anchored", "source_shots"}:
        raise ValueError("Unknown face-follow mode")
    if mode == "source_shots" and set(anchors) != {"solo"}:
        raise ValueError("Source-shot following uses one foreground crop, not split-panel identities")
    cap = cv2.VideoCapture(str(path))
    try:
        fps = cap.get(cv2.CAP_PROP_FPS) or 30
        duration = cap.get(cv2.CAP_PROP_FRAME_COUNT) / fps
        start, end = float(start), min(duration, float(end if end is not None else duration))
        if not all(math.isfinite(v) for v in (start, end)) or start < 0 or not 0 < end-start <= 180:
            raise ValueError("Analyze between 0 and 180 seconds per request")
        if mode == "source_shots":
            model = Path(__file__).parent / "models/yunet/face_detection_yunet_2023mar.onnx"
            if not model.is_file():
                raise RuntimeError("The source-shot face model is unavailable; existing framing is unchanged")
            detector = cv2.FaceDetectorYN.create(str(model), "", (320, 320), .8, .3, 5000)
        else:
            detector = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
            if detector.empty():
                raise RuntimeError("Face detector is unavailable")
        tracks = {}
        for slot, anchor in anchors.items():
            if slot not in {"top", "bottom", "solo"}:
                raise ValueError("Unknown tracking panel")
            x, y = float(anchor.get("x", 50)), float(anchor.get("y", 50))
            if not all(math.isfinite(v) and 0 <= v <= 100 for v in (x, y)):
                raise ValueError("Speaker anchors must be finite canvas percentages")
            tracks[slot] = {"keyframes": [], "missing": [], "anchor": (x/100, y/100), "face": None}
        previous_hist = None
        previous_thumbnail = None
        cut_requires_review = False
        cuts = detect_source_cuts(path, start, end) if mode == "source_shots" else []
        times = sorted(set(round(float(t), 6) for t in np.arange(start, end, max(.25, float(interval)))) | set(cuts))
        pending_shot = False
        for time in times:
            cap.set(cv2.CAP_PROP_POS_MSEC, float(time)*1000)
            ok, frame = cap.read()
            if not ok:
                raise RuntimeError(f"Unable to decode tracking frame at {time:.2f}s")
            # Keep enough pixels to detect small embedded reaction-camera faces.
            scale = min(1, 1280/frame.shape[1])
            small = cv2.resize(frame, None, fx=scale, fy=scale)
            gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
            thumbnail = cv2.resize(gray, (160, 90))
            hist = cv2.calcHist([gray], [0], None, [32], [0, 256])
            cv2.normalize(hist, hist)
            cut = time in cuts if mode == "source_shots" else previous_hist is not None and (
                cv2.compareHist(previous_hist, hist, cv2.HISTCMP_BHATTACHARYYA) > .32 or
                float(np.mean(cv2.absdiff(previous_thumbnail, thumbnail))) > 32)
            previous_hist = hist
            previous_thumbnail = thumbnail
            if cut:
                if mode == "source_shots":
                    pending_shot = True
                else:
                    cuts.append(round(float(time), 6))
                    cut_requires_review = True
            if mode == "source_shots":
                detector.setInputSize((small.shape[1], small.shape[0]))
                _, detections = detector.detect(small)
                boxes = detections[:, :4] if detections is not None else []
            else:
                boxes = detector.detectMultiScale(gray, scaleFactor=1.08, minNeighbors=5, minSize=(22, 22))
            faces = [((x+w/2)/small.shape[1], (y+h/2)/small.shape[0], w*h/(small.shape[0]*small.shape[1]))
                     for x, y, w, h in boxes]
            used = set()
            for slot, track in tracks.items():
                # Anchor proximity cannot prove identity across camera cuts.
                # Stop here instead of transferring one person's path to another.
                if cut_requires_review:
                    track["missing"].append(round(float(time), 3))
                    continue
                previous = track["face"]
                reference = previous if previous is not None and not cut else track["anchor"]
                candidates = [(i, face) for i, face in enumerate(faces) if i not in used]
                if pending_shot:
                    # Follow the new shot's dominant foreground face, not a claimed
                    # person identity. Equally sized faces require editor review.
                    candidates.sort(key=lambda pair: pair[1][2], reverse=True)
                    if len(candidates) > 1 and candidates[0][1][2] < 1.8*candidates[1][1][2]:
                        candidates = []
                else:
                    candidates.sort(key=lambda pair: (pair[1][0]-reference[0])**2 + .35*(pair[1][1]-reference[1])**2)
                selected = candidates[0] if candidates else None
                if selected and not pending_shot and (selected[1][0]-reference[0])**2 + .35*(selected[1][1]-reference[1])**2 > .12:
                    selected = None
                if not selected:
                    track["missing"].append(round(float(time), 3))
                    continue
                index, face = selected
                used.add(index)
                if previous is None:
                    track["offset"] = (track["anchor"][0]-face[0], track["anchor"][1]-face[1])
                # Preserve editor's original headroom; follow actual face displacement.
                track["face"] = face[:2]
                x = np.clip(face[0] + track["offset"][0], 0, 1) * 100
                y = np.clip(face[1] + track["offset"][1], 0, 1) * 100
                if track["keyframes"] and not pending_shot:
                    previous_key = track["keyframes"][-1]
                    # Damped follow, capped at four percentage points per second.
                    limit = 4 * min(1, float(time)-previous_key["time"])
                    x = previous_key["x"] + np.clip((x-previous_key["x"])*.45, -limit, limit)
                    y = previous_key["y"] + np.clip((y-previous_key["y"])*.45, -limit, limit)
                track["keyframes"].append({"time": round(float(time), 6), "x": round(float(x), 3),
                    "y": round(float(y), 3), "origin": "face_detection", "cut": pending_shot,
                    "reviewRequired": bool(pending_shot or cut)})
                pending_shot = False
        return {"engine": "opencv-yunet-source-shot-follow" if mode == "source_shots" else "opencv-haar-face-follow", "mode": mode,
            "identity": "foreground-per-shot-not-person-identification" if mode == "source_shots" else "anchor-proximity-not-voice-identification",
            "start": start, "end": end, "sceneCuts": cuts, "reviewRequired": True,
            "cutPolicy": "follow-dominant-foreground-face-at-source-cuts" if mode == "source_shots" else "hold-last-framing-until-editor-reanchors-next-shot",
            "tracks": {slot: {"keyframes": item["keyframes"], "missing": item["missing"],
                "coverage": len(item["keyframes"])/max(1, len(item["keyframes"])+len(item["missing"]))}
                for slot, item in tracks.items()}}
    finally:
        cap.release()
