#!/usr/bin/env python3
import json
import argparse
import shutil
import subprocess
from pathlib import Path

import cv2
import numpy as np


MASTER = Path(
    "/home/tibule12/Downloads/episode2-full-premium-render/reaction-fixed-first5/"
    "episode2_FULL_EPISODE2_REACTION_FIXED_SECTION_SYNC_MAP_V6_SIGNED_AUDIT_SECTION_SYNC.mp4"
)
OUT_DIR = Path("/home/tibule12/Downloads/episode2-verified-director-verticals-20260618")
TMP_DIR = OUT_DIR / "_tmp"
SINGLE_MASK = OUT_DIR / "rounded_card_mask_1000x1776.png"
SPLIT_MASK = OUT_DIR / "rounded_card_mask_980x760.png"

CAMERAS = {
    "host": {
        "path": Path("/home/tibule12/Videos/IMG_4533.MOV"),
        "sync_offset": 0.07,
        "face_crop": "crop=608:1080:1016:0,scale=1000:1776",
        "shared_crop": "crop=1392:1080:528:0,scale=980:760",
    },
    "guest": {
        "path": Path("/home/tibule12/Videos/IMG_4185.MOV"),
        "sync_offset": 2.32,
        "face_crop": "crop=608:1080:300:0,scale=1000:1776",
        "shared_crop": "crop=1392:1080:0:0,scale=980:760",
    },
}

CLIPS = [
    {"name": "01_opening_01m32", "timeline": 92.0, "duration": 60.0},
    {"name": "02_host_to_guest_02m12", "timeline": 132.0, "duration": 60.0},
    {"name": "03_shared_laugh_03m58", "timeline": 238.0, "duration": 60.0},
    {"name": "04_host_punch_04m04", "timeline": 243.75, "duration": 60.0},
    {"name": "05_host_run_07m26", "timeline": 445.75, "duration": 60.0},
    {"name": "06_director_switch_10m32", "timeline": 631.75, "duration": 60.0},
    {"name": "07_guest_answer_21m28", "timeline": 1287.84, "duration": 60.0},
    {"name": "08_guest_to_host_26m27", "timeline": 1587.25, "duration": 60.0},
    {"name": "09_guest_peak_32m50", "timeline": 1970.09, "duration": 60.0},
    {"name": "10_shared_big_moment_35m58", "timeline": 2158.0, "duration": 60.0},
]


def run(cmd, *, capture=False):
    proc = subprocess.run(
        [str(item) for item in cmd],
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.PIPE if capture else None,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"Command failed ({proc.returncode}): {' '.join(map(str, cmd))}\n{proc.stderr or ''}")
    return proc.stdout if capture else ""


def make_masks():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for path, width, height, radius in [
        (SINGLE_MASK, 1000, 1776, 72),
        (SPLIT_MASK, 980, 760, 56),
    ]:
        mask = np.zeros((height, width), dtype=np.uint8)
        cv2.rectangle(mask, (radius, 0), (width - radius, height), 255, -1)
        cv2.rectangle(mask, (0, radius), (width, height - radius), 255, -1)
        cv2.circle(mask, (radius, radius), radius, 255, -1)
        cv2.circle(mask, (width - radius, radius), radius, 255, -1)
        cv2.circle(mask, (radius, height - radius), radius, 255, -1)
        cv2.circle(mask, (width - radius, height - radius), radius, 255, -1)
        cv2.imwrite(str(path), mask)


def extract_frames(source, start, duration, out_dir, *, fps=1):
    expected = int(float(duration) * float(fps))
    if out_dir.exists() and len(list(out_dir.glob("*.jpg"))) >= expected:
        return
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    run(
        [
            "ffmpeg",
            "-hide_banner",
            "-y",
            "-ss",
            f"{start:.3f}",
            "-t",
            f"{duration:.3f}",
            "-i",
            source,
            "-vf",
            f"fps={fps},scale=640:360",
            str(out_dir / "%04d.jpg"),
        ]
    )


def orb_score(orb, matcher, master_frame, camera_frame):
    primary = master_frame[16:345, 22:618]
    primary = cv2.resize(primary, (640, 360))
    camera_frame = cv2.resize(camera_frame, (640, 360))
    a = cv2.cvtColor(primary, cv2.COLOR_BGR2GRAY)
    b = cv2.cvtColor(camera_frame, cv2.COLOR_BGR2GRAY)
    kp1, des1 = orb.detectAndCompute(a, None)
    kp2, des2 = orb.detectAndCompute(b, None)
    if des1 is None or des2 is None:
        return 0
    matches = matcher.match(des1, des2)
    return len([m for m in matches if m.distance < 55])


def classify_clip(clip):
    clip_tmp = TMP_DIR / clip["name"] / "frames"
    duration = float(clip["duration"])
    timeline = float(clip["timeline"])
    extract_frames(MASTER, timeline, duration, clip_tmp / "master")
    for camera, cfg in CAMERAS.items():
        extract_frames(cfg["path"], timeline + cfg["sync_offset"], duration, clip_tmp / camera)

    orb = cv2.ORB_create(1600)
    matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
    master_files = sorted((clip_tmp / "master").glob("*.jpg"))
    samples = []
    for idx, master_file in enumerate(master_files):
        master = cv2.imread(str(master_file))
        scores = {}
        for camera in CAMERAS:
            cam_file = clip_tmp / camera / master_file.name
            cam = cv2.imread(str(cam_file))
            scores[camera] = orb_score(orb, matcher, master, cam) if cam is not None else 0
        ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)
        best, best_score = ranked[0]
        runner_score = ranked[1][1]
        ratio = best_score / max(1, runner_score)
        layout = "split" if best_score >= 260 and runner_score >= 220 and ratio < 1.20 else "single"
        samples.append(
            {
                "t": idx,
                "camera": best,
                "layout": layout,
                "scores": scores,
                "confidence": round(ratio, 3),
            }
        )

    for idx, sample in enumerate(samples):
        if sample["confidence"] < 1.15 and sample["layout"] == "single":
            prev_camera = samples[idx - 1]["camera"] if idx else None
            next_camera = samples[idx + 1]["camera"] if idx + 1 < len(samples) else None
            if prev_camera and prev_camera == next_camera:
                sample["camera"] = prev_camera
                sample["smoothed"] = True

    segments = []
    for sample in samples:
        start = timeline + sample["t"]
        end = min(timeline + duration, start + 1.0)
        if segments and segments[-1]["camera"] == sample["camera"] and segments[-1]["layout"] == sample["layout"]:
            segments[-1]["end"] = end
            segments[-1]["samples"].append(sample)
        else:
            segments.append(
                {
                    "start": start,
                    "end": end,
                    "duration": end - start,
                    "camera": sample["camera"],
                    "layout": sample["layout"],
                    "samples": [sample],
                }
            )
    for segment in segments:
        segment["duration"] = segment["end"] - segment["start"]
    return samples, [s for s in segments if s["duration"] >= 0.2]


def single_filter(camera):
    crop = CAMERAS[camera]["face_crop"]
    return (
        "[0:v]split=2[base][fgsrc];"
        "[base]scale=270:480:force_original_aspect_ratio=increase,"
        "crop=270:480,gblur=sigma=14,scale=1080:1920,"
        "eq=contrast=1.03:saturation=1.08:brightness=0.01[bg];"
        f"[fgsrc]{crop},"
        "eq=contrast=1.045:saturation=1.09:brightness=0.018,"
        "unsharp=5:5:0.55:3:3:0.25,format=rgba[fg];"
        "[1:v]format=gray,scale=1000:1776[mask];"
        "[fg][mask]alphamerge[fg];"
        "[bg][fg]overlay=40:72:format=auto,format=yuv420p[v]"
    )


def split_filter(primary, secondary):
    return (
        "[0:v]split=2[bgsrc][psrc];"
        "[bgsrc]scale=270:480:force_original_aspect_ratio=increase,"
        "crop=270:480,gblur=sigma=16,scale=1080:1920,"
        "eq=contrast=1.03:saturation=1.08:brightness=0.01[bg];"
        f"[psrc]{CAMERAS[primary]['shared_crop']},"
        "eq=contrast=1.045:saturation=1.09:brightness=0.018,"
        "unsharp=5:5:0.45:3:3:0.18,format=rgba[pfg];"
        f"[1:v]{CAMERAS[secondary]['shared_crop']},"
        "eq=contrast=1.045:saturation=1.09:brightness=0.018,"
        "unsharp=5:5:0.45:3:3:0.18,format=rgba[sfg];"
        "[2:v]format=gray,scale=980:760[mask1];"
        "[2:v]format=gray,scale=980:760[mask2];"
        "[pfg][mask1]alphamerge[pfg];"
        "[sfg][mask2]alphamerge[sfg];"
        "[bg][pfg]overlay=50:135:format=auto[tmp];"
        "[tmp][sfg]overlay=50:1025:format=auto,format=yuv420p[v]"
    )


def render_segment(segment, out_path):
    camera = segment["camera"]
    if segment["layout"] == "split":
        secondary = "guest" if camera == "host" else "host"
        run(
            [
                "ffmpeg",
                "-hide_banner",
                "-y",
                "-ss",
                f"{segment['start'] + CAMERAS[camera]['sync_offset']:.3f}",
                "-i",
                CAMERAS[camera]["path"],
                "-ss",
                f"{segment['start'] + CAMERAS[secondary]['sync_offset']:.3f}",
                "-i",
                CAMERAS[secondary]["path"],
                "-loop",
                "1",
                "-i",
                SPLIT_MASK,
                "-t",
                f"{segment['duration']:.3f}",
                "-filter_complex",
                split_filter(camera, secondary),
                "-map",
                "[v]",
                "-an",
                "-r",
                "30",
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-crf",
                "17",
                "-pix_fmt",
                "yuv420p",
                out_path,
            ]
        )
        return
    run(
        [
            "ffmpeg",
            "-hide_banner",
            "-y",
            "-ss",
            f"{segment['start'] + CAMERAS[camera]['sync_offset']:.3f}",
            "-i",
            CAMERAS[camera]["path"],
            "-loop",
            "1",
            "-i",
            SINGLE_MASK,
            "-t",
            f"{segment['duration']:.3f}",
            "-filter_complex",
            single_filter(camera),
            "-map",
            "[v]",
            "-an",
            "-r",
            "30",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "17",
            "-pix_fmt",
            "yuv420p",
            out_path,
        ]
    )


def concat(parts, out_path):
    concat_path = out_path.with_suffix(".concat.txt")
    concat_path.write_text("".join(f"file '{p}'\n" for p in parts), encoding="utf-8")
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", concat_path, "-c", "copy", out_path])
    concat_path.unlink(missing_ok=True)


def add_master_audio(video_path, clip, out_path):
    audio_path = out_path.with_suffix(".m4a")
    run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-ss",
            f"{float(clip['timeline']):.3f}",
            "-t",
            f"{float(clip['duration']):.3f}",
            "-i",
            MASTER,
            "-vn",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-ar",
            "48000",
            audio_path,
        ]
    )
    run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            video_path,
            "-i",
            audio_path,
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            "-c:v",
            "copy",
            "-c:a",
            "copy",
            "-shortest",
            "-movflags",
            "+faststart",
            out_path,
        ]
    )
    audio_path.unlink(missing_ok=True)


def ffprobe(path):
    return json.loads(
        run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration:stream=index,codec_type,width,height,r_frame_rate,duration",
                "-of",
                "json",
                path,
            ],
            capture=True,
        )
    )


def freeze_check(path):
    proc = subprocess.run(
        ["ffmpeg", "-hide_banner", "-i", str(path), "-vf", "freezedetect=n=-55dB:d=0.75", "-an", "-f", "null", "-"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    lines = [line.strip() for line in proc.stderr.splitlines() if "freeze_" in line]
    return {"ok": not lines, "lines": lines}


def render_clip(clip):
    samples, segments = classify_clip(clip)
    clip_tmp = TMP_DIR / clip["name"] / "rendered"
    if clip_tmp.exists():
        shutil.rmtree(clip_tmp)
    clip_tmp.mkdir(parents=True, exist_ok=True)
    parts = []
    for idx, segment in enumerate(segments):
        part = clip_tmp / f"{idx:03d}_{segment['layout']}_{segment['camera']}.mp4"
        render_segment(segment, part)
        parts.append(part)
    silent = clip_tmp / f"{clip['name']}_video_only.mp4"
    concat(parts, silent)
    out_path = OUT_DIR / f"{clip['name']}_verified_director_vertical_1min.mp4"
    add_master_audio(silent, clip, out_path)
    spec = ffprobe(out_path)
    freeze = freeze_check(out_path)
    receipt = {
        **clip,
        "output": str(out_path),
        "camera_sync_offsets": {k: v["sync_offset"] for k, v in CAMERAS.items()},
        "samples": samples,
        "segments": segments,
        "spec": spec,
        "freeze": freeze,
        "passes_machine_checks": bool(
            freeze["ok"]
            and spec["streams"][0]["width"] == 1080
            and spec["streams"][0]["height"] == 1920
            and 59.7 <= float(spec["format"]["duration"]) <= 60.3
        ),
    }
    (OUT_DIR / f"{clip['name']}_receipt.json").write_text(json.dumps(receipt, indent=2), encoding="utf-8")
    return receipt


def contact_sheet(receipts):
    thumbs = []
    for idx, receipt in enumerate(receipts):
        thumb = OUT_DIR / f"_thumb_{idx + 1:02d}.jpg"
        run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", "6", "-i", receipt["output"], "-frames:v", "1", "-update", "1", thumb])
        thumbs.append(thumb)
    inputs = []
    for thumb in thumbs:
        inputs.extend(["-i", thumb])
    sheet = OUT_DIR / "contact_sheet.jpg"
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *inputs, "-filter_complex", "tile=5x2:padding=16:margin=16", "-frames:v", "1", "-update", "1", sheet])
    for thumb in thumbs:
        thumb.unlink(missing_ok=True)
    return sheet


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--clip-filter", default="")
    parser.add_argument("--skip-existing", action="store_true")
    args = parser.parse_args()
    selected = {
        item.strip()
        for item in args.clip_filter.split(",")
        if item.strip()
    }
    clips = [
        clip
        for clip in CLIPS
        if not selected or clip["name"] in selected or clip["name"].split("_", 1)[0] in selected
    ]
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    make_masks()
    receipts = []
    for clip in clips:
        existing_receipt = OUT_DIR / f"{clip['name']}_receipt.json"
        existing_output = OUT_DIR / f"{clip['name']}_verified_director_vertical_1min.mp4"
        if args.skip_existing and existing_receipt.exists() and existing_output.exists():
            receipts.append(json.loads(existing_receipt.read_text(encoding="utf-8")))
            continue
        print(f"render {clip['name']}", flush=True)
        receipts.append(render_clip(clip))
    all_receipts = []
    for clip in CLIPS:
        receipt_path = OUT_DIR / f"{clip['name']}_receipt.json"
        if receipt_path.exists():
            all_receipts.append(json.loads(receipt_path.read_text(encoding="utf-8")))
    sheet = contact_sheet(all_receipts) if not selected and len(all_receipts) == len(CLIPS) else None
    manifest = {
        "output_dir": str(OUT_DIR),
        "accepted_master": str(MASTER),
        "camera_sync_offsets": {k: v["sync_offset"] for k, v in CAMERAS.items()},
        "all_machine_checks_passed": len(all_receipts) == len(CLIPS) and all(r["passes_machine_checks"] for r in all_receipts),
        "contact_sheet": str(sheet) if sheet else None,
        "clips": all_receipts,
    }
    (OUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps({"output_dir": str(OUT_DIR), "passed": manifest["all_machine_checks_passed"]}, indent=2), flush=True)


if __name__ == "__main__":
    main()
