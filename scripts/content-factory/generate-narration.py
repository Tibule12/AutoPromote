#!/usr/bin/env python3
"""Generate disclosed synthetic brand narration, never clone a person's voice."""
import argparse,hashlib,json,subprocess,time
from pathlib import Path

def generate(a):
    import numpy as np,soundfile as sf,torch
    from kokoro import KModel,KPipeline
    request=json.loads(a.request.read_text());deadline=request["deadlineEpoch"]
    if time.time()+60>=deadline:raise RuntimeError("Authorized GPU window expired")
    device="cuda" if a.require_gpu else "cpu"
    if a.require_gpu and (device!="cuda" or torch.cuda.get_device_name(0)!="NVIDIA L40S"):raise RuntimeError("Authorized NVIDIA L40S required")
    receipt=json.loads((a.models/"model-receipt.json").read_text())
    model=KModel(repo_id="hexgrad/Kokoro-82M",config=str(a.models/"config.json"),model=str(a.models/"kokoro-v1_0.pth")).to(device).eval()
    pipeline=KPipeline(lang_code="a",repo_id="hexgrad/Kokoro-82M",model=model,device=device)
    voice=torch.load(a.models/"voices/af_heart.pt",weights_only=True,map_location=device).float()
    pipeline.voices["af_heart"]=voice
    a.output.mkdir(parents=True,exist_ok=True)
    for item in request["lines"]:
        if not isinstance(item.get("text"),str) or not 1<=len(item["text"])<=500:raise ValueError("Narration text outside bounds")
        if not item["id"].replace("-","").replace("_","").isalnum():raise ValueError("Invalid narration ID")
        started=time.monotonic();chunks=list(pipeline(item["text"],voice="af_heart",speed=float(item.get("speed",1)),split_pattern=r"\n+"))
        audio=np.concatenate([result.audio.cpu().numpy() for result in chunks])
        raw=a.output/(item["id"]+"-24k.wav");target=a.output/(item["id"]+".wav")
        sf.write(raw,audio,24000,subtype="PCM_16")
        subprocess.run(["ffmpeg","-y","-v","error","-i",str(raw),"-af","loudnorm=I=-18:TP=-2:LRA=7","-ar","48000","-ac","2","-c:a","pcm_s16le",str(target)],check=True)
        data,sr=sf.read(target)
        record={"status":"GENERATED_PENDING_REVIEW","assetId":item["id"],"type":"audio","audioRole":"voiceover",
            "sourceBrief":request["sourceBrief"],"prompt":item["text"],"model":"hexgrad/Kokoro-82M","modelRevision":receipt["revision"],
            "tool":"AutoPromote NVIDIA narration adapter","origin":"synthetic_brand_narration","settings":{"voice":"af_heart","speed":item.get("speed",1),"sampleRate":sr,"loudnessTargetLUFS":-18},
            "artifact":{"path":str(target),"sha256":hashlib.sha256(target.read_bytes()).hexdigest(),"duration":len(data)/sr,"container":"wav","codec":"pcm_s16le"},
            "device":device,"gpu":torch.cuda.get_device_name(0) if device=="cuda" else None,
            "phonemes":[result.phonemes for result in chunks],"seconds":time.monotonic()-started,
            "disclosure":"Generated narration using a standard licensed model preset; no founder voice or real person's identity is represented."}
        (a.output/(item["id"]+"-receipt.json")).write_text(json.dumps(record,indent=2))
        print(json.dumps({"event":"narration_ready","id":item["id"],"duration":record["artifact"]["duration"],"seconds":record["seconds"]}),flush=True)
if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("--request",type=Path,required=True);p.add_argument("--models",type=Path,required=True);p.add_argument("--output",type=Path,required=True);p.add_argument("--require-gpu",action="store_true")
    generate(p.parse_args())
