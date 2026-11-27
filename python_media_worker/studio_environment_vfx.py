"""Sky replacement matte + ambient relighting and temporal clean-plate object removal."""
import math
import numpy as np
from PIL import Image, ImageFilter

SKY_PRESETS = {
    "sunset_gold": {"top": (58.0, 72.0, 148.0), "horizon": (255.0, 142.0, 72.0), "tint": (1.0, 0.72, 0.42)},
    "storm_indigo": {"top": (34.0, 48.0, 74.0), "horizon": (108.0, 126.0, 152.0), "tint": (0.55, 0.68, 0.85)},
    "clear_azure": {"top": (28.0, 108.0, 224.0), "horizon": (152.0, 212.0, 250.0), "tint": (0.70, 0.86, 1.0)},
    "twilight_violet": {"top": (26.0, 20.0, 68.0), "horizon": (196.0, 88.0, 175.0), "tint": (0.85, 0.56, 0.92)},
}


def _smoothstep(a, b, x):
    t = np.clip((x - a) / max(1e-5, b - a), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def compute_sky_matte(frame_rgb, *, threshold=0.48, horizon_pct=64.0, softness=0.22):
    arr = np.asarray(frame_rgb, dtype=np.float32) / 255.0
    h, w, _ = arr.shape
    ny = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None]
    horizon = max(0.15, min(0.95, float(horizon_pct) / 100.0))
    soft = max(0.04, float(softness))
    height_prior = 1.0 - _smoothstep(horizon - soft * 0.6, min(1.0, horizon + soft * 0.4), ny)
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
    blue_sky = np.maximum(0.0, b - np.maximum(r, g) * 0.82)
    chroma_span = np.maximum(np.abs(r - g), np.abs(g - b))
    # High neutral brightness reads as overcast sky while protecting dark building facades.
    low_tex_white = np.maximum(0.0, luma - chroma_span * 0.55) * _smoothstep(0.45, 0.78, luma)
    score = np.maximum(luma * 0.62 + blue_sky * 0.92, low_tex_white * 0.90)
    raw_matte = np.clip(height_prior * _smoothstep(threshold - soft * 0.45, threshold + soft * 0.45, score), 0.0, 1.0)
    # Feather matte edges by 1px to avoid crisp white outline halos around buildings.
    matte_img = Image.fromarray(np.clip(raw_matte * 255.0, 0, 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(1.0))
    matte = np.clip((np.asarray(matte_img, dtype=np.float32) / 255.0) * height_prior, 0.0, 1.0)
    return matte


def apply_sky_replacement_rgb(
    frame_rgb,
    *,
    preset="sunset_gold",
    sky_image=None,
    threshold=0.48,
    horizon_pct=64.0,
    softness=0.22,
    blend=0.92,
    temperature_match=0.32,
    time=0.0,
):
    if not preset or preset == "none":
        return frame_rgb
    spec = SKY_PRESETS.get(preset, SKY_PRESETS["sunset_gold"])
    arr = np.asarray(frame_rgb, dtype=np.float32)
    h, w, _ = arr.shape
    matte = compute_sky_matte(arr, threshold=threshold, horizon_pct=horizon_pct, softness=softness)[:, :, None] * max(0.0, min(1.0, float(blend)))

    if sky_image is not None:
        sky_arr = np.asarray(Image.fromarray(np.asarray(sky_image, dtype=np.uint8)).convert("RGB").resize((w, h), Image.Resampling.BICUBIC), dtype=np.float32)
    else:
        horizon_frac = max(0.15, float(horizon_pct) / 100.0)
        ny = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None]
        nx = np.linspace(0.0, 1.0, w, dtype=np.float32)[None, :]
        v_mix = np.clip(ny / horizon_frac, 0.0, 1.0) ** 0.82
        t = float(time)
        # Soft 2D atmospheric wisps across X and Y (no horizontal 1D stripes).
        wisp_a = np.sin(nx * 4.7 + ny * 6.3 + t * 0.18) * np.cos(nx * 3.1 - ny * 4.1 - t * 0.11)
        wisp_b = np.sin(nx * 9.3 - ny * 8.4 + t * 0.25) * 0.5
        cloud = np.clip(0.5 + 0.32 * wisp_a + 0.18 * wisp_b, 0.0, 1.0) * _smoothstep(0.12, horizon_frac * 0.92, ny)
        radial_glow = np.exp(-(((nx - 0.34) / 0.42) ** 2 + ((ny - horizon_frac * 0.78) / 0.34) ** 2))
        top = np.array(spec["top"], dtype=np.float32)[None, None, :]
        hor = np.array(spec["horizon"], dtype=np.float32)[None, None, :]
        base_sky = top * (1.0 - v_mix[:, :, None]) + hor * v_mix[:, :, None]
        wisp_col = (top * 0.35 + hor * 0.65)
        sky_arr = base_sky * (0.94 + 0.08 * cloud[:, :, None]) + wisp_col * (cloud[:, :, None] * 0.08) + hor * (radial_glow[:, :, None] * 0.20)
        sky_arr = np.clip(sky_arr, 0.0, 255.0)

    fg = arr.copy()
    tm = max(0.0, min(1.0, float(temperature_match)))
    if tm > 0.005:
        lum = (0.2126 * fg[:, :, 0] + 0.7152 * fg[:, :, 1] + 0.0722 * fg[:, :, 2]) / 255.0
        t_weight = (tm * (0.35 + 0.65 * lum))[:, :, None] * (1.0 - matte)
        tint = np.array(spec["tint"], dtype=np.float32)[None, None, :]
        fg = fg * (1.0 - t_weight * 0.25) + fg * tint * t_weight * 0.25

    out = fg * (1.0 - matte) + sky_arr * matte
    return np.clip(np.rint(out), 0, 255).astype(np.uint8)


def synthesize_temporal_clean_plate_rgb(frames, mask_sequence, target_index=0, search_radius=18, feather_px=6):
    """Remove an occluder at mask_sequence[target_index] via aligned temporal median of neighbors."""
    if not frames or len(frames) != len(mask_sequence):
        raise ValueError("Clean-plate synthesis requires matching frame and mask counts")
    target = np.asarray(frames[target_index], dtype=np.float32)
    t_mask = (np.asarray(mask_sequence[target_index], dtype=np.float32) > 0.5)
    h, w, _ = target.shape
    if not np.any(t_mask):
        return np.clip(target, 0, 255).astype(np.uint8)

    t_gray = 0.299 * target[:, :, 0] + 0.587 * target[:, :, 1] + 0.114 * target[:, :, 2]
    # Background pixels outside the masked object drive rigid background alignment
    bg_support = ~t_mask
    aligned_samples = []
    aligned_masks = []
    ys, xs = np.nonzero(t_mask)
    y0, y1 = max(0, int(ys.min()) - 4), min(h, int(ys.max()) + 5)
    x0, x1 = max(0, int(xs.min()) - 4), min(w, int(xs.max()) + 5)

    for idx, (frm, msk) in enumerate(zip(frames, mask_sequence)):
        if idx == target_index:
            continue
        cand = np.asarray(frm, dtype=np.float32)
        c_gray = 0.299 * cand[:, :, 0] + 0.587 * cand[:, :, 1] + 0.114 * cand[:, :, 2]
        c_mask = (np.asarray(msk, dtype=np.float32) > 0.5)
        best_sad, best_dx, best_dy = 1e9, 0, 0
        # Coarse-to-fine translation align on unmasked background region
        for step, rad, cx0, cy0 in ((3, search_radius, 0, 0), (1, 3, None, None)):
            base_x = cx0 if cx0 is not None else best_dx
            base_y = cy0 if cy0 is not None else best_dy
            for dy in range(base_y - rad, base_y + rad + 1, step):
                sy0, sy1 = max(0, -dy), min(h, h - dy)
                if sy1 - sy0 < 16:
                    continue
                for dx in range(base_x - rad, base_x + rad + 1, step):
                    sx0, sx1 = max(0, -dx), min(w, w - dx)
                    if sx1 - sx0 < 16:
                        continue
                    valid = bg_support[sy0:sy1, sx0:sx1] & (~c_mask[sy0 + dy:sy1 + dy, sx0 + dx:sx1 + dx])
                    if np.count_nonzero(valid) < 32:
                        continue
                    sad = float(np.mean(np.abs(t_gray[sy0:sy1, sx0:sx1][valid] - c_gray[sy0 + dy:sy1 + dy, sx0 + dx:sx1 + dx][valid])))
                    if sad < best_sad:
                        best_sad, best_dx, best_dy = sad, dx, dy
        shifted = np.roll(np.roll(cand, -best_dy, axis=0), -best_dx, axis=1)
        shifted_m = np.roll(np.roll(c_mask, -best_dy, axis=0), -best_dx, axis=1)
        aligned_samples.append(shifted)
        aligned_masks.append(~shifted_m)

    fill_rgb = target.copy()
    if aligned_samples:
        stack = np.stack(aligned_samples, axis=0)
        valid_mask = np.stack(aligned_masks, axis=0)
        # Pixelwise temporal median over frames where background is visible
        for py in range(y0, y1):
            for px in range(x0, x1):
                if not t_mask[py, px]:
                    continue
                vis = valid_mask[:, py, px]
                if np.any(vis):
                    fill_rgb[py, px] = np.median(stack[vis, py, px, :], axis=0)
                else:
                    # Fallback to local surrounding ring median inside target frame
                    ry0, ry1 = max(0, py - 12), min(h, py + 13)
                    rx0, rx1 = max(0, px - 12), min(w, px + 13)
                    nb = target[ry0:ry1, rx0:rx1][~t_mask[ry0:ry1, rx0:rx1]]
                    if len(nb):
                        fill_rgb[py, px] = np.median(nb, axis=0)

    mask_img = Image.fromarray((t_mask.astype(np.uint8) * 255), "L")
    if feather_px > 0:
        mask_img = mask_img.filter(ImageFilter.GaussianBlur(max(0.5, float(feather_px))))
    blend_alpha = np.asarray(mask_img, dtype=np.float32)[:, :, None] / 255.0
    out = target * (1.0 - blend_alpha) + fill_rgb * blend_alpha
    return np.clip(np.rint(out), 0, 255).astype(np.uint8)


def render_sky_replacement_video(input_path, output_path, sky_spec):
    """Apply animated sky replacement & ambient horizon color match across an MP4 file."""
    import json
    import subprocess
    if not isinstance(sky_spec, dict) or not sky_spec.get("enabled") or not sky_spec.get("preset") or sky_spec.get("preset") == "none":
        return str(input_path)
    probe = json.loads(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_streams", "-of", "json", str(input_path)
    ]))
    v_stream = next(s for s in probe["streams"] if s.get("codec_type") == "video")
    width, height = int(v_stream["width"]), int(v_stream["height"])
    has_audio = any(s.get("codec_type") == "audio" for s in probe["streams"])
    rate_parts = str(v_stream.get("avg_frame_rate") or v_stream.get("r_frame_rate") or "30/1").split("/")
    fps = max(1.0, float(rate_parts[0]) / max(1.0, float(rate_parts[1] if len(rate_parts) > 1 else 1)))

    dec_cmd = ["ffmpeg", "-nostdin", "-v", "error", "-i", str(input_path), "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]
    enc_cmd = [
        "ffmpeg", "-nostdin", "-v", "error",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{width}x{height}", "-r", f"{fps:.6f}", "-i", "pipe:0",
    ]
    if has_audio:
        enc_cmd.extend(["-i", str(input_path), "-map", "0:v:0", "-map", "1:a:0", "-c:a", "copy", "-shortest"])
    else:
        enc_cmd.extend(["-map", "0:v:0", "-an"])
    enc_cmd.extend(["-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-y", str(output_path)])

    decoder = subprocess.Popen(dec_cmd, stdout=subprocess.PIPE)
    encoder = subprocess.Popen(enc_cmd, stdin=subprocess.PIPE)
    frame_bytes = width * height * 3
    idx = 0
    try:
        while True:
            raw = bytearray()
            while len(raw) < frame_bytes:
                chunk = decoder.stdout.read(frame_bytes - len(raw))
                if not chunk:
                    break
                raw.extend(chunk)
            if len(raw) < frame_bytes:
                break
            arr = np.frombuffer(raw, dtype=np.uint8).reshape((height, width, 3))
            processed = apply_sky_replacement_rgb(
                arr,
                preset=str(sky_spec.get("preset") or "sunset_gold"),
                threshold=float(sky_spec.get("threshold", 0.48) or 0.48),
                horizon_pct=float(sky_spec.get("horizon_pct", 64.0) or 64.0),
                softness=float(sky_spec.get("softness", 0.22) or 0.22),
                blend=float(sky_spec.get("blend", 0.92) or 0.92),
                temperature_match=float(sky_spec.get("temperature_match", 0.32) or 0.32),
                time=idx / fps,
            )
            encoder.stdin.write(processed.tobytes())
            idx += 1
        encoder.stdin.close()
        if decoder.wait(timeout=120) or encoder.wait(timeout=120):
            raise RuntimeError("Sky replacement video pipeline failed")
    finally:
        decoder.stdout.close()
        if decoder.poll() is None:
            decoder.kill()
        if encoder.poll() is None:
            encoder.kill()
    return str(output_path)
