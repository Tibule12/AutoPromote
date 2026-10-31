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
execution_seconds = int(os.environ.get("CREDITS_DEMO_EXECUTION_SECONDS", "120"))
if not 1 <= execution_seconds <= 900:
    raise RuntimeError("Invalid local worker execution limit")
resource.setrlimit(resource.RLIMIT_CPU, (execution_seconds, execution_seconds))
resource.setrlimit(resource.RLIMIT_FSIZE, (20 * 1024**2, 20 * 1024**2))
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
        data = response.read(50 * 1024**2 + 1)
    if len(data) != approved["size"] or hashlib.sha256(data).hexdigest() != approved["contentHash"]:
        raise ValueError("Source generation/hash changed")
    Path(target).parent.mkdir(parents=True, exist_ok=True)
    Path(target).write_bytes(data)
    return target


worker.materialize_video_input = materialize
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
        "providerChargesStarted": False, "invoiceCostMicros": None,
    }))
