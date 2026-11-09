#!/usr/bin/env python3
"""
Audit a completed Cam Combiner MP4 against the original camera scratch audio.

This is local-only. It does not upload, deploy, or call Cloud Run. The goal is
to stop a full assembled render from being called shippable when sampled
sections are visibly or measurably out of sync.
"""

import argparse
import json
import subprocess
import tempfile
import wave
from pathlib import Path

import numpy as np
from scipy.signal import correlate, correlation_lags


def parse_timecode(value):
    raw = str(value).strip()
    if raw.replace(".", "", 1).isdigit():
        return float(raw)
    seconds = 0.0
    for part in raw.split(":"):
        seconds = seconds * 60.0 + float(part)
    return seconds


def format_timecode(seconds):
    total = max(0, int(round(float(seconds))))
    hours, rem = divmod(total, 3600)
    minutes, secs = divmod(rem, 60)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


def parse_camera(value):
    if "=" not in value:
        raise argparse.ArgumentTypeError("camera mapping must be camera_id=/path/to/media")
    camera_id, path = value.split("=", 1)
    camera_id = camera_id.strip()
    path = Path(path).expanduser().resolve()
    if not camera_id:
        raise argparse.ArgumentTypeError("camera id is empty")
    if not path.exists():
        raise argparse.ArgumentTypeError(f"camera media not found: {path}")
    return camera_id, path


def parse_args():
    parser = argparse.ArgumentParser(description="Audit final assembled Cam Combiner sync locally.")
    parser.add_argument("--video", required=True, help="Completed full MP4 to audit")
    parser.add_argument(
        "--summary",
        action="append",
        default=[],
        help="Local multicam summary JSON. Uses worker_result.segments when present.",
    )
    parser.add_argument(
        "--plan",
        action="append",
        default=[],
        help="Chunk debug segment plan JSON. Pass in timeline order.",
    )
    parser.add_argument(
        "--camera",
        action="append",
        required=True,
        type=parse_camera,
        help="Original camera media mapping, for example cam1=/path/IMG_1.MOV",
    )
    parser.add_argument(
        "--sample",
        action="append",
        default=[],
        type=parse_timecode,
        help="Sample point as seconds or HH:MM:SS. Can be repeated.",
    )
    parser.add_argument("--chunk-duration", type=float, default=300.0)
    parser.add_argument("--sample-duration", type=float, default=8.0)
    parser.add_argument("--max-lag", type=float, default=0.7)
    parser.add_argument("--max-residual", type=float, default=0.12)
    parser.add_argument("--min-correlation", type=float, default=0.08)
    parser.add_argument("--output", required=True, help="JSON report path")
    args = parser.parse_args()
    if not args.plan and not args.summary:
        parser.error("at least one --plan or --summary is required")
    return args


def read_audio(path, start, duration, sample_rate=16000):
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp_path = Path(tmp.name)
    try:
        subprocess.run(
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-ss",
                f"{max(0.0, float(start)):.6f}",
                "-t",
                f"{float(duration):.6f}",
                "-i",
                str(path),
                "-vn",
                "-ac",
                "1",
                "-ar",
                str(sample_rate),
                "-f",
                "wav",
                str(tmp_path),
            ],
            check=True,
        )
        with wave.open(str(tmp_path), "rb") as wav:
            data = np.frombuffer(wav.readframes(wav.getnframes()), dtype=np.int16).astype(np.float32)
    finally:
        tmp_path.unlink(missing_ok=True)
    if data.size == 0:
        return data
    data = data / 32768.0
    data = data - np.mean(data)
    std = float(np.std(data))
    if std > 1e-6:
        data = data / std
    return data


def estimate_residual(output_path, source_path, output_start, source_start, duration, max_lag):
    sample_rate = 16000
    output_audio = read_audio(output_path, output_start, duration, sample_rate)
    source_audio = read_audio(source_path, source_start, duration, sample_rate)
    count = min(len(output_audio), len(source_audio))
    output_audio = output_audio[:count]
    source_audio = source_audio[:count]
    if count < sample_rate:
        return {"status": "unusable", "sample_count": int(count)}

    max_lag_samples = int(float(max_lag) * sample_rate)
    corr = correlate(output_audio, source_audio, mode="full", method="fft")
    lags = correlation_lags(len(output_audio), len(source_audio), mode="full")
    mask = (lags >= -max_lag_samples) & (lags <= max_lag_samples)
    limited_corr = corr[mask]
    limited_lags = lags[mask]
    best_index = int(np.argmax(np.abs(limited_corr)))
    best_lag = int(limited_lags[best_index])
    residual = best_lag / sample_rate
    return {
        "status": "measured",
        "estimated_residual_seconds": round(residual, 4),
        "abs_residual_seconds": round(abs(residual), 4),
        "correlation": round(float(limited_corr[best_index] / max(1, count)), 4),
        "sample_count": int(count),
    }


def load_plan(path):
    with Path(path).expanduser().open("r", encoding="utf-8") as handle:
        return json.load(handle)


def plan_start_seconds(plan, index, chunk_duration):
    return float(
        (plan or {}).get(
            "chunk_start_seconds",
            (plan or {}).get("window_start", index * float(chunk_duration)),
        )
        or 0.0
    )


def plan_duration_seconds(plan, chunk_duration):
    return float((plan or {}).get("window_duration", (plan or {}).get("duration", chunk_duration)) or chunk_duration)


def load_summary_plans(path, chunk_duration):
    summary = load_plan(path)
    items = summary if isinstance(summary, list) else summary.get("windows", [])
    plans = []
    for index, item in enumerate(items or []):
        worker_result = item.get("worker_result") if isinstance(item, dict) else None
        segments = worker_result.get("segments") if isinstance(worker_result, dict) else None
        if not segments:
            debug_plan_path = item.get("debug_plan") if isinstance(item, dict) else None
            if debug_plan_path:
                plan = load_plan(debug_plan_path)
                plans.append(plan)
            continue
        window_start = float(item.get("window_start", index * float(chunk_duration)) or 0.0)
        window_duration = float(item.get("window_duration") or worker_result.get("duration") or chunk_duration)
        sources = worker_result.get("sources") if isinstance(worker_result, dict) else None
        plans.append(
            {
                "chunk_start_seconds": window_start,
                "window_start": window_start,
                "window_duration": window_duration,
                "segments": segments,
                "sources": sources or [],
                "source": str(path),
                "summary_window": item.get("window"),
            }
        )
    return plans


def load_audit_plans(plan_paths, summary_paths, chunk_duration):
    plans = []
    for summary_path in summary_paths or []:
        plans.extend(load_summary_plans(summary_path, chunk_duration))
    for plan_path in plan_paths or []:
        plans.append(load_plan(plan_path))
    return plans


def find_plan_for_sample(plans, sample_time, chunk_duration):
    if not plans:
        return None, None, None, None
    sample_time = float(sample_time)
    for index, plan in enumerate(plans):
        start = plan_start_seconds(plan, index, chunk_duration)
        duration = plan_duration_seconds(plan, chunk_duration)
        if start <= sample_time < start + duration:
            return index, plan, start, sample_time - start
    index = min(int(sample_time // float(chunk_duration)), len(plans) - 1)
    plan = plans[index]
    start = plan_start_seconds(plan, index, chunk_duration)
    return index, plan, start, sample_time - start


def find_segment(plan, local_time):
    for segment in plan.get("segments") or []:
        if float(segment.get("timeline_start") or 0.0) <= local_time < float(segment.get("timeline_end") or 0.0):
            return segment
    segments = plan.get("segments") or []
    return segments[-1] if segments else {}


def find_source(plan, camera_id):
    for source in plan.get("sources") or []:
        if source.get("id") == camera_id:
            return source
    return {}


def audit_source_offset_seconds(source_offset, chunk_start, chunk_duration):
    source_offset = float(source_offset or 0.0)
    chunk_start = float(chunk_start or 0.0)
    chunk_duration = float(chunk_duration or 0.0)
    small_offset_limit = max(10.0, chunk_duration * 0.1)

    if abs(chunk_start) < 1e-6 and abs(source_offset) < small_offset_limit:
        return 0.0
    return source_offset


def classify_sync_measurement(sync, max_residual, min_correlation):
    measurement_status = str((sync or {}).get("status") or "missing")
    correlation = abs(float((sync or {}).get("correlation") or 0.0))
    residual = (sync or {}).get("abs_residual_seconds")

    if measurement_status != "measured" or residual is None:
        return {
            "status": "untrusted",
            "verdict": "bad_measurement",
            "measurement_quality": "unusable",
            "reason": f"sync measurement status is {measurement_status}",
            "recommended_action": "Do not treat this as drift. Re-sample with a better audible section.",
        }

    residual = abs(float(residual))
    if correlation < float(min_correlation):
        return {
            "status": "untrusted",
            "verdict": "bad_measurement",
            "measurement_quality": "low_correlation",
            "reason": (
                f"audio correlation {correlation:.4f} is below trusted threshold "
                f"{float(min_correlation):.4f}"
            ),
            "recommended_action": "Do not call this drift. Use another sample or compare against clean audio.",
        }

    if residual <= float(max_residual):
        return {
            "status": "passed",
            "verdict": "in_sync",
            "measurement_quality": "trusted",
            "reason": f"residual {residual:.4f}s is within {float(max_residual):.4f}s",
            "recommended_action": "No sync action required for this sample.",
        }

    near_threshold = residual <= float(max_residual) + 0.025
    return {
        "status": "failed",
        "verdict": "measured_drift_near_threshold" if near_threshold else "measured_drift",
        "measurement_quality": "trusted",
        "reason": f"residual {residual:.4f}s is above {float(max_residual):.4f}s",
        "recommended_action": (
            "Visually confirm because this is just above threshold."
            if near_threshold
            else "Treat as measured drift unless visual review disproves this sample."
        ),
    }


def main():
    args = parse_args()
    output_video = Path(args.video).expanduser().resolve()
    if not output_video.exists():
        raise SystemExit(f"video not found: {output_video}")

    plans = load_audit_plans(args.plan, args.summary, args.chunk_duration)
    cameras = dict(args.camera)
    sample_times = sorted(set(float(item) for item in args.sample))
    if not sample_times:
        raise SystemExit("at least one --sample is required")

    checks = []
    for sample_time in sample_times:
        chunk_index, plan, chunk_start, local_time = find_plan_for_sample(
            plans,
            sample_time,
            args.chunk_duration,
        )
        segment = find_segment(plan, local_time)
        camera_id = segment.get("camera_id")
        source = find_source(plan, camera_id)
        if camera_id not in cameras:
            checks.append(
                {
                    "time_seconds": round(sample_time, 3),
                    "timecode": format_timecode(sample_time),
                    "status": "blocked",
                    "reason": f"missing original media for {camera_id}",
                }
            )
            continue

        sync_rate = float(source.get("sync_rate") or 1.0)
        source_offset = float(source.get("offset") or 0.0)
        effective_source_offset = audit_source_offset_seconds(
            source_offset,
            chunk_start,
            args.chunk_duration,
        )
        segment_start = float(segment.get("timeline_start") or 0.0)
        segment_source_start = float(segment.get("source_start") or 0.0)
        sample_nudge = min(1.0, max(0.0, float(segment.get("timeline_end") or local_time + 1.0) - local_time - 0.25))
        output_sample_start = sample_time + sample_nudge
        source_sample_start = (
            segment_source_start
            + max(0.0, local_time - segment_start) * sync_rate
            + effective_source_offset
            + sample_nudge * sync_rate
        )
        sync = estimate_residual(
            output_video,
            cameras[camera_id],
            output_sample_start,
            source_sample_start,
            args.sample_duration,
            args.max_lag,
        )
        verdict = classify_sync_measurement(sync, args.max_residual, args.min_correlation)
        checks.append(
            {
                "time_seconds": round(sample_time, 3),
                "timecode": format_timecode(sample_time),
                "chunk_index": chunk_index,
                "chunk_start_seconds": round(float(chunk_start), 3),
                "chunk_local_seconds": round(local_time, 3),
                "hero_camera": camera_id,
                "segment": {
                    key: segment.get(key)
                    for key in [
                        "timeline_start",
                        "timeline_end",
                        "camera_id",
                        "layout_mode",
                        "secondary_camera_id",
                        "audio_leader_camera_id",
                        "audio_decision_reliable",
                        "layout_reason",
                    ]
                },
                "output_sample_start_seconds": round(output_sample_start, 3),
                "source_media": str(cameras[camera_id]),
                "source_sample_start_seconds": round(source_sample_start, 3),
                "source_offset_seconds": round(source_offset, 6),
                "effective_source_offset_seconds": round(effective_source_offset, 6),
                "status": verdict["status"],
                "sync_verdict": verdict,
                "sync": sync,
            }
        )

    failed = [item for item in checks if item.get("status") == "failed"]
    untrusted = [item for item in checks if item.get("status") == "untrusted"]
    report = {
        "status": "failed" if failed else "untrusted" if untrusted else "passed",
        "source_output": str(output_video),
        "method": "final output audio vs original hero-camera scratch audio cross-correlation",
        "thresholds": {
            "max_residual_seconds": args.max_residual,
            "min_abs_correlation": args.min_correlation,
            "max_lag_seconds": args.max_lag,
            "sample_duration_seconds": args.sample_duration,
        },
        "check_count": len(checks),
        "failed_count": len(failed),
        "untrusted_count": len(untrusted),
        "measured_drift_count": sum(
            1
            for item in checks
            if (item.get("sync_verdict") or {}).get("verdict") in {"measured_drift", "measured_drift_near_threshold"}
        ),
        "bad_measurement_count": sum(
            1
            for item in checks
            if (item.get("sync_verdict") or {}).get("verdict") == "bad_measurement"
        ),
        "checks": checks,
    }
    output_path = Path(args.output).expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(output_path)
    print(
        f"status={report['status']} failed={report['failed_count']} "
        f"untrusted={report['untrusted_count']}/{report['check_count']}"
    )
    for item in checks:
        sync = item.get("sync") or {}
        print(
            item["timecode"],
            item.get("status"),
            (item.get("sync_verdict") or {}).get("verdict"),
            item.get("hero_camera"),
            sync.get("abs_residual_seconds"),
            sync.get("correlation"),
        )


if __name__ == "__main__":
    main()
