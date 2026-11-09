#!/usr/bin/env python3
"""
Local-only episode regression harness for Cam Combiner outputs.

This reads existing debug plans and optional sync reports. It does not render,
upload, deploy, or modify media files. Known episode markers are treated as
regression fixtures; unknown user videos use duration, chunks, and switch
boundaries to select proof samples.
"""

import argparse
import json
from pathlib import Path


def parse_timecode(value):
    raw = str(value).strip()
    if not raw:
        raise argparse.ArgumentTypeError("empty timecode")
    if raw.replace(".", "", 1).isdigit():
        return float(raw)
    seconds = 0.0
    for part in raw.split(":"):
        seconds = seconds * 60.0 + float(part)
    return seconds


def format_timecode(seconds):
    total = max(0, int(round(float(seconds or 0.0))))
    hours, rem = divmod(total, 3600)
    minutes, secs = divmod(rem, 60)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


def load_json(path):
    with Path(path).expanduser().open("r", encoding="utf-8") as handle:
        return json.load(handle)


def infer_duration_from_plans(plans, chunk_duration=300.0):
    if not plans:
        return 0.0
    max_time = 0.0
    for index, plan in enumerate(plans):
        chunk_start = float(
            plan.get("chunk_start_seconds", plan.get("window_start", index * float(chunk_duration))) or 0.0
        )
        segments = plan.get("segments") or []
        if segments:
            local_end = max(float(item.get("timeline_end") or 0.0) for item in segments)
            max_time = max(max_time, chunk_start + local_end)
    return max_time


def build_dynamic_sample_times(
    duration,
    plans=None,
    chunk_duration=300.0,
    interval=300.0,
    known_markers=None,
    boundary_padding=1.0,
):
    duration = max(0.0, float(duration or 0.0))
    samples = {0.0}
    if duration > 0.0:
        samples.update(
            {
                min(duration - 0.25, duration * 0.25),
                min(duration - 0.25, duration * 0.5),
                min(duration - 0.25, duration * 0.75),
                max(0.0, duration - min(30.0, max(0.25, duration * 0.05))),
            }
        )

    cursor = float(interval or 0.0)
    while duration > 0.0 and cursor < duration:
        samples.add(cursor)
        cursor += float(interval or duration + 1.0)

    for marker in known_markers or []:
        marker = float(marker)
        if 0.0 <= marker < duration or duration <= 0.0:
            samples.add(marker)

    for chunk_index, plan in enumerate(plans or []):
        chunk_start = float(
            plan.get("chunk_start_seconds", plan.get("window_start", chunk_index * float(chunk_duration))) or 0.0
        )
        previous_camera_id = None
        for segment in plan.get("segments") or []:
            timeline_start = float(segment.get("timeline_start") or 0.0)
            camera_id = segment.get("camera_id")
            if previous_camera_id and camera_id and camera_id != previous_camera_id:
                absolute = chunk_start + timeline_start + float(boundary_padding or 0.0)
                if 0.0 <= absolute < duration or duration <= 0.0:
                    samples.add(round(absolute, 3))
            previous_camera_id = camera_id or previous_camera_id

    return sorted(round(item, 3) for item in samples if item >= 0.0)


def find_segment_for_sample(plans, sample_time, chunk_duration=300.0):
    if not plans:
        return None, None, None
    plan = None
    chunk_index = None
    chunk_start = 0.0
    for index, candidate in enumerate(plans):
        candidate_start = float(
            candidate.get("chunk_start_seconds", candidate.get("window_start", index * float(chunk_duration))) or 0.0
        )
        candidate_duration = float(
            candidate.get("window_duration", candidate.get("duration", chunk_duration)) or chunk_duration
        )
        if candidate_start <= float(sample_time) < candidate_start + candidate_duration:
            plan = candidate
            chunk_index = index
            chunk_start = candidate_start
            break
    if plan is None:
        chunk_index = min(int(float(sample_time) // float(chunk_duration)), len(plans) - 1)
        plan = plans[chunk_index]
        chunk_start = float(
            plan.get("chunk_start_seconds", plan.get("window_start", chunk_index * float(chunk_duration))) or 0.0
        )
    local_time = float(sample_time) - chunk_start
    for segment in plan.get("segments") or []:
        start = float(segment.get("timeline_start") or 0.0)
        end = float(segment.get("timeline_end") or 0.0)
        if start <= local_time < end:
            return chunk_index, local_time, segment
    segments = plan.get("segments") or []
    return chunk_index, local_time, segments[-1] if segments else None


def audit_layout_samples(plans, sample_times, chunk_duration=300.0):
    checks = []
    for sample_time in sample_times:
        chunk_index, local_time, segment = find_segment_for_sample(plans, sample_time, chunk_duration)
        if not segment:
            checks.append(
                {
                    "time_seconds": round(float(sample_time), 3),
                    "timecode": format_timecode(sample_time),
                    "status": "blocked",
                    "reason": "no segment found for sample",
                }
            )
            continue

        camera_id = segment.get("camera_id")
        audio_leader = segment.get("audio_leader_camera_id")
        secondary = segment.get("secondary_camera_id")
        layout_mode = str(segment.get("layout_mode") or "cut").lower()
        audio_reliable = bool(segment.get("audio_decision_reliable"))
        issues = []
        if audio_reliable and audio_leader:
            if camera_id != audio_leader:
                issues.append("active_speaker_not_hero")
            if layout_mode == "pip" and secondary == audio_leader:
                issues.append("active_speaker_in_reaction")
        if layout_mode == "pip" and secondary == camera_id:
            issues.append("reaction_same_as_hero")

        checks.append(
            {
                "time_seconds": round(float(sample_time), 3),
                "timecode": format_timecode(sample_time),
                "chunk_index": chunk_index,
                "chunk_local_seconds": round(float(local_time), 3),
                "status": "passed" if not issues else "failed",
                "issues": issues,
                "segment": {
                    "timeline_start": segment.get("timeline_start"),
                    "timeline_end": segment.get("timeline_end"),
                    "camera_id": camera_id,
                    "layout_mode": layout_mode,
                    "secondary_camera_id": secondary,
                    "audio_leader_camera_id": audio_leader,
                    "audio_decision_reliable": audio_reliable,
                    "layout_reason": segment.get("layout_reason"),
                },
            }
        )
    failed = [item for item in checks if item.get("status") != "passed"]
    return {
        "status": "passed" if not failed else "failed",
        "check_count": len(checks),
        "failed_count": len(failed),
        "checks": checks,
    }


def summarize_sync_report(sync_report, max_residual=0.12):
    checks = sync_report.get("checks") or []
    normalized = []
    failed = []
    untrusted = []
    for item in checks:
        sync = item.get("sync") or {}
        residual = sync.get("abs_residual_seconds")
        correlation = sync.get("correlation")
        status = item.get("status")
        if not status:
            if residual is None:
                status = "untrusted"
            else:
                status = "passed" if abs(float(residual)) <= float(max_residual) else "failed"
        entry = {
            "time_seconds": item.get("time_seconds"),
            "timecode": item.get("timecode"),
            "hero_camera": item.get("hero_camera"),
            "status": status,
            "abs_residual_seconds": residual,
            "correlation": correlation,
        }
        normalized.append(entry)
        if status == "untrusted":
            untrusted.append(entry)
        elif status != "passed":
            failed.append(entry)
    return {
        "status": "passed" if not failed and not untrusted else "blocked" if failed else "untrusted",
        "check_count": len(normalized),
        "failed_count": len(failed),
        "untrusted_count": len(untrusted),
        "checks": normalized,
    }


def build_episode_regression_report(
    *,
    plans,
    duration=None,
    chunk_duration=300.0,
    known_markers=None,
    sync_report=None,
):
    duration = float(duration or 0.0) or infer_duration_from_plans(plans, chunk_duration)
    sample_times = build_dynamic_sample_times(
        duration,
        plans=plans,
        chunk_duration=chunk_duration,
        known_markers=known_markers or [],
    )
    layout_report = audit_layout_samples(plans, sample_times, chunk_duration=chunk_duration)
    sync_summary = summarize_sync_report(sync_report or {}) if sync_report else None
    status = "passed"
    if layout_report.get("status") != "passed":
        status = "failed"
    if sync_summary and sync_summary.get("status") in {"blocked", "untrusted"}:
        status = "needs_review" if status == "passed" and sync_summary.get("status") == "untrusted" else "failed"
    return {
        "status": status,
        "duration_seconds": round(duration, 3),
        "chunk_duration_seconds": float(chunk_duration),
        "dynamic_sample_count": len(sample_times),
        "dynamic_samples": [
            {"time_seconds": item, "timecode": format_timecode(item)} for item in sample_times
        ],
        "layout_report": layout_report,
        "sync_summary": sync_summary,
    }


def parse_args():
    parser = argparse.ArgumentParser(description="Build a local episode regression proof from existing render artifacts.")
    parser.add_argument("--summary", help="Local multicam summary JSON containing debug_plan entries")
    parser.add_argument("--plan", action="append", default=[], help="Debug segment plan JSON. Can be repeated.")
    parser.add_argument("--sync-report", help="Existing final sync audit/correlation report JSON")
    parser.add_argument("--duration", type=float, default=0.0)
    parser.add_argument("--chunk-duration", type=float, default=300.0)
    parser.add_argument("--known-marker", action="append", type=parse_timecode, default=[])
    parser.add_argument("--output-dir", required=True)
    return parser.parse_args()


def plans_from_args(args):
    plan_paths = list(args.plan or [])
    plans = []
    if args.summary:
        summary = load_json(args.summary)
        items = summary if isinstance(summary, list) else summary.get("windows", [])
        for index, item in enumerate(items):
            worker_result = item.get("worker_result") if isinstance(item, dict) else None
            worker_segments = worker_result.get("segments") if isinstance(worker_result, dict) else None
            if worker_segments:
                window_start = float(item.get("window_start", index * float(args.chunk_duration)) or 0.0)
                window_duration = float(
                    item.get("window_duration")
                    or worker_result.get("duration")
                    or args.chunk_duration
                )
                plans.append(
                    {
                        "chunk_start_seconds": window_start,
                        "window_start": window_start,
                        "window_duration": window_duration,
                        "segments": worker_segments,
                    }
                )
                continue
            path = item.get("debug_plan")
            if path:
                plan_paths.append(path)
    for path in plan_paths:
        plan = load_json(path)
        plans.append(plan)
    return plans


def main():
    args = parse_args()
    output_dir = Path(args.output_dir).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    plans = plans_from_args(args)
    sync_report = load_json(args.sync_report) if args.sync_report else None
    report = build_episode_regression_report(
        plans=plans,
        duration=args.duration,
        chunk_duration=args.chunk_duration,
        known_markers=args.known_marker,
        sync_report=sync_report,
    )
    paths = {
        "episode_regression_report": output_dir / "episode2_v2_regression_report.json",
        "dynamic_samples": output_dir / "dynamic_samples.json",
        "layout_contract_report": output_dir / "layout_contract_report.json",
        "sync_report_summary": output_dir / "sync_report_summary.json",
    }
    paths["episode_regression_report"].write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    paths["dynamic_samples"].write_text(json.dumps(report["dynamic_samples"], indent=2) + "\n", encoding="utf-8")
    paths["layout_contract_report"].write_text(json.dumps(report["layout_report"], indent=2) + "\n", encoding="utf-8")
    paths["sync_report_summary"].write_text(
        json.dumps(report["sync_summary"] or {"status": "not_provided"}, indent=2) + "\n",
        encoding="utf-8",
    )
    print(paths["episode_regression_report"])
    print(f"status={report['status']} samples={report['dynamic_sample_count']}")


if __name__ == "__main__":
    main()
