"""Inspect caption transcription on a local video without deploying or rendering.

Probe mode only needs FFmpeg and the Python standard library. ASR mode needs an
already cached, local faster-whisper model and the worker's Python dependencies.
It never downloads a model, calls an external transcription service, or uses
render credits. Reports contain private transcript text; keep them local.
"""

import argparse
from collections import Counter
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess


def run(command):
    result = subprocess.run(command, text=True, capture_output=True, check=False)
    if result.returncode:
        raise RuntimeError(f"{' '.join(command[:2])} failed: {result.stderr[-1200:]}")
    return result.stdout, result.stderr


def file_sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def media_probe(source):
    stdout, _ = run([
        "ffprobe", "-v", "error", "-show_entries",
        "format=duration,size:stream=index,codec_type,codec_name,sample_rate,channels",
        "-of", "json", str(source),
    ])
    return json.loads(stdout)


def extract_worker_audio(source, target, start, duration):
    # Use the same mono MP3 settings as the worker's /transcribe endpoint.
    run([
        "ffmpeg", "-v", "error", "-nostdin", "-ss", str(start), "-i", str(source),
        "-t", str(duration), "-vn", "-ac", "1", "-ar", "16000",
        "-c:a", "libmp3lame", "-b:a", "64k", "-y", str(target),
    ])
    if not target.is_file() or target.stat().st_size == 0:
        raise RuntimeError("FFmpeg produced no audio; inspect the source stream")


def audio_levels(audio):
    _, stderr = run([
        "ffmpeg", "-v", "info", "-nostdin", "-i", str(audio),
        "-af", "volumedetect,silencedetect=noise=-35dB:d=1",
        "-f", "null", "-",
    ])
    result = {}
    for name in ("mean_volume", "max_volume"):
        match = re.search(rf"\b{name}: (-?[\d.]+) dB", stderr)
        result[name + "_db"] = float(match.group(1)) if match else None
    result["silence_starts"] = [
        float(value) for value in re.findall(r"silence_start: ([\d.]+)", stderr)
    ]
    return result


def load_offline_worker(model_dir):
    if not model_dir.is_dir() or not (model_dir / "model.bin").is_file():
        raise ValueError(
            "--model-dir must be an already downloaded faster-whisper model directory "
            "containing model.bin; this tool will not download one"
        )
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    os.environ["FASTER_WHISPER_DEVICE"] = "cpu"
    os.environ["FASTER_WHISPER_COMPUTE_TYPE"] = "int8"
    from faster_whisper import WhisperModel
    from python_media_worker import main_media_server as worker

    model = WhisperModel(
        str(model_dir), device="cpu", compute_type="int8", local_files_only=True,
        cpu_threads=min(8, os.cpu_count() or 4),
    )
    # Keep the production transcribe_with_hints options and quality filter, but
    # force a cached model so the test cannot silently download a different one.
    worker.get_faster_whisper_model = lambda model_name=None: model
    worker.get_transcription_engine = lambda: "faster"
    return worker


def describe_transcription(worker, audio, start, language=None, task="transcribe"):
    raw = worker.transcribe_with_hints(
        str(audio), word_timestamps=True, language=language, task=task,
    )
    filtered = worker.filter_caption_transcription_segments(raw.get("segments") or [])
    reasons = Counter(
        reason for row in filtered["quality"].get("rejections", [])
        for reason in row.get("reasons", [])
    )
    return {
        "task": task,
        "forced_language": language,
        "detected_language": raw.get("language"),
        "engine": raw.get("engine"),
        "window_source_start_seconds": start,
        "raw_segments": raw.get("segments") or [],
        "accepted_segments": filtered["segments"],
        "quality": filtered["quality"],
        "rejection_reason_counts": dict(reasons),
        "note": "ASR text and any English translation are unverified; compare with the recording.",
    }


def write_summary(report, destination):
    lines = [
        f"Source SHA-256: {report['source_sha256']}",
        f"Audio: {report['audio_stream']}",
        "No deployment, render, upload, or transcription API call was made.",
        "Offline ASR ran using an existing local model."
        if report["asr_executed"] else
        "Offline ASR did not run: no local model directory was supplied. "
        "Audio levels cannot establish caption or translation accuracy.",
    ]
    for window in report["windows"]:
        lines.append(
            f"\nWindow {window['start_seconds']:.1f}–"
            f"{window['start_seconds'] + window['duration_seconds']:.1f}s "
            f"| levels {window['levels']}"
        )
        for candidate in window["candidates"]:
            quality = candidate["quality"]
            lines.append(
                f"  {candidate['task']} language={candidate['forced_language'] or 'auto'} "
                f"detected={candidate['detected_language']} "
                f"raw={len(candidate['raw_segments'])} "
                f"accepted={quality['accepted_segments']} "
                f"rejected={quality['rejected_segments']} "
                f"reasons={candidate['rejection_reason_counts']}"
            )
            for segment in candidate["raw_segments"]:
                lines.append(
                    f"    {float(segment.get('start') or 0) + window['start_seconds']:.1f}–"
                    f"{float(segment.get('end') or 0) + window['start_seconds']:.1f}s "
                    f"{str(segment.get('text') or '')[:180]}"
                )
    destination.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, default=None)
    parser.add_argument("--start", type=float, default=0.0,
                        help="Start of the source window, default 0s")
    parser.add_argument("--duration", type=float, default=300.0,
                        help="Window duration, default 300s (up to source end)")
    parser.add_argument("--model-dir", type=Path,
                        help="Run offline ASR using this existing model directory")
    parser.add_argument("--languages", default="auto,zu,xh",
                        help="Offline ASR passes: auto, zu, xh (comma separated)")
    parser.add_argument("--translate", action="store_true",
                        help="Also run the local Whisper English translation pass")
    args = parser.parse_args(argv)
    source = args.source.expanduser().resolve()
    if not source.is_file():
        parser.error(f"Source video does not exist: {source}")
    if args.start < 0 or args.duration <= 0 or args.duration > 300:
        parser.error("Use start >= 0 and 0 < duration <= 300 seconds")
    languages = [value.strip() for value in args.languages.split(",")]
    if any(value not in {"auto", "zu", "xh"} for value in languages):
        parser.error("--languages accepts only auto,zu,xh")
    if args.model_dir:
        model_dir = args.model_dir.expanduser().resolve()
        if not (model_dir / "model.bin").is_file():
            parser.error("--model-dir must contain a locally cached model.bin")
    else:
        model_dir = None
        if args.translate:
            parser.error("--translate requires --model-dir")
    output = (args.output_dir or Path(
        "caption-diagnostics-" + datetime.now().strftime("%Y%m%d-%H%M%S")
    )).expanduser().resolve()
    output.mkdir(parents=True, exist_ok=True)

    probe = media_probe(source)
    stream = next((s for s in probe.get("streams", []) if s.get("codec_type") == "audio"), None)
    if stream is None:
        raise RuntimeError("No audio stream in source video")
    source_duration = float(probe.get("format", {}).get("duration") or 0)
    if args.start >= source_duration:
        parser.error(f"--start must be earlier than the {source_duration:.1f}s source")
    duration = min(args.duration, source_duration - args.start)
    audio = output / "worker-input.mp3"
    extract_worker_audio(source, audio, args.start, duration)
    window = {
        "start_seconds": args.start,
        "duration_seconds": duration,
        "worker_audio": audio.name,
        "worker_audio_sha256": file_sha256(audio),
        "levels": audio_levels(audio),
        "candidates": [],
    }
    report = {
        "source_name": source.name,
        "source_sha256": file_sha256(source),
        "source_duration_seconds": source_duration,
        "audio_stream": stream,
        "asr_executed": model_dir is not None,
        "asr_model_dir": str(model_dir) if model_dir else None,
        "windows": [window],
    }
    if model_dir:
        worker = load_offline_worker(model_dir)
        for language in dict.fromkeys(languages):
            window["candidates"].append(describe_transcription(
                worker, audio, args.start,
                language=None if language == "auto" else language,
            ))
        if args.translate:
            window["candidates"].append(describe_transcription(
                worker, audio, args.start, task="translate",
            ))
    (output / "report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    write_summary(report, output / "summary.txt")
    print(output / "summary.txt")
    print(output / "report.json")


if __name__ == "__main__":
    main()
