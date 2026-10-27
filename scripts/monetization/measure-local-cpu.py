#!/usr/bin/env python3
"""Bounded local resource observations using existing worker clock helpers.

No cloud requests or provider charges. Local timing is not a cloud invoice or a
full Studio/AI workload calibration. Uses synthetic media only.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import resource
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from python_media_worker.viral_render_contract import (  # noqa: E402
    build_delivery_video_clock_filter,
    build_studio_audio_delivery_filter,
)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    if args.output.exists():
        parser.error("Use a new observation file")
    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    if not ffmpeg or not ffprobe:
        parser.error("Local FFmpeg and ffprobe are required")
    observations = []
    with tempfile.TemporaryDirectory(prefix="autopromote-local-cost-") as folder:
        scratch = Path(folder)

        def run(name, arguments, target, expected_success):
            def limits():
                resource.setrlimit(resource.RLIMIT_CPU, (15, 15))
                resource.setrlimit(resource.RLIMIT_FSIZE, (20 * 1024**2, 20 * 1024**2))

            started = time.monotonic()
            with tempfile.TemporaryFile() as error_log:
                process = subprocess.Popen(
                    [ffmpeg, "-nostdin", "-v", "error", *arguments],
                    stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                    stderr=error_log, start_new_session=True, preexec_fn=limits,
                )
                while True:
                    pid, status, usage = os.wait4(process.pid, os.WNOHANG)
                    if pid:
                        process.returncode = os.waitstatus_to_exitcode(status)
                        break
                    if time.monotonic() - started > 30:
                        os.killpg(process.pid, signal.SIGKILL)
                    time.sleep(0.01)
                elapsed = time.monotonic() - started
                error_log.seek(0)
                error = error_log.read(2048).decode(errors="replace")
            succeeded = process.returncode == 0
            if succeeded != expected_success:
                raise RuntimeError(f"Unexpected outcome for {name}: {error}")
            observation = {
                "operationId": f"local-{name}", "scenario": name,
                "outcome": "succeeded" if succeeded else "failed",
                "wallSeconds": elapsed, "userCpuSeconds": usage.ru_utime,
                "systemCpuSeconds": usage.ru_stime, "peakRssKiB": usage.ru_maxrss,
                "outputBytes": target.stat().st_size if target.exists() else 0,
                "exitCode": process.returncode, "invoiceCostMicros": None,
                "cloudCostAttribution": "unavailable",
            }
            if succeeded:
                probe = json.loads(subprocess.check_output([
                    ffprobe, "-v", "error", "-show_entries", "format=duration,size",
                    "-of", "json", str(target),
                ], timeout=5))
                observation["durationSeconds"] = float(probe["format"]["duration"])
                observation["sha256"] = hashlib.sha256(target.read_bytes()).hexdigest()
            observations.append(observation)

        video_filter = build_delivery_video_clock_filter(24, 3, 24)
        audio_filter = build_studio_audio_delivery_filter(3)
        rendered = scratch / "render.mp4"
        run("cpu-render-clock-smoke", [
            "-f", "lavfi", "-i", "testsrc2=s=640x360:r=24:d=3",
            "-f", "lavfi", "-i", "sine=frequency=500:sample_rate=48000:duration=3",
            "-vf", video_filter, "-af", audio_filter, "-c:v", "libx264",
            "-threads", "1", "-preset", "ultrafast", "-c:a", "aac", "-y", str(rendered),
        ], rendered, True)
        clipped = scratch / "clip.mp4"
        run("cpu-clip-smoke", ["-i", str(rendered), "-t", "1", "-c:v", "libx264",
            "-threads", "1", "-preset", "ultrafast", "-c:a", "aac", "-y", str(clipped)], clipped, True)
        failed = scratch / "failed.mp4"
        run("cpu-render-invalid-encoder-failure", ["-i", str(rendered), "-c:v",
            "nonexistent_autopromote_failure_fixture", "-y", str(failed)], failed, False)
    result = {
        "observedAtUtc": datetime.now(timezone.utc).isoformat(),
        "environment": "local-workstation", "syntheticMedia": True,
        "cloudRequests": 0, "gpuExecutions": 0, "providerChargesStarted": False,
        "canonicalHelpers": "python_media_worker/viral_render_contract.py",
        "canonicalHelperSha256": hashlib.sha256((ROOT / "python_media_worker/viral_render_contract.py").read_bytes()).hexdigest(),
        "observations": observations,
        "limits": ["Resource smoke measurements, not complete application/cloud cost samples.",
            "GPU/AI inference, network, storage byte-time, Firestore, Tasks and provider fees are unmeasured.",
            "The injected early failure does not represent a worst-case late render failure.",
            "No credit price or cloud USD cost can be derived from these timings alone."],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
