"""Manual RTX qualification in the existing renderer image; no product dispatch.

The one-task Cloud Run Job receives this exact source in its command arguments.
Input is a generation-pinned, SHA-256 checked two-second AutoPromote fixture.
Only the existing private bucket's qualification prefix is read/written. This
module never imports Firestore or calls AutoPromote's production orchestration.
"""
import ctypes
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time


PROJECT = "autopromote-cc6d3"
BUCKET = "autopromote-cc6d3-viral-studio-3d"


def now():
    return datetime.now(timezone.utc).isoformat()


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def command(argv, receipt, timeout=30):
    started = time.monotonic()
    result = subprocess.run(argv, capture_output=True, text=True, timeout=timeout)
    row = {"argv": argv, "exitCode": result.returncode,
           "elapsedSeconds": round(time.monotonic() - started, 4),
           "stdout": result.stdout, "stderr": result.stderr}
    receipt["commands"].append(row)
    print(json.dumps({"event": "qualification_step", "tool": argv[0],
                      "exitCode": result.returncode,
                      "elapsedSeconds": row["elapsedSeconds"]}), flush=True)
    if result.returncode:
        raise RuntimeError(f"{argv[0]} failed ({result.returncode}): {result.stderr[-3000:]}")
    return result.stdout


def cuda_probe():
    cuda = ctypes.CDLL("libcuda.so.1")

    def check(code):
        if code:
            raise RuntimeError(f"CUDA driver API error {code}")

    check(cuda.cuInit(0))
    version, count, device = ctypes.c_int(), ctypes.c_int(), ctypes.c_int()
    check(cuda.cuDriverGetVersion(ctypes.byref(version)))
    check(cuda.cuDeviceGetCount(ctypes.byref(count)))
    if count.value != 1:
        raise RuntimeError(f"Expected exactly one visible GPU, got {count.value}")
    check(cuda.cuDeviceGet(ctypes.byref(device), 0))
    name = ctypes.create_string_buffer(256)
    check(cuda.cuDeviceGetName(name, len(name), device))
    context = ctypes.c_void_p()
    check(cuda.cuDevicePrimaryCtxRetain(ctypes.byref(context), device))
    try:
        check(cuda.cuCtxSetCurrent(context))
        free, total = ctypes.c_size_t(), ctypes.c_size_t()
        check(cuda.cuMemGetInfo_v2(ctypes.byref(free), ctypes.byref(total)))
        return {"visibleDeviceCount": count.value, "deviceName": name.value.decode(),
                "driverAPIVersion": version.value, "memoryFreeBytes": free.value,
                "memoryTotalBytes": total.value, "containerAccess": True}
    finally:
        check(cuda.cuDevicePrimaryCtxRelease_v2(device))


def main():
    from google.cloud import storage

    prefix = os.environ["GPU_QUALIFICATION_PREFIX"]
    if not prefix.startswith("temp_studio_3d/qualification/rtx-20261006-") or ".." in prefix:
        raise ValueError("Qualification prefix is outside the permitted boundary")
    store = storage.Client(project=PROJECT)
    bucket = store.bucket(BUCKET)
    started = time.monotonic()
    receipt = {"status": "RUNNING", "startedAt": now(), "project": PROJECT,
               "region": "us-central1", "job": os.environ.get("CLOUD_RUN_JOB"),
               "execution": os.environ.get("CLOUD_RUN_EXECUTION"),
               "taskIndex": os.environ.get("CLOUD_RUN_TASK_INDEX"),
               "taskAttempt": os.environ.get("CLOUD_RUN_TASK_ATTEMPT"),
               "sourceSha256": os.environ["GPU_QUALIFICATION_SOURCE_SHA256"],
               "bucket": BUCKET, "prefix": prefix, "commands": [],
               "firestoreAccess": False, "productionRequests": 0,
               "workload": "Two-second AutoPromote product-tour NVDEC to NVENC transcode"}
    try:
        smi = shutil.which("nvidia-smi")
        if not smi and Path("/usr/local/nvidia/bin/nvidia-smi").is_file():
            smi = "/usr/local/nvidia/bin/nvidia-smi"
        if not smi:
            raise RuntimeError("nvidia-smi is not available in the existing renderer image or mounted driver tools")
        receipt["nvidiaSmi"] = command([smi], receipt)
        identity = command([smi, "--query-gpu=name,driver_version,memory.total,memory.free",
                            "--format=csv,noheader,nounits"], receipt).strip()
        if "RTX PRO 6000" not in identity.upper():
            raise RuntimeError(f"Unexpected GPU identity: {identity}")
        receipt["identityCsv"] = identity
        receipt["cuda"] = cuda_probe()
        if "RTX PRO 6000" not in receipt["cuda"]["deviceName"].upper():
            raise RuntimeError("CUDA device identity differs from required RTX PRO 6000")
        if importlib.util.find_spec("torch"):
            import torch
            receipt["torch"] = {"installed": True, "version": torch.__version__,
                                "cudaAvailable": torch.cuda.is_available(),
                                "cudaVersion": torch.version.cuda}
            if not torch.cuda.is_available():
                raise RuntimeError("Installed PyTorch cannot access CUDA")
            properties = torch.cuda.get_device_properties(0)
            receipt["torch"].update(deviceName=torch.cuda.get_device_name(0),
                                    memoryTotalBytes=properties.total_memory)
        else:
            receipt["torch"] = {"installed": False, "modelsInstalled": False}
        receipt["ffmpegVersion"] = command(["ffmpeg", "-version"], receipt)
        encoders = command(["ffmpeg", "-hide_banner", "-encoders"], receipt)
        decoders = command(["ffmpeg", "-hide_banner", "-decoders"], receipt)
        hwaccels = command(["ffmpeg", "-hide_banner", "-hwaccels"], receipt)
        receipt["ffmpeg"] = {"nvencListed": "h264_nvenc" in encoders,
                             "nvdecListed": "h264_cuvid" in decoders,
                             "cudaListed": "cuda" in hwaccels}
        if not all(receipt["ffmpeg"].values()):
            raise RuntimeError("Existing FFmpeg lacks required NVENC/NVDEC/CUDA capabilities")
        with tempfile.TemporaryDirectory(prefix="autopromote-rtx-qualification-") as work:
            source, output = Path(work) / "input.mp4", Path(work) / "output.mp4"
            generation = int(os.environ["GPU_QUALIFICATION_INPUT_GENERATION"])
            blob = bucket.blob(f"{prefix}/input.mp4", generation=generation)
            blob.download_to_filename(str(source), if_generation_match=generation, timeout=30)
            receipt["input"] = {"path": blob.name, "generation": generation,
                                "sha256": sha(source), "bytes": source.stat().st_size}
            if source.stat().st_size > 2_000_000 or sha(source) != os.environ["GPU_QUALIFICATION_INPUT_SHA256"]:
                raise RuntimeError("Qualification fixture hash or size boundary failed")
            transcode_start = time.monotonic()
            command(["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "verbose", "-y",
                     "-hwaccel", "cuda", "-hwaccel_output_format", "cuda",
                     "-c:v", "h264_cuvid", "-i", str(source), "-map", "0:v:0",
                     "-frames:v", "48", "-t", "2", "-c:v", "h264_nvenc",
                     "-preset", "p4", "-b:v", "2M", "-an", "-movflags", "+faststart",
                     str(output)], receipt, timeout=90)
            receipt["transcodeElapsedSeconds"] = round(time.monotonic() - transcode_start, 4)
            probe = json.loads(command(["ffprobe", "-v", "error", "-count_frames",
                                       "-show_streams", "-show_format", "-of", "json",
                                       str(output)], receipt))
            video = next(s for s in probe["streams"] if s["codec_type"] == "video")
            if (video["codec_name"] != "h264" or video["width"] != 640
                    or video["height"] != 360 or int(video["nb_read_frames"]) != 48
                    or abs(float(probe["format"]["duration"]) - 2) > 0.06):
                raise RuntimeError("Encoded fixture failed duration/frame/dimension validation")
            # Force a second hardware decode of the produced artifact: advertised
            # codec support alone is insufficient proof of functioning NVDEC.
            command(["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "verbose",
                     "-hwaccel", "cuda", "-hwaccel_output_format", "cuda",
                     "-c:v", "h264_cuvid", "-i", str(output), "-map", "0:v:0",
                     "-vf", "hwdownload,format=nv12", "-frames:v", "48",
                     "-f", "null", "-"], receipt, timeout=60)
            receipt["ffmpeg"].update(nvencExecuted=True, nvdecExecuted=True,
                                     cpuCodecFallback=False)
            output_blob = bucket.blob(f"{prefix}/output.mp4")
            output_blob.upload_from_filename(str(output), content_type="video/mp4",
                                             if_generation_match=0, timeout=30)
            receipt["output"] = {"path": output_blob.name,
                                 "generation": output_blob.generation,
                                 "sha256": sha(output), "bytes": output.stat().st_size,
                                 "probe": probe}
        receipt["status"] = "PASS"
    except Exception as exc:
        receipt["status"] = "FAIL"
        receipt["error"] = f"{type(exc).__name__}: {exc}"
    finally:
        receipt["finishedAt"] = now()
        receipt["elapsedSeconds"] = round(time.monotonic() - started, 4)
        text = json.dumps(receipt, sort_keys=True, indent=2)
        bucket.blob(f"{prefix}/receipt.json").upload_from_string(
            text, content_type="application/json", if_generation_match=0, timeout=30)
        print(json.dumps({"event": "qualification_complete",
                          "status": receipt["status"], "execution": receipt["execution"],
                          "elapsedSeconds": receipt["elapsedSeconds"],
                          "receipt": f"gs://{BUCKET}/{prefix}/receipt.json",
                          "error": receipt.get("error")}), flush=True)
    if receipt["status"] != "PASS":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
