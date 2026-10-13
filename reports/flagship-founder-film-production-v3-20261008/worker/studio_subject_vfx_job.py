"""One bounded NVIDIA subject job, invoked by the dedicated VFX worker.

The existing media worker/CPU fallback never loads this model runtime.
"""
import argparse
import json
import math
import os
from pathlib import Path
import subprocess
from urllib.parse import urlparse
import requests

try:
    from .studio_subject_matte import generate_matte, video_geometry, sha256
    from .studio_vfx_plan import render_vfx, validate_plan
except ImportError:
    from studio_subject_matte import generate_matte, video_geometry, sha256
    from studio_vfx_plan import render_vfx, validate_plan


def materialize(spec, work):
    url = urlparse(spec["sourceUrl"])
    if url.scheme != "https" or url.hostname != "storage.googleapis.com" or url.username or url.password:
        raise ValueError("Only server-resolved private storage sources are accepted")
    source = work / "original.mp4"
    with requests.get(spec["sourceUrl"], stream=True, timeout=(15, 60), allow_redirects=False) as response:
        response.raise_for_status()
        if response.status_code != 200: raise ValueError("Source redirects are not accepted")
        total = 0
        with source.open("wb") as target:
            for block in response.iter_content(1024*1024):
                total += len(block)
                if total > 512*1024*1024: raise ValueError("Source exceeds 512 MB")
                target.write(block)
    scene = spec["scene"]
    interval = scene["sourceRange"]
    duration = interval["end"]-interval["start"]
    if not 0 <= interval["start"] < interval["end"] or not .25 <= duration <= 10:
        raise ValueError("Invalid subject source range")
    normalized = work / "source.mp4"
    frame_count = math.floor(duration*24+.5)
    command = ["ffmpeg", "-nostdin", "-v", "error", "-ss", str(interval["start"]), "-i", str(source),
               "-t", str(frame_count/24), "-frames:v", str(frame_count), "-map", "0:v:0", "-map", "0:a?",
               "-vf", "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,fps=24,setsar=1",
               "-c:v", "h264_nvenc", "-preset", "p6", "-cq", "17", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(normalized)]
    subprocess.run(command, capture_output=True, text=True, check=True, timeout=120)
    return source, normalized


def execute(spec, work):
    expected = os.environ.get("STUDIO_VFX_EXPECTED_GPU", "NVIDIA L40S")
    inventory = subprocess.run(["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"], capture_output=True, text=True, check=True, timeout=10).stdout
    if expected not in inventory: raise RuntimeError("The configured NVIDIA GPU is unavailable")
    original, source = materialize(spec, work)
    geometry = video_geometry(source)
    scene = spec["scene"]
    frame_count = math.floor((scene["sourceRange"]["end"]-scene["sourceRange"]["start"])*24+.5)
    if geometry["frame_count"] != frame_count:
        raise ValueError("The selected source cannot supply the required picture frames")
    def points(values):
        if not isinstance(values, list) or not 1 <= len(values) <= 16: raise ValueError("Invalid subject points")
        if any(not isinstance(point,list) or len(point)!=2 or any(isinstance(v,bool) or not isinstance(v,(int,float)) or not 0 <= v < 1 for v in point) for point in values): raise ValueError("Subject points must be normalized inside the source frame")
        return [[point[0]*geometry["width"],point[1]*geometry["height"]] for point in values]
    prompt = {"version":1,"source_sha256":sha256(source),"points":points(scene["prompt"]["points"]),"labels":scene["prompt"]["labels"],
              "shot_prompts":[{"frame_index":math.floor(shot["time"]*24+.5),"points":points(shot["points"]),"labels":shot["labels"]} for shot in scene["prompt"]["shotPrompts"]]}
    # Clamp the last effect boundary to the normalized picture clock. No layer
    # is moved to a different source shot, and the original scene stays editable.
    effects=[{**effect,"end":min(effect["end"],frame_count/24)} for effect in scene["effects"]]
    from types import SimpleNamespace
    validate_plan({"version":1,"source_sha256":prompt["source_sha256"],"matte_sha256":"0"*64,"effects":effects},
                  SimpleNamespace(manifest={**geometry,"source_sha256":prompt["source_sha256"]},artifact_sha256="0"*64))
    matte = work / "matte"
    model = Path(os.environ["STUDIO_VFX_MODEL_DIR"])
    generate_matte(source,prompt,model,matte,expected_gpu=expected)
    # generate_matte returns a manifest; the cache identity is its on-disk digest.
    plan={"version":1,"source_sha256":sha256(source),"matte_sha256":sha256(matte/"manifest.json"),"effects":effects}
    receipt=render_vfx(source,matte,plan,work/"render.mp4",encoder="nvenc")
    receipt.update({"original_source_sha256":sha256(original),"requestHash":spec["requestHash"],"gpu":inventory.strip(),"sourceRange":scene["sourceRange"]})
    (work/"result.json").write_text(json.dumps(receipt,indent=2))


if __name__ == "__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--spec",type=Path,required=True)
    args=parser.parse_args()
    execute(json.loads(args.spec.read_text()),args.spec.parent)
