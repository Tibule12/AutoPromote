#!/usr/bin/env python3
"""Verify compiled Hollywood VFX Studio project renders end-to-end through the real Python worker."""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
if str(REPO_ROOT / "python_media_worker") not in sys.path:
    sys.path.insert(0, str(REPO_ROOT / "python_media_worker"))


def validate_cube_lut(cube_path: Path) -> dict:
    if not cube_path.exists():
        raise FileNotFoundError(f"Missing exported .cube LUT at {cube_path}")
    lines = [ln.strip() for ln in cube_path.read_text(encoding="utf-8").splitlines() if ln.strip() and not ln.strip().startswith("#")]
    size_line = next((ln for ln in lines if ln.startswith("LUT_3D_SIZE")), None)
    if not size_line:
        raise ValueError(".cube file missing LUT_3D_SIZE header")
    size = int(size_line.split()[1])
    triplets = [
        ln.split()
        for ln in lines
        if not ln.startswith(("TITLE", "LUT_3D_SIZE", "DOMAIN_MIN", "DOMAIN_MAX"))
    ]
    if len(triplets) != size ** 3:
        raise ValueError(f"Expected {size**3} LUT entries, got {len(triplets)}")
    for idx, row in enumerate(triplets[:32]):
        vals = [float(v) for v in row]
        if len(vals) != 3 or not all(-0.5 <= v <= 1.5 for v in vals):
            raise ValueError(f"Invalid LUT entry at row {idx}: {row}")
    return {"lut_3d_size": size, "entry_count": len(triplets), "sha256": sha256_file(cube_path)}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def probe_and_verify_decode(video_path: Path) -> dict:
    info = json.loads(
        subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "stream=codec_type,codec_name,width,height,r_frame_rate,nb_frames,channels,sample_rate",
                "-show_entries",
                "format=duration,size",
                "-of",
                "json",
                str(video_path),
            ],
            check=True,
            capture_output=True,
            text=True,
        ).stdout
    )
    decode = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(video_path), "-f", "null", "-"],
        capture_output=True,
        text=True,
    )
    if decode.returncode != 0 or decode.stderr.strip():
        raise RuntimeError(f"Full decode check failed for {video_path}: {decode.stderr.strip()}")
    info["full_decode_clean"] = True
    return info


def extract_frame_at(video_path: Path, timestamp: float, dest_png: Path, size: tuple[int, int] | None = None) -> np.ndarray:
    cmd = [
        "ffmpeg",
        "-y",
        "-v",
        "error",
        "-ss",
        f"{timestamp:.3f}",
        "-i",
        str(video_path),
        "-frames:v",
        "1",
    ]
    if size is not None:
        cmd.extend(["-vf", f"scale={size[0]}:{size[1]}"])
    cmd.append(str(dest_png))
    subprocess.run(cmd, check=True, capture_output=True, text=True)
    return np.asarray(Image.open(dest_png).convert("RGB"), dtype=np.float32)


def assert_compiled_vfx_contract(payload: dict) -> dict:
    finish = payload.get("finish_plan") or {}
    comp = payload.get("composition_plan") or {}
    sky = finish.get("sky_replace") or {}
    tex = finish.get("texture") or {}
    color = finish.get("color") or {}
    effects = finish.get("creative_effects") or []
    layers = comp.get("layers") or []

    assert sky.get("enabled") is True and sky.get("preset") == "sunset_gold", f"Missing sky_replace: {sky}"
    assert abs(float(tex.get("lens_distortion") or 0)) > 0.1, f"Missing lens_distortion: {tex}"
    assert float(tex.get("rack_focus") or 0) > 0.2, f"Missing rack_focus: {tex}"
    assert float(tex.get("atmospheric_haze") or 0) > 0.1, f"Missing atmospheric_haze: {tex}"
    assert bool(color.get("precisionGrade")), f"Missing precisionGrade: {color}"

    effect_ids = [str(e.get("effectId") or "") for e in effects]
    assert "particle_overlays" in effect_ids, f"Missing particle_overlays: {effect_ids}"
    assert "kinetic_typography" in effect_ids, f"Missing kinetic_typography: {effect_ids}"
    assert "ripped_paper" in effect_ids, f"Missing ripped_paper: {effect_ids}"

    fill_layer = next((l for l in layers if l.get("id") == "fill-cyan"), None)
    assert fill_layer is not None, f"Missing fill-cyan layer in composition_plan"
    fx = fill_layer.get("effects") or {}
    assert fx.get("linear_light") is True, f"Missing linear_light on fill-cyan: {fx}"
    assert (fx.get("light_wrap") or {}).get("enabled") is True, f"Missing light_wrap: {fx}"
    assert (fx.get("mesh_warp") or {}).get("enabled") is True, f"Missing mesh_warp: {fx}"
    assert (fx.get("screen_replace") or {}).get("enabled") is True, f"Missing screen_replace: {fx}"
    key_node = (fx.get("node") or {}).get("key") or {}
    assert key_node.get("enabled") is True and key_node.get("mode") == "hsl_delta", f"Unexpected keyer node spec: {fx}"

    return {
        "sky_preset": sky.get("preset"),
        "lens_distortion": tex.get("lens_distortion"),
        "rack_focus": tex.get("rack_focus"),
        "atmospheric_haze": tex.get("atmospheric_haze"),
        "creative_effect_ids": effect_ids,
        "layer_flags": {
            "linear_light": bool(fx.get("linear_light")),
            "light_wrap": bool((fx.get("light_wrap") or {}).get("enabled")),
            "mesh_warp": bool((fx.get("mesh_warp") or {}).get("enabled")),
            "screen_replace": bool((fx.get("screen_replace") or {}).get("enabled")),
            "chroma_key": bool(key_node.get("enabled")),
            "chroma_key_mode": key_node.get("mode"),
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--folder", type=Path, required=True)
    args = parser.parse_args()

    folder = args.folder.resolve()
    req_file = folder / "render-request.json"
    if not req_file.exists():
        raise FileNotFoundError(f"Missing {req_file}")

    envelope = json.loads(req_file.read_text(encoding="utf-8"))
    payload = envelope["renderRequest"] if "renderRequest" in envelope else envelope

    cube_info = validate_cube_lut(folder / "exported-grade.cube")
    contract_summary = assert_compiled_vfx_contract(payload)

    from python_media_worker import main_media_server

    uploaded_intercepts: list[str] = []

    def _local_file_stub(local_path: str, destination_path: str | None = None) -> str:
        abs_path = os.path.abspath(local_path)
        uploaded_intercepts.append(abs_path)
        return f"file://{abs_path}"

    main_media_server.upload_file_to_firebase = _local_file_stub

    request_model = main_media_server.RenderViralRequest(**payload)
    render_result = asyncio.run(
        main_media_server.render_viral_clip_impl(request_model, "autopromote_hollywood_vfx_e2e")
    )
    rendered_url = str(render_result.get("url") or render_result.get("output_url") or "")
    source_mp4 = (
        Path(rendered_url.removeprefix("file://"))
        if rendered_url.startswith("file://")
        else Path(uploaded_intercepts[-1])
    )
    if not source_mp4.exists():
        raise FileNotFoundError(f"Rendered MP4 missing on disk: {source_mp4}")

    final_mp4 = folder / "final.mp4"
    shutil.copy2(source_mp4, final_mp4)
    media_info = probe_and_verify_decode(final_mp4)
    streams = media_info.get("streams", [])
    v_stream = next((s for s in streams if s.get("codec_type") == "video"), None)
    a_stream = next((s for s in streams if s.get("codec_type") == "audio"), None)
    assert v_stream and a_stream, f"Expected both video and audio streams: {streams}"
    w, h = int(v_stream["width"]), int(v_stream["height"])
    assert w >= 360 and h >= 640 and abs((w / h) - (9 / 16)) < 0.02, f"Unexpected 9:16 output dimensions: {w}x{h}"

    source_video = folder / "motionflow-source.mp4"
    src_ref = extract_frame_at(source_video, 0.50, folder / "source-0.50.png", size=(w, h))

    timestamps = [0.50, 2.00, 3.50, 5.00]
    frame_stats = []
    for t in timestamps:
        png = folder / f"final-{t:.2f}.png"
        arr = extract_frame_at(final_mp4, t, png)
        mean_abs_delta_vs_src = float(np.mean(np.abs(arr - src_ref)))
        luma_std = float(np.std(arr.mean(axis=2)))
        assert luma_std > 4.0, f"Output frame {t:.2f}s looks blank/uniform (std={luma_std:.2f})"
        frame_stats.append({
            "time_seconds": t,
            "mean_abs_delta_vs_source": round(mean_abs_delta_vs_src, 3),
            "luma_std": round(luma_std, 3),
            "png_sha256": sha256_file(png),
        })

    assert max(f["mean_abs_delta_vs_source"] for f in frame_stats) > 4.0, (
        f"Rendered frames did not diverge from untreated source: {frame_stats}"
    )

    receipt = {
        "passed": True,
        "cube_export": cube_info,
        "contract_summary": contract_summary,
        "media_probe": {
            "width": w,
            "height": h,
            "nb_frames": int(v_stream.get("nb_frames") or 0),
            "duration_seconds": float(media_info.get("format", {}).get("duration") or 0.0),
            "video_codec": v_stream.get("codec_name"),
            "audio_codec": a_stream.get("codec_name"),
            "full_decode_clean": True,
        },
        "frame_stats": frame_stats,
        "final_mp4_sha256": sha256_file(final_mp4),
    }
    (folder / "hollywood-e2e-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(receipt["media_probe"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
