import {
  COMPOSITE_FRAGMENT_SHADER_SOURCE,
  GRADE_FRAGMENT_SHADER_SOURCE,
  SHADER_BLEND_MODE_INDEX,
  VERTEX_SHADER_SOURCE,
  compilePrecisionGradeUniforms,
  createStudioWebGLCompositor,
  isWebGL2CompositorSupported,
  packColorCubeRgba8,
} from "../studioWebGLCompositor";
import { STUDIO_EXPORT_BLEND_MODES } from "../studioBlendModes";
import { buildProceduralColorCube } from "../studioColorCube";
import { buildPrecisionGrade } from "../studioPrecisionGrade";

describe("studioWebGLCompositor", () => {
  test("maps every exportable blend mode to a distinct shader index", () => {
    const indices = STUDIO_EXPORT_BLEND_MODES.map(mode => SHADER_BLEND_MODE_INDEX[mode]);
    expect(indices.every(idx => Number.isInteger(idx) && idx >= 0)).toBe(true);
    expect(new Set(indices).size).toBe(STUDIO_EXPORT_BLEND_MODES.length);
  });

  test("compiles WebGL2 shader uniforms matching studioPrecisionGrade clamping and balance", () => {
    const fx = {
      exposureStops: 0.75,
      lift: 0.04,
      gamma: 1.15,
      gain: 1.1,
      temperature: 0.5,
      tint: -0.25,
      contrast: 1.2,
      brightness: 1.05,
      saturation: 1.3,
      vignette: 0.45,
    };
    const uniforms = compilePrecisionGradeUniforms(fx);
    const cpuGrade = buildPrecisionGrade(fx);

    expect(uniforms.exposure).toBeCloseTo(2 ** 0.75, 6);
    expect(uniforms.lift).toBeCloseTo(0.04, 6);
    expect(uniforms.gamma).toBeCloseTo(1.15, 6);
    expect(uniforms.gain).toBeCloseTo(1.1, 6);
    expect(uniforms.contrast).toBeCloseTo(1.2, 6);
    expect(uniforms.brightness).toBeCloseTo(1.05, 6);
    expect(uniforms.saturation).toBeCloseTo(cpuGrade.saturation, 6);
    expect(uniforms.whiteBalance).toEqual([
      1 + 0.5 * 0.1 + -0.25 * 0.04,
      1 - -0.25 * 0.08,
      1 - 0.5 * 0.1 + -0.25 * 0.04,
    ]);
    expect(uniforms.vignetteAmount).toBeCloseTo(0.45, 6);
    expect(uniforms.vignetteAngle).toBeGreaterThan(0);
  });

  test("packs 3D .cube LUT into RGBA8 texture buffer with exact dimensions", () => {
    const cube = buildProceduralColorCube("kodak_2383", 5);
    const packed = packColorCubeRgba8(cube);
    expect(packed.size).toBe(5);
    expect(packed.data).toBeInstanceOf(Uint8Array);
    expect(packed.data.length).toBe(5 * 5 * 5 * 4);
    expect(packed.data[3]).toBe(255);
  });

  test("includes WebGL2 ES 3.00 primary, 3D LUT, power window, qualifier, and blend shaders", () => {
    expect(VERTEX_SHADER_SOURCE).toContain("#version 300 es");
    expect(GRADE_FRAGMENT_SHADER_SOURCE).toContain("uniform sampler3D u_lut3D;");
    expect(GRADE_FRAGMENT_SHADER_SOURCE).toContain("computePowerWindowMask");
    expect(GRADE_FRAGMENT_SHADER_SOURCE).toContain("computeQualifierMask");
    expect(COMPOSITE_FRAGMENT_SHADER_SOURCE).toContain("blendChannel");
  });

  test("degrades cleanly to null in environments without WebGL2 context", () => {
    expect(typeof isWebGL2CompositorSupported()).toBe("boolean");
    if (!isWebGL2CompositorSupported()) {
      expect(createStudioWebGLCompositor()).toBeNull();
    }
  });
});
