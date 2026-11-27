import {
  STUDIO_CREATIVE_EFFECT_CATALOG,
  createCreativeEffectInstance,
  evaluateCreativeEffectParams,
  renderKineticTypographyFrame,
  renderParticleOverlaysFrame,
} from "../studioCreativeEffects";
import { applyOpticalCameraPassRgba } from "../studioOpticalVfx";
import { applyMeshGridWarp, blendCrossDissolveMorphRgba, hasStudioNodeSurface } from "../studioNodeEffects";
import { buildAdvancedColorCube, exportColorCubeText, parseColorCube } from "../studioColorCube";
import { compileStudioFinishForRender, compileStudioCompositionForRender } from "../studioRenderCompiler";
import { adaptStudioSnapshotToDocument, projectStudioEditableStateToSnapshot } from "../studioProjectDocument";

function makeCanvasCtx(w = 64, h = 64) {
  const ops = [];
  return {
    ops,
    canvas: { width: w, height: h },
    save: () => ops.push("save"),
    restore: () => ops.push("restore"),
    translate: (...a) => ops.push(["translate", ...a]),
    rotate: a => ops.push(["rotate", a]),
    scale: (...a) => ops.push(["scale", ...a]),
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    arc: (...a) => ops.push(["arc", ...a]),
    fill: () => ops.push("fill"),
    stroke: () => ops.push("stroke"),
    fillRect: (...a) => ops.push(["fillRect", ...a]),
    fillText: (t, ...a) => ops.push(["fillText", t, ...a]),
    strokeText: (t, ...a) => ops.push(["strokeText", t, ...a]),
    measureText: t => ({ width: String(t || "").length * 10 }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    getImageData: () => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: () => {},
    drawImage: () => ops.push("drawImage"),
  };
}

describe("Increment 4: Hollywood Particles, Credits, Optical VFX, Mesh Warp, Color & Cube Export", () => {
  test("particle_overlays and kinetic_typography support physics embers, shockwave, shatter and scrolling credits", () => {
    const pt = STUDIO_CREATIVE_EFFECT_CATALOG.find(e => e.id === "particle_overlays");
    const ptTypes = pt.paramsSchema.find(s => s.key === "particleType").options.map(o => o.value);
    expect(ptTypes).toEqual(expect.arrayContaining(["fire_embers", "shockwave", "glass_shatter"]));

    const kt = STUDIO_CREATIVE_EFFECT_CATALOG.find(e => e.id === "kinetic_typography");
    const ktStyles = kt.paramsSchema.find(s => s.key === "style").options.map(o => o.value);
    expect(ktStyles).toContain("scrolling_credits");

    const creditsFx = createCreativeEffectInstance("kinetic_typography", {
      id: "fx-credits",
      startTime: 0,
      duration: 4,
      params: { style: "scrolling_credits", text: "DIRECTOR ONE\nVFX TEAM\nSOUND MIX" },
    });
    const ctx = makeCanvasCtx(128, 72);
    const resolved = evaluateCreativeEffectParams(creditsFx, [], 1.5);
    renderKineticTypographyFrame(ctx, 128, 72, creditsFx, resolved, 1.5);
    expect(ctx.ops.some(op => Array.isArray(op) && op[0] === "fillText")).toBe(true);
  });

  test("applyOpticalCameraPassRgba applies lens distortion, rack focus blur, and atmospheric haze", () => {
    const w = 24, h = 24;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = (y * w + x) * 4;
        rgba[i] = ((x + y) % 2) * 200 + 20;
        rgba[i + 1] = 30;
        rgba[i + 2] = 40;
        rgba[i + 3] = 255;
      }
    }
    const copy = new Uint8ClampedArray(rgba);
    applyOpticalCameraPassRgba(copy, w, h, { lensDistortion: 0.25, rackFocus: 0.7, focusDistance: 0.85, atmosphericHaze: 0.5 }, 1);
    // Atmospheric haze lifts top pixels significantly toward mist
    expect(copy[2 * 4 + 2]).toBeGreaterThan(rgba[2 * 4 + 2] + 35);
    // Rack focus smooths alternating checkerboard contrast near top y=2 (far from focusDistance=0.85)
    expect(Math.abs(copy[(2 * w + 10) * 4] - copy[(2 * w + 11) * 4])).toBeLessThan(120);
  });

  test("applyMeshGridWarp & blendCrossDissolveMorphRgba deform & morph pixels cleanly", () => {
    const w = 16, h = 16;
    const a = new Uint8ClampedArray(w * h * 4);
    const b = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = (y * w + x) * 4;
        a[i] = x * 15; a[i + 1] = y * 15; a[i + 2] = 20; a[i + 3] = 255;
        b[i] = 220; b[i + 1] = 40; b[i + 2] = 180; b[i + 3] = 255;
      }
    }
    const warped = applyMeshGridWarp(new Uint8ClampedArray(a), w, h, { enabled: true, strength: 0.6, pinch: 0.2 }, 0.5, 1);
    expect(warped).not.toEqual(a);
    const morphed = blendCrossDissolveMorphRgba(a, b, w, h, 0.5, 0.3);
    expect(morphed[(8 * w + 8) * 4]).toBeGreaterThan(80);
    expect(hasStudioNodeSurface({ meshWarp: { enabled: true } })).toBe(true);
  });

  test("rgbOffsets bake into 3D color cube and exportColorCubeText round-trips via parseColorCube", () => {
    const cube = buildAdvancedColorCube({ rgbOffsets: { rLift: 0.08, rGain: 1.15, bGain: 0.85 } }, 9);
    expect(cube).toBeTruthy();
    const txt = exportColorCubeText(cube, "Warm Custom");
    const reparsed = parseColorCube(txt);
    expect(reparsed.size).toBe(9);
    expect(reparsed.data[0]).toBeCloseTo(cube.data[0], 4);
  });

  test("optical finish & meshWarp compile and survive canonical document round-trip", () => {
    const doc = adaptStudioSnapshotToDocument({
      projectId: "inc4-hollywood",
      snapshot: {
        orderedClips: [{ id: "s1", start: 0, end: 2 }],
        selectedClipId: "s1",
        timeline: [{ id: "c1", sourceClipId: "s1", startRequest: 0, endRequest: 2 }],
        finishFx: { lensDistortion: 0.18, rackFocus: 0.5, focusDistance: 0.4, atmosphericHaze: 0.35 },
        overlays: [
          {
            id: "ov1",
            type: "image",
            x: 50,
            y: 50,
            src: "https://example.test/prop.png",
            startTime: 0,
            duration: 2,
            meshWarp: { enabled: true, strength: 0.4, pinch: 0.15, rows: 4, cols: 4 },
          },
        ],
      },
    });
    const fin = compileStudioFinishForRender(doc);
    expect(fin.texture.lens_distortion).toBeCloseTo(0.18);
    expect(fin.texture.rack_focus).toBeCloseTo(0.5);
    expect(fin.texture.atmospheric_haze).toBeCloseTo(0.35);
    const comp = compileStudioCompositionForRender(doc);
    expect(comp.layers.find(l => l.id === "ov1").effects.mesh_warp).toEqual({
      enabled: true, strength: 0.4, pinch: 0.15, rows: 4, cols: 4,
    });
    const back = projectStudioEditableStateToSnapshot(doc, {
      timeline: [{ id: "c1", sourceClipId: "s1", startRequest: 0, endRequest: 2 }],
      overlays: [{ id: "ov1", src: "https://example.test/prop.png" }],
    });
    expect(back.overlays[0].meshWarp.enabled).toBe(true);
    expect(back.finishFx.atmosphericHaze).toBeCloseTo(0.35);
  });
});
