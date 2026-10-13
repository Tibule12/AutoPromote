"""Bounded VM adapter for the preserved AutoPromote RTX qualification helpers.

No cloud APIs, product requests, model downloads, or infrastructure creation.
Run beside the unchanged qualify_gpu.py and exact input.mp4 fixture.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import shutil
import time

from qualify_gpu import command, cuda_probe, now, sha


EXPECTED_INPUT_SHA = "807f0f361f03c0a4936733c8c69d1232e6f4620791d3af12b0998978d008473b"
EXPECTED_HELPER_SHA = "4334b75628bd307f0a08881cbe15d10350abe0a8363b724b4580c5cc709d4cc6"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--work", type=Path, default=Path(__file__).resolve().parent)
    args = parser.parse_args()
    work = args.work.resolve()
    source, output = work / "input.mp4", work / "output.mp4"
    helper = Path(__file__).resolve().parent / "qualify_gpu.py"
    started = time.monotonic()
    receipt = {"status": "RUNNING", "startedAt": now(), "commands": [],
               "instanceName": "autopromote-l40s-staging", "provider": "Crusoe via NVIDIA Brev",
               "adapterSha256": sha(__file__), "sharedHelperSha256": sha(helper),
               "productionRequests": 0, "createdInstances": 0, "modelsInstalled": False,
               "workload": "Two-second AutoPromote product-tour NVDEC to NVENC transcode"}
    try:
        if sha(helper) != EXPECTED_HELPER_SHA:
            raise RuntimeError("Preserved Google qualification helper source differs")
        if source.stat().st_size != 29533 or sha(source) != EXPECTED_INPUT_SHA:
            raise RuntimeError("Exact preserved AutoPromote source fixture differs")
        receipt["input"] = {"path": "input.mp4", "sha256": sha(source),
                            "bytes": source.stat().st_size}
        smi = shutil.which("nvidia-smi")
        if not smi:
            raise RuntimeError("nvidia-smi is unavailable")
        receipt["hostname"] = command(["hostname"], receipt).strip()
        receipt["nvidiaSmi"] = command([smi], receipt)
        receipt["identityCsv"] = command(
            [smi, "--query-gpu=name,driver_version,memory.total,memory.free",
             "--format=csv,noheader,nounits"], receipt).strip()
        if "L40S" not in receipt["identityCsv"].upper():
            raise RuntimeError("Expected L40S device")
        receipt["cuda"] = cuda_probe()
        if "L40S" not in receipt["cuda"]["deviceName"].upper():
            raise RuntimeError("CUDA device differs from expected L40S")
        if importlib.util.find_spec("torch"):
            import torch
            receipt["torch"] = {"installed": True, "version": torch.__version__,
                                "cudaAvailable": torch.cuda.is_available(),
                                "cudaVersion": torch.version.cuda}
            if not torch.cuda.is_available():
                raise RuntimeError("Installed PyTorch cannot access CUDA")
            receipt["torch"].update(deviceName=torch.cuda.get_device_name(0),
                                    memoryTotalBytes=torch.cuda.get_device_properties(0).total_memory)
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
            raise RuntimeError("FFmpeg lacks required NVENC/NVDEC/CUDA capabilities")
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
        command(["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "verbose",
                 "-hwaccel", "cuda", "-hwaccel_output_format", "cuda",
                 "-c:v", "h264_cuvid", "-i", str(output), "-map", "0:v:0",
                 "-vf", "hwdownload,format=nv12", "-frames:v", "48",
                 "-f", "null", "-"], receipt, timeout=60)
        receipt["ffmpeg"].update(nvencExecuted=True, nvdecExecuted=True,
                                 cpuCodecFallback=False)
        receipt["output"] = {"path": "output.mp4", "sha256": sha(output),
                             "bytes": output.stat().st_size, "probe": probe}
        (work / "ffprobe.json").write_text(json.dumps(probe, indent=2) + "\n")
        receipt["status"] = "PASS"
    except Exception as exc:
        receipt["status"] = "FAIL"
        receipt["error"] = f"{type(exc).__name__}: {exc}"
    finally:
        receipt["finishedAt"] = now()
        receipt["elapsedSeconds"] = round(time.monotonic() - started, 4)
        (work / "gpu-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
        print(json.dumps({"status": receipt["status"],
                          "transcodeElapsedSeconds": receipt.get("transcodeElapsedSeconds"),
                          "error": receipt.get("error")}), flush=True)
    if receipt["status"] != "PASS":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
