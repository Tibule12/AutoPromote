#!/usr/bin/env python3
"""Private local artifact transport around AutoPromote's existing renderer.

Only storage transport is substituted. Editing/compositing/audio/encoding are
the unmodified RenderViralRequest -> render_viral_clip_impl contract.
"""
import argparse
import asyncio
import hashlib
from http.server import ThreadingHTTPServer
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import threading
import time

async def render(args):
    # CLI callers may provide relative paths; artifact URIs must be absolute.
    for field in ("worker", "root", "request", "output"):
        setattr(args, field, getattr(args, field).resolve())
    sys.path.insert(0, str(args.worker))
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from local_media_http import RangeMediaHandler
    # This transport has no cloud writes or credentials. Initialize only inert
    # project metadata before loading the worker, avoiding its credential-file
    # discovery across the caller's workspace on a private local render.
    import firebase_admin
    if not firebase_admin._apps:
        firebase_admin.initialize_app(options={"projectId": "autopromote-private-artifacts"})
    import main_media_server as worker
    worker.FIREBASE_STATUS_UPDATES_ENABLED = False
    args.output.mkdir(parents=True, exist_ok=True)
    class Handler(RangeMediaHandler):
        def __init__(self,*a,**k): super().__init__(*a,directory=str(args.root),**k)
        def log_message(self,*_a): pass
    server=ThreadingHTTPServer(("127.0.0.1",8765), Handler)
    threading.Thread(target=server.serve_forever,daemon=True).start()
    def retain(local_path,destination_path=None):
        name="poster.jpg" if destination_path and destination_path.endswith(".jpg") else "final.mp4"
        target=args.output/name;shutil.copy2(local_path,target)
        return target.as_uri()
    worker.upload_file_to_firebase=retain
    request=json.loads(args.request.read_text())
    known=getattr(worker.RenderViralRequest,'model_fields',None) or worker.RenderViralRequest.__fields__
    unknown=set(request)-set(known)
    if unknown:raise ValueError('Unknown existing Studio render fields: '+', '.join(sorted(unknown)))
    encoders=[]
    original_run=worker.run_subprocess_async
    async def observe(command,**kwargs):
        if "-c:v" in command:
            encoder=command[command.index("-c:v")+1]
            if encoder!="copy":encoders.append(encoder)
        return await original_run(command,**kwargs)
    worker.run_subprocess_async=observe
    started=time.monotonic()
    try:
        result=await worker.render_viral_clip_impl(worker.RenderViralRequest(**request))
    finally:
        server.shutdown()
    output=args.output/"final.mp4"
    if not (args.output/"poster.jpg").exists():
        subprocess.run(["ffmpeg","-v","error","-y","-ss","0.5","-i",str(output),"-frames:v","1",str(args.output/"poster.jpg")],check=True)
    probe=json.loads(subprocess.run(["ffprobe","-v","error","-show_streams","-show_format","-of","json",str(output)],capture_output=True,text=True,check=True).stdout)
    decode=subprocess.run(["ffmpeg","-v","error","-i",str(output),"-f","null","-"],capture_output=True,text=True)
    if decode.returncode or decode.stderr.strip(): raise RuntimeError("Final independent decode failed: "+decode.stderr[-1000:])
    video=next(s for s in probe["streams"] if s["codec_type"]=="video")
    audio=next((s for s in probe["streams"] if s["codec_type"]=="audio"),None)
    expected=sum(s["end_time"]-s["start_time"] for s in request["timeline_segments"])
    if abs(float(video["duration"])-expected) > 2/float(request.get("output_settings",{}).get("fps",24)):
        raise RuntimeError("Picture duration does not match the Studio edit")
    if not audio: raise RuntimeError("Marketing output is missing its designed soundtrack")
    import numpy as np
    # Measure the actual delivery layout; forcing two channels here concealed
    # mono outputs and changed their measured peak through an upmix.
    audio_channels=int(audio["channels"])
    audio_sample_rate=int(audio["sample_rate"])
    measured=subprocess.run(["ffmpeg","-v","error","-i",str(output),"-vn","-f","f32le","pipe:1"],capture_output=True,check=True)
    samples=np.frombuffer(measured.stdout,dtype="<f4")
    audio_measurements={"sampleRate":audio_sample_rate,"channels":audio_channels,"peak":float(np.max(np.abs(samples))),"rms":float(np.sqrt(np.mean(samples*samples))),"clippedSamples":int(np.sum(np.abs(samples)>=1)),"duration":len(samples)/(audio_sample_rate*audio_channels),"limitation":"Objective decoded measurements; listening and speech comprehension require founder review."}
    if audio_measurements["rms"]<.003 or audio_measurements["clippedSamples"]:raise RuntimeError("Marketing soundtrack is silent or clipped")
    receipt={"status":"RENDERED_PENDING_CREATIVE_REVIEW","pipeline":"AutoPromote RenderViralRequest/render_viral_clip_impl",
        "rendererSourceSha256":hashlib.sha256((args.worker/"main_media_server.py").read_bytes()).hexdigest(),
        "requestSha256":hashlib.sha256(args.request.read_bytes()).hexdigest(),"transportSourceSha256":hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),"sha256":hashlib.sha256(output.read_bytes()).hexdigest(),"audioMeasurements":audio_measurements,
        "duration":float(video["duration"]),"encoder":encoders[-1] if encoders else "unobserved",
        "encodersUsed":encoders,"requestedEncoderPolicy":os.environ.get("VIRAL_EXPORT_ENCODER","auto"),"probe":probe,
        "renderSeconds":time.monotonic()-started,"cloudCredentialsSupplied":False,"result":result}
    (args.output/"render-receipt.json").write_text(json.dumps(receipt,indent=2,default=str))
    print(json.dumps({"event":"factory_rendered","path":str(output),"duration":receipt["duration"]}),flush=True)

if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("--root",type=Path,required=True);p.add_argument("--worker",type=Path,required=True)
    p.add_argument("--request",type=Path,required=True);p.add_argument("--output",type=Path,required=True)
    asyncio.run(render(p.parse_args()))
