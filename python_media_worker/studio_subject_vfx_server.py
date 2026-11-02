"""Authenticated single-job VFX worker with a persisted journal.

Run only inside a newly authorized GPU window. No automatic model downloads,
cloud credentials, job resubmission after restart, or CPU inference fallback.
The separately configured model_artifact_cpu mode reuses frozen masks through
the same protocol; it performs deterministic composition and never probes GPUs.
"""
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import threading
import time
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse

app=FastAPI()
lock=threading.Lock()
process_lock=threading.Lock()
processes={}

def cpu_mode():
    return os.environ.get("STUDIO_VFX_MODE")=="model_artifact_cpu"

def cpu_timeout():
    # Full-resolution source-guided matting can exceed the short preview
    # window. An explicit local CPU setting remains bounded and cannot alter
    # the separately authorized NVIDIA deadline.
    value=int(os.environ.get("STUDIO_VFX_CPU_TIMEOUT_SECONDS","1100"))
    if not 60<=value<=3600:raise ValueError("CPU composition timeout must be 60–3600 seconds")
    return value

def root():
    directory=Path(os.environ.get("STUDIO_VFX_JOB_ROOT","/data/studio-subject-vfx"))
    directory.mkdir(parents=True,exist_ok=True)
    return directory

def auth(request):
    secret=os.environ.get("STUDIO_MODEL_VFX_SECRET" if cpu_mode() else "STUDIO_NVIDIA_VFX_SECRET","")
    if len(secret)<32 or not hmac.compare_digest(request.headers.get("authorization",""),f"Bearer {secret}"):
        raise HTTPException(401,"Invalid worker authorization")

def remaining():
    try: return float(os.environ["NVIDIA_SERVICE_DEADLINE_EPOCH"])-time.time()
    except (KeyError,ValueError): return 0

def work(job_id):
    if not isinstance(job_id,str) or not re.fullmatch(r"[A-Za-z0-9_-]{8,128}",job_id): raise HTTPException(422,"Invalid job identity")
    return root()/job_id

def read(job_id):
    path=work(job_id)/"state.json"
    if not path.exists(): raise HTTPException(404,"Render not found")
    return json.loads(path.read_text())

def save(directory,state):
    path=directory/"state.json"
    temporary=directory/"state.json.new"
    temporary.write_text(json.dumps(state,indent=2)); os.chmod(temporary,0o600); temporary.replace(path)

def stop(process):
    if process.poll() is None:
        try: os.killpg(process.pid,signal.SIGTERM)
        except ProcessLookupError: return
        try: process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            try: os.killpg(process.pid,signal.SIGKILL)
            except ProcessLookupError: pass
            process.wait()

def gpu_available():
    expected=os.environ.get("STUDIO_VFX_EXPECTED_GPU","NVIDIA L40S")
    try:
        inventory=subprocess.run(["nvidia-smi","--query-gpu=name","--format=csv,noheader"],capture_output=True,text=True,check=True,timeout=10).stdout
        active=subprocess.run(["nvidia-smi","--query-compute-apps=pid","--format=csv,noheader,nounits"],capture_output=True,text=True,check=True,timeout=10).stdout.strip()
        return expected in inventory and not active
    except (OSError,subprocess.SubprocessError): return False

def run_job(job_id):
    directory=work(job_id)
    process=None
    try:
        with process_lock:
            state=read(job_id)
            if state["status"]=="cancelled": return
            if not cpu_mode() and remaining()<60: raise RuntimeError("Authorized NVIDIA window has ended")
            state["status"]="processing"; save(directory,state)
            log=(directory/"render.log").open("wb")
            script="studio_model_subject_vfx_job.py" if cpu_mode() else "studio_subject_vfx_job.py"
            process=subprocess.Popen([sys.executable,str(Path(__file__).with_name(script)),"--spec",str(directory/"spec.json")],stdout=log,stderr=log,start_new_session=True)
            processes[job_id]=process
        try:
            process.wait(timeout=cpu_timeout() if cpu_mode() else min(1100,max(1,remaining()-15)))
        except subprocess.TimeoutExpired:
            stop(process); raise RuntimeError("CPU composition timed out" if cpu_mode() else "Render stopped before its NVIDIA deadline")
        finally: log.close()
        with process_lock:
            state=read(job_id)
            if state["status"]=="cancelled": return
            if process.returncode: raise RuntimeError("Subject render failed; inspect render.log. Camera cuts require additional subject points.")
            receipt=json.loads((directory/"result.json").read_text())
            state.update(status="completed",receipt=receipt);save(directory,state)
    except Exception as exc:
        if process is not None: stop(process)
        with process_lock:
            state=read(job_id)
            if state["status"]!="cancelled": state.update(status="failed",error=str(exc)[:600]);save(directory,state)
    finally:
        with process_lock: processes.pop(job_id,None)
        lock.release()

@app.on_event("startup")
def reconcile_restart():
    for path in root().glob("*/state.json"):
        state=json.loads(path.read_text())
        if state["status"] in ("queued","processing"):
            state.update(status="failed",error="Worker restarted. This render was not submitted again.");save(path.parent,state)

@app.get("/health")
def health(request:Request):
    auth(request)
    if cpu_mode():return {"provider":"deterministic_cpu","available":not lock.locked(),"gpuCount":0}
    return {"provider":"nvidia","available":remaining()>60 and not lock.locked() and gpu_available(),"secondsRemaining":max(0,remaining())}

@app.post("/jobs",status_code=202)
async def create(request:Request):
    auth(request)
    body=await request.body()
    if len(body)>(256*1024 if cpu_mode() else 32000): raise HTTPException(413,"Subject spec too large")
    try: spec=json.loads(body)
    except ValueError: raise HTTPException(422,"Invalid subject spec")
    fields={"jobId","ownerUid","requestHash","sourceUrl","scene"} | ({"modelInput"} if cpu_mode() else set())
    if cpu_mode() and isinstance(spec,dict) and "replacementAssets" in spec:fields.add("replacementAssets")
    if (not isinstance(spec,dict) or set(spec)!=fields
        or not isinstance(spec["requestHash"],str) or not re.fullmatch(r"[a-f0-9]{64}",spec["requestHash"])
        or not isinstance(spec["ownerUid"],str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}",spec["ownerUid"])
        or not isinstance(spec["sourceUrl"],str) or len(spec["sourceUrl"])>8192
        or not isinstance(spec["scene"],dict)):
        raise HTTPException(422,"Invalid subject spec")
    if cpu_mode():
        try:
            try:from .studio_model_subject_vfx_job import valid_model_input,storage_url,valid_replacement_assets
            except ImportError:from studio_model_subject_vfx_job import valid_model_input,storage_url,valid_replacement_assets
            valid_model_input(spec['modelInput']);storage_url(spec['sourceUrl']);valid_replacement_assets(spec)
        except (ValueError,TypeError,KeyError):raise HTTPException(422,"Invalid model artifact spec")
    directory=work(spec["jobId"])
    identity={key:value for key,value in spec.items() if key!="sourceUrl"}
    if cpu_mode():identity={**identity,"modelInput":{**spec['modelInput'],"files":{
        key:{k:v for k,v in file.items() if k!='url'} for key,file in spec['modelInput']['files'].items()}}}
    if cpu_mode() and 'replacementAssets' in spec:
        identity['replacementAssets']=[{k:v for k,v in asset.items() if k!='url'} for asset in spec['replacementAssets']]
    fingerprint=hashlib.sha256(json.dumps(identity,sort_keys=True,separators=(",",":")).encode()).hexdigest()
    with process_lock:
        if (directory/"state.json").exists():
            previous=read(spec["jobId"])
            if previous["fingerprint"]!=fingerprint: raise HTTPException(409,"Job ID belongs to another render")
            return {"jobId":spec["jobId"],"status":previous["status"],"reused":True}
        if not cpu_mode() and remaining()<60: raise HTTPException(503,"No authorized NVIDIA window")
        if (not cpu_mode() and not gpu_available()) or not lock.acquire(blocking=False): raise HTTPException(429,"Subject renderer is already occupied or unavailable")
        try:
            directory.mkdir(mode=0o700)
            (directory/"spec.json").write_text(json.dumps(spec));os.chmod(directory/"spec.json",0o600)
            state={"jobId":spec["jobId"],"ownerUid":spec["ownerUid"],"requestHash":spec["requestHash"],"fingerprint":fingerprint,"status":"queued"}
            save(directory,state)
            threading.Thread(target=run_job,args=(spec["jobId"],),daemon=True).start()
        except Exception:
            lock.release();raise
    return {"jobId":spec["jobId"],"status":"queued"}

@app.get("/jobs/{job_id}")
def status(job_id:str,request:Request):
    auth(request);state=read(job_id)
    return {key:value for key,value in state.items() if key!="fingerprint"}

@app.get("/jobs/{job_id}/media")
def media(job_id:str,request:Request):
    auth(request)
    if read(job_id)["status"]!="completed": raise HTTPException(409,"Render is not complete")
    return FileResponse(work(job_id)/"render.mp4",media_type="video/mp4")

@app.delete("/jobs/{job_id}")
def cancel(job_id:str,request:Request):
    auth(request)
    with process_lock:
        state=read(job_id)
        if state["status"] in ("failed","cancelled","completed"): return {"jobId":job_id,"status":state["status"]}
        process=processes.get(job_id)
        if process is not None: stop(process)
        state.update(status="cancelled");save(work(job_id),state)
    return {"jobId":job_id,"status":"cancelled"}
