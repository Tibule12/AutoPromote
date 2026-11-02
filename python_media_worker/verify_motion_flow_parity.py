#!/usr/bin/env python3
"""Execute a local CPU FFmpeg render and verify pixel parity against headless browser stage captures.

Scope:
- Runs the real `render_viral_clip_impl` worker pipeline on CPU with Firebase upload stubbed to `file://`
  so zero cloud/network writes or paid GPU calls occur.
- Verifies full video + AAC decode of `final.mp4` via `ffprobe` and `ffmpeg -f null -`.
- Compares paired `preview-<t>.png` vs `final-<t>.png` frames across declared timestamps, asserting
  `IoU >= min_iou` (default 0.95) and symmetric 2D Euclidean boundary `p95 <= max_p95_px` (default 2.0px)
  in native `360x640` output pixels.
"""

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


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def extract_cyan_mask(image: Image.Image) -> np.ndarray:
    rgb = np.asarray(image.convert("RGB"), dtype=np.int16)
    r = rgb[:, :, 0]
    g = rgb[:, :, 1]
    b = rgb[:, :, 2]
    # Isolates the track-matted cyan plate (#00e5ff) cleanly from #0a0f1a background
    # and the top-left neutral white "After" badge pill.
    return (r < 85) & (g > 155) & (b > 175) & ((b - r) > 100)


def extract_boundary_coords(mask: np.ndarray) -> np.ndarray:
    if not np.any(mask):
        return np.zeros((0, 2), dtype=np.float64)
    padded = np.pad(mask, 1, mode="constant", constant_values=False)
    interior = (
        padded[1:-1, 1:-1]
        & padded[:-2, 1:-1]
        & padded[2:, 1:-1]
        & padded[1:-1, :-2]
        & padded[1:-1, 2:]
    )
    boundary = mask & (~interior)
    ys, xs = np.nonzero(boundary)
    return np.column_stack([xs.astype(np.float64), ys.astype(np.float64)])


def compute_mask_parity(preview_mask: np.ndarray, final_mask: np.ndarray) -> dict:
    inter = int(np.count_nonzero(preview_mask & final_mask))
    union = int(np.count_nonzero(preview_mask | final_mask))
    iou = float(inter / union) if union > 0 else 0.0

    b_prev = extract_boundary_coords(preview_mask)
    b_final = extract_boundary_coords(final_mask)
    if len(b_prev) == 0 or len(b_final) == 0:
        return {
            "iou": round(iou, 6),
            "boundary_p95_px": 999.0,
            "boundary_max_px": 999.0,
            "preview_area_px": int(np.count_nonzero(preview_mask)),
            "final_area_px": int(np.count_nonzero(final_mask)),
            "centroid_delta_px": [999.0, 999.0],
        }

    diff_xy = b_prev[:, None, :] - b_final[None, :, :]
    dist_matrix = np.hypot(diff_xy[:, :, 0], diff_xy[:, :, 1])
    d_prev_to_final = dist_matrix.min(axis=1)
    d_final_to_prev = dist_matrix.min(axis=0)
    sym_distances = np.concatenate([d_prev_to_final, d_final_to_prev])

    py_prev, px_prev = np.nonzero(preview_mask)
    py_final, fx_final = np.nonzero(final_mask)
    cx_delta = float(px_prev.mean() - fx_final.mean())
    cy_delta = float(py_prev.mean() - py_final.mean())

    return {
        "iou": round(iou, 6),
        "boundary_p95_px": round(float(np.percentile(sym_distances, 95)), 4),
        "boundary_mean_px": round(float(sym_distances.mean()), 4),
        "boundary_max_px": round(float(sym_distances.max()), 4),
        "preview_area_px": int(np.count_nonzero(preview_mask)),
        "final_area_px": int(np.count_nonzero(final_mask)),
        "centroid_delta_px": [round(cx_delta, 3), round(cy_delta, 3)],
    }


def save_diff_visualization(
    preview_img: Image.Image,
    preview_mask: np.ndarray,
    final_mask: np.ndarray,
    out_path: Path,
) -> None:
    vis = np.asarray(preview_img.convert("RGB"), dtype=np.uint8).copy()
    overlap = preview_mask & final_mask
    only_prev = preview_mask & (~final_mask)
    only_final = final_mask & (~preview_mask)
    vis[overlap] = np.array([0, 229, 255], dtype=np.uint8)
    vis[only_prev] = np.array([255, 64, 129], dtype=np.uint8)
    vis[only_final] = np.array([255, 214, 0], dtype=np.uint8)
    Image.fromarray(vis, mode="RGB").save(out_path)


def probe_media(video_path: Path) -> dict:
    probe_cmd = [
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
    ]
    probe = subprocess.run(probe_cmd, check=True, capture_output=True, text=True)
    info = json.loads(probe.stdout)

    decode_cmd = [
        "ffmpeg",
        "-v",
        "error",
        "-i",
        str(video_path),
        "-f",
        "null",
        "-",
    ]
    decode = subprocess.run(decode_cmd, capture_output=True, text=True)
    if decode.returncode != 0 or decode.stderr.strip():
        raise RuntimeError(f"Full decode check failed for {video_path}: {decode.stderr.strip()}")
    info["full_decode_clean"] = True
    return info


def extract_exact_frame(video_path: Path, frame_idx: int, dest_png: Path) -> None:
    cmd = [
        "ffmpeg",
        "-y",
        "-v",
        "error",
        "-i",
        str(video_path),
        "-vf",
        f"select=eq(n\\,{frame_idx})",
        "-vsync",
        "0",
        "-frames:v",
        "1",
        str(dest_png),
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0 or not dest_png.exists():
        raise RuntimeError(f"Failed to extract frame {frame_idx} from {video_path}: {res.stderr}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--folder", type=Path, required=True)
    parser.add_argument("--times", type=float, nargs="+", default=[0.50, 1.50, 2.50, 3.50])
    parser.add_argument("--min-iou", type=float, default=0.95)
    parser.add_argument("--max-p95-px", type=float, default=2.0)
    args = parser.parse_args()

    folder = args.folder.resolve()
    req_file = folder / "render-request.json"
    if not req_file.exists():
        raise FileNotFoundError(f"Missing {req_file}")

    envelope = json.loads(req_file.read_text(encoding="utf-8"))
    payload = envelope["renderRequest"] if "renderRequest" in envelope else envelope

    from python_media_worker import main_media_server

    # Keep execution 100% local on CPU with zero Firebase/cloud writes.
    uploaded_intercepts: list[str] = []

    def _local_file_stub(local_path: str, destination_path: str | None = None) -> str:
        abs_path = os.path.abspath(local_path)
        uploaded_intercepts.append(abs_path)
        return f"file://{abs_path}"

    main_media_server.upload_file_to_firebase = _local_file_stub

    request_model = main_media_server.RenderViralRequest(**payload)
    render_result = asyncio.run(
        main_media_server.render_viral_clip_impl(request_model, "autopromote_flow_parity_20261031")
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

    media_info = probe_media(final_mp4)
    streams = media_info.get("streams", [])
    video_stream = next((s for s in streams if s.get("codec_type") == "video"), None)
    audio_stream = next((s for s in streams if s.get("codec_type") == "audio"), None)
    if not video_stream or not audio_stream:
        raise AssertionError(f"Expected both video and audio streams in final.mp4: {streams}")

    width = int(video_stream["width"])
    height = int(video_stream["height"])
    nb_frames = int(video_stream.get("nb_frames") or 0)
    channels = int(audio_stream.get("channels") or 0)
    if (width, height) != (360, 640):
        raise AssertionError(f"Expected 360x640 video, got {width}x{height}")
    if abs(nb_frames - 144) > 1:
        raise AssertionError(f"Expected ~144 frames at 24fps for 6.0s clip, got {nb_frames}")
    if channels not in (1, 2):
        raise AssertionError(f"Expected 1- or 2-channel AAC audio, got {channels}")

    fps = 24
    frame_results = []
    all_passed = True

    for t in args.times:
        tag = f"{t:.2f}"
        preview_png = folder / f"preview-{tag}.png"
        if not preview_png.exists():
            raise FileNotFoundError(f"Missing browser stage capture: {preview_png}")
        frame_idx = int(round(t * fps))
        final_png = folder / f"final-{tag}.png"
        diff_png = folder / f"diff-{tag}.png"
        extract_exact_frame(final_mp4, frame_idx, final_png)

        raw_preview = Image.open(preview_png)
        final_img = Image.open(final_png)
        norm_preview = raw_preview.resize(final_img.size, Image.Resampling.LANCZOS)

        prev_mask = extract_cyan_mask(norm_preview)
        fin_mask = extract_cyan_mask(final_img)
        metrics = compute_mask_parity(prev_mask, fin_mask)
        save_diff_visualization(norm_preview, prev_mask, fin_mask, diff_png)

        frame_pass = (
            metrics["iou"] >= args.min_iou and metrics["boundary_p95_px"] <= args.max_p95_px
        )
        if not frame_pass:
            all_passed = False

        frame_results.append(
            {
                "time_seconds": round(t, 3),
                "frame_index": frame_idx,
                "preview_raw_size": list(raw_preview.size),
                "final_size": list(final_img.size),
                **metrics,
                "passed": frame_pass,
                "preview_sha256": sha256_file(preview_png),
                "final_sha256": sha256_file(final_png),
                "diff_sha256": sha256_file(diff_png),
            }
        )

    receipt = {
        "passed": all_passed,
        "scope": (
            "Local loopback pre-final browser stage vs local CPU FFmpeg worker render parity "
            "for AutoPromote Comp & Rig (Null Rig parenting, loop/wiggle/spin Motion Drivers, Bezier "
            "keyframe preset, Alpha Track Matte) + Signal Node Flow canonical compilation. "
            "No cloud uploads, no GPU calls, and not a signed-in production export proof."
        ),
        "thresholds": {
            "min_iou": args.min_iou,
            "max_boundary_p95_px": args.max_p95_px,
        },
        "summary": {
            "min_measured_iou": min(r["iou"] for r in frame_results),
            "max_measured_boundary_p95_px": max(r["boundary_p95_px"] for r in frame_results),
            "frames_checked": len(frame_results),
        },
        "media_probe": {
            "width": width,
            "height": height,
            "fps": fps,
            "nb_frames": nb_frames,
            "duration_seconds": float(media_info.get("format", {}).get("duration") or 0.0),
            "video_codec": video_stream.get("codec_name"),
            "audio_codec": audio_stream.get("codec_name"),
            "audio_channels": channels,
            "full_decode_clean": True,
        },
        "artifacts": {
            "render_request_sha256": sha256_file(req_file),
            "final_mp4_sha256": sha256_file(final_mp4),
        },
        "frames": frame_results,
    }

    receipt_path = folder / "parity-receipt.json"
    receipt_path.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(receipt["summary"]))
    if not all_passed:
        raise SystemExit(
            f"Parity check failed thresholds: {json.dumps(frame_results, indent=2)}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

