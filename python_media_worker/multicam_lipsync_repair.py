"""Repair legacy checkpoint frame-rounding drift without rerendering cameras."""

import json
import math
import os
import subprocess
import tempfile
import uuid
from urllib.parse import quote

import firebase_admin
from firebase_admin import firestore, storage


FPS = 30


def run(command):
    print("RUN", " ".join(command[:8]), flush=True)
    subprocess.run(command, check=True)


def segment_packet_duration(start, end):
    duration = max(0.0, float(end) - float(start))
    return math.ceil((duration * FPS) - 1e-7) / FPS


def build_pts_chunks(plan):
    timing_chunks = []
    for chunk in plan.get("chunks") or []:
        chunk_start = float(chunk["start"])
        physical = chunk_start
        chunk_end = float(chunk["end"])
        intervals = []
        for segment in chunk.get("segments") or []:
            logical_start = float(segment["timeline_start"])
            logical_end = float(segment["timeline_end"])
            packet_end = min(
                chunk_end,
                physical + segment_packet_duration(logical_start, logical_end),
            )
            if packet_end > physical + 1e-7:
                # Each checkpoint is processed with timestamps reset to zero.
                shift = (physical - chunk_start) - (logical_start - chunk_start)
                if intervals and abs(intervals[-1][1] - shift) < 1e-7:
                    intervals[-1] = (packet_end - chunk_start, shift)
                else:
                    intervals.append((packet_end - chunk_start, shift))
            physical += segment_packet_duration(logical_start, logical_end)
            if physical >= chunk_end - 1e-7:
                break
        if intervals:
            timing_chunks.append(
                {
                    "index": int(chunk["index"]),
                    "start": chunk_start,
                    "duration": float(chunk["duration"]),
                    "intervals": intervals,
                }
            )
    if not timing_chunks:
        raise RuntimeError("Checkpoint plan contains no video timing intervals")
    return timing_chunks


def setts_expression(intervals):
    def shifted(shift):
        return "PTS" if abs(shift) < 1e-9 else f"PTS-({shift:.9f}/TB)"

    expression = shifted(intervals[-1][1])
    for end, shift in reversed(intervals[:-1]):
        expression = (
            f"if(lt(PTS*TB\\,{end:.9f})\\,{shifted(shift)}\\,{expression})"
        )
    return expression


def probe(path):
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration,start_time:stream=index,codec_type,codec_name,start_time,duration",
            "-of",
            "json",
            path,
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def firebase_url(bucket_name, object_name, token):
    return (
        f"https://firebasestorage.googleapis.com/v0/b/{bucket_name}/o/"
        f"{quote(object_name, safe='')}?alt=media&token={token}"
    )


def main():
    job_id = os.environ["MULTICAM_JOB_ID"]
    bucket_name = os.environ.get(
        "FIREBASE_STORAGE_BUCKET",
        "autopromote-cc6d3.firebasestorage.app",
    )
    if not firebase_admin._apps:
        firebase_admin.initialize_app(options={"storageBucket": bucket_name})
    db = firestore.client()
    bucket = storage.bucket(bucket_name)
    job_ref = db.collection("video_edits").document(job_id)
    job = job_ref.get().to_dict() or {}
    checkpoint = job.get("renderCheckpoint") or {}
    plan_path = checkpoint.get("planStoragePath")
    result = job.get("result") or {}
    input_path = result.get("output_storage_path")
    if not plan_path or not input_path:
        raise RuntimeError("Job is missing its checkpoint plan or recovered master")

    plan = json.loads(bucket.blob(plan_path).download_as_bytes())
    timing_chunks = build_pts_chunks(plan)
    maximum_shift = max(
        abs(item[1])
        for chunk in timing_chunks
        for item in chunk["intervals"]
    )
    print(
        json.dumps(
            {
                "stage": "timing_contract_loaded",
                "interval_count": sum(len(chunk["intervals"]) for chunk in timing_chunks),
                "maximum_accumulated_shift_seconds": round(maximum_shift, 6),
            }
        ),
        flush=True,
    )
    if maximum_shift < 0.02:
        raise RuntimeError("Master does not contain legacy cumulative frame drift")

    with tempfile.TemporaryDirectory(prefix="multicam-lipsync-") as temp_dir:
        local_input = os.path.join(temp_dir, "legacy-master.mp4")
        local_output = os.path.join(temp_dir, "sync-repaired-master.mp4")
        bucket.blob(input_path).download_to_filename(local_input, timeout=1800)
        repaired_video_parts = []
        for chunk in timing_chunks:
            chunk_path = os.path.join(temp_dir, f"video-{chunk['index']:04d}.mp4")
            expression = setts_expression(chunk["intervals"])
            run(
                [
                    "ffmpeg",
                    "-hide_banner",
                    "-loglevel",
                    "warning",
                    "-ss",
                    f"{chunk['start']:.6f}",
                    "-i",
                    local_input,
                    "-t",
                    f"{chunk['duration']:.6f}",
                    "-map",
                    "0:v:0",
                    "-an",
                    "-c",
                    "copy",
                    "-bsf:v",
                    f"setts=pts={expression}:dts={expression}",
                    "-y",
                    chunk_path,
                ]
            )
            repaired_video_parts.append((chunk_path, chunk["duration"]))

        concat_path = os.path.join(temp_dir, "video-parts.txt")
        video_only_path = os.path.join(temp_dir, "sync-repaired-video.mp4")
        with open(concat_path, "w", encoding="utf-8") as concat_file:
            for part_path, duration in repaired_video_parts:
                concat_file.write(f"file '{part_path}'\n")
                concat_file.write(f"duration {duration:.6f}\n")
        run(
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "warning",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                concat_path,
                "-map",
                "0:v:0",
                "-an",
                "-c",
                "copy",
                "-y",
                video_only_path,
            ]
        )
        run(
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "warning",
                "-i",
                video_only_path,
                "-i",
                local_input,
                "-map",
                "0:v:0",
                "-map",
                "1:a:0",
                "-c",
                "copy",
                "-y",
                local_output,
            ]
        )
        media = probe(local_output)
        streams = media.get("streams") or []
        if not any(item.get("codec_type") == "video" for item in streams):
            raise RuntimeError("Repaired master has no video stream")
        if not any(item.get("codec_type") == "audio" for item in streams):
            raise RuntimeError("Repaired master has no audio stream")
        duration = float((media.get("format") or {}).get("duration") or 0.0)
        expected = float(plan.get("duration") or 0.0)
        if abs(duration - expected) > 0.15:
            raise RuntimeError(
                f"Repaired duration mismatch: expected {expected:.6f}, got {duration:.6f}"
            )

        output_path = f"processed/multicam_{job_id}_sync_repaired.mp4"
        token = str(uuid.uuid4())
        output_blob = bucket.blob(output_path)
        output_blob.content_type = "video/mp4"
        output_blob.cache_control = "private, max-age=0, no-transform"
        output_blob.metadata = {
            "firebaseStorageDownloadTokens": token,
            "autopromotePurpose": "multicam_sync_repaired_master",
            "autopromoteJobId": job_id,
            "sourceObject": input_path,
            "maximumCorrectedDriftSeconds": f"{maximum_shift:.6f}",
        }
        output_blob.upload_from_filename(local_output, timeout=3600)
        output_blob.reload()
        url = firebase_url(bucket_name, output_path, token)
        repair_receipt = {
            "status": "completed",
            "method": "checkpoint_segment_pts_rewrite_v1",
            "source_storage_path": input_path,
            "output_storage_path": output_path,
            "maximum_corrected_drift_seconds": round(maximum_shift, 6),
            "interval_count": sum(len(chunk["intervals"]) for chunk in timing_chunks),
            "duration_seconds": duration,
            "bytes": int(output_blob.size or 0),
            "camera_rerendered": False,
            "credits_charged": 0,
        }
        job_ref.update(
            {
                "outputUrl": url,
                "videoUrl": url,
                "result.url": url,
                "result.output_url": url,
                "result.output_storage_path": output_path,
                "result.lip_sync_repaired": True,
                "result.lip_sync_repair": repair_receipt,
                "detail": "Completed; legacy checkpoint frame drift repaired",
                "lipSyncRepair": repair_receipt,
            }
        )
        print(json.dumps(repair_receipt), flush=True)


if __name__ == "__main__":
    main()
