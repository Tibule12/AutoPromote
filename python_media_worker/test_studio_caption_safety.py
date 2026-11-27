from pathlib import Path
import sys
import tempfile

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import main_media_server as mms
from studio_caption_safety import (
    analyze_caption_safety_for_segments,
    draw_safety_debug_overlay,
    estimate_subject_occupancy,
    score_candidate_zones,
)

REAL_PODCAST_FAST = Path(
    "/home/tibule12/Projects/AutoPromte/AutoPromote/test/e2e/playwright/test-assets/real-podcast-fast.mp4"
)


def _extract_real_host_head_patch(w: int = 160, h: int = 190) -> np.ndarray:
    """Pull a crisp human speaker crop from real-podcast-fast so detectors see genuine human pixels."""
    cap = cv2.VideoCapture(str(REAL_PODCAST_FAST))
    ok, frame = cap.read()
    cap.release()
    assert ok and frame is not None
    # Host face + shoulders live in x: 420..680, y: 120..520 of 1920x1080
    patch = frame[120:500, 410:700]
    return cv2.resize(patch, (w, h), interpolation=cv2.INTER_AREA)


def test_score_candidate_zones_dodges_face_and_body_masks():
    h, w = 180, 320
    # Synthetic scene with clean background EXCEPT speaker face+body parked directly over bottom_center
    face_mask = np.zeros((h, w), dtype=np.float32)
    body_mask = np.zeros((h, w), dtype=np.float32)
    clutter_mask = np.zeros((h, w), dtype=np.float32)

    # Occupy bottom_center (y: 72%..95%, x: 32%..68%)
    face_mask[round(h * 0.72) : round(h * 0.90), round(w * 0.42) : round(w * 0.58)] = 1.0
    body_mask[round(h * 0.78) : h, round(w * 0.25) : round(w * 0.75)] = 0.9

    decision = score_candidate_zones(
        face_mask,
        body_mask,
        clutter_mask,
        style_name="word_pill",  # normally prefers bottom_center!
        caption_scale=1.0,
        preferred_mode="smart_safe",
    )
    assert decision["placement"] != "bottom_center"
    assert decision["placement"] not in {"bottom_left", "bottom_right"}
    assert decision["faceOverlap"] < 0.04
    assert decision["safe"] is True

    # Now park speaker across top/wall AND bottom_center -> must choose clear side column
    face_mask[round(h * 0.06) : round(h * 0.28), round(w * 0.35) : round(w * 0.65)] = 1.0
    decision_side = score_candidate_zones(
        face_mask,
        body_mask,
        clutter_mask,
        style_name="wall_type",  # normally prefers background_center!
        caption_scale=1.0,
        preferred_mode="smart_safe",
    )
    assert decision_side["placement"] not in {"background_center", "top_center", "bottom_center"}
    assert decision_side["faceOverlap"] < 0.04


def test_video_analyzer_dodges_moving_human_face_and_body():
    """Create a 2-shot video where a real human speaker sits LEFT (0..2s) then RIGHT (2..4s),
    forcing the analyzer to dynamically dodge from RIGHT/WALL to LEFT without human overlap."""
    patch = _extract_real_host_head_patch(200, 250)
    with tempfile.TemporaryDirectory(prefix="safe-cap-vid-") as tmp:
        vid_path = Path(tmp) / "moving_speaker.mp4"
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        vw, vh, fps = 640, 360, 10
        writer = cv2.VideoWriter(str(vid_path), fourcc, fps, (vw, vh))
        for frame_idx in range(40):
            bg = np.full((vh, vw, 3), (38, 44, 52), dtype=np.uint8)
            # Draw clean torso below face patch so GrabCut + anatomical model see full body
            if frame_idx < 20:
                x0, y0 = 60, 75
            else:
                x0, y0 = 380, 75
            bg[y0 : y0 + patch.shape[0], x0 : x0 + patch.shape[1]] = patch
            cv2.rectangle(bg, (max(0, x0 - 30), y0 + patch.shape[0] - 10), (min(vw, x0 + patch.shape[1] + 30), vh), (190, 120, 70), -1)
            writer.write(bg)
        writer.release()

        segs = [
            {"id": "cue-left-speaker", "start": 0.2, "end": 1.8, "text": "Host speaking on left"},
            {"id": "cue-right-speaker", "start": 2.2, "end": 3.8, "text": "Host moved to right"},
        ]
        result = analyze_caption_safety_for_segments(
            str(vid_path),
            segs,
            style_name="editorial_duo",
            preferred_mode="smart_safe",
        )
        out = result["segments"]
        assert len(out) == 2
        assert result["summary"]["facesDetectedCues"] == 2
        assert result["summary"]["zeroFaceOverlapCues"] == 2

        # Cue 1 has speaker on left (x ~ 10..40%): must NEVER stay in side_left / shoulder_left / top_left
        assert out[0]["captionPlacement"] not in {"side_left", "shoulder_left", "top_left", "background_left", "bottom_left"}
        # Cue 2 has speaker on right (x ~ 60..90%): must NEVER stay in side_right / shoulder_right / top_right
        assert out[1]["captionPlacement"] not in {"side_right", "shoulder_right", "top_right", "background_right", "bottom_right"}

        # Check debug visualizer works cleanly
        cap = cv2.VideoCapture(str(vid_path))
        ok, f0 = cap.read()
        cap.release()
        assert ok
        annotated = draw_safety_debug_overlay(f0, out[0]["captionSafety"])
        assert annotated.shape == f0.shape


def test_real_podcast_fast_frame_detection_and_render_contract():
    """Verify YuNet + body detector finds the real Unmuted Podcast speakers cleanly and dodges them."""
    segs = [
        {"id": "h1", "start": 1.2, "end": 4.2, "text": "Hello my lovely viewers at home."},
        {"id": "h2", "start": 8.2, "end": 10.0, "text": "and I hope you missed us as well."},
    ]
    res = analyze_caption_safety_for_segments(
        str(REAL_PODCAST_FAST),
        segs,
        style_name="word_pill",
        preferred_mode="smart_safe",
    )
    assert res["summary"]["cuesAnalyzed"] == 2
    assert res["summary"]["facesDetectedCues"] >= 1
    assert res["summary"]["zeroFaceOverlapCues"] == 2
    for seg in res["segments"]:
        assert seg["captionSafety"]["faceOverlap"] < 0.04
        assert seg["captionSafety"]["safe"] is True
        assert seg["captionPlacement"] != "auto"

    # Also verify RenderViralRequest schema accepts caption_avoid_subjects + caption_safety
    req = mms.RenderViralRequest(
        video_url="https://example.com/clip.mp4",
        start_time=0.0,
        end_time=5.0,
        auto_captions=True,
        caption_style="word_pill",
        caption_position="smart_safe",
        caption_avoid_subjects=True,
        caption_segments=[
            {
                "id": "seg-1",
                "start_time": 1.0,
                "end_time": 3.0,
                "text": "Test caption safety",
                "caption_safety": res["segments"][0]["captionSafety"],
            }
        ],
    )
    assert req.caption_avoid_subjects is True
    assert req.caption_position == "smart_safe"
