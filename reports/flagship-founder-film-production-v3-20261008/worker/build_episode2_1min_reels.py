#!/usr/bin/env python3
import json
import math
import os
import subprocess
from pathlib import Path

import numpy as np
import cv2
from scipy.signal import correlate


HOST_CAM = Path("/home/tibule12/Videos/IMG_4533.MOV")
GUEST_CAM = Path("/home/tibule12/Videos/IMG_4185.MOV")
CLEAN_AUDIO = Path("/home/tibule12/Videos/UNMUTED WITH ATHI DONKILE.wav")
OUT_DIR = Path("/home/tibule12/Downloads/episode2-viral-1min-facezoom-shared-10pack-v5")
SINGLE_MASK_PATH = OUT_DIR / "rounded_card_mask_1000x1776.png"
SHARED_MASK_PATH = OUT_DIR / "rounded_card_mask_980x760.png"
EXTERNAL_AUDIO_OFFSET_SECONDS = -5.606

CLIPS = [
    {
        "name": "01_guest_energy_01m32",
        "timeline": 92.0,
        "duration": 60.0,
        "kind": "single",
        "camera": "guest",
        "title": "That Moment The Energy Changed",
        "description": "Athimna Donkile brings the kind of energy that makes you stay for the full conversation. From Unmuted Podcast Episode 2. #UnmutedPodcast #AthimnaDonkile #IkhonoYouthChoir #PodcastClips #Shorts",
    },
    {
        "name": "02_host_emphasis_02m12",
        "timeline": 132.0,
        "duration": 60.0,
        "kind": "single",
        "camera": "host",
        "title": "This Conversation Started Getting Real",
        "description": "A sharp moment from Unmuted Podcast Episode 2 with Athimna Donkile of Ikhono Youth Choir. #UnmutedPodcast #PodcastMoment #SouthAfricanPodcast #Reels",
    },
    {
        "name": "03_shared_laugh_03m58",
        "timeline": 238.0,
        "duration": 60.0,
        "kind": "shared",
        "raw_starts": {"guest": 238.089, "host": 240.324},
        "title": "The Moment Both Sides Reacted",
        "description": "A shared reaction moment from Unmuted Podcast Episode 2 with Athimna Donkile of Ikhono Youth Choir. #UnmutedPodcast #AthimnaDonkile #PodcastClips #Shorts",
    },
    {
        "name": "04_host_punch_04m04",
        "timeline": 243.75,
        "duration": 60.0,
        "kind": "single",
        "camera": "host",
        "title": "He Said What Needed To Be Said",
        "description": "A clean one-minute podcast highlight with a strong point and real energy. Watch the full Unmuted Podcast Episode 2. #PodcastClips #UnmutedPodcast #Shorts",
    },
    {
        "name": "05_host_run_07m26",
        "timeline": 445.75,
        "duration": 60.0,
        "kind": "single",
        "camera": "host",
        "title": "This Part Has Serious Momentum",
        "description": "A one-minute moment built for viewers who love honest podcast conversations. Featuring Athimna Donkile on Unmuted Podcast. #Podcast #Reels #SouthAfricanCreators",
    },
    {
        "name": "06_host_point_10m32",
        "timeline": 631.75,
        "duration": 60.0,
        "kind": "single",
        "camera": "host",
        "raw_adjust": -0.24,
        "title": "This Point Needed To Land",
        "description": "A focused highlight from Unmuted Podcast Episode 2. Real talk, clean energy, and a reason to watch the full episode. #UnmutedPodcast #PodcastShorts #AthimnaDonkile",
    },
    {
        "name": "07_guest_answer_21m28",
        "timeline": 1287.84,
        "duration": 60.0,
        "kind": "single",
        "camera": "guest",
        "title": "Athimna Said It Clearly",
        "description": "Athimna Donkile of Ikhono Youth Choir shares a clean, memorable moment from Unmuted Podcast Episode 2. #AthimnaDonkile #IkhonoYouthChoir #UnmutedPodcast",
    },
    {
        "name": "08_guest_moment_26m27",
        "timeline": 1587.25,
        "duration": 60.0,
        "kind": "single",
        "camera": "guest",
        "title": "This Is The Moment To Watch",
        "description": "A strong one-minute guest highlight from Episode 2. Real conversation, clean framing, and podcast energy. #UnmutedPodcast #PodcastMoment #Shorts",
    },
    {
        "name": "09_guest_peak_32m50",
        "timeline": 1970.09,
        "duration": 60.0,
        "kind": "single",
        "camera": "guest",
        "title": "This Part Deserves The Full Episode",
        "description": "A late-episode highlight with Athimna Donkile that pulls you into the full conversation. #UnmutedPodcast #AthimnaDonkile #PodcastClips",
    },
    {
        "name": "10_shared_big_moment_35m58",
        "timeline": 2158.0,
        "duration": 60.0,
        "kind": "shared",
        "raw_starts": {"guest": 2158.075, "host": 2160.31},
        "title": "This Shared Moment Hit Different",
        "description": "A clean shared moment from Unmuted Podcast Episode 2 with Athimna Donkile. Built for Shorts and Reels. #UnmutedPodcast #AthimnaDonkile #PodcastShorts",
    },
]

CAMERA_CONFIG = {
    "host": {
        "path": HOST_CAM,
        "raw_offset": 2.298,
        "crop_x": 1016,
        "shared_crop_x": 528,
        "label": "host",
    },
    "guest": {
        "path": GUEST_CAM,
        "raw_offset": 0.049,
        "crop_x": 300,
        "shared_crop_x": 0,
        "label": "guest",
    },
}


def run(cmd, *, capture=False):
    proc = subprocess.run(
        cmd,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.PIPE if capture else None,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(
            f"Command failed ({proc.returncode}): {' '.join(map(str, cmd))}\n{proc.stderr or ''}"
        )
    return proc.stdout if capture else ""


def sync_probe(camera_path, clean_audio_path, raw_start, timeline_start, probe_offset, duration=8.0):
    sample_rate = 16000
    raw_cmd = [
        "ffmpeg",
        "-v",
        "error",
        "-ss",
        f"{raw_start + probe_offset:.3f}",
        "-t",
        f"{duration:.3f}",
        "-i",
        str(camera_path),
        "-map",
        "0:a:0",
        "-ac",
        "1",
        "-ar",
        str(sample_rate),
        "-f",
        "s16le",
        "-",
    ]
    clean_cmd = [
        "ffmpeg",
        "-v",
        "error",
        "-ss",
        f"{timeline_start + probe_offset - EXTERNAL_AUDIO_OFFSET_SECONDS:.3f}",
        "-t",
        f"{duration:.3f}",
        "-i",
        str(clean_audio_path),
        "-map",
        "0:a:0",
        "-ac",
        "1",
        "-ar",
        str(sample_rate),
        "-f",
        "s16le",
        "-",
    ]
    raw = subprocess.check_output(raw_cmd)
    clean = subprocess.check_output(clean_cmd)
    raw_audio = np.frombuffer(raw, dtype=np.int16).astype(np.float32)
    clean_audio = np.frombuffer(clean, dtype=np.int16).astype(np.float32)
    n = min(len(raw_audio), len(clean_audio))
    if n < sample_rate:
        return {"usable": False, "reason": "audio_too_short"}
    raw_audio = raw_audio[:n]
    clean_audio = clean_audio[:n]
    frame = int(sample_rate * 0.02)
    raw_env = np.array([np.sqrt(np.mean(raw_audio[i : i + frame] ** 2)) for i in range(0, n - frame, frame)])
    clean_env = np.array([np.sqrt(np.mean(clean_audio[i : i + frame] ** 2)) for i in range(0, n - frame, frame)])
    raw_env = raw_env - raw_env.mean()
    clean_env = clean_env - clean_env.mean()
    denom = float(np.linalg.norm(raw_env) * np.linalg.norm(clean_env))
    if denom <= 0:
        return {"usable": False, "reason": "flat_audio"}
    corr = correlate(clean_env, raw_env, mode="full")
    center = len(raw_env) - 1
    max_lag_frames = int(0.6 / 0.02)
    lo = max(0, center - max_lag_frames)
    hi = min(len(corr), center + max_lag_frames + 1)
    local = corr[lo:hi]
    best = int(np.argmax(local) + lo)
    lag_frames = best - center
    residual = lag_frames * 0.02
    return {
        "usable": True,
        "probe_offset": probe_offset,
        "residual_seconds": round(float(residual), 3),
        "abs_residual_seconds": round(abs(float(residual)), 3),
        "envelope_correlation": round(float(corr[best] / denom), 4),
    }


def align_raw_start(camera_key, raw_start, timeline_start, *, probe_offset=4.0):
    check = sync_probe(
        CAMERA_CONFIG[camera_key]["path"],
        CLEAN_AUDIO,
        raw_start,
        timeline_start,
        probe_offset,
    )
    adjusted = raw_start
    if check.get("usable") and float(check.get("envelope_correlation") or 0.0) >= 0.35:
        residual = float(check.get("residual_seconds") or 0.0)
        if abs(residual) >= 0.08:
            adjusted = max(0.0, raw_start - residual)
            check["applied_source_start_adjustment_seconds"] = round(-residual, 3)
    return adjusted, check


def render_single_clip(clip, raw_start):
    cfg = CAMERA_CONFIG[clip["camera"]]
    out_path = OUT_DIR / f"{clip['name']}_1min.mp4"
    crop_x = int(cfg["crop_x"])
    # Rounded foreground card over a soft blurred full-frame background.
    vf = (
        "[0:v]split=2[base][fgsrc];"
        "[base]scale=270:480:force_original_aspect_ratio=increase,"
        "crop=270:480,gblur=sigma=14,scale=1080:1920,"
        "eq=contrast=1.03:saturation=1.08:brightness=0.01[bg];"
        f"[fgsrc]crop=608:1080:{crop_x}:0,scale=1000:1776,"
        "eq=contrast=1.045:saturation=1.09:brightness=0.018,unsharp=5:5:0.55:3:3:0.25,"
        "format=rgba[fg];"
        "[2:v]format=gray,scale=1000:1776[mask];"
        "[fg][mask]alphamerge[fg];"
        "[bg][fg]overlay=40:72:format=auto,format=yuv420p[v]"
    )
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-y",
        "-ss",
        f"{raw_start:.3f}",
        "-i",
        str(cfg["path"]),
        "-ss",
        f"{clip['timeline'] - EXTERNAL_AUDIO_OFFSET_SECONDS:.3f}",
        "-i",
        str(CLEAN_AUDIO),
        "-loop",
        "1",
        "-i",
        str(SINGLE_MASK_PATH),
        "-t",
        f"{float(clip.get('duration', 60.0)):.3f}",
        "-filter_complex",
        vf,
        "-map",
        "[v]",
        "-map",
        "1:a:0",
        "-r",
        "30",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "17",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-ar",
        "48000",
        "-movflags",
        "+faststart",
        str(out_path),
    ]
    run(cmd)
    return out_path, raw_start


def render_shared_clip(clip, raw_starts):
    out_path = OUT_DIR / f"{clip['name']}_1min.mp4"
    host = CAMERA_CONFIG["host"]
    guest = CAMERA_CONFIG["guest"]
    host_x = int(host["shared_crop_x"])
    guest_x = int(guest["shared_crop_x"])
    vf = (
        "[1:v]split=2[bgsrc][guestsrc];"
        "[bgsrc]scale=270:480:force_original_aspect_ratio=increase,"
        "crop=270:480,gblur=sigma=18,scale=1080:1920,"
        "eq=contrast=1.03:saturation=1.08:brightness=0.01[bg];"
        f"[guestsrc]crop=1392:1080:{guest_x}:0,scale=980:760,"
        "eq=contrast=1.045:saturation=1.09:brightness=0.018,unsharp=5:5:0.45:3:3:0.18,"
        "format=rgba[guestfg];"
        f"[0:v]crop=1392:1080:{host_x}:0,scale=980:760,"
        "eq=contrast=1.045:saturation=1.09:brightness=0.018,unsharp=5:5:0.45:3:3:0.18,"
        "format=rgba[hostfg];"
        "[3:v]format=gray,scale=980:760[mask1];"
        "[3:v]format=gray,scale=980:760[mask2];"
        "[guestfg][mask1]alphamerge[guestfg];"
        "[hostfg][mask2]alphamerge[hostfg];"
        "[bg][guestfg]overlay=50:135:format=auto[tmp];"
        "[tmp][hostfg]overlay=50:1025:format=auto,format=yuv420p[v]"
    )
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-y",
        "-ss",
        f"{raw_starts['host']:.3f}",
        "-i",
        str(host["path"]),
        "-ss",
        f"{raw_starts['guest']:.3f}",
        "-i",
        str(guest["path"]),
        "-ss",
        f"{clip['timeline'] - EXTERNAL_AUDIO_OFFSET_SECONDS:.3f}",
        "-i",
        str(CLEAN_AUDIO),
        "-loop",
        "1",
        "-i",
        str(SHARED_MASK_PATH),
        "-t",
        f"{float(clip.get('duration', 60.0)):.3f}",
        "-filter_complex",
        vf,
        "-map",
        "[v]",
        "-map",
        "2:a:0",
        "-r",
        "30",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "17",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-ar",
        "48000",
        "-movflags",
        "+faststart",
        str(out_path),
    ]
    run(cmd)
    return out_path, raw_starts


def freeze_check(path):
    proc = subprocess.run(
        ["ffmpeg", "-hide_banner", "-i", str(path), "-vf", "freezedetect=n=-55dB:d=0.75", "-an", "-f", "null", "-"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    lines = [
        line.strip()
        for line in (proc.stderr or "").splitlines()
        if "freeze_start" in line or "freeze_duration" in line or "freeze_end" in line
    ]
    return {"ok": len(lines) == 0, "lines": lines}


def ffprobe_spec(path):
    raw = run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height,r_frame_rate,duration",
            "-of",
            "json",
            str(path),
        ],
        capture=True,
    )
    return json.loads(raw)["streams"][0]


def contact_sheet(outputs):
    sheet = OUT_DIR / "episode2_viral_1min_facezoom_shared_10pack_v4_contact.jpg"
    inputs = []
    labels = []
    for idx, path in enumerate(outputs):
        thumb = OUT_DIR / f"thumb_{idx + 1:02d}.jpg"
        run(["ffmpeg", "-hide_banner", "-y", "-ss", "4", "-i", str(path), "-frames:v", "1", str(thumb)])
        inputs.extend(["-i", str(thumb)])
        labels.append(thumb)
    layout = "5x2"
    run(
        [
            "ffmpeg",
            "-hide_banner",
            "-y",
            *inputs,
            "-filter_complex",
            f"tile={layout}:padding=16:margin=16",
            "-frames:v",
            "1",
            str(sheet),
        ]
    )
    for thumb in labels:
        try:
            thumb.unlink()
        except OSError:
            pass
    return sheet


def create_round_mask():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for path, width, height, radius in [
        (SINGLE_MASK_PATH, 1000, 1776, 72),
        (SHARED_MASK_PATH, 980, 760, 56),
    ]:
        mask = np.zeros((height, width), dtype=np.uint8)
        cv2.rectangle(mask, (radius, 0), (width - radius, height), 255, -1)
        cv2.rectangle(mask, (0, radius), (width, height - radius), 255, -1)
        cv2.circle(mask, (radius, radius), radius, 255, -1)
        cv2.circle(mask, (width - radius, radius), radius, 255, -1)
        cv2.circle(mask, (radius, height - radius), radius, 255, -1)
        cv2.circle(mask, (width - radius, height - radius), radius, 255, -1)
        cv2.imwrite(str(path), mask)


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    create_round_mask()
    receipts = []
    outputs = []
    for clip in CLIPS:
        receipt_path = OUT_DIR / f"{clip['name']}_receipt.json"
        out_path = OUT_DIR / f"{clip['name']}_1min.mp4"
        if receipt_path.exists() and out_path.exists():
            try:
                existing = json.loads(receipt_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                existing = None
            if existing and existing.get("passes") and not clip.get("raw_adjust"):
                print(f"Keeping passed {clip['name']}...")
                receipts.append(existing)
                outputs.append(out_path)
                continue
        print(f"Rendering {clip['name']}...")
        alignment_checks = []
        if clip["kind"] == "shared":
            raw_starts = dict(clip["raw_starts"])
            for cam_key in ["guest", "host"]:
                raw_starts[cam_key], check = align_raw_start(cam_key, raw_starts[cam_key], clip["timeline"])
                check["camera"] = cam_key
                alignment_checks.append(check)
            out_path, raw_start_info = render_shared_clip(clip, raw_starts)
            checks = []
            for cam_key in ["guest", "host"]:
                checks.append(
                    {
                        "camera": cam_key,
                        "start": sync_probe(CAMERA_CONFIG[cam_key]["path"], CLEAN_AUDIO, raw_starts[cam_key], clip["timeline"], 4.0),
                        "end": sync_probe(CAMERA_CONFIG[cam_key]["path"], CLEAN_AUDIO, raw_starts[cam_key], clip["timeline"], 44.0),
                    }
                )
        else:
            cfg = CAMERA_CONFIG[clip["camera"]]
            raw_start = max(
                0.0,
                float(clip["timeline"]) + float(cfg["raw_offset"]) + float(clip.get("raw_adjust", 0.0)),
            )
            raw_start, align_check = align_raw_start(clip["camera"], raw_start, clip["timeline"])
            alignment_checks.append(align_check)
            out_path, raw_start_info = render_single_clip(clip, raw_start)
            checks = [
                sync_probe(CAMERA_CONFIG[clip["camera"]]["path"], CLEAN_AUDIO, raw_start, clip["timeline"], 4.0),
                sync_probe(CAMERA_CONFIG[clip["camera"]]["path"], CLEAN_AUDIO, raw_start, clip["timeline"], 44.0),
            ]
        freeze = freeze_check(out_path)
        spec = ffprobe_spec(out_path)
        trusted_checks = []
        flat_checks = []
        if clip["kind"] == "shared":
            for item in checks:
                for point in ["start", "end"]:
                    check = item[point]
                    if check.get("usable"):
                        flat_checks.append(check)
                        if float(check.get("envelope_correlation") or 0.0) >= 0.35:
                            trusted_checks.append(check)
        else:
            for check in checks:
                if check.get("usable"):
                    flat_checks.append(check)
                    if float(check.get("envelope_correlation") or 0.0) >= 0.35:
                        trusted_checks.append(check)
        max_abs = max([float(item.get("abs_residual_seconds", 999.0)) for item in flat_checks] or [999.0])
        max_trusted_abs = max([float(item.get("abs_residual_seconds", 999.0)) for item in trusted_checks] or [0.0])
        sync_status = "trusted_pass" if trusted_checks and max_trusted_abs <= 0.16 else "inconclusive" if not trusted_checks else "trusted_fail"
        passes = (
            freeze["ok"]
            and sync_status == "trusted_pass"
            and int(spec["width"]) == 1080
            and int(spec["height"]) == 1920
        )
        receipt = {
            **clip,
            "output": str(out_path),
            "raw_start": raw_start_info if isinstance(raw_start_info, dict) else round(raw_start_info, 3),
            "duration_seconds": float(clip.get("duration", 60.0)),
            "render_rules": [
                "raw camera source plus clean external audio",
                "single-speaker face-zoom or two-camera shared moment",
                "no subtitles, timers, stickers, or face overlays",
                "rounded foreground frames with blurred background",
                "1080x1920, 30fps, CRF 17",
            ],
            "alignment_checks": alignment_checks,
            "external_audio_offset_seconds": EXTERNAL_AUDIO_OFFSET_SECONDS,
            "external_audio_start_seconds": round(float(clip["timeline"]) - EXTERNAL_AUDIO_OFFSET_SECONDS, 3),
            "manual_raw_adjust_seconds": round(float(clip.get("raw_adjust", 0.0)), 3),
            "sync_checks": checks,
            "max_abs_sync_residual_seconds": round(max_abs, 3),
            "max_trusted_sync_residual_seconds": round(max_trusted_abs, 3),
            "sync_status": sync_status,
            "freeze": freeze,
            "spec": spec,
            "passes": bool(passes),
        }
        receipt_path.write_text(json.dumps(receipt, indent=2), encoding="utf-8")
        receipts.append(receipt)
        outputs.append(out_path)
        if not passes:
            print(f"Rejected {clip['name']}: {json.dumps(receipt, indent=2)}")
    sheet = contact_sheet(outputs) if outputs else None
    copy_lines = []
    for item in receipts:
        copy_lines.append(f"{Path(item['output']).name}")
        copy_lines.append(f"Title: {item['title']}")
        copy_lines.append(f"Description: {item['description']}")
        copy_lines.append("")
    (OUT_DIR / "platform_titles_descriptions.txt").write_text("\n".join(copy_lines), encoding="utf-8")
    manifest = {
        "status": "complete" if all(item["passes"] for item in receipts) else "needs_review",
        "folder": str(OUT_DIR),
        "accepted_count": sum(1 for item in receipts if item["passes"]),
        "rejected_count": sum(1 for item in receipts if not item["passes"]),
        "contact_sheet": str(sheet) if sheet else None,
        "clips": receipts,
    }
    (OUT_DIR / "episode2_viral_1min_facezoom_shared_10pack_v4_manifest.json").write_text(
        json.dumps(manifest, indent=2),
        encoding="utf-8",
    )
    if manifest["rejected_count"]:
        raise SystemExit(2)
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
