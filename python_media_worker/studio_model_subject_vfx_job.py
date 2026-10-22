"""Deterministic composition from verified runtime masks; no model inference."""
import argparse
import hashlib
import gzip
import json
import math
from pathlib import Path
import re
import tarfile
from urllib.parse import urlparse
import requests

try:
    from .studio_subject_matte import sha256, CachedSubjectMatte
    from .studio_vfx_plan import render_vfx
except ImportError:
    from studio_subject_matte import sha256, CachedSubjectMatte
    from studio_vfx_plan import render_vfx

# Bind the loaded worker code before work starts. A local edit during a job
# must fail qualification rather than attest the newer file over older pixels.
IMPLEMENTATION_FILES={name:sha256(Path(__file__).with_name(name)) for name in
    ("studio_model_subject_vfx_job.py","studio_vfx_plan.py","studio_vfx_foreground_cache.py")}

def verify_implementation():
    if any(sha256(Path(__file__).with_name(name))!=digest for name,digest in IMPLEMENTATION_FILES.items()):
        raise ValueError("Composition implementation changed during execution; discard this attempt")


def storage_url(value):
    if not isinstance(value, str) or len(value) > 8192:
        raise ValueError("Invalid owned storage access")
    url = urlparse(value)
    if url.scheme != "https" or url.hostname != "storage.googleapis.com" or url.port not in (None,443) or url.username or url.password or url.fragment:
        raise ValueError("Only server-resolved storage objects are accepted")


def valid_model_input(data):
    fields = {"schemaVersion", "artifactHash", "sourceSha256", "sourceRange", "files", "manifestSha256", "frameCount", "width", "height"}
    if not isinstance(data, dict) or set(data) != fields or data["schemaVersion"] != 1:
        raise ValueError("Invalid model artifact input")
    if any(not isinstance(data[k], str) or not re.fullmatch(r"[a-f0-9]{64}", data[k]) for k in ("artifactHash", "sourceSha256", "manifestSha256")):
        raise ValueError("Invalid artifact digests")
    interval = data["sourceRange"]
    if (not isinstance(interval, dict) or set(interval) != {"space", "startTick", "endTick"} or interval["space"] != "source"
            or any(type(interval[k]) is not int for k in ("startTick", "endTick"))
            or not 0 <= interval["startTick"] < interval["endTick"]):
        raise ValueError("Invalid source clock")
    if (type(data["frameCount"]) is not int or not 6 <= data["frameCount"] <= 240
            or data["frameCount"] != math.floor((interval["endTick"]-interval["startTick"])/3750 + .5)
            or any(type(data[k]) is not int or not 32 <= data[k] <= 1920 for k in ("width", "height"))
            or data["width"]*data["height"]*data["frameCount"] > 500_000_000):
        raise ValueError("Invalid mask geometry")
    if not isinstance(data["files"], dict) or set(data["files"]) != {"normalizedSource", "maskBundle"}:
        raise ValueError("Invalid artifact files")
    for value in data["files"].values():
        if (not isinstance(value, dict) or set(value) != {"url", "sha256", "bytes"}
                or type(value["bytes"]) is not int or not 1 <= value["bytes"] <= 75*1024**2
                or not isinstance(value["sha256"], str) or not re.fullmatch(r"[a-f0-9]{64}", value["sha256"])):
            raise ValueError("Invalid artifact file identity")
        storage_url(value["url"])
    return data


def download(url, target, digest, expected_bytes=None, limit=512*1024**2):
    storage_url(url)
    total = 0
    value = hashlib.sha256()
    with requests.get(url, stream=True, timeout=(15, 60), allow_redirects=False) as response:
        if response.status_code != 200:
            raise ValueError("Owned storage object unavailable")
        with Path(target).open("wb") as output:
            for block in response.iter_content(1024*1024):
                total += len(block)
                if total > limit or (expected_bytes is not None and total > expected_bytes):
                    raise ValueError("Artifact size changed")
                value.update(block)
                output.write(block)
    if not total or (expected_bytes is not None and total != expected_bytes) or value.hexdigest() != digest:
        raise ValueError("Artifact content changed")


def valid_replacement_assets(spec):
    assets = spec.get("replacementAssets", [])
    if not isinstance(assets, list) or len(assets) > 12:
        raise ValueError("Invalid replacement assets")
    effects = {effect["asset_id"]: effect["asset_sha256"] for effect in spec["scene"]["effects"] if effect["type"] == "background_replace"}
    if len(assets) != len(effects) or {a.get("assetId") for a in assets if isinstance(a, dict)} != set(effects):
        raise ValueError("Replacement assets do not match the scene")
    for asset in assets:
        if (not isinstance(asset, dict) or set(asset) != {"assetId", "sha256", "generation", "bytes", "contentType", "url"}
                or asset["sha256"] != effects[asset["assetId"]]
                or not re.fullmatch(r"[a-f0-9]{64}", asset["sha256"])
                or not isinstance(asset["generation"], str) or not re.fullmatch(r"[0-9]+", asset["generation"])
                or type(asset["bytes"]) is not int or not 1 <= asset["bytes"] <= 32*1024**2
                or not isinstance(asset["contentType"], str) or not re.fullmatch(r"image/(png|jpeg|webp)|video/[a-z0-9.+-]+", asset["contentType"])):
            raise ValueError("Invalid replacement identity")
        storage_url(asset["url"])
        # The signed read must be pinned to the exact attested object generation.
        from urllib.parse import parse_qs
        if parse_qs(urlparse(asset["url"]).query).get("generation") != [asset["generation"]]:
            raise ValueError("Replacement generation is not pinned")
    return assets


def extract_masks(bundle, target, data):
    names = {"manifest.json"} | {f"matte_{i:04d}.png" for i in range(data["frameCount"])}
    raw=target.with_suffix('.tar')
    with gzip.open(bundle,'rb') as source,raw.open('wb') as output:
        total=0
        while block:=source.read(1024*1024):
            total+=len(block)
            if total>76*1024**2:raise ValueError('Mask archive expands beyond its bound')
            output.write(block)
    with tarfile.open(raw) as archive:
        members = archive.getmembers()
        if (len(members) != len(names) or {m.name for m in members} != names
                or any(not m.isfile() or Path(m.name).name != m.name or not 0 < m.size <= 8*1024**2 for m in members)
                or sum(m.size for m in members) > 75*1024**2):
            raise ValueError("Invalid bounded mask archive")
        target.mkdir(mode=0o700)
        archive.extractall(target, members=members, filter="data")
    raw.unlink()
    if sha256(target/"manifest.json") != data["manifestSha256"]:
        raise ValueError("Mask manifest changed")


def compose_materialized(spec, work):
    data = valid_model_input(spec["modelInput"])
    assets = valid_replacement_assets(spec)
    scene = spec["scene"]
    if (round(scene["sourceRange"]["start"]*90000) != data["sourceRange"]["startTick"]
            or round(scene["sourceRange"]["end"]*90000) != data["sourceRange"]["endTick"]
            or sha256(work/"original.mp4") != data["sourceSha256"]
            or sha256(work/"source.mp4") != data["files"]["normalizedSource"]["sha256"]
            or sha256(work/"masks.tar.gz") != data["files"]["maskBundle"]["sha256"]):
        raise ValueError("Source or artifact binding changed")
    matte = work/"matte"
    extract_masks(work/"masks.tar.gz", matte, data)
    cache = CachedSubjectMatte(matte, work/"source.mp4")
    manifest = cache.manifest
    if manifest.get('original_source_sha256')!=data['sourceSha256'] or manifest.get('sourceRange')!=data['sourceRange']:
        raise ValueError('Mask original source binding changed')
    if any(manifest[k] != data[target] for k, target in [("frame_count", "frameCount"), ("width", "width"), ("height", "height")]):
        raise ValueError("Mask dimensions or duration changed")
    if any(row.get("sourceTick") != data["sourceRange"]["startTick"]+i*3750 for i, row in enumerate(manifest["frames"])):
        raise ValueError("Mask source clock changed")
    plan = {"version": 1, "source_sha256": sha256(work/"source.mp4"),
            "matte_sha256": data["manifestSha256"], "effects": [
                {**effect,"end":min(effect['end'],data['frameCount']/24)} for effect in scene['effects']]}
    paths = {asset["assetId"]: work/f"replacement-{index}.asset" for index, asset in enumerate(assets)}
    for asset in assets:
        if sha256(paths[asset["assetId"]]) != asset["sha256"]:
            raise ValueError("Replacement content changed")
    receipt = render_vfx(work/"source.mp4", matte, plan, work/"render.mp4", encoder="cpu",
                         asset_resolver=lambda asset_id: paths[asset_id],
                         audio_source=work/"original.mp4", audio_start=scene["sourceRange"]["start"])
    verify_implementation()
    receipt.update(original_source_sha256=data["sourceSha256"], requestHash=spec["requestHash"],
                   sourceRange=scene["sourceRange"], modelArtifactHash=data["artifactHash"],
                   mask_manifest_sha256=data["manifestSha256"], gpuCount=0, device="cpu",
                   implementation_sha256=hashlib.sha256(''.join(IMPLEMENTATION_FILES.values()).encode()).hexdigest(),
                   implementation_files=IMPLEMENTATION_FILES,
                   provenance="deterministic_composition_from_model_artifact")
    if assets:
        receipt["replacementAssets"] = [{key: value for key, value in asset.items() if key != "url"} for asset in assets]
    (work/"result.json").write_text(json.dumps(receipt, indent=2))
    return receipt


def execute(spec, work):
    data = valid_model_input(spec["modelInput"])
    assets = valid_replacement_assets(spec)
    for index, asset in enumerate(assets):
        download(asset["url"], work/f"replacement-{index}.asset", asset["sha256"], asset["bytes"], 32*1024**2)
    download(spec["sourceUrl"], work/"original.mp4", data["sourceSha256"])
    for key, name in [("normalizedSource", "source.mp4"), ("maskBundle", "masks.tar.gz")]:
        ref = data["files"][key]
        download(ref["url"], work/name, ref["sha256"], ref["bytes"], 75*1024**2)
    return compose_materialized(spec, work)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--spec", type=Path, required=True)
    args = parser.parse_args()
    execute(json.loads(args.spec.read_text()), args.spec.parent)
