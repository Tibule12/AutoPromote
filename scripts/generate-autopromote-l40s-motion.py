#!/usr/bin/env python3
"""Generate original AutoPromote motion footage on the authorized Brev L40S."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import time

MODEL = "Wan-AI/Wan2.2-TI2V-5B-Diffusers"
SHOTS = [
    {"name": "violet-ribbon", "seed": 20261006,
     "prompt": "Premium cinematic motion design for a professional creative video editing brand. A single broad ribbon of translucent violet glass with polished metallic edges flows elegantly through a dark obsidian studio, slowly folding into a precise ascending arch. Close-up macro photography, subtle ultraviolet edge lighting and a restrained cyan reflection, exquisite physically realistic glass and metal materials. Smooth controlled camera tracking, fluid continuous movement, gentle depth of field. Sophisticated, minimal, crisp, clean, expensive product film aesthetic. The subject sits mainly in the right half of the wide frame. Large quiet black negative space on the left for later typography. No words, no letters, no logos, no screens, no people. One uninterrupted 5-second shot."},
    {"name": "creative-lens", "seed": 20261007,
     "prompt": "Premium cinematic product film, extreme macro close-up of a professional cinema camera lens in a beautiful dark recording studio. A narrow violet light strip reflects in the curved optical glass, tiny cyan highlights and warm amber bokeh in the distance. The camera makes one slow precise dolly move along the polished black metal lens barrel toward the optical glass, realistic focus breathing and exquisite optical reflections. Beautiful physically plausible materials, sophisticated minimal composition, controlled contrast, rich black background. Cinematic commercial photography, confident and calm. No text, no brand labels, no interface, no people, no deformation. One uninterrupted 5-second shot."},
    {"name": "story-frames", "seed": 20261008,
     "prompt": "Sophisticated cinematic motion design in a black architectural studio. Three tall thin translucent glass panels with softly luminous violet edges rise elegantly from a polished obsidian surface and glide into a clean evenly spaced composition. The empty glass panels have subtle cyan and violet reflected light, beautiful realistic refraction, restrained soft glow. A very slow cinematic camera dolly moves from left to right. The visual suggests a single story becoming three social video formats, without any content inside the panels. Precise straight edges, clean geometry, physically realistic high-end product visualization, minimal luxurious art direction. No words, no letters, no logos, no icons, no interface. One uninterrupted 5-second shot."},
]
NEGATIVE = "text, words, captions, letters, watermarks, logo, screen interface, oversaturated, messy, excessive glow, strobing, shaky camera, flickering, static image, distorted geometry, warped straight lines, blurry, low quality, artifacts, cartoon, illustration, crowded composition"


def prepare(work):
    from huggingface_hub import HfApi, snapshot_download
    info = HfApi().model_info(MODEL, files_metadata=True)
    target = work / "models/wan-ti2v-5b"
    snapshot_download(MODEL, revision=info.sha, local_dir=target,
                      allow_patterns=["*.json", "*.safetensors", "*.txt", "*.model", "LICENSE*", "README*"])
    files = []
    for p in target.rglob("*"):
        if p.is_file() and ".cache" not in p.parts:
            files.append({"file": str(p.relative_to(target)), "bytes": p.stat().st_size})
    receipt = {"model": MODEL, "revision": info.sha, "license": "Apache-2.0", "files": files,
               "downloaded_bytes": sum(p["bytes"] for p in files), "source": "https://huggingface.co/" + MODEL}
    (work / "wan-model-receipt.json").write_text(json.dumps(receipt, indent=2))
    print(json.dumps({"stage": "MODEL_READY", "revision": info.sha, "bytes": receipt["downloaded_bytes"]}), flush=True)


def require_gpu(torch, expected_gpu):
    if not expected_gpu or not torch.cuda.is_available() or torch.cuda.get_device_name(0) != expected_gpu:
        raise RuntimeError(f"Expected NVIDIA device: {expected_gpu}")
    if "RTX PRO 6000" in expected_gpu.upper():
        version = tuple(int(part) for part in (torch.version.cuda or "0.0").split(".")[:2])
        if version < (12, 8):
            raise RuntimeError("RTX PRO 6000 requires a CUDA 12.8-or-newer PyTorch wheel; this L40S runtime is not qualified for Blackwell")


def generate(work, selected, expected_gpu="NVIDIA L40S", shots=None, settings=None):
    import torch
    import diffusers
    from diffusers import WanPipeline, WanImageToVideoPipeline, AutoencoderKLWan
    from diffusers.utils import export_to_video
    require_gpu(torch, expected_gpu)
    out = work / "generated"
    out.mkdir(exist_ok=True)
    target = work / "models/wan-ti2v-5b"
    started = time.monotonic()
    print(json.dumps({"stage": "LOAD", "gpu": torch.cuda.get_device_name(0)}), flush=True)
    vae = AutoencoderKLWan.from_pretrained(str(target), subfolder="vae", torch_dtype=torch.float32, local_files_only=True)
    image_mode=bool(shots) and all(shot.get("reference_image") for shot in shots)
    if shots and any(shot.get("reference_image") for shot in shots) and not image_mode:
        raise ValueError("Conditioned and text-only shots require separate batches")
    pipeline_class=WanImageToVideoPipeline if image_mode else WanPipeline
    pipe = pipeline_class.from_pretrained(str(target), vae=vae, torch_dtype=torch.bfloat16, local_files_only=True,
        **({"image_encoder":None,"image_processor":None,"expand_timesteps":True} if image_mode else {}))
    pipe.enable_model_cpu_offload()
    pipe.vae.enable_tiling()
    load_seconds = time.monotonic() - started
    settings = settings or {}
    steps = int(settings.get("steps", 50))
    frames_count = int(settings.get("frame_count", 121))
    width, height = int(settings.get("width", 1280)), int(settings.get("height", 704))
    if not 20 <= steps <= 80 or frames_count not in (49, 73, 97, 121) or (width, height) != (1280, 704):
        raise ValueError("Unsupported bounded Wan generation settings")
    for shot in (shots if shots is not None else SHOTS):
        if selected and shot["name"] not in selected:
            continue
        clock = time.monotonic()
        conditioning={};reference_hash=None
        if image_mode:
            from PIL import Image
            reference=Path(shot["reference_image"]).resolve()
            if not reference.is_relative_to(work.resolve()):raise ValueError("Reference image outside private artifacts")
            reference_hash=hashlib.sha256(reference.read_bytes()).hexdigest()
            conditioning["image"]=Image.open(reference).convert("RGB").resize((width,height))
        torch.cuda.reset_peak_memory_stats()
        def progress(_pipe, step, _timestep, callback_kwargs):
            if step % 5 == 0:
                print(json.dumps({"stage": "DENOISE", "shot": shot["name"], "step": step + 1, "steps": steps, "elapsed_seconds": round(time.monotonic()-clock, 2)}), flush=True)
            if step == steps - 1:
                checkpoint = out / (shot["name"] + "-latents.pt")
                torch.save(callback_kwargs["latents"].detach().cpu(), checkpoint)
                print(json.dumps({"stage": "LATENTS_SAVED", "shot": shot["name"], "checkpoint": str(checkpoint)}), flush=True)
            return callback_kwargs
        frames = pipe(prompt=shot["prompt"], negative_prompt=shot.get("negative_prompt", NEGATIVE), height=height, width=width,
                      num_frames=frames_count, num_inference_steps=steps, guidance_scale=5.0,
                      generator=torch.Generator(device="cuda").manual_seed(shot["seed"]),
                      callback_on_step_end=progress, **conditioning).frames[0]
        raw = out / (shot["name"] + "-raw.mp4")
        export_to_video(frames, str(raw), fps=24, quality=9)
        target_video = out / (shot["name"] + ".mp4")
        command = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-hwaccel", "cuda", "-i", str(raw), "-c:v", "h264_nvenc", "-preset", "p6", "-rc", "vbr", "-cq", "18", "-b:v", "0", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(target_video)]
        subprocess.run(command, check=True)
        probe = json.loads(subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(target_video)], capture_output=True, text=True, check=True).stdout)
        receipt = {"status": "GENERATED_PENDING_VISUAL_REVIEW", "shot": shot, "negative_prompt": shot.get("negative_prompt", NEGATIVE),
                   "pipeline":pipeline_class.__name__,"referenceImageSha256":reference_hash,
                   "model": json.loads((work / "wan-model-receipt.json").read_text()),
                   "gpu": torch.cuda.get_device_name(0), "torch": torch.__version__, "cuda": torch.version.cuda,
                   "diffusers": diffusers.__version__, "dtype": "bfloat16; VAE float32", "steps": steps,
                   "frame_count": len(frames), "fps": 24, "width": width, "height": height,
                   "load_seconds": load_seconds, "shot_seconds": time.monotonic()-clock,
                   "peak_cuda_allocated_bytes": torch.cuda.max_memory_allocated(),
                   "peak_cuda_reserved_bytes": torch.cuda.max_memory_reserved(),
                   "sha256": hashlib.sha256(target_video.read_bytes()).hexdigest(), "bytes": target_video.stat().st_size,
                   "encode_command": command, "probe": probe, "completed_at": datetime.now(timezone.utc).isoformat()}
        (out / (shot["name"] + "-receipt.json")).write_text(json.dumps(receipt, indent=2))
        print(json.dumps({"stage": "SHOT_READY", "shot": shot["name"], "elapsed_seconds": receipt["shot_seconds"], "video": str(target_video)}), flush=True)
        del frames
        torch.cuda.empty_cache()


def decoder_check(work, expected_gpu="NVIDIA L40S"):
    """Exercise the real tiled 5B decoder before expensive inference."""
    import torch
    import diffusers
    from diffusers import AutoencoderKLWan
    require_gpu(torch, expected_gpu)
    vae = AutoencoderKLWan.from_pretrained(str(work / "models/wan-ti2v-5b"), subfolder="vae",
                                         torch_dtype=torch.float32, local_files_only=True).to("cuda")
    vae.enable_tiling()
    clock = time.monotonic()
    with torch.inference_mode():
        decoded = vae.decode(torch.zeros((1, 48, 2, 44, 80), device="cuda"), return_dict=False)[0]
    assert tuple(decoded.shape) == (1, 3, 5, 704, 1280), tuple(decoded.shape)
    assert torch.isfinite(decoded).all().item()
    receipt = {"status": "PASS", "diffusers": diffusers.__version__, "tiled_decode": True,
               "decoded_shape": list(decoded.shape), "seconds": time.monotonic() - clock,
               "gpu": torch.cuda.get_device_name(0)}
    (work / "wan-decoder-check.json").write_text(json.dumps(receipt, indent=2))
    print(json.dumps(receipt), flush=True)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--work", type=Path, default=Path("/work"))
    p.add_argument("--prepare", action="store_true")
    p.add_argument("--shots", nargs="*")
    p.add_argument("--decoder-check", action="store_true")
    p.add_argument("--expected-gpu", default="NVIDIA L40S")
    p.add_argument("--shot-plan", type=Path, help="Private Content Factory shot plan; never a shell command")
    args = p.parse_args()
    if args.prepare:
        prepare(args.work)
    elif args.decoder_check:
        decoder_check(args.work, args.expected_gpu)
    else:
        plan = json.loads(args.shot_plan.read_text()) if args.shot_plan else {}
        generate(args.work, args.shots, args.expected_gpu, plan.get("shots"), plan.get("settings"))
