jest.mock("three", () => {
  const fs = require("fs");
  const path = require("path");
  const babel = require("@babel/core");
  const threeEntry = path.dirname(require.resolve("three/package.json"));
  const compileEsm = (filePath, deps) => {
    const code = babel.transformSync(fs.readFileSync(filePath, "utf8"), {
      filename: filePath,
      presets: [["@babel/preset-env", { modules: "commonjs" }]],
    }).code;
    const mod = { exports: {} };
    new Function("exports", "require", "module", code)(
      mod.exports,
      id => (deps[id] ? deps[id] : require(id)),
      mod
    );
    return mod.exports;
  };
  const core = compileEsm(path.join(threeEntry, "build/three.core.js"), {});
  const moduleExports = compileEsm(path.join(threeEntry, "build/three.module.js"), {
    "./three.core.js": core,
  });
  return { ...core, ...moduleExports };
});

jest.mock("three/examples/jsm/loaders/SVGLoader", () => {
  const fs = require("fs");
  const path = require("path");
  const babel = require("@babel/core");
  const THREE = require("three");
  const threeEntry = path.dirname(require.resolve("three/package.json"));
  const loaderPath = path.join(threeEntry, "examples/jsm/loaders/SVGLoader.js");
  const code = babel.transformSync(fs.readFileSync(loaderPath, "utf8"), {
    filename: loaderPath,
    presets: [["@babel/preset-env", { modules: "commonjs" }]],
  }).code;
  const mod = { exports: {} };
  new Function("exports", "require", "module", code)(
    mod.exports,
    id => (id === "three" ? THREE : require(id)),
    mod
  );
  return mod.exports;
});

import * as THREE from "three";
import {
  addNeonLogoStageVFX,
  animateNeonLogoStageVFX,
  computeLogoCameraPose,
  resolveLogoArchetype,
} from "./studio3DLogoVFX";
import { createStudio3DScene, normalizeStudio3DScene } from "./studio3DModel";
import { studio3DCameraProjection } from "./studio3DProjection";

describe("studio3DLogoVFX", () => {
  let origGetContext;
  beforeEach(() => {
    origGetContext = HTMLCanvasElement.prototype.getContext;
    const fakeGrad = { addColorStop: () => {} };
    const fakeCtx = {
      save: () => {},
      restore: () => {},
      translate: () => {},
      scale: () => {},
      createRadialGradient: () => fakeGrad,
      createLinearGradient: () => fakeGrad,
      fillRect: () => {},
      beginPath: () => {},
      arc: () => {},
      fill: () => {},
      fillStyle: "",
    };
    HTMLCanvasElement.prototype.getContext = () => fakeCtx;
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = origGetContext;
  });

  test("routes entrance and material combinations cleanly to the four cinema VFX archetypes", () => {
    expect(resolveLogoArchetype({ entrance: "burst", material: "chrome" })).toBe("forge");
    expect(resolveLogoArchetype({ entrance: "slide", material: "gold" })).toBe("forge");
    expect(resolveLogoArchetype({ entrance: "orbit", material: "chrome" })).toBe("silk");
    expect(resolveLogoArchetype({ entrance: "slide", material: "holographic" })).toBe("silk");
    expect(resolveLogoArchetype({ entrance: "dolly", material: "chrome" })).toBe("monolith");
    expect(resolveLogoArchetype({ entrance: "pulse", material: "glass" })).toBe("monolith");
    expect(resolveLogoArchetype({ entrance: "pulse", material: "chrome" })).toBe("cyber");
  });

  test("builds bespoke 3D sculptures, particle swarms, and live timeline telemetry for all archetypes", () => {
    const cases = [
      { text: "SOLARIS", entrance: "burst", material: "gold", expected: "forge" },
      { text: "AETHER", entrance: "orbit", material: "holographic", expected: "silk" },
      { text: "VANGUARD", entrance: "dolly", material: "glass", expected: "monolith" },
      { text: "HYPERION", entrance: "pulse", material: "chrome", expected: "cyber" },
      { text: "AutoPromote", entrance: "pulse", material: "chrome", expected: "cyber" },
    ];

    cases.forEach(item => {
      const scene = normalizeStudio3DScene({
        ...createStudio3DScene("neon_logo", 0),
        text: item.text,
        secondary: "CINEMA VFX TEST",
        entrance: item.entrance,
        material: item.material,
        duration: 5.5,
      });
      const group = new THREE.Group();
      addNeonLogoStageVFX(group, scene);

      expect(group.userData.logoArchetype).toBe(item.expected);
      expect(group.userData.logoMark.children.length).toBeGreaterThanOrEqual(2);
      expect(group.userData.wordmarkLetters.length).toBeGreaterThanOrEqual(6);
      expect(group.userData.vortexParticles).toBeTruthy();

      const particleCount = group.userData.vortexParticles.geometry.attributes.position.count;
      expect(particleCount).toBe(item.expected === "forge" ? 2400 : 1800);

      if (item.expected === "silk") {
        expect(group.userData.liquidKnot).toBeTruthy();
        expect(group.userData.crystalPrism).toBeTruthy();
      } else if (item.expected === "monolith") {
        expect(group.userData.glassMonoliths).toHaveLength(7);
        expect(group.userData.laserScan).toBeTruthy();
      } else if (item.expected === "cyber") {
        expect(group.userData.gimbals).toHaveLength(2);
        expect(group.userData.searchlightCones).toHaveLength(2);
      }

      // Verify timeline progression produces smooth chromatic pulse, shockwave, and living camera drift
      animateNeonLogoStageVFX(group, scene, 0.35, false);
      const earlyCam = computeLogoCameraPose(studio3DCameraProjection(scene, 16 / 9, 0.35), scene, 0.35);

      animateNeonLogoStageVFX(group, scene, 1.06, false);
      const impactPulse = group.userData.vfxTelemetry.chromaticPulse;
      expect(impactPulse).toBeGreaterThan(0.002);

      animateNeonLogoStageVFX(group, scene, 1.8, false);
      const midCam = computeLogoCameraPose(studio3DCameraProjection(scene, 16 / 9, 1.8), scene, 1.8);
      animateNeonLogoStageVFX(group, scene, 4.4, false);
      const lateCam = computeLogoCameraPose(studio3DCameraProjection(scene, 16 / 9, 4.4), scene, 4.4);

      expect(group.userData.vfxTelemetry.arenaPulse).toBeGreaterThan(0.5);
      expect(Math.abs(lateCam.x - midCam.x)).toBeGreaterThan(0.2);
      expect(lateCam.z).toBeGreaterThan(earlyCam.z);
    });
  });
});
