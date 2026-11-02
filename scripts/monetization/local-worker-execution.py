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
# Match the ordinary worker entrypoint's module directory for its deferred
# native compositors as well as imports performed during initial startup.
sys.path.insert(0, str(ROOT / 'python_media_worker'))
record = json.loads(Path(sys.argv[1]).read_text())
directory = Path(record["directory"])
started = time.monotonic()
if os.environ.get("UNIFIED_CREDITS_PROJECT_ID") != "demo-autopromote-credits":
    raise RuntimeError("Explicit demo runtime required")
cpu_seconds = record.get("localCpuSeconds", 240)
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

# Keep ten CPU minutes for ordinary demos. The measured minute-long masked
# graphics/3D stack exhausted that bound during final compositing; allow a
# finite twenty CPU minutes for that explicitly identified local combination.
# The provider's thirty-minute wall ceiling and production limits are unchanged.
def local_render_cpu_ceiling(body, env):
    default = 1200 if body.get('threeDGraphics') else 600
    value = env.get('CREDITS_LOCAL_RENDER_CPU_SECONDS', str(default))
    if not str(value).isdecimal() or not 600 <= int(value) <= 1200:
        raise ValueError('Local CPU rendering requires a finite 600–1200 second ceiling')
    return int(value)


is_analysis = record['expected']['endpoint'] == '/analyze-clips'
cpu_ceiling = cpu_seconds if long_review or is_analysis else local_render_cpu_ceiling(record.get('body', {}), os.environ)
if is_analysis and (not isinstance(cpu_ceiling, int) or not 30 <= cpu_ceiling <= 300):
    raise RuntimeError('Invalid local analysis CPU ceiling')
resource.setrlimit(resource.RLIMIT_CPU, (cpu_ceiling, cpu_ceiling))
# Native full-frame transparency intermediates can exceed a source MP4's size.
# Keep a finite per-file ceiling for this demo-only CPU process; production
# execution settings and the separately bounded source-download sizes do not
# inherit this local limit.
def local_render_file_ceiling(body, env):
    default = 750 if body.get('threeDGraphics') else 128
    value = env.get('CREDITS_LOCAL_RENDER_FILE_MIB', str(default))
    if not str(value).isdecimal() or not 128 <= int(value) <= 750:
        raise ValueError('Local render files require a finite 128–750 MiB ceiling')
    return int(value) * 1024**2


file_ceiling = record['localFileBytes'] if long_review else (20 * 1024**2 if is_analysis else local_render_file_ceiling(record.get('body', {}), os.environ))
resource.setrlimit(resource.RLIMIT_FSIZE, (file_ceiling, file_ceiling))
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
# Observe real intermediate timing before the canonical renderer removes its
# temporary files. This demo-only trace does not alter commands or validation.
canonical_subprocess = worker.run_subprocess_async
stage_timing = []
async def traced_subprocess(command, *args, **kwargs):
    result = await canonical_subprocess(command, *args, **kwargs)
    if command and str(command[0]).endswith("ffmpeg"):
        candidate = Path(str(command[-1]))
        if candidate.is_file() and candidate.suffix in (".mp4", ".ts", ".m4a"):
            stage_timing.append({"file": candidate.name, "media": worker.probe_media_stream_summary(str(candidate))})
            (directory / "stage-timing.json").write_text(json.dumps(stage_timing))
    return result
worker.run_subprocess_async = traced_subprocess
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
