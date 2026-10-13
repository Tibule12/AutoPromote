#!/usr/bin/env python3
"""
Local Cam Combiner render tester.

This script intentionally calls the production worker render path instead of
building a separate FFmpeg flow. Use it to validate offsets, layout composition,
and long-duration drift before spending time on a full frontend render.
"""

import argparse
import asyncio
import hashlib
import json
import logging
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path


os.environ.setdefault("MULTICAM_UPLOAD_FIREBASE", "false")
# Local proof renders should fail like production when the clean-audio
# director cannot prove speaker/channel ownership. Otherwise we generate
# misleading videos where fallback guesses look like product behavior.
os.environ.setdefault("MULTICAM_ALLOW_UNPROVEN_DIRECTOR_AUDIO", "false")

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
TMP_ROOT = REPO_ROOT / "tmp"

if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

import python_media_worker.main_media_server as worker  # noqa: E402


CAMERA_IDS = {
    "1": "cam1",
    "cam1": "cam1",
    "camera1": "cam1",
    "camera 1": "cam1",
    "2": "cam2",
    "cam2": "cam2",
    "camera2": "cam2",
    "camera 2": "cam2",
}


def parse_args():
    parser = argparse.ArgumentParser(
        description="Render local Cam Combiner test windows through the production Python worker."
    )
    parser.add_argument("--camera1", required=True, help="Local path for Camera 1")
    parser.add_argument("--camera2", required=True, help="Local path for Camera 2")
    parser.add_argument("--external-audio", default="", help="Optional local path for external clean audio")
    parser.add_argument("--camera1-offset", type=float, default=0.0, help="Manual offset seconds for Camera 1")
    parser.add_argument("--camera2-offset", type=float, default=0.0, help="Manual offset seconds for Camera 2")
    parser.add_argument("--camera1-sync-rate", type=float, default=1.0, help="Camera 1 source sync rate correction")
    parser.add_argument("--camera2-sync-rate", type=float, default=1.0, help="Camera 2 source sync rate correction")
    parser.add_argument("--camera1-rotate", type=float, default=0.0, help="Clockwise rotation degrees for Camera 1 (0/90/180/270)")
    parser.add_argument("--camera2-rotate", type=float, default=0.0, help="Clockwise rotation degrees for Camera 2 (0/90/180/270)")
    parser.add_argument("--external-audio-offset", type=float, default=0.0, help="External audio offset seconds")
    parser.add_argument("--aspect", default="9:16", choices=["9:16", "16:9", "1:1"], help="Output aspect ratio")
    parser.add_argument(
        "--render-tier",
        default="premium",
        choices=["simple", "premium", "studio"],
        help="Render tier to send to the worker for beta limits, receipts, and pricing validation.",
    )
    parser.add_argument("--start", type=float, default=0.0, help="Timeline start seconds for a single test window")
    parser.add_argument("--duration", type=float, default=90.0, help="Duration seconds for a single test window")
    parser.add_argument("--output-dir", default=str(TMP_ROOT / "local-multicam-render-tests"))
    parser.add_argument("--job-prefix", default="local-multicam")
    parser.add_argument(
        "--all-windows",
        action="store_true",
        help="Render short, mid, and late validation windows.",
    )
    parser.add_argument(
        "--window",
        action="append",
        default=[],
        help="Extra window as name:start:duration, for example mid:1200:180",
    )
    parser.add_argument(
        "--qa-proof",
        action="store_true",
        help=(
            "Render a proof pack before a full podcast render: start, middle, late, "
            "and final windows with sync grading and thumbnails."
        ),
    )
    parser.add_argument(
        "--timeline-duration",
        type=float,
        default=0.0,
        help="Override detected timeline duration seconds for QA window placement.",
    )
    parser.add_argument(
        "--qa-window-duration",
        type=float,
        default=30.0,
        help="Duration seconds for start/mid/late QA proof windows.",
    )
    parser.add_argument(
        "--qa-final-window-duration",
        type=float,
        default=120.0,
        help="Duration seconds for the final QA drift window.",
    )
    parser.add_argument(
        "--qa-good-sync-seconds",
        type=float,
        default=0.15,
        help="Max post-render sync residual considered safe.",
    )
    parser.add_argument(
        "--qa-block-sync-seconds",
        type=float,
        default=0.35,
        help="Post-render sync residual at or above this value blocks the proof.",
    )
    parser.add_argument(
        "--qa-min-usable-post-render-samples",
        type=int,
        default=1,
        help="Minimum usable post-render sync samples required before a QA window can be marked safe.",
    )
    parser.add_argument(
        "--no-thumbnails",
        action="store_true",
        help="Do not capture proof thumbnails from rendered QA clips.",
    )
    parser.add_argument(
        "--no-qa-auto-offset-candidates",
        action="store_true",
        help="Disable the automatic one-shot QA retry using preflight-suggested camera offsets.",
    )
    parser.add_argument(
        "--qa-auto-sync-rate",
        action="store_true",
        help="Also apply preflight-suggested sync-rate corrections during the QA offset candidate retry.",
    )
    parser.add_argument(
        "--plan-json",
        default="",
        help=(
            "Optional edit plan JSON string or file path. Items need camera_id, "
            "layout_mode, timeline_start, timeline_end relative to each window."
        ),
    )
    parser.add_argument("--dry-run", action="store_true", help="Print plan only; do not render")
    parser.add_argument(
        "--director-plan-only",
        action="store_true",
        help="Run the production auto-director and layout contract, then return the segment receipt before rendering.",
    )
    parser.add_argument(
        "--auto-switch",
        action="store_true",
        help="Let the production backend choose camera cuts from per-camera audio/visual scores instead of using a fixed test plan.",
    )
    parser.add_argument("--auto-switch-interval", type=float, default=2.0, help="Backend auto-switch scoring interval seconds")
    parser.add_argument(
        "--auto-switch-aggressiveness",
        default="balanced",
        choices=["steady", "balanced", "dynamic"],
        help="Backend auto-switch aggressiveness for --auto-switch tests",
    )
    parser.add_argument(
        "--director-channel-camera-map",
        default="",
        help="Comma-separated camera ids for external clean-audio channels, for example cam2,cam1.",
    )
    parser.add_argument(
        "--primary-audio-camera-id",
        default="cam1",
        choices=["cam1", "cam2"],
        help="Camera id to use as the default primary speaker when clean-channel switching has no active run.",
    )
    parser.add_argument(
        "--clean-channel-min-run-seconds",
        type=float,
        default=None,
        help="Minimum clean-channel active-speaker run length before the director cuts to that camera.",
    )
    parser.add_argument(
        "--trusted-sync-contract-json",
        default="",
        help="Trusted sync contract JSON string or file path to pass through the worker.",
    )
    parser.add_argument(
        "--trusted-director-channel-map-json",
        default="",
        help="Trusted director channel-map JSON string or file path to pass through the worker.",
    )
    parser.add_argument(
        "--camera1-reaction-side",
        default="auto",
        choices=["auto", "left", "right"],
        help="Force the reaction PiP side when camera 1 is primary.",
    )
    parser.add_argument(
        "--camera2-reaction-side",
        default="auto",
        choices=["auto", "left", "right"],
        help="Force the reaction PiP side when camera 2 is primary.",
    )
    parser.add_argument(
        "--reaction-overlays",
        action="store_true",
        help="Enable the same optional reaction PiP overlay flag used by production exports.",
    )
    parser.add_argument(
        "--no-burn-captions",
        action="store_true",
        help="Disable burned captions for fast local layout proofs.",
    )
    parser.add_argument(
        "--skip-audio",
        action="store_true",
        help="Ignore external audio even if provided, useful for fast layout-only tests.",
    )
    parser.add_argument(
        "--skip-presync-clap",
        action="store_true",
        help="Disable worker clap pre-sync alignment before rendering.",
    )
    parser.add_argument(
        "--qa-presync-clap",
        action="store_true",
        help=(
            "Allow full pre-sync clap alignment during --qa-proof. Off by default because it creates "
            "full-length aligned media and is too slow for quick proof windows."
        ),
    )
    parser.add_argument(
        "--use-cfr-cache",
        action="store_true",
        default=True,
        help=(
            "Use the production CFR/downscaled mezzanine cache for local camera sources. "
            "Enabled by default so proof renders exercise the faster repeat-render path."
        ),
    )
    parser.add_argument(
        "--direct-local-source",
        dest="use_cfr_cache",
        action="store_false",
        help="Bypass the CFR cache and read original local MP4/MOV files directly.",
    )
    parser.add_argument(
        "--no-stable-input-cache",
        action="store_true",
        help="Stage inputs inside the per-run folder instead of a stable tmp cache. Mostly useful for debugging staging itself.",
    )
    return parser.parse_args()


def safe_name(value):
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", str(value or "").strip())
    return cleaned.strip("_") or "input"


def resolve_path(path_text):
    raw = Path(path_text).expanduser()
    if raw.is_absolute():
        return raw.resolve()
    return (Path.cwd() / raw).resolve()


def local_input_cache_path(source, label):
    fingerprint = f"{source}:{source.stat().st_size}:{source.stat().st_mtime_ns}"
    digest = hashlib.sha256(fingerprint.encode("utf-8")).hexdigest()[:24]
    suffix = source.suffix or ".bin"
    cache_dir = TMP_ROOT / "local-multicam-input-cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir / f"{safe_name(label)}_{digest}{suffix}"


def local_input_cache_key(path_text, label):
    source = resolve_path(path_text)
    fingerprint = f"{source}:{source.stat().st_size}:{source.stat().st_mtime_ns}"
    return f"local:{safe_name(label)}:{hashlib.sha256(fingerprint.encode('utf-8')).hexdigest()[:24]}"


def link_or_copy_local_input(source, destination):
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists() and destination.stat().st_size == source.stat().st_size:
        return destination
    if destination.exists():
        destination.unlink()
    try:
        os.link(source, destination)
    except OSError:
        shutil.copy2(source, destination)
    return destination


def stage_local_file(path_text, run_dir, label, stable_input_cache=True):
    raw = Path(path_text).expanduser()
    raw_absolute = raw if raw.is_absolute() else (Path.cwd() / raw)
    raw_absolute = raw_absolute.absolute()
    if raw_absolute.exists():
        try:
            raw_absolute.relative_to(TMP_ROOT.absolute())
            return str(raw_absolute)
        except ValueError:
            pass

    source = resolve_path(path_text)
    if not source.exists():
        raise FileNotFoundError(f"{label} not found: {source}")

    try:
        source.relative_to(TMP_ROOT.resolve())
        return str(source)
    except ValueError:
        if stable_input_cache:
            destination = local_input_cache_path(source, label)
        else:
            inputs_dir = run_dir / "inputs"
            suffix = source.suffix or ".bin"
            destination = inputs_dir / f"{safe_name(label)}_{safe_name(source.stem)}{suffix}"
        link_or_copy_local_input(source, destination)
        return str(destination.resolve())


def normalize_camera_id(value):
    key = str(value or "").strip().lower()
    return CAMERA_IDS.get(key, key or "cam1")


def normalize_layout(value):
    return worker.normalize_multicam_layout_mode(value or "cut")


def load_plan(plan_json, duration):
    if not plan_json:
        return default_plan(duration)

    plan_source = plan_json.strip()
    if plan_source.startswith(("[", "{")):
        data = json.loads(plan_source)
    else:
        maybe_path = Path(plan_source).expanduser()
        if maybe_path.exists():
            data = json.loads(maybe_path.read_text(encoding="utf-8"))
        else:
            data = json.loads(plan_source)

    if isinstance(data, dict):
        data = data.get("segments") or data.get("plan") or []
    if not isinstance(data, list) or not data:
        raise ValueError("plan-json must contain a non-empty segment list")

    return [
        {
            "camera_id": normalize_camera_id(item.get("camera_id") or item.get("cameraId") or "cam1"),
            "layout_mode": normalize_layout(item.get("layout_mode") or item.get("layoutMode") or "cut"),
            "timeline_start": float(item.get("timeline_start") if item.get("timeline_start") is not None else item.get("start", 0)),
            "timeline_end": float(item.get("timeline_end") if item.get("timeline_end") is not None else item.get("end", duration)),
        }
        for item in data
    ]


def default_plan(duration):
    safe_duration = max(3.0, float(duration or 90.0))
    if safe_duration >= 18.0:
        layout_sequence = [
            ("cam1", "cut"),
            ("cam1", "reaction"),
            ("cam1", "show-everyone"),
            ("cam2", "shared-moment"),
            ("cam1", "scene-grid"),
            ("cam2", "split-vertical"),
            ("cam2", "cut"),
        ]
        slot_duration = max(3.0, min(4.0, safe_duration / len(layout_sequence)))
        points = []
        cursor = 0.0
        for camera_id, layout_mode in layout_sequence:
            end = min(safe_duration, cursor + slot_duration)
            points.append((cursor, end, camera_id, layout_mode))
            cursor = end
            if cursor >= safe_duration - 0.02:
                break
        return [
            {
                "camera_id": camera_id,
                "layout_mode": layout_mode,
                "timeline_start": round(start, 3),
                "timeline_end": round(end, 3),
            }
            for start, end, camera_id, layout_mode in points
            if end > start + 0.02
        ]

    points = [
        (0.0, 0.2, "cam1", "cut"),
        (0.2, 0.4, "cam1", "pip"),
        (0.4, 0.6, "cam1", "scene-grid"),
        (0.6, 0.8, "cam2", "split-vertical"),
        (0.8, 1.0, "cam2", "cut"),
    ]
    return [
        {
            "camera_id": camera_id,
            "layout_mode": layout_mode,
            "timeline_start": round(safe_duration * start_ratio, 3),
            "timeline_end": round(safe_duration * end_ratio, 3),
        }
        for start_ratio, end_ratio, camera_id, layout_mode in points
    ]


def infer_timeline_duration(paths):
    durations = []
    labels = []
    for label, key in [("external_audio", "audio"), ("camera1", "cam1"), ("camera2", "cam2")]:
        path = paths.get(key)
        if not path:
            continue
        duration = media_duration(path)
        if duration > 0.1:
            durations.append(duration)
            labels.append({"label": label, "path": path, "duration": round(duration, 3)})
    if not durations:
        return 0.0, labels
    return min(durations), labels


def dedupe_windows(windows):
    deduped = []
    seen = set()
    for name, start, duration in windows:
        key = (round(float(start), 1), round(float(duration), 1))
        if key in seen:
            continue
        seen.add(key)
        deduped.append((name, start, duration))
    return deduped


def build_qa_windows(args, timeline_duration):
    total = float(args.timeline_duration or timeline_duration or 0.0)
    if total <= 1.0:
        raise ValueError("QA proof needs a readable timeline duration. Pass --timeline-duration if probing fails.")
    normal_duration = max(5.0, float(args.qa_window_duration or 30.0))
    final_duration = max(10.0, float(args.qa_final_window_duration or 120.0))
    normal_duration = min(normal_duration, total)
    final_duration = min(final_duration, total)
    windows = [
        ("qa_start", 0.0, normal_duration),
        ("qa_mid", max(0.0, (total - normal_duration) / 2.0), normal_duration),
        ("qa_late", max(0.0, (total * 0.78) - (normal_duration / 2.0)), normal_duration),
        ("qa_final", max(0.0, total - final_duration), final_duration),
    ]
    return dedupe_windows(
        [
            (name, min(max(0.0, start), max(0.0, total - duration)), duration)
            for name, start, duration in windows
        ]
    )


def build_windows(args, timeline_duration=0.0):
    windows = []
    if args.qa_proof:
        windows.extend(build_qa_windows(args, timeline_duration))
    elif args.all_windows:
        windows.extend(
            [
                ("short", 0.0, max(60.0, min(120.0, args.duration))),
                ("mid", 20.0 * 60.0, 180.0),
                ("late", 35.0 * 60.0, 180.0),
            ]
        )
    elif not args.window:
        windows.append(("single", args.start, args.duration))

    for raw in args.window:
        parts = raw.split(":")
        if len(parts) != 3:
            raise ValueError(f"Invalid --window value {raw!r}; expected name:start:duration")
        windows.append((safe_name(parts[0]), float(parts[1]), float(parts[2])))

    return [(name, max(0.0, float(start)), max(1.0, float(duration))) for name, start, duration in windows]


def source_start_for(camera_id, timeline_absolute, offsets, sync_rates):
    return max(0.0, (float(timeline_absolute) - float(offsets[camera_id])) * float(sync_rates[camera_id]))


def probe_media(path):
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration:stream=index,codec_type,codec_name,duration",
            "-of",
            "json",
            str(path),
        ],
        check=True,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return json.loads(result.stdout or "{}")


def media_duration(path):
    try:
        return float((probe_media(path).get("format") or {}).get("duration") or 0.0)
    except Exception:
        return 0.0


def media_has_audio(path):
    try:
        return any(stream.get("codec_type") == "audio" for stream in probe_media(path).get("streams", []))
    except Exception:
        return False


def audio_stream_summary(path):
    try:
        streams = [
            stream
            for stream in probe_media(path).get("streams", [])
            if stream.get("codec_type") == "audio"
        ]
        return [
            {
                "index": stream.get("index"),
                "codec": stream.get("codec_name"),
                "duration": round(float(stream.get("duration") or 0.0), 3),
            }
            for stream in streams
        ]
    except Exception as exc:
        return [{"error": str(exc)}]


def capture_thumbnail(video_path, output_dir, run_id, window_name):
    duration = media_duration(video_path)
    seek_time = max(0.0, min(duration * 0.5, max(0.0, duration - 0.2)))
    thumbnail_path = output_dir / f"{run_id}_{safe_name(window_name)}_thumbnail.jpg"
    try:
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-ss",
                f"{seek_time:.3f}",
                "-i",
                str(video_path),
                "-frames:v",
                "1",
                "-q:v",
                "3",
                str(thumbnail_path),
            ],
            check=True,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        return str(thumbnail_path)
    except Exception as exc:
        return {"error": str(exc), "path": str(thumbnail_path)}


def find_post_render_sync_audit(worker_result):
    if not isinstance(worker_result, dict):
        return None
    receipt = worker_result.get("render_receipt") or {}
    if isinstance(receipt, dict) and receipt.get("post_render_sync_audit"):
        return receipt.get("post_render_sync_audit")
    return worker_result.get("post_render_sync_audit")


def summarize_preflight(preflight):
    cameras = (preflight or {}).get("cameras") or {}
    summary = []
    for camera_id, info in cameras.items():
        summary.append(
            {
                "camera": camera_id,
                "confidence": info.get("confidence"),
                "max_residual_offset_seconds": info.get("max_residual_offset_seconds"),
                "drift_seconds": info.get("drift_seconds"),
                "suggested_offset_seconds": info.get("suggested_offset_seconds"),
                "suggested_sync_rate": info.get("suggested_sync_rate"),
                "avg_correlation": info.get("avg_correlation"),
            }
        )
    return summary


def summarize_render_error(exc):
    detail = getattr(exc, "detail", None)
    if isinstance(detail, dict):
        preflight = detail.get("preflight")
        if isinstance(preflight, dict):
            return {
                "message": detail.get("message") or "Sync preflight failed",
                "preflight_status": preflight.get("status"),
                "preflight_summary": summarize_preflight(preflight),
            }
        return {"message": detail.get("message") or str(exc)}
    return {"message": str(exc)}


def camera_key_from_preflight_id(camera_id):
    match = re.search(r"(\d+)$", str(camera_id or ""))
    if not match:
        return None
    index = int(match.group(1))
    return "cam1" if index == 0 else "cam2" if index == 1 else None


def extract_offset_candidate_from_results(results, apply_sync_rate=False):
    for result in results or []:
        summary = (result.get("render_error_summary") or {}).get("preflight_summary") or []
        if not summary:
            detail = result.get("error_detail") or {}
            summary = summarize_preflight((detail.get("preflight") or {}))
        offsets = {}
        sync_rates = {}
        for item in summary:
            camera_key = camera_key_from_preflight_id(item.get("camera"))
            if not camera_key:
                continue
            suggested_offset = item.get("suggested_offset_seconds")
            if suggested_offset is not None:
                offsets[camera_key] = float(suggested_offset)
            suggested_sync_rate = item.get("suggested_sync_rate")
            if apply_sync_rate and suggested_sync_rate is not None:
                sync_rates[camera_key] = float(suggested_sync_rate)
        if offsets:
            return {
                "offsets": offsets,
                "sync_rates": sync_rates,
                "source_preflight_summary": summary,
            }
    return None


def grade_window_result(result, good_threshold, block_threshold, min_usable_samples=1):
    if result.get("dry_run"):
        return {"status": "SKIPPED", "reason": "dry run"}
    if result.get("superseded_by_attempt"):
        return {
            "status": "SUPERSEDED",
            "reason": f"Superseded by {result.get('superseded_by_attempt')}",
        }
    if result.get("render_error"):
        return {
            "status": "BLOCKED",
            "reason": result.get("render_error_summary", {}).get("message") or result.get("render_error"),
            "preflight_status": result.get("render_error_summary", {}).get("preflight_status"),
            "preflight_summary": result.get("render_error_summary", {}).get("preflight_summary"),
            "error_detail": result.get("error_detail"),
        }
    if not result.get("has_audio"):
        return {"status": "BLOCKED", "reason": "output has no audio stream"}

    audit = find_post_render_sync_audit(result.get("worker_result") or {})
    if not audit:
        return {"status": "BLOCKED", "reason": "missing post-render sync audit"}

    audit_status = str(audit.get("status") or "missing")
    max_residual = audit.get("max_abs_residual_seconds")
    usable_samples = int(audit.get("usable_sample_count") or 0)
    worker_result = result.get("worker_result") or {}
    preflight = worker_result.get("sync_preflight") or {}
    preflight_cameras = preflight.get("cameras") or {}
    preflight_good = (
        str(preflight.get("status") or "").lower() == "good"
        and bool(preflight_cameras)
        and all(
            str(camera.get("confidence") or "").lower() == "good"
            and float(camera.get("max_residual_offset_seconds") or 999.0) <= float(good_threshold)
            for camera in preflight_cameras.values()
        )
    )
    if audit_status == "unsafe":
        return {
            "status": "BLOCKED",
            "reason": audit.get("message") or "post-render sync audit unsafe",
            "audit_status": audit_status,
            "max_abs_residual_seconds": max_residual,
            "usable_sample_count": usable_samples,
        }
    if usable_samples < int(min_usable_samples or 1):
        return {
            "status": "BLOCKED",
            "reason": f"only {usable_samples} usable post-render sync samples; need at least {int(min_usable_samples or 1)}",
            "audit_status": audit_status,
            "max_abs_residual_seconds": max_residual,
            "usable_sample_count": usable_samples,
            "preflight_status": preflight.get("status"),
            "preflight_good": preflight_good,
        }
    if max_residual is None:
        return {
            "status": "RISKY",
            "reason": "sync residual missing",
            "audit_status": audit_status,
            "usable_sample_count": usable_samples,
        }
    residual = abs(float(max_residual))
    if residual >= float(block_threshold):
        return {
            "status": "BLOCKED",
            "reason": f"sync residual {residual:.3f}s is above block threshold",
            "audit_status": audit_status,
            "max_abs_residual_seconds": round(residual, 3),
            "usable_sample_count": usable_samples,
        }
    if audit_status != "good" or residual > float(good_threshold):
        return {
            "status": "RISKY",
            "reason": f"sync residual {residual:.3f}s needs visual review",
            "audit_status": audit_status,
            "max_abs_residual_seconds": round(residual, 3),
            "usable_sample_count": usable_samples,
        }
    return {
        "status": "SAFE",
        "reason": "post-render sync audit passed",
        "audit_status": audit_status,
        "max_abs_residual_seconds": round(residual, 3),
        "usable_sample_count": usable_samples,
    }


def qa_receipt_timeline_duration(args, duration_probe):
    if args.timeline_duration and args.timeline_duration > 0:
        return float(args.timeline_duration)
    durations = [
        float(item.get("duration") or 0.0)
        for item in (duration_probe or [])
        if isinstance(item, dict) and float(item.get("duration") or 0.0) > 0.1
    ]
    if durations:
        return min(durations)
    return max(float(args.duration or 0.0), 1.0)


def load_optional_json_arg(value):
    raw = str(value or "").strip()
    if not raw:
        return None
    if raw.startswith("{") or raw.startswith("["):
        return json.loads(raw)
    path = Path(raw)
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return json.loads(raw)


def build_qa_receipt_request(args, proof_duration):
    return worker.RenderMultiCamRequest(
        sources=[
            worker.MultiCamSource(
                id="cam1",
                url=str(args.camera1),
                label="Camera 1",
                offset_seconds=args.camera1_offset,
                sync_rate=args.camera1_sync_rate,
                rotation_degrees=args.camera1_rotate,
                cache_key=local_input_cache_key(args.camera1, "camera1"),
            ),
            worker.MultiCamSource(
                id="cam2",
                url=str(args.camera2),
                label="Camera 2",
                offset_seconds=args.camera2_offset,
                sync_rate=args.camera2_sync_rate,
                reaction_side=None if args.camera2_reaction_side == "auto" else args.camera2_reaction_side,
                rotation_degrees=args.camera2_rotate,
                cache_key=local_input_cache_key(args.camera2, "camera2"),
            ),
        ],
        auto_switch=bool(args.auto_switch),
        audio_based_auto_switch=True,
        auto_switch_interval=args.auto_switch_interval,
        auto_switch_aggressiveness=args.auto_switch_aggressiveness,
        primary_audio_camera_id=args.primary_audio_camera_id,
        director_channel_camera_ids=[
            item.strip()
            for item in str(args.director_channel_camera_map or "").split(",")
            if item.strip()
        ] or None,
        external_audio_url=str(args.external_audio) if args.external_audio and not args.skip_audio else None,
        external_audio_offset_seconds=args.external_audio_offset,
        external_audio_mix_mode="external_only",
        overlap_start=0.0,
        overlap_duration=float(proof_duration or 0.0),
        timeline_start=0.0,
        output_aspect_ratio=args.aspect,
        render_tier=args.render_tier,
        renderTier=args.render_tier,
        pre_sync_clap_alignment=(not args.skip_presync_clap and args.qa_presync_clap),
        reactionOverlays=bool(args.reaction_overlays),
        reaction_overlays=bool(args.reaction_overlays),
        burnCaptions=False if args.no_burn_captions else None,
        burn_captions=False if args.no_burn_captions else None,
        brandWatermark=False,
        generateThumbnail=(not args.no_thumbnails),
        async_mode=False,
        trusted_sync_contract=load_optional_json_arg(args.trusted_sync_contract_json),
        trustedSyncContract=load_optional_json_arg(args.trusted_sync_contract_json),
        trusted_director_channel_map=load_optional_json_arg(args.trusted_director_channel_map_json),
        trustedDirectorChannelMap=load_optional_json_arg(args.trusted_director_channel_map_json),
    )


def build_qa_report(results, args, output_dir, run_id, duration_probe):
    window_grades = []
    final_status = "SAFE"
    has_real_window = False
    for result in results:
        grade = grade_window_result(
            result,
            args.qa_good_sync_seconds,
            args.qa_block_sync_seconds,
            args.qa_min_usable_post_render_samples,
        )
        if grade["status"] not in {"SKIPPED", "SUPERSEDED"}:
            has_real_window = True
        if grade["status"] == "BLOCKED":
            final_status = "BLOCKED"
        elif grade["status"] == "RISKY" and final_status != "BLOCKED":
            final_status = "RISKY"
        window_grades.append(
            {
                "attempt": result.get("attempt"),
                "window": result.get("window"),
                "output": result.get("output"),
                "thumbnail": result.get("thumbnail"),
                "debug_plan": result.get("debug_plan"),
                **grade,
            }
        )
    if not has_real_window:
        final_status = "DRY_RUN"

    report = {
        "status": final_status,
        "qa_proof_receipt_id": run_id,
        "run_id": run_id,
        "output_dir": str(output_dir),
        "duration_probe": duration_probe,
        "thresholds": {
            "safe_sync_seconds": args.qa_good_sync_seconds,
            "blocked_sync_seconds": args.qa_block_sync_seconds,
            "min_usable_post_render_samples": args.qa_min_usable_post_render_samples,
        },
        "windows": window_grades,
        "recommendation": (
            "Safe to start a full render from the sync evidence."
            if final_status == "SAFE"
            else "Dry run only. Window placement was validated, but no rendered sync evidence exists yet."
            if final_status == "DRY_RUN"
            else "Do not start the full render yet. Inspect/fix the risky or blocked proof windows first."
        ),
    }
    proof_duration = qa_receipt_timeline_duration(args, duration_probe)
    proof_request = build_qa_receipt_request(args, proof_duration)
    report["proof_scope"] = {
        "timeline_start": 0.0,
        "duration_seconds": round(float(proof_duration or 0.0), 3),
        "signed": bool(worker.multicam_qa_receipt_secret()),
    }
    report = worker.sign_multicam_qa_proof_receipt(report, proof_request, proof_duration)
    report_path = output_dir / f"{run_id}_qa_report.json"
    report_path.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")

    md_lines = [
        f"# Cam Combiner QA Proof: {final_status}",
        "",
        f"- Run: `{run_id}`",
        f"- Output dir: `{output_dir}`",
        f"- Recommendation: {report['recommendation']}",
        "",
        "| Attempt | Window | Status | Max residual | Samples | Output | Thumbnail |",
        "| --- | --- | --- | ---: | ---: | --- | --- |",
    ]
    for item in window_grades:
        md_lines.append(
            "| {attempt} | {window} | {status} | {residual} | {samples} | {output} | {thumbnail} |".format(
                attempt=item.get("attempt") or "",
                window=item.get("window"),
                status=item.get("status"),
                residual=item.get("max_abs_residual_seconds"),
                samples=item.get("usable_sample_count"),
                output=item.get("output"),
                thumbnail=item.get("thumbnail"),
            )
        )
    report_md_path = output_dir / f"{run_id}_qa_report.md"
    report_md_path.write_text("\n".join(md_lines) + "\n", encoding="utf-8")
    report["report_path"] = str(report_path)
    report["markdown_report_path"] = str(report_md_path)
    return report


def build_segments(plan, window_start, window_duration, offsets, sync_rates):
    segments = []
    debug_rows = []
    window_start = float(window_start)
    window_duration = float(window_duration)
    window_end = window_start + window_duration
    max_plan_end = max([float(item.get("timeline_end") or 0.0) for item in plan] or [0.0])
    plan_uses_absolute_timeline = window_start > 0.001 or max_plan_end > window_duration + 0.5
    for index, item in enumerate(plan):
        item_start = float(item["timeline_start"])
        item_end = float(item["timeline_end"])
        if plan_uses_absolute_timeline:
            clipped_start = max(window_start, item_start)
            clipped_end = min(window_end, item_end)
            relative_start = clipped_start - window_start
            relative_end = clipped_end - window_start
        else:
            relative_start = max(0.0, item_start)
            relative_end = min(window_duration, item_end)
        if relative_end <= relative_start + 0.02:
            continue

        camera_id = normalize_camera_id(item["camera_id"])
        layout_mode = normalize_layout(item["layout_mode"])
        timeline_absolute_start = window_start + relative_start
        timeline_absolute_end = window_start + relative_end
        source_start = source_start_for(camera_id, timeline_absolute_start, offsets, sync_rates)
        source_end = source_start + ((relative_end - relative_start) * float(sync_rates[camera_id]))
        secondary_camera_id = "cam2" if camera_id == "cam1" else "cam1"
        secondary_source_start = source_start_for(
            secondary_camera_id,
            timeline_absolute_start,
            offsets,
            sync_rates,
        )

        debug_rows.append(
            {
                "segment_index": index,
                "requested_layout_mode": item.get("layout_mode"),
                "layout_mode": layout_mode,
                "timeline_start": round(relative_start, 3),
                "timeline_end": round(relative_end, 3),
                "timeline_relative": [round(relative_start, 3), round(relative_end, 3)],
                "timeline_absolute": [round(timeline_absolute_start, 3), round(timeline_absolute_end, 3)],
                "primary_camera_id": camera_id,
                "primary_manual_offset": offsets[camera_id],
                "primary_sync_rate": sync_rates[camera_id],
                "primary_source_start": round(source_start, 3),
                "primary_source_end": round(source_end, 3),
                "secondary_camera_id": secondary_camera_id,
                "secondary_manual_offset": offsets[secondary_camera_id],
                "secondary_sync_rate": sync_rates[secondary_camera_id],
                "secondary_expected_source_start": round(secondary_source_start, 3),
                "secondary_expected_source_end": round(
                    secondary_source_start + ((relative_end - relative_start) * float(sync_rates[secondary_camera_id])),
                    3,
                ),
                "overlay_duration": round(relative_end - relative_start, 3),
                "final_segment_duration": round(relative_end - relative_start, 3),
            }
        )

        segments.append(
            worker.MultiCamSegment(
                camera_id=camera_id,
                timeline_start=round(relative_start, 3),
                timeline_end=round(relative_end, 3),
                source_start=round(source_start, 3),
                source_end=round(source_end, 3),
                layout_mode=layout_mode,
            )
        )

    return segments, debug_rows


def install_command_tracer(args):
    original_run = worker.run_subprocess_async
    original_materialize_cfr = worker.materialize_to_cfr_cache
    original_render_layout = worker.render_multicam_layout_segment
    original_copy2 = worker.shutil.copy2

    def traced_copy2(src, dst, *args, **kwargs):
        try:
            src_path = Path(str(src)).resolve()
            dst_path = Path(str(dst)).resolve()
            src_path.relative_to(TMP_ROOT.resolve())
            dst_path.relative_to(TMP_ROOT.resolve())
            if src_path.suffix.lower() in {".mp4", ".mov", ".m4v"} and src_path.stat().st_size > 128 * 1024 * 1024:
                if dst_path.exists():
                    dst_path.unlink()
                os.link(src_path, dst_path)
                print(f"HARDLINK LOCAL MP4: {src_path} -> {dst_path}")
                return str(dst_path)
        except Exception:
            pass
        return original_copy2(src, dst, *args, **kwargs)

    async def traced_run(cmd, *args, **kwargs):
        print("\nFFMPEG/WORKER COMMAND:")
        print(" ".join(str(part) for part in cmd))
        if "-map" in cmd and "1:a:0" in [str(part) for part in cmd]:
            print("FFMPEG AUDIO MAPPING: video=0:v:0 audio=1:a:0 codec=aac")
        if len(cmd) >= 5 and "-vn" in cmd and "-c:a" in cmd:
            inputs = [str(cmd[index + 1]) for index, part in enumerate(cmd[:-1]) if part == "-i"]
            print(f"FFMPEG AUDIO BED INPUTS: {inputs}")
        return await original_run(cmd, *args, **kwargs)

    async def traced_materialize_cfr(source_url, *mat_args, **mat_kwargs):
        keep_audio = bool(mat_kwargs.get("keep_audio", False))
        source = Path(str(source_url)).expanduser()
        cfr_dir = Path(worker.get_cfr_cache_dir()).resolve()
        if not args.use_cfr_cache:
            try:
                resolved = source.resolve()
                if resolved.exists() and resolved.suffix.lower() in {".mp4", ".mov", ".m4v"} and worker.get_media_duration(str(resolved)) > 0.1:
                    print(f"\nLOCAL MP4 DIRECT USE: {resolved}")
                    return str(resolved)
            except Exception:
                pass
        try:
            resolved = source.resolve()
            resolved.relative_to(cfr_dir)
            if (
                resolved.exists()
                and resolved.suffix.lower() in {".mp4", ".mov", ".m4v"}
                and worker.get_media_duration(str(resolved)) > 0.1
                and (not keep_audio or worker.has_audio_stream(str(resolved)))
            ):
                print(f"\nCFR CACHE DIRECT USE: {resolved}")
                return str(resolved)
        except Exception:
            pass
        return await original_materialize_cfr(source_url, *mat_args, **mat_kwargs)

    async def traced_render_layout(
        segment_output_path,
        layout_mode,
        layout_sources,
        overlap_start,
        timeline_start,
        duration,
        output_width,
        output_height,
        job_id,
        primary_source_start=None,
        primary_source_end=None,
        layout_source_ranges=None,
        segment_index=None,
    ):
        primary = layout_sources[0] if layout_sources else {}
        secondary = layout_sources[1] if len(layout_sources) > 1 else {}
        source_ranges = layout_source_ranges or {}
        primary_range = source_ranges.get(primary.get("id")) if primary else None
        secondary_range = source_ranges.get(secondary.get("id")) if secondary else None
        primary_start = max(
            0.0,
            float(primary_range[0] if primary_range else primary_source_start if primary_source_start is not None else 0.0),
        )
        primary_rate = float(primary.get("sync_rate") or 1.0)
        if primary_range and float(primary_range[1]) > primary_start:
            primary_duration = max(0.02, float(primary_range[1]) - primary_start)
        elif primary_source_end is not None and float(primary_source_end) > primary_start:
            primary_duration = max(0.02, float(primary_source_end) - primary_start)
        else:
            primary_duration = max(0.02, float(duration) * primary_rate)
        secondary_start = None
        secondary_duration = None
        if secondary:
            if secondary_range:
                secondary_start = max(0.0, float(secondary_range[0]))
                secondary_duration = max(0.02, float(secondary_range[1]) - secondary_start)
            else:
                secondary_start = max(
                    0.0,
                    worker.get_source_start_for_timeline(secondary, overlap_start, timeline_start),
                )
                secondary_duration = max(0.02, float(duration) * float(secondary.get("sync_rate") or 1.0))

        print("\nLAYOUT SEGMENT TIMING:")
        print(
            json.dumps(
                {
                    "segment_index": segment_index,
                    "layout_mode": layout_mode,
                    "primary_camera_id": primary.get("id"),
                    "primary_sync_rate": round(primary_rate, 9),
                    "primary_source_start": round(primary_start, 3),
                    "primary_source_end": round(primary_start + primary_duration, 3),
                    "secondary_camera_id": secondary.get("id"),
                    "secondary_sync_rate": round(float(secondary.get("sync_rate") or 1.0), 9) if secondary else None,
                    "secondary_source_start": round(secondary_start, 3) if secondary_start is not None else None,
                    "secondary_source_end": round(secondary_start + secondary_duration, 3)
                    if secondary_start is not None and secondary_duration is not None
                    else None,
                    "overlay_duration": round(float(duration), 3),
                    "final_segment_duration": round(float(duration), 3),
                },
                indent=2,
            )
        )

        rendered = await original_render_layout(
            segment_output_path,
            layout_mode,
            layout_sources,
            overlap_start,
            timeline_start,
            duration,
            output_width,
            output_height,
            job_id,
            primary_source_start=primary_source_start,
            primary_source_end=primary_source_end,
            layout_source_ranges=layout_source_ranges,
            segment_index=segment_index,
        )
        if rendered and Path(segment_output_path).exists():
            actual_duration = media_duration(segment_output_path)
            print(
                "LAYOUT SEGMENT OUTPUT DURATION: "
                f"segment_index={segment_index} expected={float(duration):.3f}s actual={actual_duration:.3f}s"
            )
        return rendered

    worker.run_subprocess_async = traced_run
    worker.materialize_to_cfr_cache = traced_materialize_cfr
    worker.render_multicam_layout_segment = traced_render_layout
    worker.shutil.copy2 = traced_copy2


async def render_window(args, name, window_start, window_duration, paths, output_dir, run_id):
    offsets = {"cam1": args.camera1_offset, "cam2": args.camera2_offset}
    sync_rates = {"cam1": args.camera1_sync_rate, "cam2": args.camera2_sync_rate}
    rotations = {"cam1": args.camera1_rotate, "cam2": args.camera2_rotate}
    if args.auto_switch:
        segments = []
        debug_rows = []
    else:
        plan = load_plan(args.plan_json, window_duration)
        segments, debug_rows = build_segments(plan, window_start, window_duration, offsets, sync_rates)
        if not segments:
            raise ValueError(f"No valid segments for window {name}")

    layout_summary = {}
    for segment in segments:
        layout_summary[segment.layout_mode] = layout_summary.get(segment.layout_mode, 0) + 1

    debug_plan = {
        "window": name,
        "window_start": window_start,
        "window_duration": window_duration,
        "offsets": offsets,
        "sync_rates": sync_rates,
        "rotations": rotations,
        "trusted_sync_contract": load_optional_json_arg(args.trusted_sync_contract_json),
        "trusted_director_channel_map": load_optional_json_arg(args.trusted_director_channel_map_json),
        "auto_switch": bool(args.auto_switch),
        "auto_switch_interval": args.auto_switch_interval,
        "auto_switch_aggressiveness": args.auto_switch_aggressiveness,
        "primary_audio_camera_id": args.primary_audio_camera_id,
        "clean_channel_min_run_seconds": args.clean_channel_min_run_seconds,
        "render_tier": args.render_tier,
        "layout_summary": layout_summary,
        "segments": debug_rows,
    }
    debug_path = output_dir / f"{run_id}_{name}_debug_plan.json"
    debug_path.write_text(json.dumps(debug_plan, indent=2), encoding="utf-8")

    print(f"\n=== WINDOW {name} ===")
    print(json.dumps(debug_plan, indent=2))
    print(f"Debug plan: {debug_path}")

    if args.dry_run:
        return {"window": name, "debug_plan": str(debug_path), "dry_run": True}

    if not args.skip_audio and not paths.get("audio"):
        raise ValueError("External clean audio is required for this local verification run. Pass --external-audio or --skip-audio.")

    if paths.get("audio") and not args.skip_audio:
        print(f"EXTERNAL CLEAN AUDIO INPUT PATH: {paths['audio']}")
        print(f"EXTERNAL CLEAN AUDIO STREAMS: {json.dumps(audio_stream_summary(paths['audio']), indent=2)}")

    request = worker.RenderMultiCamRequest(
        sources=[
            worker.MultiCamSource(
                id="cam1",
                url=paths["cam1"],
                label="Camera 1",
                offset_seconds=args.camera1_offset,
                sync_rate=args.camera1_sync_rate,
                reaction_side=None if args.camera1_reaction_side == "auto" else args.camera1_reaction_side,
                rotation_degrees=args.camera1_rotate,
                cache_key=local_input_cache_key(args.camera1, "camera1"),
            ),
            worker.MultiCamSource(
                id="cam2",
                url=paths["cam2"],
                label="Camera 2",
                offset_seconds=args.camera2_offset,
                sync_rate=args.camera2_sync_rate,
                reaction_side=None if args.camera2_reaction_side == "auto" else args.camera2_reaction_side,
                rotation_degrees=args.camera2_rotate,
                cache_key=local_input_cache_key(args.camera2, "camera2"),
            ),
        ],
        segments=segments if not args.auto_switch else None,
        auto_switch=bool(args.auto_switch),
        audio_based_auto_switch=True,
        auto_switch_interval=args.auto_switch_interval,
        auto_switch_aggressiveness=args.auto_switch_aggressiveness,
        primary_audio_camera_id=args.primary_audio_camera_id,
        director_channel_camera_ids=[
            item.strip()
            for item in str(args.director_channel_camera_map or "").split(",")
            if item.strip()
        ] or None,
        external_audio_url=paths.get("audio") if paths.get("audio") and not args.skip_audio else None,
        external_audio_offset_seconds=args.external_audio_offset,
        external_audio_mix_mode="external_only",
        overlap_start=window_start,
        overlap_duration=window_duration,
        timeline_start=window_start,
        output_aspect_ratio=args.aspect,
        render_tier=args.render_tier,
        renderTier=args.render_tier,
        pre_sync_clap_alignment=(not args.skip_presync_clap and args.qa_presync_clap),
        reactionOverlays=bool(args.reaction_overlays),
        reaction_overlays=bool(args.reaction_overlays),
        burnCaptions=False if args.no_burn_captions else None,
        burn_captions=False if args.no_burn_captions else None,
        brandWatermark=False,
        watermarkText="AutoPromote Cam Combiner",
        generateThumbnail=(not args.no_thumbnails),
        async_mode=False,
        plan_only=bool(args.director_plan_only),
        trusted_sync_contract=load_optional_json_arg(args.trusted_sync_contract_json),
        trustedSyncContract=load_optional_json_arg(args.trusted_sync_contract_json),
        trusted_director_channel_map=load_optional_json_arg(args.trusted_director_channel_map_json),
        trustedDirectorChannelMap=load_optional_json_arg(args.trusted_director_channel_map_json),
    )

    job_id = f"{safe_name(args.job_prefix)}-{safe_name(name)}-{int(time.time())}"
    try:
        result = await worker.render_multicam_impl(request, provided_job_id=job_id)
    except Exception as exc:
        detail = getattr(exc, "detail", None)
        error_summary = summarize_render_error(exc)
        error_result = {
            "window": name,
            "output": None,
            "thumbnail": None,
            "debug_plan": str(debug_path),
            "has_audio": False,
            "audio_streams": [],
            "render_error": str(exc),
            "render_error_summary": error_summary,
            "error_detail": detail,
        }
        error_path = output_dir / f"{run_id}_{name}_error.json"
        error_path.write_text(json.dumps(error_result, indent=2, default=str), encoding="utf-8")
        print("WINDOW RENDER BLOCKED:")
        print(json.dumps(error_result, indent=2, default=str))
        return error_result
    if result.get("pre_sync_clap"):
        print("PRE-SYNC CLAP RESULT:")
        print(json.dumps(result["pre_sync_clap"], indent=2, default=str))
    if result.get("render_receipt"):
        print("RENDER RECEIPT:")
        print(json.dumps(result["render_receipt"], indent=2, default=str))
    if result.get("plan_only"):
        plan_path = output_dir / f"{run_id}_{name}_director_plan_result.json"
        plan_path.write_text(json.dumps(result, indent=2, default=str), encoding="utf-8")
        print(f"Director plan result: {plan_path}")
        return {
            "window": name,
            "output": None,
            "thumbnail": None,
            "debug_plan": str(debug_path),
            "has_audio": False,
            "audio_streams": [],
            "worker_result": result,
            "director_plan_result": str(plan_path),
        }
    source_output = Path(result["output_path"])
    if not source_output.exists():
        local_url = str(result.get("local_output_url") or "")
        local_name = local_url.rstrip("/").split("/")[-1]
        source_output = Path(worker.LOCAL_MEDIA_OUTPUT_DIR) / local_name
    if not source_output.exists():
        raise FileNotFoundError(f"Worker reported completion but output was not found: {result}")

    final_path = output_dir / f"{run_id}_{name}_{int(window_start)}s_{int(window_duration)}s.mp4"
    shutil.copy2(source_output, final_path)
    print(f"Rendered MP4: {final_path}")
    thumbnail = None
    worker_thumbnail_value = str(result.get("thumbnail_path") or "")
    worker_thumbnail = Path(worker_thumbnail_value) if worker_thumbnail_value else None
    if worker_thumbnail and worker_thumbnail.exists():
        thumbnail_path = output_dir / f"{run_id}_{safe_name(name)}_thumbnail.jpg"
        shutil.copy2(worker_thumbnail, thumbnail_path)
        thumbnail = str(thumbnail_path)
        print(f"Worker thumbnail: {thumbnail}")
    elif args.qa_proof and not args.no_thumbnails:
        thumbnail = capture_thumbnail(final_path, output_dir, run_id, name)
        print(f"QA thumbnail: {thumbnail}")
    output_audio = audio_stream_summary(final_path)
    print(f"OUTPUT AUDIO STREAMS: {json.dumps(output_audio, indent=2)}")
    print(f"OUTPUT HAS AUDIO STREAM: {media_has_audio(final_path)}")
    if not media_has_audio(final_path):
        raise RuntimeError(f"Rendered output has no audio stream: {final_path}")
    return {
        "window": name,
        "output": str(final_path),
        "thumbnail": thumbnail,
        "debug_plan": str(debug_path),
        "has_audio": media_has_audio(final_path),
        "audio_streams": output_audio,
        "worker_result": result,
    }


async def main():
    args = parse_args()
    if args.clean_channel_min_run_seconds is not None:
        worker.MULTICAM_CLEAN_CHANNEL_MIN_RUN_SECONDS = max(
            0.25,
            min(5.0, float(args.clean_channel_min_run_seconds)),
        )
    logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")
    worker.logger.setLevel(logging.INFO)

    output_dir = Path(args.output_dir).expanduser().resolve()
    run_id = f"{safe_name(args.job_prefix)}-{int(time.time())}"
    output_dir.mkdir(parents=True, exist_ok=True)
    # Stage source copies under project tmp because the production worker's
    # local-path guard intentionally rejects arbitrary filesystem paths.
    run_dir = TMP_ROOT / "local-multicam-render-tests" / run_id
    run_dir.mkdir(parents=True, exist_ok=True)

    paths = {
        "cam1": stage_local_file(args.camera1, run_dir, "camera1", stable_input_cache=not args.no_stable_input_cache),
        "cam2": stage_local_file(args.camera2, run_dir, "camera2", stable_input_cache=not args.no_stable_input_cache),
    }
    if args.external_audio and not args.skip_audio:
        paths["audio"] = stage_local_file(args.external_audio, run_dir, "external_audio", stable_input_cache=not args.no_stable_input_cache)
    elif not args.skip_audio:
        raise ValueError("External clean audio is required. Pass --external-audio, or use --skip-audio only for visual-only smoke tests.")

    print("Local render inputs:")
    print(json.dumps(paths, indent=2))
    if paths.get("audio"):
        print(f"External clean audio path: {paths['audio']}")
    print("Manual offsets:")
    print(json.dumps({"cam1": args.camera1_offset, "cam2": args.camera2_offset}, indent=2))
    print("Manual rotations:")
    print(json.dumps({"cam1": args.camera1_rotate, "cam2": args.camera2_rotate}, indent=2))

    print("Speed/cache options:")
    print(
        json.dumps(
            {
                "stable_input_cache": not args.no_stable_input_cache,
                "use_cfr_cache": args.use_cfr_cache,
                "pre_sync_clap_alignment": (not args.skip_presync_clap and (not args.qa_proof or args.qa_presync_clap)),
            },
            indent=2,
        )
    )
    timeline_duration, duration_probe = infer_timeline_duration(paths)
    print("Timeline duration probe:")
    print(json.dumps({"selected_seconds": round(timeline_duration, 3), "inputs": duration_probe}, indent=2))

    install_command_tracer(args)

    windows = build_windows(args, timeline_duration)
    initial_offsets = {
        "camera1_offset": args.camera1_offset,
        "camera2_offset": args.camera2_offset,
        "camera1_sync_rate": args.camera1_sync_rate,
        "camera2_sync_rate": args.camera2_sync_rate,
    }

    async def render_windows_attempt(attempt_label, attempt_run_id):
        attempt_results = []
        for index, (name, start, duration) in enumerate(windows):
            result = await render_window(args, name, start, duration, paths, output_dir, attempt_run_id)
            result["attempt"] = attempt_label
            attempt_results.append(result)
            error_summary = result.get("render_error_summary") or {}
            if args.qa_proof and error_summary.get("preflight_status") == "unsafe":
                for skipped_name, skipped_start, skipped_duration in windows[index + 1:]:
                    skipped_result = {
                        "attempt": attempt_label,
                        "window": skipped_name,
                        "output": None,
                        "thumbnail": None,
                        "debug_plan": None,
                        "has_audio": False,
                        "audio_streams": [],
                        "render_error": "Skipped after earlier unsafe sync preflight",
                        "render_error_summary": {
                            "message": "Skipped after earlier unsafe sync preflight",
                            "preflight_status": "unsafe",
                            "skipped_window_start": skipped_start,
                            "skipped_window_duration": skipped_duration,
                        },
                        "error_detail": error_summary,
                    }
                    attempt_results.append(skipped_result)
                break
        return attempt_results

    results = await render_windows_attempt("initial", run_id)
    candidate = None
    if args.qa_proof and not args.no_qa_auto_offset_candidates:
        candidate = extract_offset_candidate_from_results(
            results,
            apply_sync_rate=args.qa_auto_sync_rate,
        )
        if candidate and candidate.get("offsets"):
            for result in results:
                if result.get("render_error_summary", {}).get("preflight_status") == "unsafe":
                    result["superseded_by_attempt"] = "candidate_offsets"
            args.camera1_offset = candidate["offsets"].get("cam1", args.camera1_offset)
            args.camera2_offset = candidate["offsets"].get("cam2", args.camera2_offset)
            if args.qa_auto_sync_rate:
                args.camera1_sync_rate = candidate.get("sync_rates", {}).get("cam1", args.camera1_sync_rate)
                args.camera2_sync_rate = candidate.get("sync_rates", {}).get("cam2", args.camera2_sync_rate)
            candidate_path = output_dir / f"{run_id}_candidate_offsets.json"
            candidate_path.write_text(json.dumps(candidate, indent=2, default=str), encoding="utf-8")
            print("QA OFFSET CANDIDATE:")
            print(json.dumps(candidate, indent=2, default=str))
            print(f"QA offset candidate receipt: {candidate_path}")
            results.extend(await render_windows_attempt("candidate_offsets", f"{run_id}_candidate"))
        elif args.qa_proof:
            print("QA OFFSET CANDIDATE: none available from preflight summary")

    args.camera1_offset = initial_offsets["camera1_offset"]
    args.camera2_offset = initial_offsets["camera2_offset"]
    args.camera1_sync_rate = initial_offsets["camera1_sync_rate"]
    args.camera2_sync_rate = initial_offsets["camera2_sync_rate"]

    summary_path = output_dir / f"{run_id}_summary.json"
    summary_path.write_text(json.dumps(results, indent=2, default=str), encoding="utf-8")
    print(f"\nSummary: {summary_path}")
    if args.qa_proof:
        qa_report = build_qa_report(results, args, output_dir, run_id, duration_probe)
        print("QA REPORT:")
        print(json.dumps(qa_report, indent=2, default=str))
        print(f"QA JSON: {qa_report['report_path']}")
        print(f"QA Markdown: {qa_report['markdown_report_path']}")
        if qa_report["status"] == "BLOCKED":
            raise SystemExit(2)
        if qa_report["status"] == "RISKY":
            raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
