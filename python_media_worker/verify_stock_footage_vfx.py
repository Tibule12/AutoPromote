#!/usr/bin/env python3
"""Run 6 HD real-footage VFX showcase scenarios through AutoPromote Studio worker pipelines."""

from __future__ import annotations

import asyncio
import functools
import http.server
import json
import os
import shutil
import socketserver
import subprocess
import sys
import threading
from pathlib import Path

import numpy as np
from PIL import Image

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
if str(REPO_ROOT / "python_media_worker") not in sys.path:
    sys.path.insert(0, str(REPO_ROOT / "python_media_worker"))

STOCK_DIR = REPO_ROOT / "reports/studio-hollywood-vfx-20261122/stock-videos"
FEATURE_LABS_DIR = REPO_ROOT.parent / "tutorials/assets/feature-labs"
OUT_DIR = REPO_ROOT / "reports/studio-hollywood-vfx-20261122/stock-vfx-results"


class _QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        return


def start_local_server(directory: Path):
    handler = functools.partial(_QuietHandler, directory=str(directory))
    httpd = socketserver.TCPServer(("127.0.0.1", 0), handler)
    port = httpd.server_address[1]
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    return httpd, port


def run_cmd(cmd: list[str]) -> bytes:
    return subprocess.run(cmd, check=True, capture_output=True).stdout


def extract_png(video_path: Path, t: float, dest: Path) -> np.ndarray:
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-ss", f"{t:.3f}", "-i", str(video_path), "-frames:v", "1", str(dest)],
        check=True,
        capture_output=True,
        text=True,
    )
    return np.asarray(Image.open(dest).convert("RGB"), dtype=np.float32)


def verify_output(video_path: Path, expect_audio: bool = True) -> dict:
    info = json.loads(
        subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "stream=codec_type,codec_name,width,height,r_frame_rate,nb_frames,channels",
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
        raise RuntimeError(f"Full decode failed for {video_path}: {decode.stderr.strip()}")
    streams = info.get("streams") or []
    v_stream = next((s for s in streams if s.get("codec_type") == "video"), None)
    a_stream = next((s for s in streams if s.get("codec_type") == "audio"), None)
    assert v_stream is not None, f"Missing video stream in {video_path}"
    if expect_audio:
        assert a_stream is not None, f"Missing audio stream in {video_path}"
    return {
        "width": int(v_stream["width"]),
        "height": int(v_stream["height"]),
        "video_codec": v_stream.get("codec_name"),
        "audio_codec": a_stream.get("codec_name") if a_stream else None,
        "nb_frames": int(v_stream.get("nb_frames") or 0),
        "duration_seconds": round(float((info.get("format") or {}).get("duration") or 0.0), 3),
        "bytes": video_path.stat().st_size,
        "full_decode_clean": True,
    }


def make_render_helper(main_media_server):
    intercepted: list[str] = []

    def _stub(local_path: str, destination_path: str | None = None) -> str:
        abs_p = os.path.abspath(local_path)
        intercepted.append(abs_p)
        return f"file://{abs_p}"

    main_media_server.upload_file_to_firebase = _stub

    def execute(payload: dict, job_id: str, dest: Path) -> Path:
        req = main_media_server.RenderViralRequest(**payload)
        res = asyncio.run(main_media_server.render_viral_clip_impl(req, job_id))
        url = str(res.get("url") or res.get("output_url") or "")
        src = Path(url.removeprefix("file://")) if url.startswith("file://") else Path(intercepted[-1])
        shutil.copy2(src, dest)
        return dest

    return execute


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    frames_dir = OUT_DIR / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)

    from python_media_worker import main_media_server
    from python_media_worker.studio_region_tracking import track_planar_corners

    execute_render = make_render_helper(main_media_server)
    httpd_stock, stock_port = start_local_server(STOCK_DIR)
    httpd_labs = None
    labs_url = None
    if FEATURE_LABS_DIR.is_dir():
        httpd_labs, labs_port = start_local_server(FEATURE_LABS_DIR)
        labs_url = f"http://127.0.0.1:{labs_port}"

    base_url = f"http://127.0.0.1:{stock_port}"
    neon_perf_url = f"{labs_url}/Neon%20performance.mp4" if labs_url else f"{base_url}/sky_landscape_10931363.mp4"
    neon_src_url = f"{labs_url}/Neon%20source.mp4" if labs_url else f"{base_url}/laptop_screen_track_15770788.mp4"
    results = {}

    try:
        # ------------------------------------------------------------------
        # CASE 1: Studio ChromaKeyer (luminance-protected hsl_delta + single-channel despill)
        #         + Soft Light Wrap + Horizon Sunset Sky Replace (1280x720)
        # ------------------------------------------------------------------
        case1_mp4 = execute_render(
            {
                "video_url": f"{base_url}/sky_landscape_10931363.mp4",
                "start_time": 0.0,
                "end_time": 4.0,
                "timeline_segments": [
                    {
                        "id": "sky-bg",
                        "url": f"{base_url}/sky_landscape_10931363.mp4",
                        "start_time": 3.0,
                        "end_time": 7.0,
                        "duration": 4.0,
                    }
                ],
                "overlays": [
                    {
                        "id": "gs-actors",
                        "type": "video",
                        "src": f"{base_url}/greenscreen_actor_9465046.mp4",
                        "sourceStartTime": 2.0,
                        "startTime": 0.0,
                        "start_time": 0.0,
                        "duration": 4.0,
                        "x": 50.0,
                        "y": 51.0,
                        "width": 100.0,
                        "height": 102.0,
                        "scale": 1.0,
                        "rotation": 0.0,
                        "opacity": 1.0,
                        "mediaFit": "cover",
                        "bRollMode": "fullscreen",
                        "frameShape": "edge",
                        "useOverlayAudio": False,
                    }
                ],
                "finish_plan": {
                    "sky_replace": {
                        "enabled": True,
                        "preset": "sunset_gold",
                        "horizon_pct": 58,
                        "threshold": 0.46,
                        "softness": 0.22,
                        "blend": 0.88,
                        "temperature_match": 0.36,
                    },
                    "texture": {
                        "pixel_version": 1,
                        "atmospheric_haze": 0.14,
                        "haze_color": "#f6c89f",
                    },
                },
                "composition_plan": {
                    "layers": [
                        {
                            "id": "gs-actors",
                            "type": "video",
                            "blend_mode": "normal",
                            "base_transform": {"x": 50, "y": 51, "scale": 1, "rotation": 0, "opacity": 1},
                            "anchor_x": 50,
                            "anchor_y": 50,
                            "effects": {
                                "node": {
                                    "version": 1,
                                    "key": {
                                        "enabled": True,
                                        "mode": "hsl_delta",
                                        "color": "#98dcbd",
                                        "similarity": 0.115,
                                        "smoothness": 0.08,
                                        "spill": 0.78,
                                        "choke": 0,
                                        "invert": False,
                                    },
                                    "optical": {"halation": 0, "streak": 0},
                                    "warp": {"enabled": False, "x": 8, "y": 6, "frequency": 2.2},
                                    "defocus": 0,
                                    "depth": 0,
                                },
                                "light_wrap": {"enabled": True, "intensity": 0.24, "radius": 8},
                            },
                        }
                    ]
                },
                "smart_crop": False,
                "brand_watermark": False,
                "output_settings": {"width": 1280, "height": 720, "fps": 24, "aspectRatio": "16:9"},
            },
            "stock_case_1_greenscreen_sky",
            OUT_DIR / "stock_case_1_greenscreen_sky.mp4",
        )
        c1_probe = verify_output(case1_mp4, expect_audio=True)
        c1_f0 = extract_png(case1_mp4, 0.5, frames_dir / "stock_c1_t0.5.png")
        c1_f1 = extract_png(case1_mp4, 2.0, frames_dir / "stock_c1_t2.0.png")
        c1_f2 = extract_png(case1_mp4, 3.5, frames_dir / "stock_c1_t3.5.png")
        top_band = c1_f1[: int(c1_f1.shape[0] * 0.25), :, :]
        mint_ratio = float(np.mean((top_band[:, :, 1] > 180) & (top_band[:, :, 1] - top_band[:, :, 0] > 30)))
        results["case_1_greenscreen_actors_over_miami_sky"] = {
            **c1_probe,
            "residual_mint_green_sky_ratio": round(mint_ratio, 4),
            "top_sky_mean_rgb": [round(float(x), 1) for x in top_band.mean(axis=(0, 1))],
        }
        print("[stock-vfx] CASE 1 DONE:", json.dumps(results["case_1_greenscreen_actors_over_miami_sky"]))

        # ------------------------------------------------------------------
        # CASE 2: 129-Keyframe Planar Track + Edge-to-Edge MacBook Screen Replace (1280x720)
        #         Inserts widescreen 16:9 Neon Performance video cleanly flush to bezel!
        # ------------------------------------------------------------------
        laptop_file = STOCK_DIR / "laptop_screen_track_15770788.mp4"
        raw_laptop = run_cmd(
            ["ffmpeg", "-v", "error", "-t", "4", "-i", str(laptop_file), "-vf", "fps=4,scale=480:270", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]
        )
        laptop_frames = list(np.frombuffer(raw_laptop, dtype=np.uint8).reshape(-1, 270, 480, 3))
        laptop_times = [round(i * 0.25, 3) for i in range(len(laptop_frames))]
        # Expanded slightly onto the outer black aluminum bezel to eliminate any green rim
        initial_quad = [[20.12, 54.95], [39.04, 52.85], [41.30, 81.85], [22.38, 86.85]]
        planar_res = track_planar_corners(laptop_frames, laptop_times, initial_quad)
        planar_keys_canvas = planar_res["keyframes"]
        box_x, box_y, box_w, box_h = 30.7, 69.6, 23.5, 36.0
        left_pct, top_pct = box_x - box_w / 2.0, box_y - box_h / 2.0
        to_box_x = lambda fx: round(max(0.0, min(100.0, (fx - left_pct) / box_w * 100.0)), 2)
        to_box_y = lambda fy: round(max(0.0, min(100.0, (fy - top_pct) / box_h * 100.0)), 2)
        box_quad = [[to_box_x(qx), to_box_y(qy)] for qx, qy in initial_quad]
        planar_keys = []
        for k in planar_keys_canvas:
            prop = str(k.get("property") or "")
            if prop.startswith("planeCorner") and prop.endswith("X"):
                planar_keys.append({**k, "value": to_box_x(float(k["value"]))})
            elif prop.startswith("planeCorner") and prop.endswith("Y"):
                planar_keys.append({**k, "value": to_box_y(float(k["value"]))})
            else:
                planar_keys.append(k)
        flat_quad = [coord for pt in box_quad for coord in pt]

        case2_mp4 = execute_render(
            {
                "video_url": f"{base_url}/laptop_screen_track_15770788.mp4",
                "start_time": 0.0,
                "end_time": 4.0,
                "timeline_segments": [
                    {
                        "id": "laptop-bg",
                        "url": f"{base_url}/laptop_screen_track_15770788.mp4",
                        "start_time": 1.0,
                        "end_time": 5.0,
                        "duration": 4.0,
                    }
                ],
                "overlays": [
                    {
                        "id": "laptop-insert",
                        "type": "video",
                        "src": neon_perf_url,
                        "sourceStartTime": 1.5,
                        "startTime": 0.0,
                        "start_time": 0.0,
                        "duration": 4.0,
                        "x": box_x,
                        "y": box_y,
                        "width": box_w,
                        "height": box_h,
                        "scale": 1.0,
                        "rotation": 0.0,
                        "opacity": 0.98,
                        "mediaFit": "stretch",
                        "bRollMode": "pip",
                        "frameShape": "edge",
                        "useOverlayAudio": False,
                        "perspective": {"version": 1, "corners": flat_quad},
                        "perspectiveProgress": 100.0,
                    }
                ],
                "finish_plan": {
                    "texture": {
                        "pixel_version": 1,
                        "anamorphic_flare": 0.16,
                        "halation": 0.12,
                    }
                },
                "composition_plan": {
                    "layers": [
                        {
                            "id": "laptop-insert",
                            "type": "video",
                            "perspective": {"version": 1, "corners": flat_quad},
                            "blend_mode": "normal",
                            "base_transform": {"perspective_progress": 100, "x": box_x, "y": box_y, "scale": 1, "rotation": 0, "opacity": 0.98},
                            "anchor_x": 50,
                            "anchor_y": 50,
                            "motion_keyframes": planar_keys,
                            "effects": {
                                "screen_replace": {"enabled": True, "glare_preserve": 0.36},
                                "linear_light": False,
                            },
                        }
                    ]
                },
                "smart_crop": False,
                "brand_watermark": False,
                "output_settings": {"width": 1280, "height": 720, "fps": 24, "aspectRatio": "16:9"},
            },
            "stock_case_2_laptop_cornerpin",
            OUT_DIR / "stock_case_2_laptop_cornerpin.mp4",
        )
        c2_probe = verify_output(case2_mp4, expect_audio=True)
        c2_f0 = extract_png(case2_mp4, 0.5, frames_dir / "stock_c2_t0.5.png")
        c2_f1 = extract_png(case2_mp4, 2.0, frames_dir / "stock_c2_t2.0.png")
        c2_f2 = extract_png(case2_mp4, 3.5, frames_dir / "stock_c2_t3.5.png")
        h2, w2, _ = c2_f1.shape
        screen_roi = c2_f1[int(h2 * 0.58) : int(h2 * 0.78), int(w2 * 0.24) : int(w2 * 0.37)]
        green_dom = float(np.mean((screen_roi[:, :, 1] - screen_roi[:, :, 0] > 40) & (screen_roi[:, :, 1] > 130)))
        results["case_2_macbook_planar_screen_replace"] = {
            **c2_probe,
            "planar_keyframes_count": len(planar_keys),
            "remaining_green_screen_ratio": round(green_dom, 4),
            "screen_roi_mean_rgb": [round(float(x), 1) for x in screen_roi.mean(axis=(0, 1))],
        }
        print("[stock-vfx] CASE 2 DONE:", json.dumps(results["case_2_macbook_planar_screen_replace"]))

        # ------------------------------------------------------------------
        # CASE 3: Clean Photorealistic Miami Coast Twilight Sky Replace + Optical Lens + Rack Focus (1280x720)
        # ------------------------------------------------------------------
        case3_mp4 = execute_render(
            {
                "video_url": f"{base_url}/sky_landscape_10931363.mp4",
                "start_time": 0.0,
                "end_time": 4.0,
                "timeline_segments": [
                    {
                        "id": "miami-sky",
                        "url": f"{base_url}/sky_landscape_10931363.mp4",
                        "start_time": 4.0,
                        "end_time": 8.0,
                        "duration": 4.0,
                    }
                ],
                "overlays": [],
                "finish_plan": {
                    "sky_replace": {
                        "enabled": True,
                        "preset": "twilight_violet",
                        "horizon_pct": 58,
                        "threshold": 0.45,
                        "softness": 0.22,
                        "blend": 0.90,
                        "temperature_match": 0.38,
                    },
                    "color": {
                        "precisionGrade": True,
                        "exposureStops": -0.06,
                        "contrast": 1.10,
                        "saturation": 1.12,
                        "gamma": 1.03,
                        "gain": 1.0,
                        "lift": 0.0,
                    },
                    "texture": {
                        "pixel_version": 1,
                        "lens_distortion": -0.14,
                        "rack_focus": 0.32,
                        "focus_distance": 0.48,
                        "atmospheric_haze": 0.18,
                        "haze_color": "#a78bfa",
                        "film_grain": 0.10,
                    },
                },
                "smart_crop": False,
                "brand_watermark": False,
                "output_settings": {"width": 1280, "height": 720, "fps": 24, "aspectRatio": "16:9"},
            },
            "stock_case_3_miami_twilight_optics",
            OUT_DIR / "stock_case_3_miami_twilight_optics.mp4",
        )
        c3_probe = verify_output(case3_mp4, expect_audio=True)
        c3_f0 = extract_png(case3_mp4, 0.5, frames_dir / "stock_c3_t0.5.png")
        c3_f1 = extract_png(case3_mp4, 2.0, frames_dir / "stock_c3_t2.0.png")
        c3_f2 = extract_png(case3_mp4, 3.5, frames_dir / "stock_c3_t3.5.png")
        h3, _, _ = c3_f1.shape
        c3_sky_top = c3_f1[: int(h3 * 0.35), :, :].mean(axis=(0, 1))
        c3_water_bot = c3_f1[int(h3 * 0.72) :, :, :].mean(axis=(0, 1))
        results["case_3_miami_twilight_sky_optics_particles"] = {
            **c3_probe,
            "sky_top_mean_rgb": [round(float(x), 1) for x in c3_sky_top],
            "water_bottom_mean_rgb": [round(float(x), 1) for x in c3_water_bot],
        }
        print("[stock-vfx] CASE 3 DONE:", json.dumps(results["case_3_miami_twilight_sky_optics_particles"]))

        # ------------------------------------------------------------------
        # CASE 4: Neon Performance — Incandescent Rising Fire Embers + Halation + Lower-Third Title (1280x720)
        # ------------------------------------------------------------------
        case4_mp4 = execute_render(
            {
                "video_url": neon_perf_url,
                "start_time": 0.0,
                "end_time": 4.0,
                "timeline_segments": [
                    {
                        "id": "neon-perf",
                        "url": neon_perf_url,
                        "start_time": 0.0,
                        "end_time": 4.0,
                        "duration": 4.0,
                    }
                ],
                "overlays": [],
                "finish_plan": {
                    "color": {
                        "precisionGrade": True,
                        "exposureStops": 0.05,
                        "contrast": 1.08,
                        "saturation": 1.12,
                        "gamma": 1.02,
                        "gain": 1.02,
                        "lift": -0.01,
                    },
                    "texture": {
                        "pixel_version": 1,
                        "halation": 0.24,
                        "film_grain": 0.08,
                    },
                    "creative_effects": [
                        {
                            "id": "fx-neon-embers",
                            "effectId": "particle_overlays",
                            "enabled": True,
                            "startTime": 0.0,
                            "duration": 4.0,
                            "blendMode": "screen",
                            "opacity": 0.85,
                            "params": {
                                "particleType": "fire_embers",
                                "particleCount": 58,
                                "speed": 1.0,
                                "size": 8.5,
                                "direction": "up",
                                "color": "#ff7a18",
                                "secondaryColor": "#fde68a",
                                "gravity": 0.16,
                                "turbulence": 0.55,
                                "emitterX": 50.0,
                                "emitterY": 72.0,
                            },
                        },
                        {
                            "id": "fx-lower-title",
                            "effectId": "kinetic_typography",
                            "enabled": True,
                            "startTime": 0.3,
                            "duration": 3.5,
                            "blendMode": "normal",
                            "opacity": 0.96,
                            "params": {
                                "text": "AUTOPROMOTE STUDIO · CINEMA VFX",
                                "style": "karaoke_highlight",
                                "fontFamily": "Inter",
                                "fontSize": 24,
                                "color": "#f8fafc",
                                "highlightColor": "#fde047",
                                "bgColor": "#090d16",
                                "showBg": True,
                                "x": 50,
                                "y": 87,
                            },
                        },
                    ],
                },
                "smart_crop": False,
                "brand_watermark": False,
                "output_settings": {"width": 1280, "height": 720, "fps": 24, "aspectRatio": "16:9"},
            },
            "stock_case_4_neon_embers",
            OUT_DIR / "stock_case_4_neon_embers.mp4",
        )
        c4_probe = verify_output(case4_mp4, expect_audio=False)
        extract_png(case4_mp4, 0.8, frames_dir / "stock_c4_embers_t0.8.png")
        extract_png(case4_mp4, 2.2, frames_dir / "stock_c4_embers_t2.2.png")
        extract_png(case4_mp4, 3.5, frames_dir / "stock_c4_embers_t3.5.png")
        results["case_4_neon_embers_cinematic_title"] = c4_probe
        print("[stock-vfx] CASE 4 DONE:", json.dumps(results["case_4_neon_embers_cinematic_title"]))

        # ------------------------------------------------------------------
        # CASE 5: Aspect-Matched 16:9 Multi-Clip NLE xfade + Film Burn Light Leak + Audio Remix (1280x720)
        # ------------------------------------------------------------------
        case5_mp4 = execute_render(
            {
                "video_url": f"{base_url}/sky_landscape_10931363.mp4",
                "start_time": 0.0,
                "end_time": 4.4,
                "timeline_segments": [
                    {
                        "id": "seg-sky-wide",
                        "url": f"{base_url}/sky_landscape_10931363.mp4",
                        "start_time": 1.0,
                        "end_time": 3.5,
                        "duration": 2.5,
                    },
                    {
                        "id": "seg-neon-wide",
                        "url": neon_src_url,
                        "start_time": 1.0,
                        "end_time": 3.5,
                        "duration": 2.5,
                        "transition_in": "cross_dissolve",
                        "transition_duration": 0.65,
                    },
                ],
                "overlays": [],
                "finish_plan": {
                    "creative_effects": [
                        {
                            "id": "fx-transition-leak",
                            "effectId": "light_leaks",
                            "enabled": True,
                            "startTime": 1.7,
                            "duration": 1.1,
                            "blendMode": "screen",
                            "opacity": 0.72,
                            "params": {
                                "style": "film_burn_orange",
                                "mode": "clip_transition",
                                "direction": "left_to_right",
                                "intensity": 52,
                                "softness": 78,
                            },
                        },
                        {
                            "id": "fx-credits",
                            "effectId": "kinetic_typography",
                            "enabled": True,
                            "startTime": 2.2,
                            "duration": 2.0,
                            "blendMode": "normal",
                            "opacity": 0.94,
                            "params": {
                                "text": "SEAMLESS TIMELINE TRANSITIONS",
                                "style": "fade",
                                "fontFamily": "Inter",
                                "fontSize": 22,
                                "color": "#f8fafc",
                                "highlightColor": "#facc15",
                                "bgColor": "#090d16",
                                "showBg": True,
                                "x": 50,
                                "y": 87,
                            },
                        },
                    ]
                },
                "audio_remix": {"enabled": True, "preset": "warm_vocal", "target": "voice", "intensity": 0.65},
                "smart_crop": False,
                "brand_watermark": False,
                "output_settings": {"width": 1280, "height": 720, "fps": 24, "aspectRatio": "16:9"},
            },
            "stock_case_5_nle_xfade_wide",
            OUT_DIR / "stock_case_5_nle_xfade_wide.mp4",
        )
        c5_probe = verify_output(case5_mp4, expect_audio=True)
        extract_png(case5_mp4, 0.8, frames_dir / "stock_c5_t0.8.png")
        extract_png(case5_mp4, 2.15, frames_dir / "stock_c5_t2.15_xfade.png")
        extract_png(case5_mp4, 3.6, frames_dir / "stock_c5_t3.6.png")
        results["case_5_nle_xfade_aspect_matched"] = c5_probe
        print("[stock-vfx] CASE 5 DONE:", json.dumps(results["case_5_nle_xfade_aspect_matched"]))

        # ------------------------------------------------------------------
        # CASE 6: Clean 9:16 Vertical Reels Edit — Tear-Away Paper Intro + Light Leak + Kinetic Type (540x960)
        # ------------------------------------------------------------------
        case6_mp4 = execute_render(
            {
                "video_url": f"{base_url}/hd_dancer_portrait_8113110.mp4",
                "start_time": 0.0,
                "end_time": 4.0,
                "timeline_segments": [
                    {
                        "id": "seg-reel-dancer",
                        "url": f"{base_url}/hd_dancer_portrait_8113110.mp4",
                        "start_time": 1.0,
                        "end_time": 5.0,
                        "duration": 4.0,
                    }
                ],
                "overlays": [],
                "finish_plan": {
                    "color": {
                        "precisionGrade": True,
                        "contrast": 1.08,
                        "saturation": 1.12,
                    },
                    "creative_effects": [
                        {
                            "id": "fx-paper-reveal",
                            "effectId": "ripped_paper",
                            "enabled": True,
                            "startTime": 0.0,
                            "duration": 1.1,
                            "blendMode": "normal",
                            "opacity": 1.0,
                            "params": {
                                "mode": "tear_away_paper",
                                "direction": "vertical",
                                "tearPosition": 50,
                                "speed": 0.78,
                                "roughness": 52,
                                "shadow": 60,
                                "paperColor": "#f4ede0",
                                "fiberEdgeColor": "#ffffff",
                                "autoAnimate": True,
                            },
                        },
                        {
                            "id": "fx-reel-leak",
                            "effectId": "light_leaks",
                            "enabled": True,
                            "startTime": 1.0,
                            "duration": 3.0,
                            "blendMode": "screen",
                            "opacity": 0.65,
                            "params": {
                                "style": "cool_cyan",
                                "mode": "ambient",
                                "direction": "corner_pulse",
                                "intensity": 34,
                                "softness": 75,
                            },
                        },
                        {
                            "id": "fx-reel-title",
                            "effectId": "kinetic_typography",
                            "enabled": True,
                            "startTime": 0.9,
                            "duration": 3.0,
                            "blendMode": "normal",
                            "opacity": 0.95,
                            "params": {
                                "text": "STREET RHYTHM · REELS FX",
                                "style": "karaoke_highlight",
                                "fontFamily": "Inter",
                                "fontSize": 22,
                                "color": "#f8fafc",
                                "highlightColor": "#38bdf8",
                                "bgColor": "#090d16",
                                "showBg": True,
                                "x": 50,
                                "y": 85,
                            },
                        },
                    ],
                },
                "smart_crop": False,
                "brand_watermark": False,
                "output_settings": {"width": 540, "height": 960, "fps": 24, "aspectRatio": "9:16"},
            },
            "stock_case_6_vertical_reel",
            OUT_DIR / "stock_case_6_vertical_reel.mp4",
        )
        c6_probe = verify_output(case6_mp4, expect_audio=False)
        extract_png(case6_mp4, 0.35, frames_dir / "stock_c6_t0.35_tear.png")
        extract_png(case6_mp4, 2.0, frames_dir / "stock_c6_t2.0.png")
        extract_png(case6_mp4, 3.5, frames_dir / "stock_c6_t3.5.png")
        results["case_6_vertical_reel_ripped_paper_lightleak"] = c6_probe
        print("[stock-vfx] CASE 6 DONE:", json.dumps(results["case_6_vertical_reel_ripped_paper_lightleak"]))

        receipt = {"passed": True, "cases": results}
        (OUT_DIR / "stock-vfx-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(receipt))
        return 0
    finally:
        httpd_stock.shutdown()
        if httpd_labs is not None:
            httpd_labs.shutdown()


if __name__ == "__main__":
    raise SystemExit(main())
