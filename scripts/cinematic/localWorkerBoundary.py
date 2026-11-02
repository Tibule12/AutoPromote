"""Offline I/O boundary around the unchanged full Studio production renderer.

Use only in a stripped-environment subprocess. No application SDK, credential
file, .env loader, network ingestion, upload or database access is available.
"""
import asyncio
import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import sys
import types

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "python_media_worker")]


def denied(*args, **kwargs):
    raise RuntimeError("External access is disabled in the local Studio renderer")


def load_worker():
    dotenv = types.ModuleType("dotenv")
    dotenv.load_dotenv = lambda *args, **kwargs: False
    dotenv.dotenv_values = lambda *args, **kwargs: {}
    dotenv.find_dotenv = lambda *args, **kwargs: ""
    sys.modules["dotenv"] = dotenv
    firebase = types.ModuleType("firebase_admin")
    # Truthy sentinel skips the existing credential-file discovery branch.
    # This is a deny adapter, not an authenticated Firebase application.
    firebase._apps = {"local-access-denied": None}
    firebase.initialize_app = denied
    def module_attribute(name):
        if name.startswith("__"):
            raise AttributeError(name)
        return denied
    for name in ("credentials", "storage", "firestore", "auth"):
        module = types.ModuleType("firebase_admin." + name)
        module.__file__ = __file__
        module.__getattr__ = module_attribute
        setattr(firebase, name, module)
        sys.modules["firebase_admin." + name] = module
    sys.modules["firebase_admin"] = firebase
    original_connect = socket.socket.connect
    def connect(sock, address):
        if sock.family == socket.AF_UNIX:
            return original_connect(sock, address)
        return denied()
    socket.socket.connect = connect
    from python_media_worker import main_media_server as worker
    worker._detect_gpu_encoder = lambda: None
    worker.update_firestore_job = denied
    return worker


async def render(request_path, output_dir, source):
    output_dir = Path(output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    source = Path(source).resolve()
    payload = json.loads(Path(request_path).read_text())
    expected_hash = payload.pop("local_source_sha256")
    if hashlib.sha256(source.read_bytes()).hexdigest() != expected_hash:
        raise ValueError("Local source hash changed")
    allowed = {payload["video_url"], *(cut["url"] for cut in payload.get("timeline_segments", []))}
    if payload.get("add_music") or payload.get("subjectVfx") or payload.get("threeDGraphics"):
        raise ValueError("This offline boundary requires locally authored source/title/caption edits")
    if any(item.get("type") != "text" for item in payload.get("overlays", [])):
        raise ValueError("This offline boundary accepts native text layers only")
    worker = load_worker()
    async def ingest(url, destination, **kwargs):
        if url not in allowed:
            return denied()
        shutil.copyfile(source, destination)
        return destination
    def deliver(path, *args, **kwargs):
        suffix = Path(path).suffix.lower()
        target = output_dir / ("movie.mp4" if suffix == ".mp4" else "thumbnail" + suffix)
        if target.exists():
            raise ValueError("Retain prior delivery; use a fresh output directory")
        shutil.copyfile(path, target)
        return str(target)
    worker.materialize_video_input = ingest
    worker.upload_file_to_firebase = deliver
    request = worker.RenderViralRequest(**payload)
    result = await worker.render_viral_clip(request)
    (output_dir / "receipt.json").write_text(json.dumps(result, indent=2, default=str))
    print(json.dumps({"output": str(output_dir / "movie.mp4"), "receipt": str(output_dir / "receipt.json")}), flush=True)
    return result


if __name__ == "__main__":
    if sys.argv[1:] == ["--probe"]:
        worker = load_worker()
        print("Offline production Studio renderer loaded; external access denied", flush=True)
    else:
        if len(sys.argv) == 2:
            manifest = Path(sys.argv[1]).resolve()
            spec = json.loads(manifest.read_text())
            work = manifest.parent
            request = work / "request.json"
            request.write_text(json.dumps(spec["request"]))
            scratch = work / "scratch"
            scratch.mkdir(exist_ok=True)
            os.environ["MEDIA_WORKER_STUDIO_TMP_DIR"] = str(scratch)
            print(json.dumps({"status":"preparing","progress":0.05}),flush=True)
            result = asyncio.run(render(request, work, spec["sourcePath"]))
            receipt = {"version":1,"manifestId":spec["manifestId"],"kind":"studio_offline_programme",
                "duration":result["duration"],"workerReceipt":result,"documentHash":spec["documentHash"]}
            (work / "receipt.json").write_text(json.dumps(receipt,indent=2))
            print(json.dumps({"status":"completed","progress":1,"receipt":receipt}),flush=True)
        else:
            asyncio.run(render(*sys.argv[1:]))
