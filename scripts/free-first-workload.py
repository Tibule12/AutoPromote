#!/usr/bin/env python3
"""Measure the canonical production algorithms on owned local media, offline.

Transport/storage/status are local only. Rendering, speech models, synchronization,
quality gates and delivery algorithms are unchanged. This is worker qualification,
not evidence of an ordinary signed-in Studio interaction or provider publication.
"""
import argparse
import asyncio
import hashlib
import json
import os
from pathlib import Path
import resource
import shutil
import socket
import subprocess
import sys
import threading
import time

parser = argparse.ArgumentParser()
parser.add_argument("mode", choices=["render", "find", "captions", "multicam", "ingest"])
parser.add_argument("--input", required=True)
parser.add_argument("--output-dir", required=True)
parser.add_argument("--seconds", type=float, default=60)
parser.add_argument("--threads", type=int, choices=[2, 4], default=2)
parser.add_argument("--baseline", action="store_true")
parser.add_argument("--camera2")
parser.add_argument("--audio")
parser.add_argument("--effects", action="store_true")
parser.add_argument("--language", default="auto")
parser.add_argument("--request-file", help="Replay an owned native request with only local transport substituted")
parser.add_argument("--cam-max-edge",type=int,choices=[1280,1920],default=1280)
args = parser.parse_args()
repo = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(repo))
# Reuse already installed, offline speech dependencies. No package/model download.
for extra in [Path.home()/".cache/autopromote-caption-runtime/venv/lib/python3.12/site-packages",
              Path("/usr/lib/python3/dist-packages"),
              Path.home()/".local/lib/python3.12/site-packages"]:
    if extra.is_dir(): sys.path.append(str(extra))
out = Path(args.output_dir).resolve()
out.mkdir(parents=True, exist_ok=False)
source = Path(args.input).resolve()
if not source.is_file() or not 0 < args.seconds <= 180:
    raise ValueError("Owned source and bounded 1–180s workload required")
if repo/'tmp' not in source.parents:
    # Bind an explicitly supplied existing local artifact into the worker's
    # development-only media root. Never relax its production URL/path checks.
    digest=hashlib.file_digest(source.open('rb'),'sha256').hexdigest()
    inputs=repo/'tmp/free-first-workload-inputs';inputs.mkdir(mode=0o700,parents=True,exist_ok=True)
    bound=inputs/(digest+source.suffix)
    if not bound.exists(): os.link(source,bound)
    source=bound
allowed = sorted(os.sched_getaffinity(0))[:args.threads]
os.sched_setaffinity(0, allowed)
resource.setrlimit(resource.RLIMIT_CPU, (1800, 1800))
resource.setrlimit(resource.RLIMIT_FSIZE, (512*1024**2, 512*1024**2))
os.environ.update({
    "NODE_ENV": "test", "HF_HUB_OFFLINE": "1", "TRANSFORMERS_OFFLINE": "1",
    "OPENAI_API_KEY": "", "OPENAI_KEY": "", "VIRAL_CAPTION_TRANSCRIPTION_PROVIDER": "local",
    "FIREBASE_STATUS_UPDATES_ENABLED": "false", "MULTICAM_UPLOAD_FIREBASE": "false",
    "VIDEO_ENCODER": "libx264", "WHISPER_ENGINE": "faster", "WHISPER_DEVICE": "cpu",
    "FASTER_WHISPER_DEVICE": "cpu", "FASTER_WHISPER_COMPUTE_TYPE": "int8",
    "FASTER_WHISPER_STRICT": "true", "FASTER_WHISPER_CPU_THREADS": str(args.threads),
    "OMP_NUM_THREADS": str(args.threads), "OPENBLAS_NUM_THREADS": str(args.threads),
    "MULTICAM_X264_THREADS": str(args.threads), "MEDIA_WORKER_STUDIO_FFMPEG_THREADS": str(args.threads),
    "PROCESSING_RESULT_CACHE_ENABLED": "false" if args.baseline else "true",
    "PROCESSING_RESULT_CACHE_DIR": str(out.parent / "inference-cache"),
    "MULTICAM_CFR_CACHE_DIR":str(out/"cfr-cache"),
    "MULTICAM_RECEIPT_CACHE_DIR":str(out/"receipt-cache"),
    "MULTICAM_AUDIO_ANALYSIS_CACHE_DIR":str(out/"audio-cache"),
    "LOCAL_MEDIA_JOB_CACHE_DIR":str(out/"media-cache"),
    "MULTICAM_CFR_MAX_LONG_EDGE":str(args.cam_max_edge),
})
for name, model_id in [("VIRAL_CAPTION_GENERAL_WHISPER_MODEL", "deepdml--faster-whisper-large-v3-turbo-ct2"),
                       ("VIRAL_CAPTION_SOUTH_AFRICAN_WHISPER_MODEL", "digiphyte--swivuriso-turbo")]:
    snapshots = Path.home()/".cache/huggingface/hub"/("models--"+model_id)/"snapshots"
    cached = sorted(p for p in snapshots.glob("*") if (p/"model.bin").exists())
    if not cached: raise RuntimeError("Required full-quality model is not cached locally")
    os.environ[name] = str(cached[-1])
original_connect = socket.socket.connect
def local_connect(self, address):
    if isinstance(address, tuple) and address[0] not in {"127.0.0.1", "localhost", "::1"}:
        raise RuntimeError("External network and paid execution are disabled")
    return original_connect(self, address)
socket.socket.connect = local_connect
import firebase_admin
from firebase_admin import credentials
from google.auth.credentials import AnonymousCredentials
class EmulatorCredential(credentials.Base):
    def get_credential(self): return AnonymousCredentials()
firebase_admin.initialize_app(EmulatorCredential(), {"projectId": "demo-autopromote-credits", "storageBucket": "demo-autopromote-credits"})

# Observe the entire owned process tree, including simultaneous FFmpeg children.
done = threading.Event()
resources = {"sampledTreePeakRssBytes": 0}
def sample():
    while not done.wait(.1):
        entries = {}
        for item in Path("/proc").glob("[0-9]*/stat"):
            try:
                fields = item.read_text().split(") ", 1)[1].split()
                entries[int(item.parent.name)] = (int(fields[1]), max(0, int(fields[21])) * os.sysconf("SC_PAGE_SIZE"))
            except (OSError, ValueError, IndexError): pass
        descendants = {os.getpid()}
        for _ in range(8):
            added = {pid for pid, (parent, _) in entries.items() if parent in descendants}
            if added.issubset(descendants): break
            descendants.update(added)
        resources["sampledTreePeakRssBytes"] = max(resources["sampledTreePeakRssBytes"],
            sum(entries.get(pid, (0, 0))[1] for pid in descendants))
threading.Thread(target=sample, daemon=True).start()
started = time.monotonic()
from python_media_worker import main_media_server as worker
if args.baseline:
    from python_media_worker import studio_finish_reuse
    studio_finish_reuse.can_fuse_neutral_finish = lambda *_args, **_kwargs: False
    def legacy_black_canvas(input_label,width,height,output_label,blur=24):
        return (f"[{input_label}]scale={width}:{height}:force_original_aspect_ratio=increase,"
                f"crop={width}:{height},drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill,"
                f"setsar=1[{output_label}]")
    worker.multicam_card_canvas_filter=legacy_black_canvas
worker.update_firestore_job = lambda *_args, **_kwargs: True
worker.FIREBASE_STATUS_UPDATES_ENABLED = False
uploaded = []
def retain(path, destination_path=None):
    target = out / ("artifact-" + str(len(uploaded)) + Path(path).suffix)
    shutil.copyfile(path, target)
    uploaded.append(target)
    return target.as_uri()
worker.upload_file_to_firebase = retain

stages = []
canonical_run = worker.run_subprocess_async
async def traced(command, *positional, **kwargs):
    before = time.monotonic()
    try: return await canonical_run(command, *positional, **kwargs)
    finally:
        stages.append({"program": Path(str(command[0])).name,
                       "output": Path(str(command[-1])).name,
                       "wallSeconds": round(time.monotonic()-before, 4)})
worker.run_subprocess_async = traced

async def run():
    if args.mode == "ingest":
        raw = await worker.materialize_video_input(str(source), str(out/"ingest.mp4"),
            keep_audio=True, preserve_source_bytes=not args.baseline)
        await worker.create_promo_analysis_copy(raw, str(out/"analysis.mp4"))
        return {"sourceBytes": source.stat().st_size, "proxyBytes": (out/"analysis.mp4").stat().st_size,
                "fullSizeEncodeEliminated": not args.baseline}
    if args.mode == "captions":
        result = worker.transcribe_captions_with_provider(str(source), source_language=args.language)
        # Repeat exactly once to measure an actual inference cache hit, without
        # changing language/model/word-time quality or inventing a transcript.
        before = time.monotonic()
        again = worker.transcribe_captions_with_provider(str(source), source_language=args.language) if not args.baseline else None
        if again is not None and result != again: raise RuntimeError("Cached word timings changed")
        return {"transcript": result, "warmRepeatSeconds": time.monotonic()-before if again is not None else None}
    if args.mode == "find":
        analysis = await worker.analyze_clips({"video_url": str(source), "selection_settings": {"targetDuration": 30}})
        suggestions = analysis.get("clipSuggestions") or []
        if not suggestions: raise RuntimeError("No source-bound moments were found")
        chosen = suggestions[0]
        export = await worker.render_clip(worker.RenderClipRequest(video_url=str(source),
            start_time=float(chosen["start"]),end_time=float(chosen["end"]),target_aspect_ratio="16:9"))
        return {"analysis":analysis,"selectedMoment":chosen,"export":export}
    if args.mode == "multicam":
        if not args.camera2 or not args.audio: raise ValueError("Two actual input streams and external audio required")
        body = {"sources": [{"id":"cam1","url":str(source),"offset_seconds":0},
                            {"id":"cam2","url":str(Path(args.camera2).resolve()),"offset_seconds":0}],
                "segments":[{"camera_id":"cam1","timeline_start":0,"timeline_end":args.seconds/2,
                             "source_start":0,"source_end":args.seconds/2},
                            {"camera_id":"cam2","timeline_start":args.seconds/2,"timeline_end":args.seconds,
                             "source_start":args.seconds/2,"source_end":args.seconds}],
                "external_audio_url":str(Path(args.audio).resolve()),"external_audio_mix_mode":"external_only",
                "overlap_duration":args.seconds,"timeline_start":0,"output_aspect_ratio":"16:9",
                "burn_captions":False,"brand_watermark":False,"generate_thumbnail":False,
                "auto_switch":False,"async_mode":False}
        (out/"request.json").write_text(json.dumps(body,indent=2))
        return await worker.render_multicam_impl(worker.RenderMultiCamRequest(**body), propagate_errors=True)
    body = {"video_url":str(source),"start_time":0,"end_time":args.seconds,
            "auto_captions":False,"brand_watermark":False,"smart_crop":False,
            "output_settings":{"resolution":"1080p","fps":30},"async_mode":False}
    if args.request_file:
        saved=json.loads(Path(args.request_file).read_text())
        body=saved.get("body",saved)
        def replace_transport(value):
            if isinstance(value,dict): return {k:replace_transport(v) for k,v in value.items()}
            if isinstance(value,list): return [replace_transport(v) for v in value]
            if isinstance(value,str) and value.startswith("http://127.0.0.1:") and "/api/credit-pilot/object/" in value:
                return str(source)
            return value
        body=replace_transport(body)
        body.update(video_url=str(source),async_mode=False)
    if args.effects:
        body["creative_plan"] = {"version":1,"enabled":True,"intensity":"clean","effects":[
            {"id":"motion-echo","preset":"beat_echo","start_time":10,"end_time":14,"intensity":"clean"}]}
        # Ordinary canonical text motion, using the same exported layer schema.
        if body.get('overlays') and body.get('composition_plan'):
            title=body['overlays'][0];title.update(text='Same tools. More creativity.',duration=8)
            layer=next(l for l in body['composition_plan']['layers'] if str(l['id'])==str(title['id']))
            layer['motion_keyframes']=[{'property':'x','time':0,'value':50,'easing':'ease_in_out'},
                {'property':'x','time':4,'value':65,'easing':'ease_in_out'},
                {'property':'x','time':8,'value':50,'easing':'ease_in_out'}]
    (out/"request.json").write_text(json.dumps(body,indent=2))
    return await worker.render_viral_clip_impl(worker.RenderViralRequest(**body))

status = "failed"
try:
    result = asyncio.run(run())
    (out/"result.json").write_text(json.dumps(result,indent=2,default=str))
    if result is None or isinstance(result, dict) and result.get("status") == "failed":
        raise RuntimeError("Canonical workflow did not complete")
    if not uploaded and isinstance(result,dict) and result.get('output_path'):
        local_output=Path(result['output_path']).resolve()
        if not local_output.is_file() and result.get('local_output_url'):
            from urllib.parse import urlparse
            local_output=Path(worker.resolve_local_output_path(Path(urlparse(result['local_output_url']).path).name))
        if local_output.is_file() and local_output.suffix=='.mp4' and repo/'tmp' in local_output.parents:
            retain(local_output)
    if args.mode in ['render','find','multicam'] and not uploaded:
        raise RuntimeError('Completed movie artifact was not retained')
    status = "completed"
finally:
    elapsed = time.monotonic()-started
    usage = resource.getrusage(resource.RUSAGE_SELF)
    children = resource.getrusage(resource.RUSAGE_CHILDREN)
    resources.update({"status":status,"wallSecondsIncludingImport":elapsed,
        "cpuSeconds":usage.ru_utime+usage.ru_stime+children.ru_utime+children.ru_stime,
        "largestProcessPeakRssKiB":max(usage.ru_maxrss,children.ru_maxrss),
        "cpuAffinity":allowed,"threads":args.threads,"providerChargesStarted":False,
        "actualCloudExpenditureUsd":0,"invoiceAttributedHistoricalCostUsd":None,
        "sourceBytes":source.stat().st_size,"sourceSha256":hashlib.file_digest(source.open('rb'),'sha256').hexdigest(),
        "stages":stages,"mode":args.mode,"baseline":args.baseline})
    if args.mode=='multicam':resources['camSourceMaxLongEdge']=args.cam_max_edge
    resources["workerSourceSha256"] = hashlib.file_digest((repo/"python_media_worker/main_media_server.py").open('rb'),'sha256').hexdigest()
    done.set()
    (out/"resources.json").write_text(json.dumps(resources,indent=2))

# Independent validation is excluded from the processing resource measurement.
for artifact in uploaded:
    if artifact.suffix == ".mp4":
        subprocess.run(["ffmpeg","-v","error","-i",str(artifact),"-f","null","-"],check=True,timeout=180)
        probe = json.loads(subprocess.check_output(["ffprobe","-v","error","-show_entries",
            "format=duration,size:stream=codec_name,width,height,r_frame_rate,channels,sample_rate", "-of","json",str(artifact)]))
        (out/(artifact.stem+"-proof.json")).write_text(json.dumps({"fullDecodePassed":True,"probe":probe,
            "sha256":hashlib.file_digest(artifact.open('rb'),'sha256').hexdigest()},indent=2))
print(json.dumps({"mode":args.mode,"status":status,"wallSeconds":round(elapsed,3),"output":str(out)}))
