import {
  solveHomographyDLT,
  applyHomography,
  sampleQuadInteriorGrid,
  trackPlanarPointsAcrossLumaPair,
} from "../studioPlanarTracker";
import { computeSkyMatte, applySkyReplacementRgba } from "../studioEnvironmentVfx";
import { applyScreenGlareReflection, hasStudioNodeSurface } from "../studioNodeEffects";
import { compileStudioFinishForRender, compileStudioCompositionForRender } from "../studioRenderCompiler";
import { adaptStudioSnapshotToDocument, projectStudioEditableStateToSnapshot } from "../studioProjectDocument";
import { compileStudioAdjustmentGrade } from "../studioAdjustmentGrade";
import { applySelectiveClone } from "../studioSelectiveMask";

describe("Increment 3: Planar Tracker, Environment VFX, Glare & Clean-Plate", () => {
  test("solveHomographyDLT recovers known translation + perspective warp within subpixel error", () => {
    const src = [[10, 10], [110, 10], [120, 90], [15, 95]];
    const dst = [[24, 18], [130, 14], [142, 98], [26, 102]];
    const H = solveHomographyDLT(src, dst);
    for (let i = 0; i < src.length; i += 1) {
      const [px, py] = applyHomography(H, src[i]);
      expect(Math.hypot(px - dst[i][0], py - dst[i][1])).toBeLessThan(0.05);
    }
  });

  test("trackPlanarPointsAcrossLumaPair measures translated textured quad motion", () => {
    const w = 96, h = 64;
    const prev = new Float32Array(w * h);
    const curr = new Float32Array(w * h);
    const pattern = (x, y) => ((Math.sin(x * 0.45) + Math.cos(y * 0.42)) * 60 + 128);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        prev[y * w + x] = pattern(x, y);
        curr[y * w + x] = pattern(x - 4, y + 2);
      }
    }
    const grid = sampleQuadInteriorGrid([[22, 16], [70, 16], [70, 48], [22, 48]], 4, 4);
    const fit = trackPlanarPointsAcrossLumaPair(prev, curr, w, h, grid);
    expect(fit).toBeTruthy();
    expect(fit.translation[0]).toBeGreaterThanOrEqual(3);
    expect(fit.translation[1]).toBeLessThanOrEqual(-1);
  });

  test("computeSkyMatte and applySkyReplacementRgba replace upper blue sky while preserving dark foreground", () => {
    const w = 16, h = 16;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = (y * w + x) * 4;
        if (y < 6) {
          rgba[i] = 90; rgba[i + 1] = 170; rgba[i + 2] = 245; rgba[i + 3] = 255;
        } else {
          rgba[i] = 28; rgba[i + 1] = 30; rgba[i + 2] = 26; rgba[i + 3] = 255;
        }
      }
    }
    const matte = computeSkyMatte(rgba, w, h, { threshold: 0.45, horizonPct: 60 });
    expect(matte[2 * w + 8]).toBeGreaterThan(0.75);
    expect(matte[13 * w + 8]).toBeLessThan(0.05);
    applySkyReplacementRgba(rgba, w, h, { preset: "sunset_gold", horizonPct: 60, blend: 1, temperatureMatch: 0.25 });
    const skyIdx = (2 * w + 8) * 4;
    expect(rgba[skyIdx]).toBeGreaterThan(70);
    const fgIdx = (13 * w + 8) * 4;
    expect(rgba[fgIdx]).toBeLessThan(45);
  });

  test("applyScreenGlareReflection adds bright specular glare over screen replacement foreground", () => {
    const fg = new Uint8ClampedArray([20, 40, 80, 255, 20, 40, 80, 255]);
    const bg = new Uint8ClampedArray([250, 250, 250, 255, 30, 30, 30, 255]);
    applyScreenGlareReflection(fg, bg, 2, 1, 0.5);
    expect(fg[0]).toBeGreaterThan(100);
    expect(fg[4]).toBe(20);
    expect(hasStudioNodeSurface({ screenReplace: { enabled: true } })).toBe(true);
  });

  test("compilers forward sky_replace & screen_replace and clean-plate repair validates & fills", () => {
    const doc = adaptStudioSnapshotToDocument({
      projectId: "inc3-vfx",
      snapshot: {
        orderedClips: [{ id: "s1", start: 0, end: 2 }],
        selectedClipId: "s1",
        timeline: [{ id: "c1", sourceClipId: "s1", startRequest: 0, endRequest: 2 }],
        finishFx: {
          skyReplace: { enabled: true, preset: "sunset_gold", horizonPct: 62, tempMatch: 0.4 },
        },
        overlays: [
          {
            id: "scr",
            type: "image",
            x: 50,
            y: 50,
            src: "https://example.test/screen.png",
            startTime: 0,
            duration: 2,
            screenReplace: { enabled: true, glarePreserve: 0.42 },
          },
        ],
      },
    });
    const finish = compileStudioFinishForRender(doc);
    expect(finish.sky_replace).toEqual(expect.objectContaining({ enabled: true, preset: "sunset_gold", horizon_pct: 62 }));
    const comp = compileStudioCompositionForRender(doc);
    const scrLayer = comp.layers.find(l => l.id === "scr");
    expect(scrLayer.effects.screen_replace).toEqual({ enabled: true, glare_preserve: 0.42 });
    const roundTripped = projectStudioEditableStateToSnapshot(doc, { timeline: [{ id: "c1", sourceClipId: "s1", startRequest: 0, endRequest: 2 }], overlays: [{ id: "scr", src: "https://example.test/screen.png" }] });
    expect(roundTripped.overlays[0].screenReplace).toEqual({ enabled: true, glarePreserve: 0.42 });
    expect(roundTripped.finishFx.skyReplace.preset).toBe("sunset_gold");

    const compiledAdj = compileStudioAdjustmentGrade({
      id: "cp",
      startTime: 0,
      duration: 2,
      mask: { space: "programme", version: 1, shape: "rectangle", x: 0.5, y: 0.5, width: 0.25, height: 0.25, rotation: 0, feather: 0, inverted: false, keyframes: [] },
      finishFx: { clonePatch: { enabled: true, mode: "temporal_clean_plate", dx: 0, dy: 0, strength: 1 } },
    });
    expect(compiledAdj.effects.clone_patch.mode).toBe("temporal_clean_plate");

    const w = 24, h = 24;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = (y * w + x) * 4;
        const inCenter = Math.abs(x - 12) <= 2 && Math.abs(y - 12) <= 2;
        data[i] = inCenter ? 250 : 20;
        data[i + 1] = inCenter ? 20 : 140;
        data[i + 2] = 40;
        data[i + 3] = 255;
      }
    }
    const img = { width: w, height: h, data };
    applySelectiveClone(img, compiledAdj.effects.clone_patch, compiledAdj.effects.selective_mask, 0);
    const mid = (12 * w + 12) * 4;
    expect(img.data[mid]).toBeLessThan(60);
    expect(img.data[mid + 1]).toBeGreaterThan(100);
  });
});
