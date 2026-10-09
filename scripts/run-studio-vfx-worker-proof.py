#!/usr/bin/env python3
"""Real podcast speed ranges + creative effect through the existing worker."""
import asyncio
from functools import partial
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
import shutil
import subprocess
import sys
import threading
from local_media_http import RangeMediaHandler


async def main():
    work = Path("/work")
    out = work / "speed-creative-proof"
    out.mkdir(exist_ok=False)
    sys.path.insert(0, str(work / "python_media_worker"))
    import main_media_server as worker
    inventory = subprocess.check_output(["nvidia-smi", "--query-gpu=name,driver_version", "--format=csv,noheader"], text=True)
    if "NVIDIA L40S" not in inventory or worker.GPU_VIDEO_ENCODER != "h264_nvenc":
        raise RuntimeError("Explicit existing NVIDIA render qualification required")
    worker.FIREBASE_STATUS_UPDATES_ENABLED = False
    server = ThreadingHTTPServer(("127.0.0.1", 8765), partial(RangeMediaHandler, directory=str(work)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    def retain(local_path, destination_path=None):
        target = out / ("export.jpg" if destination_path and destination_path.endswith(".jpg") else "export.mp4")
        shutil.copy2(local_path, target)
        return target.as_uri()
    worker.upload_file_to_firebase = retain
    request = {"video_url": "http://127.0.0.1:8765/podcast-source-45s.mp4", "start_time": 17, "end_time": 23,
        "auto_captions": False, "brand_watermark": False, "output_settings": {"resolution": "source", "fps": 30},
        "speed_segments": [{"id": "slow", "start_time": 0, "end_time": 2, "rate": .5},
                           {"id": "fast", "start_time": 2, "end_time": 4, "rate": 2},
                           {"id": "natural", "start_time": 4, "end_time": 6, "rate": 1}],
        "creative_plan": {"version": 1, "enabled": True, "intensity": "clean", "effects": [
            {"id": "motion-echo", "preset": "beat_echo", "start_time": .5, "end_time": 3, "intensity": "clean"}]}}
    (out / "request.json").write_text(json.dumps(request, indent=2))
    try:
        result = await worker.render_viral_clip_impl(worker.RenderViralRequest(**request))
    finally:
        server.shutdown()
    validation = worker.validate_final_viral_delivery(str(out / "export.mp4"), expected_duration=7, expected_audio=True)
    decode = subprocess.run(["ffmpeg", "-v", "error", "-hwaccel", "cuda", "-i", str(out / "export.mp4"), "-f", "null", "-"], capture_output=True, text=True)
    if decode.returncode or decode.stderr: raise RuntimeError("Independent NVIDIA decode failed: " + decode.stderr)
    receipt = {"status": "PASS", "gpu": inventory.strip(), "validation": validation, "result": result,
        "expected_seconds": 2/.5 + 2/2 + 2, "source_seconds": 6, "scope": "Actual podcast, existing CPU editorial filters and NVIDIA final encoding/decoding; no cloud requests"}
    (out / "receipt.json").write_text(json.dumps(receipt, indent=2, default=str))
    print(json.dumps({"status": "PASS", "expected_seconds": 7, "validation": validation}))


if __name__ == "__main__": asyncio.run(main())
