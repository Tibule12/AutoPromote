#!/usr/bin/env python3
"""Exercise the existing Studio caption and renderer engines on one L40S.

Run model preparation with network access; run inference/export in a separate
container with --network none. No environment file or cloud key is required.
"""
import argparse
import asyncio
import hashlib
from http.server import ThreadingHTTPServer
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import threading
import time
from local_media_http import RangeMediaHandler


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def prepare(work):
    from huggingface_hub import HfApi, snapshot_download
    model_id = "digiphyte/swivuriso-turbo"
    info = HfApi().model_info(model_id)
    target = work / "models" / "studio-whisper"
    snapshot_download(model_id, revision=info.sha, local_dir=target,
                      allow_patterns=["config.json", "model.bin", "tokenizer.json", "vocabulary.*", "preprocessor_config.json", "README.md", "LICENSE*"])
    receipt = {"model": model_id, "revision": info.sha,
               "files": {str(p.relative_to(target)): {"bytes": p.stat().st_size, "sha256": sha(p)}
                         for p in target.rglob("*") if p.is_file() and ".cache" not in p.parts}}
    (work / "model-receipt.json").write_text(json.dumps(receipt, indent=2))
    print(json.dumps({"prepared": model_id, "revision": info.sha}), flush=True)


def gpu_sample(samples, stop):
    while not stop.is_set():
        result = subprocess.run(["nvidia-smi", "--query-gpu=timestamp,name,utilization.gpu,memory.used", "--format=csv,noheader,nounits"], capture_output=True, text=True)
        samples.append({"time": time.time(), "value": result.stdout.strip(), "exit": result.returncode})
        stop.wait(0.2)


async def run(work, request_path):
    out = work / "output"
    out.mkdir(exist_ok=True)
    inventory = subprocess.run(["nvidia-smi", "--query-gpu=name,memory.total,driver_version", "--format=csv,noheader"], check=True, capture_output=True, text=True).stdout.strip()
    if "NVIDIA L40S" not in inventory:
        raise RuntimeError("This proof is authorized only on the existing NVIDIA L40S")
    sys.path.insert(0, str(work / "python_media_worker"))
    os.environ["FASTER_WHISPER_MODEL"] = str(work / "models/studio-whisper")
    os.environ["FASTER_WHISPER_DEVICE"] = "auto"
    os.environ["FASTER_WHISPER_COMPUTE_TYPE"] = "float16"
    os.environ["FASTER_WHISPER_STRICT"] = "true"
    import main_media_server as worker
    import ctranslate2
    worker.FIREBASE_STATUS_UPDATES_ENABLED = False
    if worker.get_faster_whisper_device() != "cuda" or worker.GPU_VIDEO_ENCODER != "h264_nvenc":
        raise RuntimeError("CUDA inference or NVIDIA encoding is unavailable; CPU fallback is forbidden in this proof")
    samples, stop = [], threading.Event()
    stage_media = []
    original_subprocess = worker.run_subprocess_async
    async def observe_stage(command, **kwargs):
        result = await original_subprocess(command, **kwargs)
        candidate = Path(str(command[-1])) if command else Path("/missing")
        if candidate.suffix.lower() in {".mp4", ".mov", ".m4a"} and candidate.is_file():
            probe = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(candidate)], capture_output=True, text=True)
            stage_media.append({"command": command, "probe": json.loads(probe.stdout or "{}")})
            if candidate.name.endswith("_viral.mp4"):
                shutil.copy2(candidate, out / "debug-last-export.mp4")
        return result
    worker.run_subprocess_async = observe_stage
    sampler = threading.Thread(target=gpu_sample, args=(samples, stop), daemon=True)
    sampler.start()
    started = time.monotonic()
    source = work / "podcast-source-45s.mp4"
    try:
        load_started = time.monotonic()
        model = worker.get_faster_whisper_model()
        load_seconds = time.monotonic() - load_started
        if model.model.device != "cuda":
            raise RuntimeError("Loaded caption model is not executing on CUDA")
        speech_started = time.monotonic()
        transcript = worker.transcribe_with_hints(str(source), word_timestamps=True, model_name=str(work / "models/studio-whisper"))
        inference_seconds = time.monotonic() - speech_started
        (out / "gpu-transcript.json").write_text(json.dumps(transcript, indent=2))
        filtered = worker.filter_caption_transcription_segments(transcript.get("segments", []))
        (out / "caption-quality.json").write_text(json.dumps(filtered, indent=2))
        if not transcript.get("segments") or not any(s.get("words") for s in transcript["segments"]):
            raise RuntimeError("The real podcast did not produce editable timestamped caption words")
        # Local loopback exercises the unchanged HTTP materialization path.
        class LocalMedia(RangeMediaHandler):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, directory=str(work), **kwargs)
            def log_message(self, *_args):
                pass
        server = ThreadingHTTPServer(("127.0.0.1", 8765), LocalMedia)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        def retain(local_path, destination_path=None):
            target = out / ("studio-export.jpg" if destination_path and destination_path.endswith(".jpg") else "studio-export.mp4")
            shutil.copy2(local_path, target)
            return target.as_uri()
        worker.upload_file_to_firebase = retain
        if request_path:
            request = json.loads(request_path.read_text())
        else:
            request = {"video_url": "http://127.0.0.1:8765/podcast-source-45s.mp4", "start_time": 0, "end_time": 20,
                       "auto_captions": True, "caption_review_copy": True, "caption_style": "bold_pop",
                       "caption_segments": [{"id": str(s["id"]), "start_time": s["start"], "end_time": min(20, s["end"]), "text": s["text"], "text_review_required": True, "text_reviewed": False} for s in transcript["segments"] if s["start"] < 20],
                       "output_settings": {"resolution": "1080p", "fps": 30}, "brand_watermark": True,
                       "finish_plan": {"version": 1, "enabled": True, "reframe": {"enabled": True, "aspect": "9:16", "mode": "off"}}}
        (out / "render-request.json").write_text(json.dumps(request, indent=2))
        render_started = time.monotonic()
        try:
            result = await worker.render_viral_clip_impl(worker.RenderViralRequest(**request))
        finally:
            server.shutdown()
        render_seconds = time.monotonic() - render_started
        (out / "render-result.json").write_text(json.dumps(result, indent=2, default=str))
        output = out / "studio-export.mp4"
        probe = json.loads(subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(output)], capture_output=True, text=True, check=True).stdout)
        decode = subprocess.run(["ffmpeg", "-hide_banner", "-v", "error", "-hwaccel", "cuda", "-i", str(output), "-f", "null", "-"], capture_output=True, text=True)
        if decode.returncode or decode.stderr.strip():
            raise RuntimeError("Export failed independent GPU decode: " + decode.stderr[-2000:])
        receipt = {"status": "PASS", "gpu": inventory, "cuda_devices": ctranslate2.get_cuda_device_count(),
                   "caption_device": model.model.device, "caption_compute_type": model.model.compute_type,
                   "video_encoder": worker.GPU_VIDEO_ENCODER, "model_load_seconds": load_seconds,
                   "inference_seconds": inference_seconds, "source_seconds": worker.get_media_duration(str(source)),
                   "inference_real_time_factor": inference_seconds / worker.get_media_duration(str(source)),
                   "render_seconds": render_seconds, "elapsed_seconds": time.monotonic() - started,
                   "source_sha256": sha(source), "output_sha256": sha(output), "output_bytes": output.stat().st_size,
                   "gpu_decode": {"exit_code": decode.returncode, "stderr": decode.stderr}, "output_probe": probe,
                   "transcript_segments": len(transcript["segments"]), "transcript_words": sum(len(s.get("words", [])) for s in transcript["segments"]),
                   "cloud_credentials_supplied": False, "render_network": "none; local loopback source only",
                   "caption_review_copy": bool(request.get("caption_review_copy")), "source_hashes": {"main_media_server.py": sha(work / "python_media_worker/main_media_server.py")}}
        (out / "gpu-studio-receipt.json").write_text(json.dumps(receipt, indent=2))
        print(json.dumps({"status": "PASS", "inference_seconds": inference_seconds, "render_seconds": render_seconds, "output": str(output)}), flush=True)
    finally:
        (out / "stage-media.json").write_text(json.dumps(stage_media, indent=2))
        stop.set()
        sampler.join(timeout=3)
        (out / "gpu-samples.json").write_text(json.dumps(samples, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--work", type=Path, default=Path("/work"))
    parser.add_argument("--prepare", action="store_true")
    parser.add_argument("--request", type=Path)
    args = parser.parse_args()
    if args.prepare:
        prepare(args.work)
    else:
        asyncio.run(run(args.work, args.request))
