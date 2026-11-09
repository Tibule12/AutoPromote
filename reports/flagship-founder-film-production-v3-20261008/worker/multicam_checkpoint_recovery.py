"""Recover a Cam Combiner master from verified cloud checkpoints.

This is intentionally independent from the full renderer: it never downloads
camera originals or reruns video encoding. It stream-copies existing checkpoint
video, prepares only the clean-audio bed, validates the final MP4, publishes it,
and then removes the temporary checkpoint objects.
"""

import datetime
import json
import os
import shutil
import subprocess
import tempfile
import urllib.parse
import uuid

import firebase_admin
from firebase_admin import firestore, storage


def required_env(name):
    value = str(os.getenv(name) or "").strip()
    if not value:
        raise RuntimeError(f"{name} is required")
    return value


def run(command):
    subprocess.run(command, check=True)


def probe(path):
    completed = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration:stream=codec_type,codec_name,width,height",
            "-of",
            "json",
            path,
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(completed.stdout)


def validate_video(path, expected_duration, *, require_audio):
    summary = probe(path)
    streams = summary.get("streams") or []
    video = next((item for item in streams if item.get("codec_type") == "video"), None)
    audio = next((item for item in streams if item.get("codec_type") == "audio"), None)
    duration = float((summary.get("format") or {}).get("duration") or 0.0)
    if not video or str(video.get("codec_name") or "").lower() != "h264":
        raise RuntimeError("Recovered master is missing its H.264 video stream")
    if int(video.get("width") or 0) != 1920 or int(video.get("height") or 0) != 1080:
        raise RuntimeError("Recovered master dimensions are not 1920x1080")
    if require_audio and not audio:
        raise RuntimeError("Recovered master is missing clean audio")
    if not require_audio and audio:
        raise RuntimeError("Checkpoint video unexpectedly contains audio")
    if abs(duration - expected_duration) > 0.1:
        raise RuntimeError(
            f"Recovered master duration mismatch: expected={expected_duration:.6f} "
            f"actual={duration:.6f}"
        )
    return {"duration": duration, "video": video, "audio": audio}


def firebase_download_url(bucket_name, object_name, token):
    encoded = urllib.parse.quote(object_name, safe="")
    return (
        f"https://firebasestorage.googleapis.com/v0/b/{bucket_name}/o/{encoded}"
        f"?alt=media&token={token}"
    )


def release_capacity(db, job_id):
    capacity_ref = db.collection("system_runtime").document("multicam_render_capacity")
    transaction = db.transaction()

    @firestore.transactional
    def release(transaction):
        snapshot = capacity_ref.get(transaction=transaction)
        if not snapshot.exists:
            return
        data = snapshot.to_dict() or {}
        active_jobs = data.get("activeJobs") or {}
        if not isinstance(active_jobs, dict):
            active_jobs = {}
        active_jobs.pop(job_id, None)
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        transaction.set(
            capacity_ref,
            {
                "activeJobs": active_jobs,
                "activeCount": len(active_jobs),
                "lastRelease": {
                    "jobId": job_id,
                    "reason": "checkpoint_recovery_completed",
                    "releasedAt": now,
                },
                "updatedAt": now,
            },
            merge=True,
        )

    release(transaction)


def main():
    bucket_name = required_env("RECOVERY_BUCKET")
    job_id = required_env("RECOVERY_JOB_ID")
    checkpoint_prefix = required_env("RECOVERY_CHECKPOINT_PREFIX").rstrip("/") + "/"
    audio_object = required_env("RECOVERY_AUDIO_OBJECT")
    expected_duration = float(required_env("RECOVERY_DURATION_SECONDS"))
    output_object = str(
        os.getenv("RECOVERY_OUTPUT_OBJECT") or f"processed/multicam_{job_id}.mp4"
    ).strip()

    if not firebase_admin._apps:
        firebase_admin.initialize_app(options={"storageBucket": bucket_name})
    bucket = storage.bucket(bucket_name)
    db = firestore.client()
    job_ref = db.collection("video_edits").document(job_id)
    temporary_directory = tempfile.mkdtemp(prefix=f"multicam-recovery-{job_id}-")

    try:
        job_snapshot = job_ref.get()
        if not job_snapshot.exists:
            raise RuntimeError("Recovery job does not exist")
        job = job_snapshot.to_dict() or {}
        if not job.get("creditReceipt"):
            raise RuntimeError("Recovery job has no existing credit receipt")
        if job.get("creditsRefunded"):
            raise RuntimeError("Recovery job was already refunded")
        checkpoint_state = job.get("renderCheckpoint") or {}
        expected_checkpoint_count = int(checkpoint_state.get("expectedCount") or 0)
        if expected_checkpoint_count <= 0:
            raise RuntimeError("Recovery job has no expected checkpoint count")

        job_ref.set(
            {
                "status": "processing",
                "stage": "recovering_saved_checkpoints",
                "progress": 88,
                "detail": (
                    f"Preparing clean audio for {expected_checkpoint_count} saved checkpoints; "
                    "cameras are not rerendering"
                ),
                "updatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            },
            merge=True,
        )

        audio_wav_path = os.path.join(temporary_directory, "clean-audio.wav")
        audio_aac_path = os.path.join(temporary_directory, "clean-audio.m4a")
        bucket.blob(audio_object).download_to_filename(audio_wav_path, timeout=900)
        run(
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                audio_wav_path,
                "-vn",
                "-af",
                "apad",
                "-t",
                f"{expected_duration:.6f}",
                "-c:a",
                "aac",
                "-b:a",
                "192k",
                "-movflags",
                "+faststart",
                "-y",
                audio_aac_path,
            ]
        )
        os.remove(audio_wav_path)
        job_ref.set(
            {
                "stage": "downloading_saved_checkpoints",
                "progress": 89,
                "detail": f"Downloading 0/{expected_checkpoint_count} saved checkpoints",
                "updatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            },
            merge=True,
        )

        checkpoint_blobs = sorted(
            (
                blob
                for blob in bucket.list_blobs(prefix=checkpoint_prefix)
                if os.path.basename(blob.name).startswith("chunk_")
                and blob.name.endswith(".mp4")
            ),
            key=lambda blob: blob.name,
        )
        if len(checkpoint_blobs) != expected_checkpoint_count:
            raise RuntimeError(
                f"Expected {expected_checkpoint_count} checkpoints, found {len(checkpoint_blobs)}"
            )

        checkpoint_paths = []
        downloaded_bytes = 0
        for index, blob in enumerate(checkpoint_blobs):
            checkpoint_path = os.path.join(temporary_directory, f"chunk_{index:04d}.mp4")
            blob.download_to_filename(checkpoint_path, timeout=900)
            checkpoint_paths.append(checkpoint_path)
            downloaded_bytes += os.path.getsize(checkpoint_path)
            job_ref.set(
                {
                    "stage": "downloading_saved_checkpoints",
                    "progress": 89 + int(round(4 * (index + 1) / expected_checkpoint_count)),
                    "detail": (
                        f"Downloaded {index + 1}/{expected_checkpoint_count} saved checkpoints "
                        f"({downloaded_bytes / (1024 ** 3):.2f} GiB)"
                    ),
                    "updatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                },
                merge=True,
            )

        concat_list_path = os.path.join(temporary_directory, "checkpoints.txt")
        with open(concat_list_path, "w", encoding="utf-8") as concat_file:
            for checkpoint_path in checkpoint_paths:
                concat_file.write(f"file '{checkpoint_path}'\n")

        video_only_path = os.path.join(temporary_directory, "video-only.mp4")
        job_ref.set(
            {
                "stage": "stitching_saved_checkpoints",
                "progress": 94,
                "detail": f"Stream-copy stitching {expected_checkpoint_count} verified checkpoints",
                "updatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            },
            merge=True,
        )
        run(
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                concat_list_path,
                "-c",
                "copy",
                "-movflags",
                "+faststart",
                "-y",
                video_only_path,
            ]
        )
        validate_video(video_only_path, expected_duration, require_audio=False)
        for checkpoint_path in checkpoint_paths:
            os.remove(checkpoint_path)

        output_path = os.path.join(temporary_directory, "recovered-master.mp4")
        job_ref.set(
            {
                "stage": "muxing_recovered_master",
                "progress": 96,
                "detail": "Attaching the prepared clean-audio master",
                "updatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            },
            merge=True,
        )
        run(
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                video_only_path,
                "-i",
                audio_aac_path,
                "-map",
                "0:v:0",
                "-map",
                "1:a:0",
                "-c",
                "copy",
                "-shortest",
                "-movflags",
                "+faststart",
                "-y",
                output_path,
            ]
        )
        validation = validate_video(output_path, expected_duration, require_audio=True)

        download_token = str(uuid.uuid4())
        output_blob = bucket.blob(output_object)
        output_blob.metadata = {
            "firebaseStorageDownloadTokens": download_token,
            "autopromotePurpose": "multicam_master",
            "autopromoteJobId": job_id,
            "recoveredFromCheckpoints": "true",
        }
        output_blob.cache_control = "private, max-age=3600"
        job_ref.set(
            {
                "stage": "uploading_recovered_master",
                "progress": 98,
                "detail": "Uploading the recovered final MP4",
                "updatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            },
            merge=True,
        )
        output_blob.upload_from_filename(output_path, content_type="video/mp4", timeout=1800)
        output_url = firebase_download_url(bucket_name, output_object, download_token)
        completed_at = datetime.datetime.now(datetime.timezone.utc)
        expires_at = completed_at + datetime.timedelta(days=7)
        result = {
            "status": "completed",
            "url": output_url,
            "output_url": output_url,
            "output_storage_path": output_object,
            "duration": validation["duration"],
            "render_tier": "premium",
            "recovered_from_checkpoints": True,
        }
        job_ref.set(
            {
                "status": "completed",
                "stage": "completed",
                "progress": 100,
                "detail": "Multi-camera master recovered from verified checkpoints",
                "result": result,
                "outputUrl": output_url,
                "outputStoragePath": output_object,
                "storagePath": output_object,
                "expiresAt": expires_at.isoformat(),
                "completedAt": completed_at.isoformat(),
                "updatedAt": completed_at.isoformat(),
                "renderCheckpoint": {
                    **(job.get("renderCheckpoint") or {}),
                    "status": "completed",
                    "stage": "completed",
                    "recovered": True,
                    "cleanup_policy": "deleted_after_recovery",
                },
            },
            merge=True,
        )
        release_capacity(db, job_id)

        for blob in bucket.list_blobs(prefix=checkpoint_prefix):
            blob.delete()
        print(json.dumps({"status": "completed", "jobId": job_id, "output": output_object}))
    finally:
        shutil.rmtree(temporary_directory, ignore_errors=True)


if __name__ == "__main__":
    main()
