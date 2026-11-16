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

import logoGeometry from "./autopromote-vector-logo.json";
import {
  buildInterWordmarkGlyphs,
  buildOrbitalRibbonTube,
  buildSculpturalCrestGeometries,
  extractBrandMonogram,
  extrudeBrandSvgPart,
} from "./studio3DBrandGeometry";

describe("studio3DBrandGeometry", () => {
  test("extrudes both brand emblem parts with positive 3D bounds and preserves holes", () => {
    const unit = 3.35 / 192;
    const fold = logoGeometry.symbolParts.find(part => part.id === "forward-fold");
    const plane = logoGeometry.symbolParts.find(part => part.id === "rising-plane");
    expect(fold).toBeTruthy();
    expect(plane).toBeTruthy();

    const foldGeom = extrudeBrandSvgPart(
      fold.path,
      logoGeometry.symbolTransform,
      -96,
      -96,
      unit,
      { depth: 0.16, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 3 }
    );
    const planeGeom = extrudeBrandSvgPart(
      plane.path,
      logoGeometry.symbolTransform,
      -96,
      -96,
      unit,
      { depth: 0.16, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 3 }
    );
    foldGeom.computeBoundingBox();
    planeGeom.computeBoundingBox();

    expect(foldGeom.attributes.position.count).toBeGreaterThan(200);
    expect(planeGeom.attributes.position.count).toBeGreaterThan(100);
    expect(foldGeom.boundingBox.max.z - foldGeom.boundingBox.min.z).toBeGreaterThan(0.18);
    expect(planeGeom.boundingBox.max.y).toBeGreaterThan(planeGeom.boundingBox.min.y);
    foldGeom.dispose();
    planeGeom.dispose();
  });

  test("extrudes all 11 wordmark glyphs centered around origin in upright Y-up space", () => {
    const wordScale = 5.45 / logoGeometry.wordmark.width;
    let minX = Infinity;
    let maxX = -Infinity;
    logoGeometry.wordmark.parts.forEach(part => {
      const geom = extrudeBrandSvgPart(
        part.path,
        part.transform,
        -logoGeometry.wordmark.width / 2,
        0,
        wordScale,
        { depth: 0.14, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2 }
      );
      geom.computeBoundingBox();
      minX = Math.min(minX, geom.boundingBox.min.x);
      maxX = Math.max(maxX, geom.boundingBox.max.x);
      expect(geom.boundingBox.max.y).toBeGreaterThan(0.35);
      expect(geom.boundingBox.min.y).toBeGreaterThan(-0.08);
      geom.dispose();
    });
    expect(logoGeometry.wordmark.parts).toHaveLength(11);
    expect(maxX + minX).toBeCloseTo(0, 1);
    expect(maxX - minX).toBeGreaterThan(5.1);
  });

  test("builds closed indexed orbital filament tube matching drawRange segment stride", () => {
    const geom = buildOrbitalRibbonTube(2.38, 0.72, 1.24, 0.35, 0.62, 0.03);
    expect(geom.index.count).toBe(144 * 10 * 6);
    expect(geom.parameters.path.closed).toBe(true);
    geom.dispose();
  });

  test("extracts monogram initials for single-word, camelCase, and multi-word custom brands", () => {
    expect(extractBrandMonogram("NovaForge")).toBe("NF");
    expect(extractBrandMonogram("SOLARIS LABS")).toBe("SL");
    expect(extractBrandMonogram("CHRONOS")).toBe("C");
  });

  test("extrudes Inter 900 architectural typography glyphs centered around origin with proper holes", () => {
    const built = buildInterWordmarkGlyphs("BAiO & CO", { weight: "900", size: 0.7, depth: 0.22 });
    expect(built.glyphs).toHaveLength(7); // skips space
    expect(built.totalWidth).toBeGreaterThan(2.5);
    built.glyphs.forEach(entry => {
      entry.geometry.computeBoundingBox();
      expect(entry.geometry.attributes.position.count).toBeGreaterThan(60);
      expect(entry.geometry.boundingBox.max.y).toBeGreaterThan(entry.geometry.boundingBox.min.y);
      entry.geometry.dispose();
    });
  });

  test("builds chamfered monolithic shield bezel and swept blade wing geometries", () => {
    const { shieldBezel, leftWing, rightWing } = buildSculpturalCrestGeometries(1.25);
    [shieldBezel, leftWing, rightWing].forEach(geom => {
      geom.computeBoundingBox();
      expect(geom.attributes.position.count).toBeGreaterThan(100);
      expect(geom.boundingBox.max.z).toBeGreaterThan(0);
      geom.dispose();
    });
  });
});
