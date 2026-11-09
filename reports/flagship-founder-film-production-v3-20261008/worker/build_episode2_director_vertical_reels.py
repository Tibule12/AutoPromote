#!/usr/bin/env python3
import json
import os
import re
import shutil
import subprocess
from pathlib import Path

import cv2
import numpy as np


HOST_CAM = Path("/home/tibule12/Videos/IMG_4533.MOV")
GUEST_CAM = Path("/home/tibule12/Videos/IMG_4185.MOV")
CLEAN_AUDIO = Path("/home/tibule12/Videos/UNMUTED WITH ATHI DONKILE.wav")
ACCEPTED_MASTER = Path(
    "/home/tibule12/Downloads/episode2-full-premium-render/reaction-fixed-first5/"
    "episode2_FULL_EPISODE2_REACTION_FIXED_SECTION_SYNC_MAP_V6_SIGNED_AUDIT_SECTION_SYNC.mp4"
)
ACCEPTED_MASTER_SYNC_SUMMARY = Path(
    "/home/tibule12/Downloads/episode2-full-premium-render/reaction-fixed-first5/"
    "episode2_FULL_EPISODE2_REACTION_FIXED_SECTION_SYNC_MAP_V6_SIGNED_AUDIT_SECTION_SYNC_SUMMARY.json"
)

FULL_SUMMARY = Path(
    "/home/tibule12/Downloads/episode2-full-premium-render/full-fixed-chunked/"
    "episode2-full-fixed-chunked-1781177844_summary.json"
)
FIRST5_SUMMARY = Path(
    "/home/tibule12/Downloads/episode2-full-premium-render/reaction-fixed-first5/"
    "episode2-reaction-fixed-first5-1781194979_summary.json"
)

OUT_DIR = Path("/home/tibule12/Downloads/episode2-master-matched-vertical-1min-10pack-v5")
TMP_DIR = OUT_DIR / "_segments"
TMP_AUDIO_DIR = OUT_DIR / "_audio"
SINGLE_MASK_PATH = OUT_DIR / "rounded_card_mask_1000x1776.png"
SHARED_MASK_PATH = OUT_DIR / "rounded_card_mask_980x760.png"

EXTERNAL_AUDIO_OFFSET_SECONDS = -5.606

CAMERAS = {
    "cam1": {
        "label": "host",
        "path": HOST_CAM,
        "face_crop": "crop=608:1080:1016:0,scale=1000:1776",
        "shared_crop": "crop=1392:1080:528:0,scale=980:760",
    },
    "cam2": {
        "label": "guest",
        "path": GUEST_CAM,
        "face_crop": "crop=608:1080:300:0,scale=1000:1776",
        "shared_crop": "crop=1392:1080:0:0,scale=980:760",
    },
}

SOURCE_OFFSETS = {
    "first5": {
        "cam1": 2.03,
        "cam2": 0.081,
    },
    "full": {
        "cam1": 1.8985,
        "cam2": 1.9755,
    },
}

CLIPS = [
    {
        "name": "01_guest_energy_01m32",
        "timeline": 92.0,
        "duration": 60.0,
        "title": "That Moment The Energy Changed",
        "description": "Athimna Donkile brings the kind of energy that makes you stay for the full conversation. From Unmuted Podcast Episode 2. #UnmutedPodcast #AthimnaDonkile #IkhonoYouthChoir #PodcastClips #Shorts",
    },
    {
        "name": "02_host_to_guest_02m12",
        "timeline": 132.0,
        "duration": 60.0,
        "title": "This Conversation Started Getting Real",
        "description": "A sharp one-minute podcast highlight from Unmuted Podcast Episode 2 with Athimna Donkile of Ikhono Youth Choir. #UnmutedPodcast #PodcastMoment #SouthAfricanPodcast #Reels",
    },
    {
        "name": "03_shared_laugh_03m58",
        "timeline": 238.0,
        "duration": 60.0,
        "title": "The Moment Both Sides Reacted",
        "description": "A shared reaction moment from Unmuted Podcast Episode 2 with Athimna Donkile of Ikhono Youth Choir. #UnmutedPodcast #AthimnaDonkile #PodcastClips #Shorts",
    },
    {
        "name": "04_host_punch_04m04",
        "timeline": 243.75,
        "duration": 60.0,
        "title": "He Said What Needed To Be Said",
        "description": "A clean one-minute podcast highlight with a strong point and real energy. Watch the full Unmuted Podcast Episode 2. #PodcastClips #UnmutedPodcast #Shorts",
    },
    {
        "name": "05_host_run_07m26",
        "timeline": 445.75,
        "duration": 60.0,
        "title": "This Part Has Serious Momentum",
        "description": "A one-minute moment built for viewers who love honest podcast conversations. Featuring Athimna Donkile on Unmuted Podcast. #Podcast #Reels #SouthAfricanCreators",
    },
    {
        "name": "06_director_switch_10m32",
        "timeline": 631.75,
        "duration": 60.0,
        "title": "This Point Needed To Land",
        "description": "A focused highlight from Unmuted Podcast Episode 2. Real talk, clean energy, and a reason to watch the full episode. #UnmutedPodcast #PodcastShorts #AthimnaDonkile",
    },
    {
        "name": "07_guest_answer_21m28",
        "timeline": 1287.84,
        "duration": 60.0,
        "title": "Athimna Said It Clearly",
        "description": "Athimna Donkile of Ikhono Youth Choir shares a clean, memorable moment from Unmuted Podcast Episode 2. #AthimnaDonkile #IkhonoYouthChoir #UnmutedPodcast",
    },
    {
        "name": "08_guest_to_host_26m27",
        "timeline": 1587.25,
        "duration": 60.0,
        "title": "This Is The Moment To Watch",
        "description": "A strong one-minute highlight from Episode 2. Real conversation, clean framing, and podcast energy. #UnmutedPodcast #PodcastMoment #Shorts",
    },
    {
        "name": "09_guest_peak_32m50",
        "timeline": 1970.09,
        "duration": 60.0,
        "title": "This Part Deserves The Full Episode",
        "description": "A late-episode highlight with Athimna Donkile that pulls you into the full conversation. #UnmutedPodcast #AthimnaDonkile #PodcastClips",
    },
    {
        "name": "10_shared_big_moment_35m58",
        "timeline": 2158.0,
        "duration": 60.0,
        "title": "This Shared Moment Hit Different",
        "description": "A clean shared moment from Unmuted Podcast Episode 2 with Athimna Donkile. Built for Shorts and Reels. #UnmutedPodcast #AthimnaDonkile #PodcastShorts",
    },
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


def chunk_start_from_window(item):
    window = str(item.get("window") or "")
    match = re.search(r"_(\d{4})s$", window)
    if match:
        return float(match.group(1))
    return float((item.get("worker_result") or {}).get("chunk_start") or 0.0)


def time_to_seconds(value):
    hh, mm, ss = [int(part) for part in str(value).split(":")]
    return float(hh * 3600 + mm * 60 + ss)


def load_audio_sync_map():
    data = json.loads(ACCEPTED_MASTER_SYNC_SUMMARY.read_text(encoding="utf-8"))
    sections = []
    for item in data.get("section_sync_map") or []:
        change = str(item["change"])
        amount_ms = float(re.search(r"(\d+)ms", change).group(1))
        # To make output audio later, read slightly earlier audio content and let it land later.
        input_adjust = -amount_ms / 1000.0 if "later" in change else amount_ms / 1000.0
        sections.append(
            {
                "start": time_to_seconds(item["start"]),
                "end": time_to_seconds(item["end"]),
                "change": change,
                "input_adjust_seconds": input_adjust,
            }
        )
    return sections


def audio_input_adjust_at(timeline_time, sync_sections):
    for section in sync_sections:
        if section["start"] <= timeline_time < section["end"]:
            return section["input_adjust_seconds"], section["change"]
    return 0.0, "base_clean_audio_offset"


def clean_audio_input_at(timeline_time, sync_sections):
    adjust, change = audio_input_adjust_at(timeline_time, sync_sections)
    return timeline_time - EXTERNAL_AUDIO_OFFSET_SECONDS + adjust, change


def audio_envelope(path, start, duration=6.0, sample_rate=16000):
    raw = subprocess.check_output(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-ss",
            f"{max(0.0, float(start)):.3f}",
            "-t",
            f"{duration:.3f}",
            "-i",
            str(path),
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
    )
    audio = np.frombuffer(raw, dtype=np.int16).astype(np.float32)
    frame = int(sample_rate * 0.02)
    if len(audio) < sample_rate or len(audio) <= frame:
        return None
    env = np.array([np.sqrt(np.mean(audio[i : i + frame] ** 2)) for i in range(0, len(audio) - frame, frame)])
    env = env - env.mean()
    norm = np.linalg.norm(env)
    if norm <= 0:
        return None
    return env / norm


def sync_probe_segment(camera_id, raw_start, timeline_start, sync_sections, probe_offset, duration=6.0):
    clean_start, sync_change = clean_audio_input_at(timeline_start + probe_offset, sync_sections)
    raw_env = audio_envelope(CAMERAS[camera_id]["path"], raw_start + probe_offset, duration)
    clean_env = audio_envelope(CLEAN_AUDIO, clean_start, duration)
    if raw_env is None or clean_env is None:
        return {"usable": False, "reason": "audio_too_short_or_flat", "sync_change": sync_change}

    n = min(len(raw_env), len(clean_env))
    raw_env = raw_env[:n]
    clean_env = clean_env[:n]
    corr = np.correlate(clean_env, raw_env, mode="full")
    center = len(raw_env) - 1
    max_lag_frames = int(0.7 / 0.02)
    lo = max(0, center - max_lag_frames)
    hi = min(len(corr), center + max_lag_frames + 1)
    best = int(np.argmax(corr[lo:hi]) + lo)
    lag_frames = best - center
    residual = lag_frames * 0.02
    confidence = float(corr[best])
    return {
        "usable": True,
        "camera_id": camera_id,
        "probe_offset": round(float(probe_offset), 3),
        "raw_probe_start": round(float(raw_start + probe_offset), 3),
        "clean_probe_start": round(float(clean_start), 3),
        "sync_change": sync_change,
        "residual_seconds": round(float(residual), 3),
        "abs_residual_seconds": round(abs(float(residual)), 3),
        "envelope_correlation": round(confidence, 4),
    }


def align_segment_source_start(segment, sync_sections):
    duration = float(segment.get("duration") or 0.0)
    if duration < 2.5:
        segment["source_sync_check"] = {"usable": False, "reason": "segment_too_short"}
        return segment

    probe_offsets = sorted(
        {
            round(min(max(1.0, duration * ratio), max(1.0, duration - 1.0)), 3)
            for ratio in (0.25, 0.5, 0.75)
        }
    )
    checks = [
        sync_probe_segment(
            segment["camera_id"],
            float(segment["render_source_start_abs"]),
            float(segment["clip_overlap_start"]),
            sync_sections,
            probe_offset,
        )
        for probe_offset in probe_offsets
    ]
    usable_checks = [item for item in checks if item.get("usable")]
    selected_check = max(usable_checks, key=lambda item: float(item.get("envelope_correlation") or 0.0)) if usable_checks else checks[0]
    check = dict(selected_check)
    check["candidate_probes"] = [dict(item) for item in checks]
    segment["source_sync_check"] = check
    confidence = float(check.get("envelope_correlation") or 0.0)
    trust_threshold = 0.30 if segment["camera_id"] == "cam2" else 0.35
    if check.get("usable") and confidence >= trust_threshold:
        residual = float(check.get("residual_seconds") or 0.0)
        if 0.08 <= abs(residual) <= 0.75:
            segment["render_source_start_abs"] = max(0.0, float(segment["render_source_start_abs"]) - residual)
            check["applied_source_start_adjustment_seconds"] = round(-residual, 3)
            check["adjusted_render_source_start_abs"] = round(float(segment["render_source_start_abs"]), 3)
            check["applied_reason"] = "raw_camera_to_clean_audio_probe"
    return segment


class FrameReader:
    def __init__(self, path):
        self.path = str(path)
        self.cap = cv2.VideoCapture(self.path)
        if not self.cap.isOpened():
            raise RuntimeError(f"Could not open video: {path}")

    def read(self, seconds):
        self.cap.set(cv2.CAP_PROP_POS_MSEC, max(0.0, float(seconds)) * 1000.0)
        ok, frame = self.cap.read()
        if not ok:
            raise RuntimeError(f"Could not read frame at {seconds:.3f}s from {self.path}")
        return frame

    def close(self):
        self.cap.release()


class MasterCameraMatcher:
    def __init__(self):
        self.master = FrameReader(ACCEPTED_MASTER)
        self.cameras = {camera_id: FrameReader(cfg["path"]) for camera_id, cfg in CAMERAS.items()}
        self.orb = cv2.ORB_create(1200)
        self.matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)

    def close(self):
        self.master.close()
        for reader in self.cameras.values():
            reader.close()

    def _orb_score(self, master_frame, camera_frame):
        master_small = cv2.resize(master_frame, (640, 360))
        camera_small = cv2.resize(camera_frame, (640, 360))
        master_gray = cv2.cvtColor(master_small, cv2.COLOR_BGR2GRAY)
        camera_gray = cv2.cvtColor(camera_small, cv2.COLOR_BGR2GRAY)
        kp1, des1 = self.orb.detectAndCompute(master_gray, None)
        kp2, des2 = self.orb.detectAndCompute(camera_gray, None)
        if des1 is None or des2 is None:
            return 0
        matches = self.matcher.match(des1, des2)
        return len([match for match in matches if match.distance < 55])

    def pick_camera(self, timeline_time):
        master_frame = self.master.read(timeline_time)
        scores = {}
        for camera_id in CAMERAS:
            camera_frame = self.cameras[camera_id].read(source_start_for_camera(camera_id, timeline_time))
            scores[camera_id] = self._orb_score(master_frame, camera_frame)
        sorted_scores = sorted(scores.items(), key=lambda item: item[1], reverse=True)
        winner, best_score = sorted_scores[0]
        runner_up_score = max(1, sorted_scores[1][1])
        return {
            "camera_id": winner,
            "scores": scores,
            "confidence": round(best_score / runner_up_score, 3),
        }


def build_master_matched_segments(clip, matcher):
    start = float(clip["timeline"])
    end = start + float(clip.get("duration") or 60.0)
    sample_step = 1.0
    samples = []
    current = start
    while current < end - 0.001:
        sample_time = min(end - 0.001, current + sample_step / 2)
        pick = matcher.pick_camera(sample_time)
        samples.append(
            {
                "start": current,
                "end": min(end, current + sample_step),
                "sample_time": sample_time,
                **pick,
            }
        )
        current += sample_step

    for idx, sample in enumerate(samples):
        if sample["confidence"] < 1.15:
            previous_id = samples[idx - 1]["camera_id"] if idx else None
            next_id = samples[idx + 1]["camera_id"] if idx + 1 < len(samples) else None
            if previous_id and previous_id == next_id:
                sample["camera_id"] = previous_id
                sample["smoothed_reason"] = "low_confidence_held_between_matching_neighbors"

    segments = []
    for sample in samples:
        if segments and segments[-1]["camera_id"] == sample["camera_id"]:
            segments[-1]["clip_overlap_end"] = sample["end"]
            segments[-1]["duration"] = segments[-1]["clip_overlap_end"] - segments[-1]["clip_overlap_start"]
            segments[-1]["samples"].append(sample)
            continue
        segments.append(
            {
                "camera_id": sample["camera_id"],
                "secondary_camera_id": None,
                "layout_mode": "master-matched-active-speaker",
                "clip_overlap_start": sample["start"],
                "clip_overlap_end": sample["end"],
                "duration": sample["end"] - sample["start"],
                "render_source_start_abs": source_start_for_camera(sample["camera_id"], sample["start"]),
                "samples": [sample],
            }
        )
    return [segment for segment in segments if segment["duration"] >= 0.08]


def single_filter(camera_id):
    cfg = CAMERAS[camera_id]
    return (
        "[0:v]split=2[base][fgsrc];"
        "[base]scale=270:480:force_original_aspect_ratio=increase,"
        "crop=270:480,gblur=sigma=14,scale=1080:1920,"
        "eq=contrast=1.03:saturation=1.08:brightness=0.01[bg];"
        f"[fgsrc]{cfg['face_crop']},"
        "eq=contrast=1.045:saturation=1.09:brightness=0.018,"
        "unsharp=5:5:0.55:3:3:0.25,format=rgba[fg];"
        "[1:v]format=gray,scale=1000:1776[mask];"
        "[fg][mask]alphamerge[fg];"
        "[bg][fg]overlay=40:72:format=auto,format=yuv420p[v]"
    )


def shared_filter(active_id, secondary_id):
    active = CAMERAS[active_id]
    secondary = CAMERAS[secondary_id]
    return (
        "[0:v]split=2[bgsrc][active_src];"
        "[bgsrc]scale=270:480:force_original_aspect_ratio=increase,"
        "crop=270:480,gblur=sigma=18,scale=1080:1920,"
        "eq=contrast=1.03:saturation=1.08:brightness=0.01[bg];"
        f"[active_src]{active['shared_crop']},"
        "eq=contrast=1.045:saturation=1.09:brightness=0.018,"
        "unsharp=5:5:0.45:3:3:0.18,format=rgba[activefg];"
        f"[1:v]{secondary['shared_crop']},"
        "eq=contrast=1.045:saturation=1.09:brightness=0.018,"
        "unsharp=5:5:0.45:3:3:0.18,format=rgba[secondaryfg];"
        "[2:v]format=gray,scale=980:760[mask1];"
        "[2:v]format=gray,scale=980:760[mask2];"
        "[activefg][mask1]alphamerge[activefg];"
        "[secondaryfg][mask2]alphamerge[secondaryfg];"
        "[bg][activefg]overlay=50:135:format=auto[tmp];"
        "[tmp][secondaryfg]overlay=50:1025:format=auto,format=yuv420p[v]"
    )


def render_video_segment(segment, segment_path):
    active_id = segment["camera_id"]
    secondary_id = segment.get("secondary_camera_id")
    use_shared = (
        secondary_id in CAMERAS
        and str(segment.get("layout_mode") or "").lower() in {"split-vertical", "split", "side-by-side"}
    )
    if use_shared:
        secondary_source_start = source_start_for_camera(
            secondary_id,
            segment["clip_overlap_start"],
        )
        source_inputs = [
            "-ss",
            f"{segment['render_source_start_abs']:.3f}",
            "-i",
            CAMERAS[active_id]["path"],
            "-ss",
            f"{secondary_source_start:.3f}",
            "-i",
            CAMERAS[secondary_id]["path"],
            "-loop",
            "1",
            "-i",
            SHARED_MASK_PATH,
        ]
        vf = shared_filter(active_id, secondary_id)
    else:
        source_inputs = [
            "-ss",
            f"{segment['render_source_start_abs']:.3f}",
            "-i",
            CAMERAS[active_id]["path"],
            "-loop",
            "1",
            "-i",
            SINGLE_MASK_PATH,
        ]
        vf = single_filter(active_id)
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-y",
        *source_inputs,
        "-t",
        f"{segment['duration']:.3f}",
        "-filter_complex",
        vf,
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
        str(segment_path),
    ]
    run(cmd)


def source_start_for_camera(camera_id, timeline_time):
    bucket = "first5" if float(timeline_time) < 300.0 else "full"
    return float(timeline_time) + float(SOURCE_OFFSETS[bucket][camera_id])


def concat_video_segments(segment_paths, video_path):
    concat_path = video_path.with_suffix(".concat.txt")
    concat_path.write_text("".join(f"file '{path}'\n" for path in segment_paths), encoding="utf-8")
    run(
        [
            "ffmpeg",
            "-hide_banner",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            concat_path,
            "-c",
            "copy",
            str(video_path),
        ]
    )
    concat_path.unlink(missing_ok=True)


def split_audio_ranges(timeline_start, duration, sync_sections):
    timeline_end = timeline_start + duration
    cuts = {timeline_start, timeline_end}
    for section in sync_sections:
        if timeline_start < section["start"] < timeline_end:
            cuts.add(section["start"])
        if timeline_start < section["end"] < timeline_end:
            cuts.add(section["end"])
    ordered = sorted(cuts)
    ranges = []
    for start, end in zip(ordered, ordered[1:]):
        if end - start < 0.01:
            continue
        adjust, change = audio_input_adjust_at((start + end) / 2, sync_sections)
        ranges.append(
            {
                "timeline_start": start,
                "timeline_end": end,
                "duration": end - start,
                "audio_input_start": start - EXTERNAL_AUDIO_OFFSET_SECONDS + adjust,
                "sync_change": change,
            }
        )
    return ranges


def build_section_synced_audio(clip_name, timeline_start, duration, sync_sections):
    audio_tmp = TMP_AUDIO_DIR / clip_name
    if audio_tmp.exists():
        shutil.rmtree(audio_tmp)
    audio_tmp.mkdir(parents=True, exist_ok=True)
    ranges = split_audio_ranges(timeline_start, duration, sync_sections)
    audio_segments = []
    for idx, item in enumerate(ranges):
        segment_path = audio_tmp / f"{idx:03d}.wav"
        run(
            [
                "ffmpeg",
                "-hide_banner",
                "-y",
                "-ss",
                f"{item['audio_input_start']:.3f}",
                "-t",
                f"{item['duration']:.3f}",
                "-i",
                CLEAN_AUDIO,
                "-vn",
                "-ac",
                "2",
                "-ar",
                "48000",
                "-c:a",
                "pcm_s16le",
                segment_path,
            ]
        )
        audio_segments.append(segment_path)
    concat_path = audio_tmp / "audio.concat.txt"
    concat_path.write_text("".join(f"file '{path}'\n" for path in audio_segments), encoding="utf-8")
    output_audio = audio_tmp / f"{clip_name}_section_synced.wav"
    run(
        [
            "ffmpeg",
            "-hide_banner",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            concat_path,
            "-c",
            "copy",
            output_audio,
        ]
    )
    return output_audio, ranges


def add_clean_audio(video_path, output_path, timeline_start, duration, clip_name, sync_sections):
    audio_path, audio_ranges = build_section_synced_audio(clip_name, timeline_start, duration, sync_sections)
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
            "aac",
            "-b:a",
            "192k",
            "-ar",
            "48000",
            "-shortest",
            "-movflags",
            "+faststart",
            output_path,
        ]
    )
    return audio_ranges


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
            path,
        ],
        capture=True,
    )
    return json.loads(raw)["streams"][0]


def contact_sheet(outputs):
    sheet = OUT_DIR / "episode2_master_matched_vertical_1min_10pack_v5_contact.jpg"
    inputs = []
    thumbs = []
    for idx, path in enumerate(outputs):
        thumb = OUT_DIR / f"thumb_{idx + 1:02d}.jpg"
        run(["ffmpeg", "-hide_banner", "-y", "-ss", "4", "-i", path, "-frames:v", "1", "-update", "1", thumb])
        inputs.extend(["-i", thumb])
        thumbs.append(thumb)
    run(
        [
            "ffmpeg",
            "-hide_banner",
            "-y",
            *inputs,
            "-filter_complex",
            "tile=5x2:padding=16:margin=16",
            "-frames:v",
            "1",
            "-update",
            "1",
            sheet,
        ]
    )
    for thumb in thumbs:
        thumb.unlink(missing_ok=True)
    return sheet


def render_clip(clip, matcher, sync_sections):
    timeline_start = float(clip["timeline"])
    duration = float(clip.get("duration") or 60.0)
    timeline_end = timeline_start + duration
    segments = build_master_matched_segments(clip, matcher)
    segments = [align_segment_source_start(segment, sync_sections) for segment in segments]
    if not segments:
        raise RuntimeError(f"No master-matched segments for {clip['name']}")
    clip_tmp = TMP_DIR / clip["name"]
    if clip_tmp.exists():
        shutil.rmtree(clip_tmp)
    clip_tmp.mkdir(parents=True, exist_ok=True)
    rendered_segments = []
    segment_receipts = []
    for idx, segment in enumerate(segments):
        seg_path = clip_tmp / f"{idx:03d}_{segment['camera_id']}.mp4"
        render_video_segment(segment, seg_path)
        rendered_segments.append(seg_path)
        segment_receipts.append(
            {
                "camera_id": segment.get("camera_id"),
                "secondary_camera_id": segment.get("secondary_camera_id"),
                "layout_mode": segment.get("layout_mode"),
                "abs_start": round(segment["clip_overlap_start"], 3),
                "abs_end": round(segment["clip_overlap_end"], 3),
                "duration": round(segment["duration"], 3),
                "source_start_abs": round(segment["render_source_start_abs"], 3),
                "source_sync_check": segment.get("source_sync_check"),
                "match_samples": [
                    {
                        "sample_time": round(sample["sample_time"], 3),
                        "camera_id": sample["camera_id"],
                        "confidence": sample["confidence"],
                        "scores": sample["scores"],
                        "smoothed_reason": sample.get("smoothed_reason"),
                    }
                    for sample in segment.get("samples") or []
                ],
            }
        )
    silent_video = clip_tmp / f"{clip['name']}_video_only.mp4"
    concat_video_segments(rendered_segments, silent_video)
    output_path = OUT_DIR / f"{clip['name']}_master_matched_vertical_1min.mp4"
    audio_ranges = add_clean_audio(silent_video, output_path, timeline_start, duration, clip["name"], sync_sections)
    freeze = freeze_check(output_path)
    spec = ffprobe_spec(output_path)
    weak_samples = [
        sample
        for segment in segment_receipts
        for sample in segment["match_samples"]
        if sample["confidence"] < 1.15
    ]
    passes = (
        freeze["ok"]
        and int(spec["width"]) == 1080
        and int(spec["height"]) == 1920
        and len(weak_samples) == 0
    )
    receipt = {
        **clip,
        "output": str(output_path),
        "source": "raw cams + clean external audio + accepted-master visual camera matching",
        "timeline_end": round(timeline_end, 3),
        "audio_sync_source": str(ACCEPTED_MASTER_SYNC_SUMMARY),
        "audio_ranges": [
            {
                **item,
                "timeline_start": round(item["timeline_start"], 3),
                "timeline_end": round(item["timeline_end"], 3),
                "duration": round(item["duration"], 3),
                "audio_input_start": round(item["audio_input_start"], 3),
            }
            for item in audio_ranges
        ],
        "segments": segment_receipts,
        "active_camera_sequence": [item["camera_id"] for item in segment_receipts],
        "weak_master_match_samples": weak_samples,
        "freeze": freeze,
        "spec": spec,
        "passes": bool(passes),
    }
    (OUT_DIR / f"{clip['name']}_receipt.json").write_text(json.dumps(receipt, indent=2), encoding="utf-8")
    return output_path, receipt


def main():
    if OUT_DIR.exists():
        shutil.rmtree(OUT_DIR)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    TMP_AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    create_round_mask()
    sync_sections = load_audio_sync_map()
    matcher = MasterCameraMatcher()
    outputs = []
    receipts = []
    clip_filter = {
        item.strip()
        for item in str(os.environ.get("CLIP_FILTER") or "").split(",")
        if item.strip()
    }
    try:
        for clip in CLIPS:
            clip_number = clip["name"].split("_", 1)[0]
            if clip_filter and clip["name"] not in clip_filter and clip_number not in clip_filter:
                continue
            print(f"Rendering {clip['name']} from accepted-master camera match...")
            output, receipt = render_clip(clip, matcher, sync_sections)
            outputs.append(output)
            receipts.append(receipt)
            if not receipt["passes"]:
                print(f"Rejected {clip['name']}: {json.dumps(receipt, indent=2)}")
    finally:
        matcher.close()
    sheet = contact_sheet(outputs)
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
        "accepted_master": str(ACCEPTED_MASTER),
        "method": "camera sequence derived by ORB image matching against accepted full master; each raw camera segment source start is lip-sync probed against clean external audio before rendering; audio rebuilt from clean external WAV using V6 section sync map",
        "accepted_count": sum(1 for item in receipts if item["passes"]),
        "rejected_count": sum(1 for item in receipts if not item["passes"]),
        "contact_sheet": str(sheet),
        "clips": receipts,
    }
    (OUT_DIR / "episode2_master_matched_vertical_1min_10pack_v5_manifest.json").write_text(
        json.dumps(manifest, indent=2),
        encoding="utf-8",
    )
    if manifest["rejected_count"]:
        raise SystemExit(2)
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
