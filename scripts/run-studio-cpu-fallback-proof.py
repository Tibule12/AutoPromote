#!/usr/bin/env python3
"""Actual CPU ASR and Studio export without any exposed NVIDIA device."""
import asyncio
from functools import partial
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


async def main():
    work = Path("/work")
    output = work / "cpu-fallback-output"
    output.mkdir(exist_ok=True)
    sys.path.insert(0, str(work / "python_media_worker"))
    os.environ["FASTER_WHISPER_MODEL"] = str(work / "models/studio-whisper")
    os.environ["FASTER_WHISPER_DEVICE"] = "auto"
    os.environ["FASTER_WHISPER_COMPUTE_TYPE"] = "int8"
    os.environ["FASTER_WHISPER_STRICT"] = "false"
    os.environ["VIRAL_EXPORT_ENCODER"] = "auto"
    import main_media_server as worker
    import ctranslate2
    if ctranslate2.get_cuda_device_count() != 0:
        raise RuntimeError("CPU fallback proof must not expose a GPU")
    worker.FIREBASE_STATUS_UPDATES_ENABLED = False
    source = work / "cpu-source.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-ss", "17", "-i", str(work / "podcast-source-45s.mp4"), "-t", "4",
                    "-vf", "scale=640:360,fps=24", "-c:v", "libx264", "-c:a", "aac", "-y", str(source)], check=True)
    started = time.monotonic()
    model = worker.get_faster_whisper_model()
    if worker.get_faster_whisper_device() != "cpu" or model.model.device != "cpu" or worker.GPU_VIDEO_ENCODER != "libx264":
        raise RuntimeError("Automatic CPU fallback did not select CPU ASR and encoding")
    transcript = worker.transcribe_with_hints(str(source), word_timestamps=True, model_name=str(work / "models/studio-whisper"))
    if not transcript.get("segments"):
        raise RuntimeError("CPU caption model produced no segments on actual speech")
    (output / "transcript.json").write_text(json.dumps(transcript, indent=2))
    server = ThreadingHTTPServer(("127.0.0.1", 8765), partial(RangeMediaHandler, directory=str(work)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    def retain(local_path, destination_path=None):
        target = output / ("export.jpg" if destination_path and destination_path.endswith(".jpg") else "export.mp4")
        shutil.copy2(local_path, target)
        return target.as_uri()
    worker.upload_file_to_firebase = retain
    request = {"video_url": "http://127.0.0.1:8765/cpu-source.mp4", "start_time": 0, "end_time": 4,
               "auto_captions": True, "caption_review_copy": True, "caption_style": "bold_pop", "brand_watermark": True,
               "caption_segments": [{"id": str(segment["id"]), "start_time": segment["start"], "end_time": min(4, segment["end"]),
                                     "text": segment["text"], "text_review_required": True, "text_reviewed": False}
                                    for segment in transcript["segments"] if segment["start"] < 4],
               "output_settings": {"resolution": "source", "fps": 24}}
    try:
        result = await worker.render_viral_clip_impl(worker.RenderViralRequest(**request))
    finally:
        server.shutdown()
    validation = worker.validate_final_viral_delivery(str(output / "export.mp4"), expected_duration=4, expected_audio=True)
    receipt = {"status": "PASS", "cuda_devices": 0, "caption_device": model.model.device, "compute_type": model.model.compute_type,
               "encoder": worker.GPU_VIDEO_ENCODER, "elapsed_seconds": time.monotonic() - started,
               "caption_segments": len(transcript["segments"]), "validation": validation, "render_result": result,
               "scope": "Actual short podcast, automatic CPU/int8 and libx264, offline container, no cloud credentials"}
    (output / "receipt.json").write_text(json.dumps(receipt, indent=2, default=str))
    print(json.dumps({key: receipt[key] for key in ("status", "cuda_devices", "caption_device", "encoder", "elapsed_seconds")}), flush=True)


if __name__ == "__main__":
    asyncio.run(main())
