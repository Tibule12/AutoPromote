#!/usr/bin/env python3
"""Invoke the existing CPU worker, with real source bytes and no cloud access."""
import asyncio
import hashlib
import json
import os
from pathlib import Path
import resource
import shutil
import socket
import sys
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
record = json.loads(Path(sys.argv[1]).read_text())
directory = Path(record["directory"])
started = time.monotonic()
if os.environ.get("UNIFIED_CREDITS_PROJECT_ID") != "demo-autopromote-credits":
    raise RuntimeError("Explicit demo runtime required")
cpu_seconds = record.get(
    "localCpuSeconds", 240 if record["expected"]["endpoint"] == "/analyze-clips" else 120
)
long_review = record.get('localReview') is True
if long_review:
    ranges = record['body'].get('timeline_segments') or [record['body']]
    durations = [float(item['end_time']) - float(item['start_time']) for item in ranges]
    if (os.environ.get('STUDIO_BACKGROUND_DEMO') != 'true' or
            os.environ.get('STUDIO_BACKGROUND_LONG_DEMO') != 'true' or
            record['expected']['endpoint'] not in ('/render-viral-clip','/render-clip') or
            not durations or any(not 0 < d <= 240 for d in durations) or not sum(durations) <= 240 or
            cpu_seconds != 900 or record.get('localFileBytes') != 512 * 1024**2 or
            record.get('localSourceBytes') != 512 * 1024**2):
        raise RuntimeError('Invalid bounded local four-minute review')
if not isinstance(cpu_seconds, int) or not 30 <= cpu_seconds <= (900 if long_review else 300):
    raise RuntimeError("Invalid local CPU ceiling")
if not long_review and record["expected"]["endpoint"] != "/analyze-clips" and cpu_seconds != 120:
    raise RuntimeError("Render CPU ceiling must remain unchanged")
resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds))
# The bounded short subject demo now retains lossless sequence intermediates.
# A six-second concat can exceed the old 20 MiB per-file ceiling even though
# the final movie is small. Keep this allowance local and limited to <=10s;
# production settings and the existing 120-second render CPU ceiling stay put.
short_subject_sequence = (
    record["expected"]["endpoint"] == "/render-viral-clip"
    and bool(record.get("body", {}).get("subjectVfx"))
    and 0 < sum(float(s["end_time"]) - float(s["start_time"])
                for s in record["body"].get("timeline_segments", [])) <= 10
)
file_limit = record['localFileBytes'] if long_review else (64 if short_subject_sequence else 20) * 1024**2
resource.setrlimit(resource.RLIMIT_FSIZE, (file_limit, file_limit))
connect = socket.socket.connect


def local_connect(self, address):
    if isinstance(address, tuple) and address[0] not in ("127.0.0.1", "localhost", "::1"):
        raise RuntimeError("Paid/external network execution is disabled")
    return connect(self, address)


socket.socket.connect = local_connect
import firebase_admin
from firebase_admin import credentials
from google.auth.credentials import AnonymousCredentials


class EmulatorCredential(credentials.Base):
    def get_credential(self):
        return AnonymousCredentials()


firebase_admin.initialize_app(EmulatorCredential(), {
    "projectId": "demo-autopromote-credits", "storageBucket": "demo-autopromote-credits",
})
import python_media_worker.main_media_server as worker


async def materialize(url, target, *args, **kwargs):
    parsed = __import__("urllib.parse", fromlist=["urlparse"]).urlparse(url)
    approved = next((source for source in record["expected"]["sources"] if source["gatewayPath"] == parsed.path), None)
    if not approved or f"{parsed.scheme}://{parsed.netloc}" != record["apiOrigin"]:
        raise ValueError("Unapproved worker source")
    with urllib.request.urlopen(url, timeout=15) as response:
        data = response.read((record['localSourceBytes'] if long_review else 50 * 1024**2) + 1)
    if len(data) != approved["size"] or hashlib.sha256(data).hexdigest() != approved["contentHash"]:
        raise ValueError("Source generation/hash changed")
    Path(target).parent.mkdir(parents=True, exist_ok=True)
    Path(target).write_bytes(data)
    return target


worker.materialize_video_input = materialize
if os.environ.get('STUDIO_BACKGROUND_DEMO')=='true':
    import python_media_worker.studio_subject_vfx_export as subject_export
    from urllib.parse import urlparse,parse_qs
    validate_subjects=subject_export.validate_resolved_subject_vfx
    def owned_subject_access(url,item):
        parsed=urlparse(url)
        if f'{parsed.scheme}://{parsed.netloc}'!=record['apiOrigin'] or not parsed.path.startswith('/api/credit-pilot/object/'):
            raise ValueError('Owned demo subject URL required')
        payload=parse_qs(parsed.query).get('cap',[''])[0].split('.')[0]
        import base64
        data=json.loads(base64.urlsafe_b64decode(payload+'='*((-len(payload))%4)))
        if data['userId']!=item['ownerUid'] or data['storagePath']!=f"temp_studio_vfx/{item['ownerUid']}/{item['jobId']}/render.mp4" or data['contentHash']!=item['sha256']:
            raise ValueError('Reviewed subject ownership changed')
    subject_export.validate_resolved_subject_vfx=lambda items:validate_subjects(items,access_validator=owned_subject_access)

# Progress is telemetry only. The canonical API publishes completed job state
# after verified bytes reach private storage, not a worker's placeholder URI.
def process_telemetry(job_id, data, **kwargs):
    (directory / "progress.json").write_text(json.dumps({"jobId": job_id, "progress": data}, default=str))
    return True
worker.update_firestore_job = process_telemetry
# The canonical renderer still runs. Its transport returns a local artifact URI;
# the Node service verifies/copies real bytes into the private Storage emulator.
uploaded = []
def local_artifact(local_path, destination_path=None):
    # Canonical worker cleanup may remove its temporary output on return.
    retained = directory / ("retained-" + str(len(uploaded)) + Path(local_path).suffix)
    shutil.copyfile(local_path, retained)
    uploaded.append(str(retained))
    return "http://127.0.0.1/local-worker-output"
worker.upload_file_to_firebase = local_artifact


async def run():
    body = record["body"]
    endpoint = record["expected"]["endpoint"]
    if endpoint == "/render-viral-clip":
        return await worker.render_viral_clip(worker.RenderViralRequest(**body))
    if endpoint == "/render-clip":
        return await worker.render_clip(worker.RenderClipRequest(**body))
    if endpoint == "/analyze-clips":
        return await worker.analyze_clips(body)
    if endpoint == "/process":
        body["async_mode"] = False
        return await worker.run_pipeline_impl(worker.VideoProcessRequest(**body))
    if endpoint == "/dispatch":
        target = directory / "delivered-source.mp4"
        await materialize(body["sourceUrl"], target)
        (directory / "local-destination.json").write_text(json.dumps(body))
        return {"success": True, "deliveryMode": "local-simulated-destination", "bytes": target.stat().st_size}
    raise ValueError("Unsupported local worker endpoint")


try:
    result = asyncio.run(run())
    if not isinstance(result, dict):
        raise ValueError("Canonical worker returned an invalid result")
    if uploaded and not result.get("output_path"):
        videos = [name for name in uploaded if name.endswith(".mp4")]
        if videos: result["output_path"] = videos[-1]
    if os.environ.get("CREDITS_FAIL_AFTER_RENDER") == "1":
        raise RuntimeError("Controlled late process failure after actual CPU execution")
    (directory / "result.json").write_text(json.dumps(result, default=str))
finally:
    usage = resource.getrusage(resource.RUSAGE_SELF)
    children = resource.getrusage(resource.RUSAGE_CHILDREN)
    (directory / "resource.json").write_text(json.dumps({
        "wallSeconds": time.monotonic() - started,
        "cpuSeconds": usage.ru_utime + usage.ru_stime + children.ru_utime + children.ru_stime,
        "peakRssKiB": max(usage.ru_maxrss, children.ru_maxrss),
        "cpuCeilingSeconds": cpu_seconds,
        "localFileCeilingBytes": file_limit,
        "providerChargesStarted": False, "invoiceCostMicros": None,
    }))
