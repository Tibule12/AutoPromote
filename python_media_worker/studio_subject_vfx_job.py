"""One bounded NVIDIA subject job, invoked by the dedicated VFX worker.

The existing media worker/CPU fallback never loads this model runtime.
"""
import argparse
import json
import math
import os
from pathlib import Path
import re
import subprocess
from urllib.parse import parse_qs, urlparse
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


def _replacement_storage_url(value):
    if not isinstance(value, str) or len(value) > 8192:
        raise ValueError("Invalid owned storage access")
    url = urlparse(value)
    if url.scheme != "https" or url.hostname != "storage.googleapis.com" or url.port not in (None, 443) or url.username or url.password or url.fragment:
        raise ValueError("Only server-resolved storage objects are accepted")


def _validated_replacement_assets(spec):
    assets = spec.get("replacementAssets", [])
    if not isinstance(assets, list) or len(assets) > 12:
        raise ValueError("Invalid replacement assets")
    effects = {
        effect["asset_id"]: effect["asset_sha256"]
        for effect in spec["scene"]["effects"]
        if effect["type"] in {"background_replace", "screen_replace"}
    }
    if not effects and not assets:
        return []
    if len(assets) != len(effects) or {a.get("assetId") for a in assets if isinstance(a, dict)} != set(effects):
        raise ValueError("Replacement assets do not match the scene")
    for asset in assets:
        if (not isinstance(asset, dict) or set(asset) != {"assetId", "sha256", "generation", "bytes", "contentType", "url"}
                or asset["sha256"] != effects[asset["assetId"]]
                or not re.fullmatch(r"[a-f0-9]{64}", asset["sha256"])
                or not isinstance(asset["generation"], str) or not re.fullmatch(r"[0-9]+", asset["generation"])
                or type(asset["bytes"]) is not int or not 1 <= asset["bytes"] <= 32 * 1024 ** 2
                or not isinstance(asset["contentType"], str) or not re.fullmatch(r"image/(png|jpeg|webp)|video/[a-z0-9.+-]+", asset["contentType"])):
            raise ValueError("Invalid replacement identity")
        _replacement_storage_url(asset["url"])
        if parse_qs(urlparse(asset["url"]).query).get("generation") != [asset["generation"]]:
            raise ValueError("Replacement generation is not pinned")
    return assets


def _download_replacement_asset(asset, target):
    _replacement_storage_url(asset["url"])
    total = 0
    with requests.get(asset["url"], stream=True, timeout=(15, 60), allow_redirects=False) as response:
        response.raise_for_status()
        if response.status_code != 200:
            raise ValueError("Replacement redirects are not accepted")
        with Path(target).open("wb") as handle:
            for block in response.iter_content(1024 * 1024):
                total += len(block)
                if total > 32 * 1024 ** 2 or total > asset["bytes"]:
                    raise ValueError("Replacement asset size changed")
                handle.write(block)
    if total != asset["bytes"] or sha256(target) != asset["sha256"]:
        raise ValueError("Replacement content changed")
    return target


def execute(spec, work):
    expected = os.environ.get("STUDIO_VFX_EXPECTED_GPU", "NVIDIA L40S")
    inventory = subprocess.run(["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"], capture_output=True, text=True, check=True, timeout=10).stdout
    if expected not in inventory: raise RuntimeError("The configured NVIDIA GPU is unavailable")
    assets = _validated_replacement_assets(spec)
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
    paths = {}
    for index, asset in enumerate(assets):
        dest = work / f"replacement-{index}.asset"
        _download_replacement_asset(asset, dest)
        paths[asset["assetId"]] = dest
    matte = work / "matte"
    model = Path(os.environ["STUDIO_VFX_MODEL_DIR"])
    generate_matte(source,prompt,model,matte,expected_gpu=expected)
    # generate_matte returns a manifest; the cache identity is its on-disk digest.
    plan={"version":1,"source_sha256":sha256(source),"matte_sha256":sha256(matte/"manifest.json"),"effects":effects}
    render_kwargs = {"encoder": "nvenc"}
    if paths:
        render_kwargs["asset_resolver"] = lambda asset_id: paths[asset_id]
        render_kwargs["audio_source"] = original
        render_kwargs["audio_start"] = scene["sourceRange"]["start"]
    receipt=render_vfx(source,matte,plan,work/"render.mp4",**render_kwargs)
    receipt.update({"original_source_sha256":sha256(original),"requestHash":spec["requestHash"],"gpu":inventory.strip(),"sourceRange":scene["sourceRange"]})
    if assets:
        receipt["replacementAssets"] = [{k: v for k, v in asset.items() if k != "url"} for asset in assets]
    (work/"result.json").write_text(json.dumps(receipt,indent=2))


if __name__ == "__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--spec",type=Path,required=True)
    args=parser.parse_args()
    execute(json.loads(args.spec.read_text()),args.spec.parent)
