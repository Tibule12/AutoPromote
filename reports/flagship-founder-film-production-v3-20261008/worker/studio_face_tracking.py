"""Bounded, source-pixel face following. No audio-speaker identification claims."""
import math
import re
import subprocess
from pathlib import Path
import cv2
import numpy as np


MAX_STUDIO_ANALYSIS_SECONDS = 15 * 60


def estimate_picture_window(frame):
    """Measure the visible programme after baked top and bottom padding."""
    height, width = frame.shape[:2]
    if height < 16 or width < 16:
        return 0.0, 0.0
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    middle = gray[:, int(width * .2):max(int(width * .8), int(width * .2) + 1)]
    row_signal = np.percentile(middle, 75, axis=1)
    active = np.flatnonzero(row_signal > 18)
    if not len(active):
        return 0.0, 0.0
    top, bottom = int(active[0]), int(active[-1])
    padding = height - (bottom - top + 1)
    if padding < height * .008 or padding > height * .24:
        return 0.0, 0.0
    return round(top * 100 / height, 3), round((height - bottom - 1) * 100 / height, 3)


def estimate_picture_fill(frame):
    """Measure baked black picture padding and return the smallest safe fill.

    Podcast masters often arrive with a rounded landscape programme already
    inset on black. A portrait crop preserves the horizontal black bands. The
    Studio records this value at each source cut so preview and export use the
    same picture fill instead of relying on episode-specific timestamps.
    """
    top, bottom = estimate_picture_window(frame)
    if not top and not bottom:
        return 1.0
    return round(float(np.clip(1.004 / (1 - (top + bottom) / 100), 1.0, 1.5)), 3)


def build_podcast_edit_plan(start, end, cuts, observations):
    """Turn source-pixel observations into an editable Studio first cut."""
    ordered = sorted(observations, key=lambda item: item["time"])
    boundaries = sorted({round(float(start), 6), *[round(float(cut), 6) for cut in cuts]})
    timeline_cuts = []
    caption_cuts = []
    warnings = []
    for boundary in boundaries:
        sample = next((item for item in ordered if item["time"] >= boundary - 1e-6), None)
        if sample is None:
            sample = ordered[-1] if ordered else None
        zoom = float(sample.get("pictureFill", 1)) if sample else 1.0
        timeline_cut = {
            "time": boundary,
            "mode": "speaker_track",
            "zoom": zoom,
            "origin": "source_shot_analysis",
            "reviewRequired": sample is None,
        }
        if sample and abs(float(sample.get("sourceTimeOffsetSeconds", 0) or 0)) > 1e-6:
            timeline_cut["sourceTimeOffsetSeconds"] = round(
                float(sample["sourceTimeOffsetSeconds"]), 3
            )
            timeline_cut["origin"] = "rejected_short_shot_hold"
            timeline_cut["reviewRequired"] = True
        timeline_cuts.append(timeline_cut)
        face_y = float(sample.get("faceY", .5)) if sample else .5
        caption_cuts.append({
            "time": boundary,
            "placement": "top_center" if face_y >= .58 else "bottom_center",
            "origin": "face_safe_analysis",
        })

    # A split is safe only when the same source frame contains two similarly
    # sized, clearly separated foreground faces. Small reaction windows never
    # qualify and are never enlarged into a split panel.
    split_suggestions = []
    def visible_padding(item):
        fill = max(1.0, float(item.get("pictureFill", 1) or 1))
        inferred = max(0.0, (1.0 - 1.0 / fill) * 50.0)
        return {
            "source_visible_top_percent": round(float(item.get("pictureTopPercent", inferred)), 2),
            "source_visible_bottom_percent": round(float(item.get("pictureBottomPercent", inferred)), 2),
        }

    last_split = -999.0
    for item in ordered:
        faces = sorted(item.get("faces") or [], key=lambda face: face[2], reverse=True)
        if len(faces) < 2 or item["time"] - last_split < 30:
            continue
        first, second = faces[:2]
        area_ratio = second[2] / max(first[2], 1e-9)
        separation = abs(first[0] - second[0])
        if (second[2] < .008 or area_ratio < .58 or separation < .24 or
                any(face[0] < .08 or face[0] > .92 or face[1] > .58
                    for face in (first, second))):
            continue
        left, right = sorted((first, second), key=lambda face: face[0])
        split_suggestions.append({
            "start": round(float(item["time"]), 3),
            "end": round(min(float(end), float(item["time"]) + 1.25), 3),
            "reason": "two_clean_foreground_faces",
            "confidence": round(min(1.0, area_ratio), 3),
            "top": {"x": round(left[0] * 100, 2), "y": round(left[1] * 100, 2), "zoom": 1.45, **visible_padding(item)},
            "bottom": {"x": round(right[0] * 100, 2), "y": round(right[1] * 100, 2), "zoom": 1.45, **visible_padding(item)},
            "reviewRequired": True,
        })
        last_split = item["time"]

    # A flattened programme offers nearby full-size shots as editorial
    # cutaway candidates. They are not simultaneous camera feeds and must not
    # become automatic two-person splits with misleading mouth movement.
    temporal_candidates = []
    shot_boundaries = sorted({float(start), *[float(cut) for cut in cuts], float(end)})

    def shot_end_at(timestamp):
        return next((boundary for boundary in shot_boundaries if boundary > timestamp + 1e-6), float(end))

    clean_solos = []
    for item in ordered:
        if item.get("synthetic"):
            continue
        faces = sorted(item.get("faces") or [], key=lambda face: face[2], reverse=True)
        if not faces:
            continue
        second_ratio = faces[1][2] / max(faces[0][2], 1e-9) if len(faces) > 1 else 0
        if faces[0][2] >= .003 and second_ratio <= .35 and shot_end_at(item["time"]) - item["time"] >= 1.4:
            clean_solos.append({**item, "side": "left" if faces[0][0] < .5 else "right"})

    minimum_gap = max(45.0, (float(end) - float(start)) / 4)
    last_temporal = float(start) - minimum_gap
    for boundary in [value for value in shot_boundaries[1:-1] if value >= float(start) + 20]:
        if boundary - last_temporal < minimum_gap:
            continue
        current_shot_end = shot_end_at(boundary)
        current = next((item for item in clean_solos
                        if boundary - 1e-6 <= item["time"] < current_shot_end - 1e-6), None)
        if not current:
            continue
        previous_observation = next((item for item in reversed(ordered)
                                     if item["time"] < boundary - .05 and item.get("faces")), None)
        previous_faces = sorted((previous_observation or {}).get("faces") or [],
                                key=lambda face: face[2], reverse=True)
        previous_side = ("left" if previous_faces[0][0] < .5 else "right") if previous_faces else None
        # The source edit must visibly switch between the two established
        # speaker sides. This rejects logo/monitor false positives that keep
        # the same side across a cut and produced an empty panel in review.
        if not previous_side or previous_side == current["side"]:
            continue
        alternates = [item for item in clean_solos
                      if item["side"] != current["side"] and abs(item["time"] - boundary) <= 60]
        if not alternates:
            continue
        alternate = min(alternates, key=lambda item: abs(item["time"] - boundary))
        split_start = min(float(end) - .1, boundary + .12)
        split_end = min(float(end), split_start + 1.25)
        if split_end - split_start < .8:
            continue
        temporal_candidates.append({
            "start": round(split_start, 3),
            "end": round(split_end, 3),
            "reason": "two_clean_temporal_speaker_views",
            "confidence": .82,
            "top": {
                "x": round(float(current["faceX"]) * 100, 2),
                "y": round(float(current["faceY"]) * 100, 2),
                "zoom": 1.45,
                "sourceTimeOffsetSeconds": 0,
                **visible_padding(current),
            },
            "bottom": {
                "x": round(float(alternate["faceX"]) * 100, 2),
                "y": round(float(alternate["faceY"]) * 100, 2),
                "zoom": 1.45,
                "sourceTimeOffsetSeconds": round(float(alternate["time"]) - split_start, 3),
                **visible_padding(alternate),
            },
            "reviewRequired": True,
        })
        last_temporal = boundary
    if not split_suggestions:
        warnings.append("No synchronized two-speaker view was found; use separate camera feeds for a live split.")

    return {
        "version": 1,
        "sourceRange": {"start": float(start), "end": float(end)},
        "timelineCuts": timeline_cuts,
        "captionPlacementCuts": caption_cuts,
        "splitSuggestions": split_suggestions,
        "temporalCutawayCandidates": temporal_candidates,
        "mainFrame": {
            "enabled": True,
            "shape": "round",
            "insetPercent": 2.5,
            "radiusPercent": 10,
            "background": "studio_black",
        },
        "preflight": {
            "passed": bool(ordered),
            "warnings": warnings,
            "reactionWindowsUsedForSplit": False,
        },
    }


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
        if not all(math.isfinite(v) for v in (start, end)) or start < 0 or not 0 < end-start <= MAX_STUDIO_ANALYSIS_SECONDS:
            raise ValueError("Analyze between 0 and 15 minutes per request")
        if mode == "source_shots":
            model = Path(__file__).parent / "models/yunet/face_detection_yunet_2023mar.onnx"
            if not model.is_file():
                raise RuntimeError("The source-shot face model is unavailable; existing framing is unchanged")
            # A hand or steep head turn can lower confidence at the exact edit
            # frame. Keep those full-size faces, then reject tiny detections by
            # normalized area below instead of using a high confidence cutoff.
            detector = cv2.FaceDetectorYN.create(str(model), "", (320, 320), .55, .3, 5000)
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
        pending_shot_time = None
        pending_picture_fill = 1.0
        pending_picture_window = (0.0, 0.0)
        observations = []
        decode_failures = []
        for time in times:
            # FFmpeg reports the first frame of a new scene, while an OpenCV
            # timestamp seek can resolve to the frame immediately before it.
            # Sampling just inside the new shot prevents a one-frame old face
            # from anchoring the whole following shot to the wrong side.
            is_source_cut = mode == "source_shots" and time in cuts
            sample_time = min(end - 1e-4, float(time) + min(.08, 2 / fps)) if is_source_cut else float(time)
            cap.set(cv2.CAP_PROP_POS_MSEC, sample_time*1000)
            ok, frame = cap.read()
            if not ok:
                if float(time) >= end - max(1.0, float(interval) * 2):
                    decode_failures.append(round(float(time), 3))
                    break
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
                    if pending_shot and pending_shot_time is not None:
                        # The previous shot ended before any reliable face was
                        # visible (for example a half-second laughing cutaway
                        # with a covered face). Hold a clean part of the prior
                        # full-size reaction shot instead of exposing an empty
                        # monitor or a headless crop.
                        track = tracks["solo"]
                        previous = track["face"] or track["anchor"]
                        fallback = previous
                        hold_offset = -(float(time) - float(pending_shot_time) + .12)
                        track["keyframes"].append({
                            "time": round(float(pending_shot_time), 6),
                            "x": round(fallback[0] * 100, 3),
                            "y": round(fallback[1] * 100, 3),
                            "origin": "short_shot_side_fallback",
                            "cut": True,
                            "reviewRequired": True,
                        })
                        observations.append({
                            "time": round(float(pending_shot_time), 6),
                            "faceX": round(fallback[0], 5),
                            "faceY": round(float(fallback[1]), 5),
                            "faces": [(fallback[0], fallback[1], .01)],
                            "pictureFill": pending_picture_fill,
                            "pictureTopPercent": pending_picture_window[0],
                            "pictureBottomPercent": pending_picture_window[1],
                            "synthetic": True,
                            "sourceTimeOffsetSeconds": round(hold_offset, 3),
                        })
                        track["face"] = fallback
                    pending_shot = True
                    pending_shot_time = float(time)
                    pending_picture_fill = estimate_picture_fill(frame)
                    pending_picture_window = estimate_picture_window(frame)
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
                     for x, y, w, h in boxes
                     if mode != "source_shots" or w*h/(small.shape[0]*small.shape[1]) >= .0025]
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
                if mode == "source_shots" and slot == "solo":
                    observations.append({
                        # If the subject was obscured on the first frame of a
                        # new shot, backfill the first reliable face to the cut
                        # itself. Holding the previous camera's left/right crop
                        # exposes an empty monitor until the face reappears.
                        "time": round(float(pending_shot_time if pending_shot_time is not None else time), 6),
                        "faceX": round(float(face[0]), 5),
                        "faceY": round(float(face[1]), 5),
                        "faces": [tuple(float(value) for value in candidate) for candidate in faces],
                        "pictureFill": estimate_picture_fill(frame),
                        "pictureTopPercent": estimate_picture_window(frame)[0],
                        "pictureBottomPercent": estimate_picture_window(frame)[1],
                    })
                if mode == "source_shots" and (previous is None or pending_shot):
                    # Each source camera edit establishes its own crop. Carrying
                    # the first shot's anchor offset into a later left/right
                    # angle briefly pushes the new speaker out of frame.
                    track["offset"] = (0.0, 0.0)
                elif previous is None:
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
                key_time = pending_shot_time if pending_shot_time is not None else time
                track["keyframes"].append({"time": round(float(key_time), 6), "x": round(float(x), 3),
                    "y": round(float(y), 3), "origin": "face_detection", "cut": pending_shot,
                    "reviewRequired": bool(pending_shot or cut)})
                pending_shot = False
                pending_shot_time = None
        result = {"engine": "opencv-yunet-source-shot-follow" if mode == "source_shots" else "opencv-haar-face-follow", "mode": mode,
            "identity": "foreground-per-shot-not-person-identification" if mode == "source_shots" else "anchor-proximity-not-voice-identification",
            "start": start, "end": end, "sceneCuts": cuts, "reviewRequired": True,
            "cutPolicy": "follow-dominant-foreground-face-at-source-cuts" if mode == "source_shots" else "hold-last-framing-until-editor-reanchors-next-shot",
            "decodeFailures": decode_failures,
            "tracks": {slot: {"keyframes": item["keyframes"], "missing": item["missing"],
                "coverage": len(item["keyframes"])/max(1, len(item["keyframes"])+len(item["missing"]))}
                for slot, item in tracks.items()}}
        if mode == "source_shots":
            result["editPlan"] = build_podcast_edit_plan(start, end, cuts, observations)
            if decode_failures:
                result["editPlan"]["preflight"]["warnings"].append(
                    "The source ended before its declared duration; the final decodable framing is held to the end."
                )
        return result
    finally:
        cap.release()
