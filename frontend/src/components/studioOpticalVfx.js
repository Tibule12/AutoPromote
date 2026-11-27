// Optical Camera Finish VFX: Brown-Conrady lens distortion, Z-depth rack focus bokeh,
// and volumetric atmospheric depth haze. Matches FFmpeg worker filters in studio_pro_render_engine.py.

const clamp = (v, lo, hi, fb = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fb;
};

const parseHexRgb = (hex, fb = [203, 213, 225]) => {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return fb;
  return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
};

function separableBoxBlurRgba(src, w, h, radius) {
  const r = Math.max(1, Math.min(24, Math.round(radius)));
  const span = r * 2 + 1;
  const work = new Float32Array(src.length);
  const out = new Uint8ClampedArray(src.length);
  for (let y = 0; y < h; y += 1) {
    for (let c = 0; c < 4; c += 1) {
      let sum = 0;
      for (let x = -r; x <= r; x += 1) {
        const cx = Math.max(0, Math.min(w - 1, x));
        sum += src[(y * w + cx) * 4 + c];
      }
      for (let x = 0; x < w; x += 1) {
        work[(y * w + x) * 4 + c] = sum / span;
        const addX = Math.min(w - 1, x + r + 1);
        const subX = Math.max(0, x - r);
        sum += src[(y * w + addX) * 4 + c] - src[(y * w + subX) * 4 + c];
      }
    }
  }
  for (let x = 0; x < w; x += 1) {
    for (let c = 0; c < 4; c += 1) {
      let sum = 0;
      for (let y = -r; y <= r; y += 1) {
        const cy = Math.max(0, Math.min(h - 1, y));
        sum += work[(cy * w + x) * 4 + c];
      }
      for (let y = 0; y < h; y += 1) {
        out[(y * w + x) * 4 + c] = Math.max(0, Math.min(255, Math.round(sum / span)));
        const addY = Math.min(h - 1, y + r + 1);
        const subY = Math.max(0, y - r);
        sum += work[(addY * w + x) * 4 + c] - work[(subY * w + x) * 4 + c];
      }
    }
  }
  return out;
}

export function applyOpticalCameraPassRgba(rgba, width, height, fx = {}, units = 1) {
  if (!rgba || width < 4 || height < 4) return rgba;
  const k1 = clamp(fx.lensDistortion ?? fx.lens_distortion, -0.5, 0.5, 0);
  const rack = clamp(fx.rackFocus ?? fx.rack_focus, 0, 1, 0);
  const focusDist = clamp(fx.focusDistance ?? fx.focus_distance, 0, 1, 0.5);
  const haze = clamp(fx.atmosphericHaze ?? fx.atmospheric_haze, 0, 1, 0);
  const hazeRgb = parseHexRgb(fx.hazeColor ?? fx.haze_color, [203, 213, 225]);

  if (Math.abs(k1) > 0.005) {
    const src = new Uint8ClampedArray(rgba);
    const cx = (width - 1) * 0.5;
    const cy = (height - 1) * 0.5;
    const invNorm = 1 / Math.max(1, Math.hypot(cx, cy));
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const dx = (x - cx) * invNorm;
        const dy = (y - cy) * invNorm;
        const r2 = dx * dx + dy * dy;
        const factor = 1 + k1 * r2 + (k1 * 0.25) * r2 * r2;
        const sx = Math.max(0, Math.min(width - 1, Math.round(cx + (x - cx) * factor)));
        const sy = Math.max(0, Math.min(height - 1, Math.round(cy + (y - cy) * factor)));
        const dstI = (y * width + x) * 4;
        const srcI = (sy * width + sx) * 4;
        rgba[dstI] = src[srcI];
        rgba[dstI + 1] = src[srcI + 1];
        rgba[dstI + 2] = src[srcI + 2];
        rgba[dstI + 3] = src[srcI + 3];
      }
    }
  }

  if (rack > 0.01) {
    const blurRadius = Math.max(2, Math.round(rack * 11 * Math.max(0.4, units)));
    const blurred = separableBoxBlurRgba(rgba, width, height, blurRadius);
    for (let y = 0; y < height; y += 1) {
      const ny = y / Math.max(1, height - 1);
      const dist = Math.min(1, Math.abs(ny - focusDist) * 2.2);
      const wBlur = Math.min(1, rack * dist * dist);
      if (wBlur <= 0.004) continue;
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        rgba[i] = Math.round(rgba[i] * (1 - wBlur) + blurred[i] * wBlur);
        rgba[i + 1] = Math.round(rgba[i + 1] * (1 - wBlur) + blurred[i + 1] * wBlur);
        rgba[i + 2] = Math.round(rgba[i + 2] * (1 - wBlur) + blurred[i + 2] * wBlur);
      }
    }
  }

  if (haze > 0.005) {
    for (let y = 0; y < height; y += 1) {
      const ny = y / Math.max(1, height - 1);
      // Aerial depth perspective denser toward top/horizon distance
      const mist = haze * 0.65 * Math.pow(Math.max(0, 1 - ny * 0.85), 1.35);
      if (mist <= 0.002) continue;
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        for (let c = 0; c < 3; c += 1) {
          const base = rgba[i + c] / 255;
          const fog = (hazeRgb[c] / 255) * mist;
          const scr = 1 - (1 - base) * (1 - fog);
          rgba[i + c] = Math.max(0, Math.min(255, Math.round(scr * 255)));
        }
      }
    }
  }

  return rgba;
}
