"""GPU job runner: validated JSON -> isolated Blender -> short encoded previews."""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time

from spec import validate_spec
from scene_motion import delivery_frame_count

JOB_ID = re.compile(r"^[A-Za-z0-9_-]{8,100}$")
IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp"}
MAX_ASSET_BYTES = 5 * 1024 * 1024
MAX_VIDEO_BYTES = 50 * 1024 * 1024


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


def prepare_video_texture(spec, asset_file, root):
    """Decode the requested source interval once onto the scene delivery grid."""
    asset=Path(asset_file)
    if not 0<asset.stat().st_size<=MAX_VIDEO_BYTES or hashlib.sha256(asset.read_bytes()).hexdigest()!=spec['scene']['assetContentHash']:
        raise ValueError('Invalid video texture content hash or size')
    info=json.loads(run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(asset)],timeout=30))
    video=next((s for s in info['streams'] if s['codec_type']=='video'),None)
    scene=spec['scene']
    if (not video or video['codec_name']!='h264' or video['width']*video['height']>8192**2
            or abs(video['width']/video['height']-scene['assetAspect'])>.002
            or float(video.get('duration') or info['format']['duration'])+.001<scene['assetSourceStart']+spec['duration']):
        raise ValueError('Invalid video texture format, dimensions or source range')
    frames=Path(root)/'texture';frames.mkdir(mode=0o700)
    count=delivery_frame_count(spec)
    run(['ffmpeg','-v','error','-y','-threads','2','-ss',str(scene['assetSourceStart']),'-i',str(asset),
         '-vf',f"setpts=PTS-STARTPTS,fps={spec['fps']}:start_time=0:round=near,scale=1280:720:force_original_aspect_ratio=decrease",
         '-frames:v',str(count),'-threads','2','-start_number','1',str(frames/'texture_%04d.png')],timeout=180)
    if len(list(frames.glob('texture_*.png')))!=count:
        raise ValueError('Video texture interval has incomplete decoded frame coverage')
    return frames/'texture_0001.png'


def render_files(spec, temp_dir, asset_file=None):
    root = Path(temp_dir)
    frames = root / "frames"
    frames.mkdir(mode=0o700)
    spec_file = root / "spec.json"
    spec_file.write_text(json.dumps(spec, sort_keys=True), encoding="utf-8")
    if spec.get('scene',{}).get('assetType')=='video':
        if not asset_file:raise ValueError('Video texture requires its owned source bytes')
        asset_file=prepare_video_texture(spec,asset_file,root)
    command = [os.environ.get('STUDIO_3D_BLENDER_BIN','blender'), "-b", "--factory-startup", "-noaudio", '-t', '2', "--python-exit-code", "1", "--python", str(Path(__file__).with_name("blender_scene.py")), "--", str(spec_file), str(frames)]
    if asset_file:
        command.append(str(asset_file))
    planar=(os.environ.get('STUDIO_3D_NATIVE_PLANAR')=='1' and spec.get('scene',{}).get('template')=='media_plane' and spec['scene'].get('assetType')=='video'
        and not spec['scene']['text'].strip() and not spec['scene']['secondary'].strip() and spec['scene']['bloom']==0)
    if planar:
        from plane_scene import render_plane_scene
        emit('native_plane_start',width=spec['width'],height=spec['height'],fps=spec['fps'],duration=spec['duration'])
        render_plane_scene(spec,asset_file,frames)
        blender_log=json.dumps(dict(event='render_device',engine='AUTOPROMOTE_PLANAR',backend='CPU',devices=[],gpu_verified=False))
    else:
        emit("blender_start", width=spec["width"], height=spec["height"], fps=spec["fps"], duration=spec["duration"])
        blender_log = run(command)
    expected_count = delivery_frame_count(spec)
    expected_names = {f'frame_{index:04d}.png' for index in range(expected_count)}
    if {p.name for p in frames.glob('frame_*.png')} != expected_names:
        raise RuntimeError('Blender did not render the complete requested frame sequence')
    device = None
    for line in blender_log.splitlines():
        if line.startswith('{"event": "render_device"'):
            print(line, flush=True)
            device = json.loads(line)
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
    receipt = {"version": 1, "device": device, "artifacts": {}}
    for artifact in (preview, overlay):
        digest = hashlib.sha256()
        with artifact.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        receipt["artifacts"][artifact.name] = {"bytes": artifact.stat().st_size, "sha256": digest.hexdigest()}
    (root / "receipt.json").write_text(json.dumps(receipt, sort_keys=True), encoding="utf-8")
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
                video=spec['scene'].get('assetType')=='video'
                if blob.size > (MAX_VIDEO_BYTES if video else MAX_ASSET_BYTES) or blob.content_type not in ({'video/mp4'} if video else IMAGE_TYPES):
                    raise ValueError("Invalid asset metadata")
                asset_file = Path(temp) / "asset"
                blob.download_to_filename(str(asset_file))
                if not video and (asset_file.stat().st_size > MAX_ASSET_BYTES or not is_image_file(asset_file, blob.content_type)):
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
        (target / "receipt.json").write_bytes((Path(temp) / "receipt.json").read_bytes())


if __name__ == "__main__":
    main()
