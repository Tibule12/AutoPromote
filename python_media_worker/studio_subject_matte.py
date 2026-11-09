"""Optional CUDA subject tracking and source-bound, reusable video mattes.

No model download occurs here. The lightweight CPU worker does not import Torch.
Preview and final consumers read the same hashed PNGs rather than rerun inference.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
from pathlib import Path
import subprocess
import time

import numpy as np
from PIL import Image

MODEL_ID = "facebook/sam2.1-hiera-tiny"
MODEL_REVISION = "de431c4043854a71d8101e17995dfe596bf101a5"
MODEL_WEIGHTS_SHA256 = "48c14467e5cf9e51870511feb72c89688e82dd74523142c0538b663e193ac2a7"


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def canonical_hash(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def video_geometry(source):
    probe = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-count_frames",
                            "-show_streams", "-of", "json", str(source)],
                           capture_output=True, text=True, check=True, timeout=60)
    stream = json.loads(probe.stdout)["streams"][0]
    numerator, denominator = map(int, stream["avg_frame_rate"].split("/"))
    fps = numerator / denominator
    frames = int(stream["nb_read_frames"])
    width, height = int(stream["width"]), int(stream["height"])
    if not (1 <= fps <= 60 and 1 <= frames <= 900 and frames / fps <= 30
            and 32 <= width <= 1920 and 32 <= height <= 1920
            and width * height * frames <= 500_000_000):
        raise ValueError("Matte source exceeds the bounded 30-second workload")
    # An explicit CFR clip prevents masks drifting on a variable-rate source.
    if stream.get("r_frame_rate") != stream["avg_frame_rate"]:
        raise ValueError("Materialize a constant-frame-rate source before tracking")
    return {"width": width, "height": height, "fps": fps, "fps_fraction": stream["avg_frame_rate"], "frame_count": frames}


def detect_shot_cuts(source, fps):
    result = subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-i", str(source),
                             "-vf", "select='gt(scene,0.25)',showinfo", "-an", "-f", "null", "-"],
                            capture_output=True, text=True, check=True, timeout=60)
    return sorted({round(float(value) * fps) for value in re.findall(r"pts_time:([0-9.]+)", result.stderr)})


def validate_prompt(prompt, geometry):
    required = {"version", "source_sha256", "points", "labels"}
    if not isinstance(prompt, dict) or not required.issubset(prompt) or set(prompt) - required - {"shot_prompts"} or prompt["version"] != 1:
        raise ValueError("Expected version 1 source-bound point prompt")
    points, labels = prompt["points"], prompt["labels"]
    if not isinstance(points, list) or not isinstance(labels, list) or not 1 <= len(points) <= 16 or len(points) != len(labels):
        raise ValueError("Expected 1–16 labeled points")
    for point, label in zip(points, labels):
        if (not isinstance(point, list) or len(point) != 2 or label not in (0, 1)
                or any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in point)
                or not 0 <= point[0] < geometry["width"] or not 0 <= point[1] < geometry["height"]):
            raise ValueError("Point or label outside the source frame")
    if 1 not in labels:
        raise ValueError("At least one foreground point is required")
    prior = 0
    for shot in prompt.get("shot_prompts", []):
        if not isinstance(shot, dict) or set(shot) != {"frame_index", "points", "labels"}:
            raise ValueError("Each shot prompt needs a frame index and labeled points")
        index = shot["frame_index"]
        if isinstance(index, bool) or not isinstance(index, int) or not prior < index < geometry["frame_count"]:
            raise ValueError("Shot prompts must be ordered, unique, and inside the source")
        validate_prompt({"version": 1, "source_sha256": prompt["source_sha256"], "points": shot["points"], "labels": shot["labels"]}, geometry)
        prior = index


def mask_geometry(alpha):
    ys, xs = np.nonzero(alpha >= 128)
    if not len(xs):
        return {"bbox": None, "centroid": None, "coverage": 0.0}
    return {"bbox": [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1],
            "centroid": [round(float(xs.mean()), 4), round(float(ys.mean()), 4)],
            "coverage": round(len(xs) / alpha.size, 6)}


def generate_matte(source, prompt, model_dir, output, expected_gpu="NVIDIA L40S"):
    import torch
    from transformers import Sam2VideoModel, Sam2VideoProcessor

    geometry = video_geometry(source)
    source_hash = sha256(source)
    validate_prompt(prompt, geometry)
    if prompt["source_sha256"] != source_hash:
        raise ValueError("Point prompt is for a different source")
    if not torch.cuda.is_available() or expected_gpu not in torch.cuda.get_device_name(0):
        raise RuntimeError(f"Required NVIDIA GPU unavailable: {expected_gpu}")
    if sha256(Path(model_dir) / "model.safetensors") != MODEL_WEIGHTS_SHA256:
        raise ValueError("SAM2 model weights differ from the pinned official revision")
    cuts = detect_shot_cuts(source, geometry["fps"])
    shot_prompts = {item["frame_index"]: item for item in prompt.get("shot_prompts", [])}
    if any(index not in shot_prompts for index in cuts):
        raise ValueError(f"Shot cuts {cuts} need reviewed source-bound shot_prompts; tracking across a cut is unsafe")
    target = Path(output)
    target.mkdir(parents=True, exist_ok=False)
    started = time.monotonic()
    torch.manual_seed(0)
    torch.backends.cudnn.benchmark = False
    # Freeze the generated artifact. GPU model inference itself is not promised
    # bit-identical across GPU architectures; composition from the cache is.
    model = Sam2VideoModel.from_pretrained(str(model_dir), local_files_only=True).to("cuda", dtype=torch.bfloat16).eval()
    processor = Sam2VideoProcessor.from_pretrained(str(model_dir), local_files_only=True)
    session = processor.init_video_session(inference_device="cuda", dtype=torch.bfloat16)
    width, height = geometry["width"], geometry["height"]
    rows = []
    command = ["ffmpeg", "-nostdin", "-v", "error", "-i", str(source), "-map", "0:v:0",
               "-vsync", "0", "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"]
    with subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE) as decoder:
        try:
            with torch.inference_mode():
                for index in range(geometry["frame_count"]):
                    data = decoder.stdout.read(width * height * 3)
                    if len(data) != width * height * 3:
                        raise RuntimeError(f"Source decoder ended at frame {index}")
                    frame = Image.frombytes("RGB", (width, height), data)
                    inputs = processor(images=frame, device="cuda", return_tensors="pt")
                    if index == 0 or index in shot_prompts:
                        if index in shot_prompts:
                            session = processor.init_video_session(inference_device="cuda", dtype=torch.bfloat16)
                        current_prompt = shot_prompts.get(index, prompt)
                        processor.add_inputs_to_inference_session(
                            inference_session=session, frame_idx=0, obj_ids=1,
                            input_points=[[current_prompt["points"]]], input_labels=[[current_prompt["labels"]]],
                            original_size=inputs.original_sizes[0])
                    result = model(inference_session=session, frame=inputs.pixel_values[0])
                    logits = processor.post_process_masks([result.pred_masks], original_sizes=inputs.original_sizes, binarize=False)[0]
                    values = logits[0, 0].float().cpu().numpy()
                    if values.shape != (height, width) or not np.isfinite(values).all():
                        raise RuntimeError("SAM2 produced an invalid matte")
                    # SAM2 is segmentation, not a dedicated hair matting model.
                    alpha = np.rint(255 / (1 + np.exp(-np.clip(values, -20, 20)))).astype(np.uint8)
                    name = f"matte_{index:04d}.png"
                    Image.fromarray(alpha).save(target / name)
                    rows.append({"index": index, "time": index / geometry["fps"], "file": name,
                                 "sha256": sha256(target / name), **mask_geometry(alpha)})
                    if index % 24 == 0:
                        print(json.dumps({"event": "matte_frame", "frame": index, "total": geometry["frame_count"], "coverage": rows[-1]["coverage"]}), flush=True)
            if decoder.stdout.read(1):
                raise RuntimeError("Source decoder frame count exceeds its probe")
            if decoder.wait(timeout=30):
                raise RuntimeError("Source decode failed: " + decoder.stderr.read().decode()[-1000:])
        except BaseException:
            decoder.kill()
            decoder.wait()
            raise
    manifest = {"version": 1, "kind": "source_bound_subject_matte", "source_sha256": source_hash,
                **geometry, "model": MODEL_ID, "model_revision": MODEL_REVISION,
                "model_weights_sha256": sha256(Path(model_dir) / "model.safetensors"),
                "prompt": prompt, "prompt_sha256": canonical_hash(prompt), "frames": rows,
                "device": torch.cuda.get_device_name(0), "torch": torch.__version__, "torch_cuda": torch.version.cuda,
                "elapsed_seconds": time.monotonic() - started, "shot_cuts": cuts,
                "quality_warnings": [f"Frame {row['index']} has near-empty foreground" for row in rows if row["coverage"] < .02],
                "quality": "segmentation; requires visual review; no hair-matte guarantee"}
    # Publish the manifest last. An interrupted generation cannot appear complete.
    (target / "manifest.json").write_text(json.dumps(manifest, indent=2, allow_nan=False))
    print(json.dumps({"event": "matte_complete", "frames": len(rows), "seconds": manifest["elapsed_seconds"], "manifest": str(target / "manifest.json")}), flush=True)
    return manifest


class CachedSubjectMatte:
    """Verify source, clock, file hashes and shapes before any composition."""
    def __init__(self, directory, source):
        self.directory = Path(directory).resolve()
        self.manifest_path = self.directory / "manifest.json"
        self.manifest = json.loads(self.manifest_path.read_text())
        data = self.manifest
        if data.get("version") != 1 or data.get("kind") != "source_bound_subject_matte":
            raise ValueError("Unsupported matte artifact")
        if data.get("source_sha256") != sha256(source):
            raise ValueError("Matte artifact belongs to a different source")
        geometry = video_geometry(source)
        if any(data.get(key) != value for key, value in geometry.items()):
            raise ValueError("Matte source clock or dimensions changed")
        if data.get("prompt_sha256") != canonical_hash(data["prompt"]):
            raise ValueError("Matte prompt hash changed")
        validate_prompt(data["prompt"], geometry)
        cuts = detect_shot_cuts(source, geometry["fps"])
        shot_indices = {item["frame_index"] for item in data["prompt"].get("shot_prompts", [])}
        if data.get("shot_cuts") != cuts or any(index not in shot_indices for index in cuts):
            raise ValueError("Matte cache lacks reviewed prompts for this source's shot cuts")
        if len(data["frames"]) != geometry["frame_count"]:
            raise ValueError("Matte artifact is incomplete")
        for index, row in enumerate(data["frames"]):
            if row["index"] != index or abs(row["time"] - index / geometry["fps"]) > 1e-8 or row["file"] != f"matte_{index:04d}.png":
                raise ValueError("Invalid matte frame index, path or timestamp")
            self.frame(index)

    @property
    def artifact_sha256(self):
        return sha256(self.manifest_path)

    def frame(self, index):
        row = self.manifest["frames"][index]
        path = self.directory / row["file"]
        if path.resolve().parent != self.directory or sha256(path) != row["sha256"]:
            raise ValueError("Matte frame hash or path changed")
        with Image.open(path) as image:
            if image.mode != "L" or image.size != (self.manifest["width"], self.manifest["height"]):
                raise ValueError("Matte frame dimensions or mode changed")
            return np.array(image, dtype=np.uint8)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--prompt", type=Path, required=True)
    parser.add_argument("--model-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--expected-gpu", default="NVIDIA L40S")
    args = parser.parse_args()
    generate_matte(args.source, json.loads(args.prompt.read_text()), args.model_dir, args.output, args.expected_gpu)


if __name__ == "__main__":
    main()
