// 4-Corner Planar Homography DLT Solver & Multi-Patch Video Tracker.
// Produces editable planeCorner0..3 X/Y keyframes for CornerPin & Screen Replacement.

export function solveHomographyDLT(srcPts, dstPts) {
  if (!Array.isArray(srcPts) || !Array.isArray(dstPts) || srcPts.length < 4 || srcPts.length !== dstPts.length) {
    throw new Error("Homography solver requires at least 4 matching point pairs.");
  }
  const n = srcPts.length;
  const rows = [];
  const rhs = [];
  for (let i = 0; i < n; i += 1) {
    const [x, y] = srcPts[i];
    const [u, v] = dstPts[i];
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    rhs.push(u);
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    rhs.push(v);
  }
  // Normal equations A^T A h = A^T b (8x8 linear system solved with partial pivoting)
  const M = Array.from({ length: 8 }, () => new Float64Array(9));
  for (let r = 0; r < rows.length; r += 1) {
    const row = rows[r];
    const b = rhs[r];
    for (let i = 0; i < 8; i += 1) {
      for (let j = 0; j < 8; j += 1) M[i][j] += row[i] * row[j];
      M[i][8] += row[i] * b;
    }
  }
  for (let col = 0; col < 8; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < 8; r += 1) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-10) {
      return [1, 0, 0, 0, 1, 0, 0, 0, 1];
    }
    if (pivot !== col) {
      const tmp = M[col]; M[col] = M[pivot]; M[pivot] = tmp;
    }
    const inv = 1 / M[col][col];
    for (let j = col; j <= 8; j += 1) M[col][j] *= inv;
    for (let r = 0; r < 8; r += 1) {
      if (r === col) continue;
      const factor = M[r][col];
      if (!factor) continue;
      for (let j = col; j <= 8; j += 1) M[r][j] -= factor * M[col][j];
    }
  }
  return [M[0][8], M[1][8], M[2][8], M[3][8], M[4][8], M[5][8], M[6][8], M[7][8], 1];
}

export function applyHomography(H, [x, y]) {
  const denom = H[6] * x + H[7] * y + H[8];
  const safeD = Math.abs(denom) < 1e-8 ? (denom < 0 ? -1e-8 : 1e-8) : denom;
  return [(H[0] * x + H[1] * y + H[2]) / safeD, (H[3] * x + H[4] * y + H[5]) / safeD];
}

const quadArea = corners => {
  let area = 0;
  for (let i = 0; i < 4; i += 1) {
    const [x0, y0] = corners[i];
    const [x1, y1] = corners[(i + 1) % 4];
    area += x0 * y1 - x1 * y0;
  }
  return area * 0.5;
};

export function sampleQuadInteriorGrid(corners, cols = 4, rows = 4) {
  const [tl, tr, br, bl] = corners;
  const pts = [];
  for (let r = 0; r < rows; r += 1) {
    const v = (r + 0.5) / rows;
    for (let c = 0; c < cols; c += 1) {
      const u = (c + 0.5) / cols;
      const x = (1 - u) * (1 - v) * tl[0] + u * (1 - v) * tr[0] + u * v * br[0] + (1 - u) * v * bl[0];
      const y = (1 - u) * (1 - v) * tl[1] + u * (1 - v) * tr[1] + u * v * br[1] + (1 - u) * v * bl[1];
      pts.push([x, y]);
    }
  }
  return pts;
}

export function trackPlanarPointsAcrossLumaPair(prevLuma, currLuma, width, height, ptsPx, searchRadius = 10, halfPatch = 5) {
  const matchedSrc = [];
  const matchedDst = [];
  const displacements = [];
  for (let i = 0; i < ptsPx.length; i += 1) {
    const cx = Math.round(ptsPx[i][0]);
    const cy = Math.round(ptsPx[i][1]);
    let bestDx = 0, bestDy = 0, bestSad = Infinity;
    for (let dy = -searchRadius; dy <= searchRadius; dy += 2) {
      for (let dx = -searchRadius; dx <= searchRadius; dx += 2) {
        let sad = 0, cnt = 0;
        for (let py = -halfPatch; py <= halfPatch; py += 2) {
          const sy = cy + py, ty = sy + dy;
          if (sy < 0 || sy >= height || ty < 0 || ty >= height) continue;
          for (let px = -halfPatch; px <= halfPatch; px += 2) {
            const sx = cx + px, tx = sx + dx;
            if (sx < 0 || sx >= width || tx < 0 || tx >= width) continue;
            sad += Math.abs(prevLuma[sy * width + sx] - currLuma[ty * width + tx]);
            cnt += 1;
          }
        }
        if (cnt >= 6 && sad / cnt < bestSad) {
          bestSad = sad / cnt;
          bestDx = dx;
          bestDy = dy;
        }
      }
    }
    // Refine 1px around best coarse integer displacement
    let refDx = bestDx, refDy = bestDy, refSad = bestSad;
    for (let dy = bestDy - 1; dy <= bestDy + 1; dy += 1) {
      for (let dx = bestDx - 1; dx <= bestDx + 1; dx += 1) {
        let sad = 0, cnt = 0;
        for (let py = -halfPatch; py <= halfPatch; py += 1) {
          const sy = cy + py, ty = sy + dy;
          if (sy < 0 || sy >= height || ty < 0 || ty >= height) continue;
          for (let px = -halfPatch; px <= halfPatch; px += 1) {
            const sx = cx + px, tx = sx + dx;
            if (sx < 0 || sx >= width || tx < 0 || tx >= width) continue;
            sad += Math.abs(prevLuma[sy * width + sx] - currLuma[ty * width + tx]);
            cnt += 1;
          }
        }
        if (cnt >= 16 && sad / cnt < refSad) {
          refSad = sad / cnt;
          refDx = dx;
          refDy = dy;
        }
      }
    }
    if (refSad < 32) {
      displacements.push({ idx: i, dx: refDx, dy: refDy, sad: refSad });
    }
  }
  if (displacements.length < 4) return null;
  const medDx = [...displacements].sort((a, b) => a.dx - b.dx)[Math.floor(displacements.length / 2)].dx;
  const medDy = [...displacements].sort((a, b) => a.dy - b.dy)[Math.floor(displacements.length / 2)].dy;
  for (const d of displacements) {
    if (Math.hypot(d.dx - medDx, d.dy - medDy) <= 5.5) {
      const pt = ptsPx[d.idx];
      matchedSrc.push(pt);
      matchedDst.push([pt[0] + d.dx, pt[1] + d.dy]);
    }
  }
  if (matchedSrc.length < 4) return { translation: [medDx, medDy], inliers: displacements.length };
  return { H: solveHomographyDLT(matchedSrc, matchedDst), translation: [medDx, medDy], inliers: matchedSrc.length };
}

export async function trackPlanarCornersOnVideo({
  videoElement,
  initialCorners,
  startTime = 0,
  duration = 2.0,
  targetId,
  fps = 8,
  createId,
} = {}) {
  if (!videoElement || !videoElement.videoWidth || !videoElement.videoHeight) {
    throw new Error("Load a real video before tracking a planar surface.");
  }
  if (!Array.isArray(initialCorners) || initialCorners.length !== 4) {
    throw new Error("Planar tracking requires 4 initial quad corners.");
  }
  const prevTime = videoElement.currentTime;
  const wasPaused = videoElement.paused;
  videoElement.pause?.();
  const w = 192;
  const h = Math.max(108, Math.round((192 * videoElement.videoHeight) / Math.max(1, videoElement.videoWidth)));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const sampleLumaAt = async t => {
    await new Promise(resolve => {
      const done = () => { videoElement.removeEventListener("seeked", done); resolve(); };
      videoElement.addEventListener("seeked", done);
      videoElement.currentTime = Math.max(0, Math.min(videoElement.duration || t, t));
      window.setTimeout(done, 250);
    });
    ctx.drawImage(videoElement, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    const luma = new Float32Array(w * h);
    for (let i = 0, j = 0; i < luma.length; i += 1, j += 4) {
      luma[i] = data[j] * 0.299 + data[j + 1] * 0.587 + data[j + 2] * 0.114;
    }
    return luma;
  };
  const step = 1 / Math.max(2, Math.min(12, fps));
  const totalSteps = Math.max(2, Math.min(28, Math.round(duration / step) + 1));
  let curCornersPx = initialCorners.map(([cx, cy]) => [(Number(cx) / 100) * w, (Number(cy) / 100) * h]);
  let prevLuma = await sampleLumaAt(startTime);
  const mkId = () => (createId ? createId("pin") : `pin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`);
  const keyframes = [{ id: mkId(), targetId: String(targetId), property: "perspectiveProgress", time: Number(startTime.toFixed(3)), value: 100, easing: "linear" }];
  const pushCorners = t => {
    curCornersPx.forEach(([px, py], idx) => {
      const cx = Math.max(0, Math.min(100, Number(((px / w) * 100).toFixed(2))));
      const cy = Math.max(0, Math.min(100, Number(((py / h) * 100).toFixed(2))));
      keyframes.push({ id: mkId(), targetId: String(targetId), property: `planeCorner${idx}X`, time: Number(t.toFixed(3)), value: cx, easing: "linear" });
      keyframes.push({ id: mkId(), targetId: String(targetId), property: `planeCorner${idx}Y`, time: Number(t.toFixed(3)), value: cy, easing: "linear" });
    });
  };
  pushCorners(startTime);
  for (let s = 1; s < totalSteps; s += 1) {
    const t = startTime + (s / (totalSteps - 1)) * duration;
    const nextLuma = await sampleLumaAt(t);
    const gridPts = [...curCornersPx, ...sampleQuadInteriorGrid(curCornersPx, 4, 4)];
    const fit = trackPlanarPointsAcrossLumaPair(prevLuma, nextLuma, w, h, gridPts);
    if (fit?.H) {
      const candidate = curCornersPx.map(pt => applyHomography(fit.H, pt).map((v, axis) => Math.max(1, Math.min((axis === 0 ? w : h) - 1, v))));
      if (quadArea(candidate) > 80) curCornersPx = candidate;
    } else if (fit?.translation) {
      const [dx, dy] = fit.translation;
      curCornersPx = curCornersPx.map(([px, py]) => [Math.max(1, Math.min(w - 1, px + dx)), Math.max(1, Math.min(h - 1, py + dy))]);
    }
    prevLuma = nextLuma;
    pushCorners(t);
  }
  videoElement.currentTime = prevTime;
  if (!wasPaused) videoElement.play?.().catch(() => {});
  return keyframes;
}

export async function estimate3DCameraMatchmoveKeyframes({
  videoElement,
  baseScene = {},
  startTime = 0,
  duration = 3.0,
  fps = 6,
  createId,
} = {}) {
  const tracked = await trackPlanarCornersOnVideo({
    videoElement,
    initialCorners: [[25, 25], [75, 25], [75, 75], [25, 75]],
    startTime,
    duration,
    targetId: "camera",
    fps,
  });
  const times = Array.from(new Set(tracked.map(k => k.time))).sort((a, b) => a - b);
  const bx = Number(baseScene.x ?? 50);
  const by = Number(baseScene.y ?? 50);
  const bz = Number(baseScene.z ?? 0);
  const bScale = Number(baseScene.scale ?? 1);
  const brx = Number(baseScene.rotationX ?? 0);
  const bry = Number(baseScene.rotationY ?? 0);
  const brz = Number(baseScene.rotationZ ?? 0);
  const mkId = () => (createId ? createId("cam-mm") : `cam-mm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`);
  return times.map(t => {
    const pts = [0, 1, 2, 3].map(idx => [
      tracked.find(k => k.property === `planeCorner${idx}X` && k.time === t)?.value ?? 50,
      tracked.find(k => k.property === `planeCorner${idx}Y` && k.time === t)?.value ?? 50,
    ]);
    const cx = (pts[0][0] + pts[1][0] + pts[2][0] + pts[3][0]) * 0.25;
    const cy = (pts[0][1] + pts[1][1] + pts[2][1] + pts[3][1]) * 0.25;
    const spanW = Math.max(5, Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]));
    const scaleRatio = Math.max(0.4, Math.min(2.2, spanW / 50));
    const dx = cx - 50;
    const dy = cy - 50;
    return {
      id: mkId(),
      time: Number(t.toFixed(3)),
      easing: "linear",
      values: {
        x: Math.max(5, Math.min(95, Number((bx + dx).toFixed(2)))),
        y: Math.max(5, Math.min(95, Number((by + dy).toFixed(2)))),
        z: Math.max(-4, Math.min(4, Number((bz + (scaleRatio - 1) * 2.5).toFixed(3)))),
        scale: Math.max(0.2, Math.min(3, Number((bScale * scaleRatio).toFixed(3)))),
        rotationX: Number(brx.toFixed(2)),
        rotationY: Math.max(-180, Math.min(180, Number((bry - dx * 0.45).toFixed(2)))),
        rotationZ: Number(brz.toFixed(2)),
      },
    };
  });
}
