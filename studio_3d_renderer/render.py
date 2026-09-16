"""GPU job runner: validated JSON -> isolated Blender -> short encoded previews."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time

from spec import validate_spec

JOB_ID = re.compile(r"^[A-Za-z0-9_-]{8,100}$")
IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp"}
MAX_ASSET_BYTES = 5 * 1024 * 1024


def emit(event, **details):
    print(json.dumps({"event": event, **details}, sort_keys=True), flush=True)


def run(argv, timeout=840):
    started = time.monotonic()
    process = subprocess.run(argv, capture_output=True, text=True, timeout=timeout, check=False)
    if process.returncode:
        message = (process.stderr or process.stdout)[-2500:]
        raise RuntimeError(f"{Path(argv[0]).name} failed ({process.returncode}): {message}")
    emit("step_complete", tool=Path(argv[0]).name, seconds=round(time.monotonic() - started, 2))
    return process.stdout


def is_image_file(path, content_type):
    with open(path, "rb") as image:
        header = image.read(16)
    return ((content_type == "image/png" and header.startswith(b"\x89PNG\r\n\x1a\n"))
            or (content_type == "image/jpeg" and header.startswith(b"\xff\xd8\xff"))
            or (content_type == "image/webp" and header.startswith(b"RIFF") and header[8:12] == b"WEBP"))


def render_files(spec, temp_dir, asset_file=None):
    root = Path(temp_dir)
    frames = root / "frames"
    frames.mkdir(mode=0o700)
    spec_file = root / "spec.json"
    spec_file.write_text(json.dumps(spec, sort_keys=True), encoding="utf-8")
    command = ["blender", "-b", "--factory-startup", "-noaudio", "--python", str(Path(__file__).with_name("blender_scene.py")), "--", str(spec_file), str(frames)]
    if asset_file:
        command.append(str(asset_file))
    emit("blender_start", width=spec["width"], height=spec["height"], fps=spec["fps"], duration=spec["duration"])
    run(command)
    pattern = str(frames / "frame_%04d.png")
    preview = root / "preview.mp4"
    overlay = root / "overlay.mov"
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", f"color=c=0x0c1020:s={spec['width']}x{spec['height']}:r={spec['fps']}:d={spec['duration']}", "-framerate", str(spec["fps"]), "-i", pattern, "-filter_complex", "[0:v][1:v]overlay=shortest=1:format=auto,format=yuv420p[v]", "-map", "[v]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-movflags", "+faststart", "-an", str(preview)], timeout=180)
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-framerate", str(spec["fps"]), "-i", pattern, "-c:v", "qtrle", "-pix_fmt", "argb", "-an", str(overlay)], timeout=180)
    probe = run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_name,width,height,pix_fmt,duration", "-show_entries", "format=duration", "-of", "json", str(preview)], timeout=30)
    video_info = json.loads(probe)
    stream = next((stream for stream in video_info.get("streams", []) if stream.get("codec_name") == "h264"), None)
    if not stream or stream.get("width") != spec["width"] or stream.get("height") != spec["height"] or float(video_info["format"]["duration"]) < spec["duration"] - .15:
        raise RuntimeError("Encoded preview failed FFprobe validation")
    emit("render_validated", codec="h264", width=spec["width"], height=spec["height"], duration=video_info["format"]["duration"], preview_bytes=preview.stat().st_size, overlay_bytes=overlay.stat().st_size)
    return preview, overlay


def run_cloud_job(job_id):
    if not JOB_ID.fullmatch(job_id):
        raise ValueError("Invalid job ID")
    from google.cloud import firestore, storage
    project = os.environ["GOOGLE_CLOUD_PROJECT"]
    bucket_name = os.environ["STUDIO_3D_BUCKET"]
    db = firestore.Client(project=project)
    store = storage.Client(project=project)
    bucket = store.bucket(bucket_name)
    ref = db.collection("studio_3d_jobs").document(job_id)
    snap = ref.get()
    if not snap.exists:
        raise ValueError("Unknown job")
    record = snap.to_dict()
    if record.get("status") != "queued" or record.get("jobId") != job_id:
        raise ValueError("Job is not queued")
    spec = validate_spec(record.get("spec"))
    if record.get("ownerUid") != spec["ownerUid"]:
        raise ValueError("Ownership mismatch")
    ref.update({"status": "rendering", "startedAt": firestore.SERVER_TIMESTAMP})
    try:
        emit("gpu_info", nvidia_smi=run(["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader"], timeout=10).strip())
        with tempfile.TemporaryDirectory(prefix="studio-3d-") as temp:
            asset_file = None
            asset_path = spec["scene"].get("assetStoragePath")
            if asset_path:
                blob = bucket.blob(asset_path)
                blob.reload()
                if blob.size > MAX_ASSET_BYTES or blob.content_type not in IMAGE_TYPES:
                    raise ValueError("Invalid asset metadata")
                asset_file = Path(temp) / "asset"
                blob.download_to_filename(str(asset_file))
                if asset_file.stat().st_size > MAX_ASSET_BYTES or not is_image_file(asset_file, blob.content_type):
                    raise ValueError("Invalid asset content")
            preview, overlay = render_files(spec, temp, asset_file)
            prefix = f"temp_studio_3d/{spec['ownerUid']}/{job_id}"
            bucket.blob(f"{prefix}/preview.mp4").upload_from_filename(str(preview), content_type="video/mp4")
            bucket.blob(f"{prefix}/overlay.mov").upload_from_filename(str(overlay), content_type="video/quicktime")
            ref.update({"status": "completed", "completedAt": firestore.SERVER_TIMESTAMP, "previewPath": f"{prefix}/preview.mp4", "overlayPath": f"{prefix}/overlay.mov", "previewBytes": preview.stat().st_size, "overlayBytes": overlay.stat().st_size})
    except Exception as exc:
        ref.update({"status": "failed", "completedAt": firestore.SERVER_TIMESTAMP, "errorCode": "RENDER_FAILED"})
        emit("render_failed", message=str(exc)[:1000])
        raise
    finally:
        lease_ref = db.collection("studio_3d_capacity").document("global")
        try:
            @firestore.transactional
            def release(transaction):
                lease = lease_ref.get(transaction=transaction)
                if lease.exists and lease.to_dict().get("jobId") == job_id:
                    transaction.delete(lease_ref)
            release(db.transaction())
        except Exception:
            emit("capacity_release_failed", job_id=job_id)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--job-id")
    parser.add_argument("--spec")
    parser.add_argument("--output")
    parser.add_argument("--asset")
    args = parser.parse_args()
    if not args.job_id and not args.spec and not args.output:
        args.job_id = os.environ.get("STUDIO_3D_JOB_ID")
    if args.job_id:
        if args.spec or args.output or args.asset:
            parser.error("Cloud job takes only --job-id")
        run_cloud_job(args.job_id)
        return
    if not args.spec or not args.output:
        parser.error("Local render requires --spec and --output")
    with open(args.spec, encoding="utf-8") as handle:
        spec = validate_spec(json.load(handle))
    target = Path(args.output).resolve()
    target.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="studio-3d-") as temp:
        preview, overlay = render_files(spec, temp, args.asset)
        (target / "preview.mp4").write_bytes(preview.read_bytes())
        (target / "overlay.mov").write_bytes(overlay.read_bytes())


if __name__ == "__main__":
    main()
