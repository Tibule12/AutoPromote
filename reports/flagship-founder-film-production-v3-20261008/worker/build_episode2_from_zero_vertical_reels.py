#!/usr/bin/env python3
import argparse
import json
import math
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np


MASTER = Path(
    "/home/tibule12/Downloads/episode2-full-premium-render/reaction-fixed-first5/"
    "episode2_FULL_EPISODE2_REACTION_FIXED_SECTION_SYNC_MAP_V6_SIGNED_AUDIT_SECTION_SYNC.mp4"
)
APPROVED_STYLE_CLIP = Path(
    "/home/tibule12/Downloads/episode2-master-matched-vertical-1min-10pack-v5/"
    "05_host_run_07m26_master_matched_vertical_1min.mp4"
)
OUTPUT_DIR = Path("/home/tibule12/Downloads/episode2-from-zero-vertical-reels-20260618")
TMP_DIR = OUTPUT_DIR / "_tmp"
SINGLE_MASK = OUTPUT_DIR / "rounded_card_mask_1000x1776.png"
SPLIT_MASK = OUTPUT_DIR / "rounded_card_mask_980x760.png"

CAMERAS = {
    "cam1": {
        "label": "host",
        "path": Path("/home/tibule12/Videos/IMG_4533.MOV"),
        "crop": "crop=608:1080:1016:0,scale=1000:1776",
    },
    "cam2": {
        "label": "guest",
        "path": Path("/home/tibule12/Videos/IMG_4185.MOV"),
        "crop": "crop=608:1080:300:0,scale=1000:1776",
    },
}

CLIPS = [
    {"name": "01_guest_energy_01m32", "timeline": 92.0, "duration": 60.0},
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

STATIC_PLAN = {
    "01_guest_energy_01m32": {"layout": "single", "camera_id": "cam1", "offsets": {"cam1": 0.0}},
    "02_host_to_guest_02m12": {"layout": "single", "camera_id": "cam2", "offsets": {"cam2": 2.25}},
    "03_shared_laugh_03m58": {"layout": "single", "camera_id": "cam2", "offsets": {"cam2": 2.25}},
    "04_host_punch_04m04": {"layout": "single", "camera_id": "cam2", "offsets": {"cam2": 2.25}},
    "05_host_run_07m26": {"layout": "single", "camera_id": "cam2", "offsets": {"cam2": 2.25}},
    "06_director_switch_10m32": {"layout": "single", "camera_id": "cam2", "offsets": {"cam2": 2.25}},
    "07_guest_answer_21m28": {"layout": "single", "camera_id": "cam1", "offsets": {"cam1": 0.35}},
    "08_guest_to_host_26m27": {"layout": "single", "camera_id": "cam1", "offsets": {"cam1": 0.35}},
    "09_guest_peak_32m50": {"layout": "single", "camera_id": "cam1", "offsets": {"cam1": 0.35}},
    "10_shared_big_moment_35m58": {
        "layout": "split",
        "camera_id": "cam1",
        "secondary_camera_id": "cam2",
        "offsets": {"cam1": 0.5, "cam2": 2.75},
    },
}


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


def ffprobe_json(path):
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


def create_round_masks():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
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


class FrameSource:
    def __init__(self, path):
        self.path = str(path)
        self.cap = cv2.VideoCapture(self.path)
        if not self.cap.isOpened():
            raise RuntimeError(f"Could not open {path}")

    def read(self, seconds):
        self.cap.set(cv2.CAP_PROP_POS_MSEC, max(0.0, float(seconds)) * 1000.0)
        ok, frame = self.cap.read()
        if not ok:
            raise RuntimeError(f"Could not read {self.path} at {seconds:.3f}s")
        return frame

    def close(self):
        self.cap.release()


class MasterMatcher:
    def __init__(self):
        self.master = FrameSource(MASTER)
        self.cameras = {camera_id: FrameSource(cfg["path"]) for camera_id, cfg in CAMERAS.items()}
        self.orb = cv2.ORB_create(1800)
        self.matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)

    def close(self):
        self.master.close()
        for item in self.cameras.values():
            item.close()

    def score(self, master_frame, camera_frame):
        # The accepted master keeps the primary camera in the large rounded card.
        primary = master_frame[50:1035, 65:1855]
        primary = cv2.resize(primary, (640, 360))
        candidate = cv2.resize(camera_frame, (640, 360))
        primary_gray = cv2.cvtColor(primary, cv2.COLOR_BGR2GRAY)
        candidate_gray = cv2.cvtColor(candidate, cv2.COLOR_BGR2GRAY)
        kp1, des1 = self.orb.detectAndCompute(primary_gray, None)
        kp2, des2 = self.orb.detectAndCompute(candidate_gray, None)
        if des1 is None or des2 is None:
            return 0
        matches = self.matcher.match(des1, des2)
        return len([match for match in matches if match.distance < 55])

    def coarse_offset(self, camera_id, timeline_time):
        if camera_id == "cam2":
            return 2.25
        return 0.0 if timeline_time < 300 else 0.35

    def choose_primary(self, timeline_time):
        master_frame = self.master.read(timeline_time)
        scores = {}
        for camera_id in CAMERAS:
            source_time = timeline_time + self.coarse_offset(camera_id, timeline_time)
            scores[camera_id] = self.score(master_frame, self.cameras[camera_id].read(source_time))
        ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)
        best_id, best_score = ranked[0]
        runner_score = ranked[1][1]
        confidence = best_score / max(1, runner_score)
        ambiguous = best_score < 350 or confidence < 1.25
        return {
            "timeline_time": round(timeline_time, 3),
            "camera_id": best_id,
            "scores": scores,
            "confidence": round(confidence, 3),
            "ambiguous": bool(ambiguous),
        }

    def fine_offset(self, camera_id, timeline_time):
        center = self.coarse_offset(camera_id, timeline_time)
        candidates = [center + step for step in np.arange(-0.5, 0.501, 0.05)]
        master_frame = self.master.read(timeline_time)
        scored = []
        for offset in candidates:
            frame = self.cameras[camera_id].read(timeline_time + float(offset))
            scored.append((self.score(master_frame, frame), float(offset)))
        best_score, best_offset = max(scored, key=lambda item: item[0])
        return round(best_offset, 3), int(best_score)


def merge_samples(samples, timeline_start, timeline_end, sample_step):
    if not samples:
        return []
    for idx, sample in enumerate(samples):
        if sample["ambiguous"]:
            previous_id = samples[idx - 1]["camera_id"] if idx else None
            next_id = samples[idx + 1]["camera_id"] if idx + 1 < len(samples) else None
            if previous_id and previous_id == next_id:
                sample["camera_id"] = previous_id
                sample["filled_ambiguous"] = True
    segments = []
    for sample in samples:
        start = max(timeline_start, sample["timeline_time"] - sample_step / 2)
        end = min(timeline_end, sample["timeline_time"] + sample_step / 2)
        if segments and segments[-1]["camera_id"] == sample["camera_id"]:
            segments[-1]["end"] = end
            segments[-1]["samples"].append(sample)
        else:
            segments.append({"camera_id": sample["camera_id"], "start": start, "end": end, "samples": [sample]})
    for segment in segments:
        segment["duration"] = round(segment["end"] - segment["start"], 3)
    return [segment for segment in segments if segment["duration"] >= 0.1]


def analyze_clip(clip, matcher, sample_step):
    timeline_start = float(clip["timeline"])
    duration = float(clip["duration"])
    timeline_end = timeline_start + duration
    samples = []
    t = timeline_start + sample_step / 2
    while t < timeline_end:
        samples.append(matcher.choose_primary(t))
        t += sample_step
    segments = merge_samples(samples, timeline_start, timeline_end, sample_step)
    ambiguous_count = sum(1 for sample in samples if sample["ambiguous"] and not sample.get("filled_ambiguous"))
    weak_count = sum(1 for sample in samples if max(sample["scores"].values()) < 350)
    ambiguous_ratio = ambiguous_count / max(1, len(samples))
    renderable = ambiguous_ratio <= 0.20 and weak_count <= max(2, math.ceil(len(samples) * 0.20))
    return {
        **clip,
        "samples": samples,
        "segments": segments,
        "sample_count": len(samples),
        "ambiguous_count": ambiguous_count,
        "weak_count": weak_count,
        "ambiguous_ratio": round(ambiguous_ratio, 3),
        "sample_step": sample_step,
        "renderable": bool(renderable),
    }


def single_camera_filter(camera_id):
    crop = CAMERAS[camera_id]["crop"]
    return (
        "[0:v]split=2[base][fgsrc];"
        "[base]scale=270:480:force_original_aspect_ratio=increase,"
        "crop=270:480,gblur=sigma=14,scale=1080:1920,"
        "eq=contrast=1.03:saturation=1.08:brightness=0.01[bg];"
        f"[fgsrc]{crop},"
        "eq=contrast=1.045:saturation=1.09:brightness=0.018,"
        "unsharp=5:5:0.55:3:3:0.25,format=rgba[fg];"
        "[1:v]format=gray,scale=1000:1776[mask];"
        "[fg][mask]alphamerge[fgcard];"
        "[bg][fgcard]overlay=40:72:format=auto,format=yuv420p[v]"
    )


def split_camera_filter(primary_id, secondary_id):
    primary = CAMERAS[primary_id]
    secondary = CAMERAS[secondary_id]
    return (
        "[0:v]split=2[bgsrc][primarysrc];"
        "[bgsrc]scale=270:480:force_original_aspect_ratio=increase,"
        "crop=270:480,gblur=sigma=16,scale=1080:1920,"
        "eq=contrast=1.03:saturation=1.08:brightness=0.01[bg];"
        f"[primarysrc]{primary['crop'].replace('scale=1000:1776', 'scale=980:760')},"
        "eq=contrast=1.045:saturation=1.09:brightness=0.018,"
        "unsharp=5:5:0.45:3:3:0.18,format=rgba[pfg];"
        f"[1:v]{secondary['crop'].replace('scale=1000:1776', 'scale=980:760')},"
        "eq=contrast=1.045:saturation=1.09:brightness=0.018,"
        "unsharp=5:5:0.45:3:3:0.18,format=rgba[sfg];"
        "[2:v]format=gray,scale=980:760[mask1];"
        "[2:v]format=gray,scale=980:760[mask2];"
        "[pfg][mask1]alphamerge[pfg];"
        "[sfg][mask2]alphamerge[sfg];"
        "[bg][pfg]overlay=50:135:format=auto[tmp];"
        "[tmp][sfg]overlay=50:1025:format=auto,format=yuv420p[v]"
    )


def render_video_segment(segment, source_offset, path):
    camera_id = segment["camera_id"]
    run(
        [
            "ffmpeg",
            "-hide_banner",
            "-y",
            "-ss",
            f"{segment['start'] + source_offset:.3f}",
            "-i",
            CAMERAS[camera_id]["path"],
            "-loop",
            "1",
            "-i",
            SINGLE_MASK,
            "-t",
            f"{segment['duration']:.3f}",
            "-filter_complex",
            single_camera_filter(camera_id),
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
            path,
        ]
    )


def render_static_video(clip, plan, video_path):
    timeline_start = float(clip["timeline"])
    duration = float(clip["duration"])
    if plan["layout"] == "split":
        primary_id = plan["camera_id"]
        secondary_id = plan["secondary_camera_id"]
        run(
            [
                "ffmpeg",
                "-hide_banner",
                "-y",
                "-ss",
                f"{timeline_start + plan['offsets'][primary_id]:.3f}",
                "-i",
                CAMERAS[primary_id]["path"],
                "-ss",
                f"{timeline_start + plan['offsets'][secondary_id]:.3f}",
                "-i",
                CAMERAS[secondary_id]["path"],
                "-loop",
                "1",
                "-i",
                SPLIT_MASK,
                "-t",
                f"{duration:.3f}",
                "-filter_complex",
                split_camera_filter(primary_id, secondary_id),
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
                video_path,
            ]
        )
        return

    camera_id = plan["camera_id"]
    render_video_segment(
        {
            "camera_id": camera_id,
            "start": timeline_start,
            "duration": duration,
        },
        plan["offsets"][camera_id],
        video_path,
    )


def concat_segments(paths, output):
    concat = output.with_suffix(".concat.txt")
    concat.write_text("".join(f"file '{path}'\n" for path in paths), encoding="utf-8")
    run(["ffmpeg", "-hide_banner", "-y", "-f", "concat", "-safe", "0", "-i", concat, "-c", "copy", output])
    concat.unlink(missing_ok=True)


def add_master_audio(video_path, output_path, timeline_start, duration):
    audio_path = output_path.with_suffix(".master_audio.m4a")
    run(
        [
            "ffmpeg",
            "-hide_banner",
            "-y",
            "-ss",
            f"{timeline_start:.3f}",
            "-t",
            f"{duration:.3f}",
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
            output_path,
        ]
    )
    audio_path.unlink(missing_ok=True)


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
    return {"ok": not lines, "lines": lines}


def render_clip(analysis, matcher):
    if not analysis["renderable"]:
        return None
    clip_tmp = TMP_DIR / analysis["name"]
    if clip_tmp.exists():
        shutil.rmtree(clip_tmp)
    clip_tmp.mkdir(parents=True, exist_ok=True)
    rendered = []
    rendered_segments = []
    for idx, segment in enumerate(analysis["segments"]):
        midpoint = (segment["start"] + segment["end"]) / 2
        offset, offset_score = matcher.fine_offset(segment["camera_id"], midpoint)
        segment_path = clip_tmp / f"{idx:03d}_{segment['camera_id']}.mp4"
        render_video_segment(segment, offset, segment_path)
        rendered.append(segment_path)
        rendered_segments.append({**segment, "source_offset": offset, "offset_score": offset_score})
    silent = clip_tmp / f"{analysis['name']}_video_only.mp4"
    concat_segments(rendered, silent)
    output = OUTPUT_DIR / f"{analysis['name']}_from_zero_vertical_1min.mp4"
    add_master_audio(silent, output, float(analysis["timeline"]), float(analysis["duration"]))
    spec = ffprobe_json(output)
    freeze = freeze_check(output)
    receipt = {
        **{key: value for key, value in analysis.items() if key != "segments"},
        "output": str(output),
        "segments": rendered_segments,
        "source": "raw camera vertical video + accepted full episode audio",
        "accepted_master": str(MASTER),
        "approved_style_clip": str(APPROVED_STYLE_CLIP),
        "spec": spec,
        "freeze": freeze,
        "passes_machine_checks": bool(
            freeze["ok"]
            and spec["streams"][0]["width"] == 1080
            and spec["streams"][0]["height"] == 1920
            and 59.7 <= float(spec["format"]["duration"]) <= 60.3
        ),
    }
    (OUTPUT_DIR / f"{analysis['name']}_receipt.json").write_text(json.dumps(receipt, indent=2), encoding="utf-8")
    return receipt


def render_static_clip(clip):
    plan = STATIC_PLAN[clip["name"]]
    clip_tmp = TMP_DIR / clip["name"]
    if clip_tmp.exists():
        shutil.rmtree(clip_tmp)
    clip_tmp.mkdir(parents=True, exist_ok=True)
    silent = clip_tmp / f"{clip['name']}_video_only.mp4"
    output = OUTPUT_DIR / f"{clip['name']}_from_zero_vertical_1min.mp4"
    render_static_video(clip, plan, silent)
    add_master_audio(silent, output, float(clip["timeline"]), float(clip["duration"]))
    spec = ffprobe_json(output)
    freeze = freeze_check(output)
    receipt = {
        **clip,
        "output": str(output),
        "plan": plan,
        "source": "static accepted-master-derived primary camera plan; raw camera vertical video + accepted full episode audio",
        "accepted_master": str(MASTER),
        "approved_style_clip": str(APPROVED_STYLE_CLIP),
        "spec": spec,
        "freeze": freeze,
        "passes_machine_checks": bool(
            freeze["ok"]
            and spec["streams"][0]["width"] == 1080
            and spec["streams"][0]["height"] == 1920
            and 59.7 <= float(spec["format"]["duration"]) <= 60.3
        ),
    }
    (OUTPUT_DIR / f"{clip['name']}_receipt.json").write_text(json.dumps(receipt, indent=2), encoding="utf-8")
    return receipt


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--render", action="store_true")
    parser.add_argument("--static-render", action="store_true")
    parser.add_argument("--clip-filter", default="")
    parser.add_argument("--sample-step", type=float, default=3.0)
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

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    create_round_masks()
    if args.static_render:
        receipts = [render_static_clip(clip) for clip in clips]
        manifest = {
            "output_dir": str(OUTPUT_DIR),
            "render_mode": "static_accepted_master_plan",
            "accepted_master": str(MASTER),
            "approved_style_clip": str(APPROVED_STYLE_CLIP),
            "rendered": receipts,
        }
        (OUTPUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        print(json.dumps({
            "output_dir": str(OUTPUT_DIR),
            "rendered": [Path(item["output"]).name for item in receipts],
            "failed_machine_checks": [
                Path(item["output"]).name for item in receipts if not item["passes_machine_checks"]
            ],
        }, indent=2))
        return

    matcher = MasterMatcher()
    try:
        analyses = [analyze_clip(clip, matcher, args.sample_step) for clip in clips]
        receipts = []
        if args.render:
            for analysis in analyses:
                receipt = render_clip(analysis, matcher)
                if receipt:
                    receipts.append(receipt)
    finally:
        matcher.close()

    manifest = {
        "output_dir": str(OUTPUT_DIR),
        "render_requested": bool(args.render),
        "accepted_master": str(MASTER),
        "approved_style_clip": str(APPROVED_STYLE_CLIP),
        "analyses": analyses,
        "rendered": receipts,
    }
    (OUTPUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps({
        "output_dir": str(OUTPUT_DIR),
        "renderable": [item["name"] for item in analyses if item["renderable"]],
        "blocked": [item["name"] for item in analyses if not item["renderable"]],
        "rendered": [Path(item["output"]).name for item in receipts],
    }, indent=2))


if __name__ == "__main__":
    main()
