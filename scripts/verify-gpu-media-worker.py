"""Private candidate gate: strict CUDA startup, NVENC export, audio and duration."""
import json
import os
import urllib.request

origin = os.environ["CANDIDATE_URL"].rstrip("/")
headers = {"Authorization": "Bearer " + os.environ["WORKER_TOKEN"],
           "Content-Type": "application/json"}


def request(endpoint, payload=None):
    body = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(origin + endpoint, data=body, headers=headers)
    with urllib.request.urlopen(req, timeout=600) as response:
        return json.load(response)


health = request("/health")
assert health.get("status") == "ok", "GPU worker is not healthy"
assert health.get("computeDevice") == "cuda", "CUDA is not selected"
assert health.get("gpuRequired") is True, "Strict startup GPU inference was not required"
assert health.get("videoEncoder") == "h264_nvenc", "NVENC device probe failed"
result = request("/render-viral-clip", {
    "video_url": "https://raw.githubusercontent.com/mediaelement/mediaelement-files/4d21a042353022326071acb0251ab75cd6bae114/big_buck_bunny.mp4",
    "start_time": 0, "end_time": 2, "auto_captions": False,
    "smart_crop": False, "brand_watermark": False, "async_mode": False,
    "overlays": [],
})
assert result.get("status") == "completed", "GPU render did not complete"
assert result.get("output_settings", {}).get("encoder") == "h264_nvenc", "Render used a CPU encoder"
assert result.get("audio_proof", {}).get("verified") is True, "GPU render audio was not verified"
assert result.get("final_quality_gate", {}).get("status") == "passed", "GPU render failed delivery validation"
print("GPU candidate passed strict CUDA inference, real NVENC render and audio/delivery validation.")
