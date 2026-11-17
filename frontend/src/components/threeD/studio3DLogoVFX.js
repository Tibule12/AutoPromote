import * as THREE from "three";
import logoGeometry from "./autopromote-vector-logo.json";
import {
  buildInterWordmarkGlyphs,
  buildOrbitalRibbonTube,
  buildSculpturalCrestGeometries,
  createAnamorphicStreakTexture,
  createGlowBokehTexture,
  extractBrandMonogram,
  extrudeBrandSvgPart,
} from "./studio3DBrandGeometry";
import { createVortexParticleSystem } from "./studio3DVFXShaders";

const clamp01 = value => Math.max(0, Math.min(1, value));
const smooth = value => {
  const p = clamp01(value);
  return p * p * (3 - 2 * p);
};
const overshoot = value => {
  const p = clamp01(value);
  return 1 + 2.70158 * (p - 1) ** 3 + 1.70158 * (p - 1) ** 2;
};

export const FILAMENT_SEGMENT_INDICES = 60; // 10 radial segments * 6 indices per tubular segment

/**
 * Resolve which cinema VFX archetype drives the logo sculpture, shaders,
 * particle physics, and lighting choreography.
 */
export function resolveLogoArchetype(scene = {}) {
  const entrance = String(scene.entrance || "").toLowerCase();
  const material = String(scene.material || "").toLowerCase();
  if (entrance === "burst" || material === "gold") return "forge";
  if (entrance === "orbit" || material === "holographic") return "silk";
  if (entrance === "dolly" || material === "glass") return "monolith";
  return "cyber";
}

function createSoftLightBeamTexture(hexColor = "#ffffff") {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const c = new THREE.Color(hexColor);
  const rgb = `${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}`;
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, `rgba(${rgb}, 0.42)`);
  grad.addColorStop(0.28, `rgba(${rgb}, 0.16)`);
  grad.addColorStop(0.72, `rgba(${rgb}, 0.04)`);
  grad.addColorStop(1, `rgba(${rgb}, 0.0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createBeveledMonolithGeometry(width = 0.28, height = 2.24, depth = 0.34, cornerRadius = 0.03) {
  const hw = width * 0.5;
  const hh = height * 0.5;
  const r = Math.min(cornerRadius, hw * 0.45, hh * 0.45);
  const shape = new THREE.Shape();
  shape.moveTo(-hw + r, -hh);
  shape.lineTo(hw - r, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + r);
  shape.lineTo(hw, hh - r);
  shape.quadraticCurveTo(hw, hh, hw - r, hh);
  shape.lineTo(-hw + r, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - r);
  shape.lineTo(-hw, -hh + r);
  shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth,
    curveSegments: 6,
    bevelEnabled: true,
    bevelSize: 0.02,
    bevelThickness: 0.022,
    bevelSegments: 3,
  });
  geom.translate(0, 0, -depth * 0.5);
  geom.computeVertexNormals();
  return geom;
}

function createMonogramTieredMeshes(monogram, monoSize, backingMat, coreMat, faceMat, fallbackFont) {
  const built = buildInterWordmarkGlyphs(monogram, {
    weight: "900",
    size: monoSize,
    depth: 0.2,
    bevelSize: 0.024,
    bevelThickness: 0.022,
    bevelSegments: 4,
    letterSpacing: 0.06,
    fallbackFont,
  });
  const baseGeoms = built.glyphs;
  const meshes = [];
  if (!baseGeoms.length) return meshes;

  // Estimate vertical center of cap height for optical centering inside crests
  let minY = Infinity;
  let maxY = -Infinity;
  baseGeoms.forEach(entry => {
    entry.geometry.computeBoundingBox();
    minY = Math.min(minY, entry.geometry.boundingBox.min.y);
    maxY = Math.max(maxY, entry.geometry.boundingBox.max.y);
  });
  const yCenter = Number.isFinite(minY) ? (minY + maxY) * 0.5 : monoSize * 0.36;

  baseGeoms.forEach((entry, glyphIdx) => {
    const { char, geometry: frontGeom, x } = entry;
    frontGeom.translate(x, -yCenter, 0.06);

    const chassisBuilt = buildInterWordmarkGlyphs(char, {
      weight: "900",
      size: monoSize * 1.03,
      depth: 0.28,
      bevelSize: 0.032,
      bevelThickness: 0.026,
      bevelSegments: 4,
      fallbackFont,
    });
    const backGeom = chassisBuilt.glyphs[0]?.geometry;

    const frontMesh = new THREE.Mesh(frontGeom, faceMat);
    frontMesh.userData.baseZ = 0.06;
    frontMesh.userData.partDelay = 0.14 + glyphIdx * 0.05;
    frontMesh.userData.partSide = 1;
    meshes.push(frontMesh);

    if (backGeom) {
      backGeom.computeBoundingBox();
      const bCenter = (backGeom.boundingBox.min.y + backGeom.boundingBox.max.y) * 0.5;
      backGeom.translate(x, -bCenter, -0.05);
      const backMesh = new THREE.Mesh(backGeom, glyphIdx % 2 === 0 ? backingMat : coreMat);
      backMesh.userData.baseZ = -0.05;
      backMesh.userData.partDelay = 0.08 + glyphIdx * 0.05;
      backMesh.userData.partSide = -1;
      meshes.push(backMesh);
    }
  });
  return meshes;
}

function buildSegmentedApertureRing(radius, tube, count, arcFrac, gapMat, arcMat, emissiveMat) {
  const group = new THREE.Group();
  const step = (Math.PI * 2) / count;
  const arcLen = step * arcFrac;
  for (let i = 0; i < count; i += 1) {
    const startAngle = i * step;
    const isAccent = i % 2 === 1;
    const geom = new THREE.TorusGeometry(radius, isAccent ? tube * 0.65 : tube, 14, 24, arcLen);
    const mesh = new THREE.Mesh(geom, isAccent ? emissiveMat : arcMat);
    mesh.rotation.z = startAngle;
    mesh.castShadow = false;
    group.add(mesh);

    // Machined chamfered end-block cuff on primary segments
    if (!isAccent) {
      const midA = startAngle + arcLen * 0.5;
      const cuff = new THREE.Mesh(new THREE.BoxGeometry(tube * 2.4, tube * 4.2, tube * 2.8), gapMat);
      cuff.position.set(Math.cos(midA) * radius, Math.sin(midA) * radius, 0);
      cuff.rotation.z = midA;
      cuff.castShadow = false;
      group.add(cuff);
    }
  }
  return group;
}

/**
 * Build extruded wordmark, hairline accent divider bar, and wide-tracked
 * Inter 600 subtitle beneath the 3D hero emblem.
 */
function buildLogoWordmarkAndSubtitle(group, scene, archetype, fallbackFont) {
  const text = String(scene.text || "BRAND").trim() || "BRAND";
  const isDefaultBrand = text.toLowerCase() === "autopromote";
  const deepPrimary = new THREE.Color(scene.primaryColor).multiplyScalar(0.24);
  const deepGlow = new THREE.Color(scene.glowColor).multiplyScalar(0.22);

  const isGold = archetype === "forge" || scene.material === "gold";
  const isHolo = archetype === "silk" || scene.material === "holographic";
  const isGlass = archetype === "monolith" || scene.material === "glass";

  const platinumWordMat = new THREE.MeshPhysicalMaterial({
    color: isGlass ? "#f4f8ff" : "#ecf1fc",
    emissive: isGlass ? "#162038" : "#0b0f1c",
    emissiveIntensity: 0.08,
    metalness: 0.86,
    roughness: isHolo ? 0.18 : 0.25,
    clearcoat: 0.72,
    clearcoatRoughness: 0.14,
    ...(isHolo ? { iridescence: 0.85, iridescenceIOR: 1.42 } : {}),
  });

  const accentWordMat = new THREE.MeshPhysicalMaterial({
    color: isGold ? "#fbbf24" : scene.primaryColor,
    emissive: isGold ? "#783f04" : deepPrimary,
    emissiveIntensity: 0.16,
    metalness: scene.material === "neon" ? 0.42 : 0.86,
    roughness: isHolo ? 0.18 : 0.24,
    clearcoat: 0.78,
    clearcoatRoughness: 0.12,
    ...(isHolo ? { iridescence: 1, iridescenceIOR: 1.5 } : {}),
  });

  if (isDefaultBrand) {
    const wordScale = 5.55 / logoGeometry.wordmark.width;
    const letters = logoGeometry.wordmark.parts.map((part, index) => {
      const geom = extrudeBrandSvgPart(
        part.path,
        part.transform,
        -logoGeometry.wordmark.width / 2,
        0,
        wordScale,
        {
          depth: 0.16,
          bevelSize: 0.015,
          bevelThickness: 0.014,
          bevelSegments: 4,
        }
      );
      geom.translate(0, 0, -0.08);
      const mesh = new THREE.Mesh(geom, index < 4 ? platinumWordMat : accentWordMat);
      mesh.position.set(0, -1.04, 0);
      mesh.userData.basePosition = mesh.position.clone();
      mesh.userData.baseScale = mesh.scale.clone();
      group.add(mesh);
      return mesh;
    });
    group.userData.wordmarkLetters = letters;
    group.userData.title = letters[0];
  } else {
    const cleanLen = text.replace(/\s+/g, "").length;
    const fontSize = cleanLen > 14 ? 0.44 : cleanLen > 9 ? 0.56 : 0.66;
    const built = buildInterWordmarkGlyphs(text, {
      weight: "900",
      size: fontSize,
      depth: 0.18,
      bevelSize: 0.017,
      bevelThickness: 0.015,
      bevelSegments: 4,
      letterSpacing: 0.15,
      fallbackFont,
    });
    const maxWidth = 6.5;
    const wordScale = built.totalWidth > maxWidth ? maxWidth / built.totalWidth : 1;

    const spaceIdx = text.indexOf(" ");
    const camelMatch = text.match(/[a-z][A-Z]/);
    const splitAt = spaceIdx > 0 ? spaceIdx + 1 : camelMatch ? camelMatch.index + 1 : -1;

    const letters = built.glyphs.map(entry => {
      const useAccent = splitAt > 0
        ? entry.index >= splitAt
        : isGold || (archetype === "cyber" && entry.index === 0);
      const mesh = new THREE.Mesh(entry.geometry, useAccent ? accentWordMat : platinumWordMat);
      mesh.scale.setScalar(wordScale);
      mesh.position.set(entry.x * wordScale, -1.04, 0);
      mesh.userData.basePosition = mesh.position.clone();
      mesh.userData.baseScale = mesh.scale.clone();
      group.add(mesh);
      return mesh;
    });
    group.userData.wordmarkLetters = letters;
    group.userData.title = letters[0];

    // Illuminated ultra-thin architectural hairline divider bar beneath wordmark
    const barWidth = Math.min(6.4, Math.max(2.6, built.totalWidth * wordScale * 0.96));
    const dividerColor = new THREE.Color(scene.glowColor).multiplyScalar(1.35);
    const dividerMat = new THREE.MeshBasicMaterial({ color: dividerColor });
    const dividerBar = new THREE.Mesh(new THREE.BoxGeometry(barWidth, 0.014, 0.025), dividerMat);
    dividerBar.position.set(0, -1.23, 0.03);
    dividerBar.scale.set(0.001, 1, 1);
    dividerBar.castShadow = false;
    group.add(dividerBar);
    group.userData.dividerBar = dividerBar;
  }

  if (scene.secondary) {
    const subMat = new THREE.MeshStandardMaterial({
      color: scene.secondaryColor || "#e2e8f0",
      emissive: deepGlow,
      emissiveIntensity: 0.28,
      metalness: 0.45,
      roughness: 0.24,
      transparent: true,
    });
    const subBuilt = buildInterWordmarkGlyphs(String(scene.secondary).toUpperCase(), {
      weight: "600",
      size: 0.16,
      depth: 0.03,
      bevelSize: 0.004,
      bevelThickness: 0.004,
      bevelSegments: 2,
      letterSpacing: 0.34,
      fallbackFont,
    });
    const subGroup = new THREE.Group();
    const subWidth = Math.max(0.1, subBuilt.totalWidth);
    const subFit = subWidth > 6.2 ? 6.2 / subWidth : 1;
    subBuilt.glyphs.forEach(entry => {
      const m = new THREE.Mesh(entry.geometry, subMat);
      m.position.set(entry.x * subFit, 0, 0);
      m.scale.setScalar(subFit);
      m.castShadow = false;
      subGroup.add(m);
    });
    subGroup.position.set(0, -1.49, 0.04);
    subGroup.userData.basePosition = subGroup.position.clone();
    subGroup.userData.baseScale = subGroup.scale.clone();
    group.add(subGroup);
    group.userData.subtitle = subGroup;
  }
}

/**
 * Construct a cinema-tier WebGL2 + GLSL 3D Logo Stage inside `group`.
 */
export function addNeonLogoStageVFX(group, scene, { fallbackFont = null } = {}) {
  const archetype = resolveLogoArchetype(scene);
  const text = String(scene.text || "BRAND").trim() || "BRAND";
  const isDefaultBrand = text.toLowerCase() === "autopromote";
  const primary = new THREE.Color(scene.primaryColor);
  const glow = new THREE.Color(scene.glowColor);
  const deepPrimary = primary.clone().multiplyScalar(0.28);

  group.userData.logoArchetype = archetype;
  group.userData.vfxTelemetry = {
    chromaticPulse: 0.0005,
    arenaPulse: 0,
    shockRadius: 0,
  };

  const mark = new THREE.Group();
  const darkTitaniumMat = new THREE.MeshPhysicalMaterial({
    color: "#1a2030",
    metalness: 0.94,
    roughness: 0.24,
    clearcoat: 0.55,
    clearcoatRoughness: 0.18,
  });
  const brushedAlloyMat = new THREE.MeshPhysicalMaterial({
    color: archetype === "forge" ? "#fbbf24" : "#eef4ff",
    emissive: archetype === "forge" ? "#663205" : "#10172a",
    emissiveIntensity: 0.14,
    metalness: archetype === "silk" ? 0.92 : 0.86,
    roughness: archetype === "silk" ? 0.16 : 0.24,
    clearcoat: 0.8,
    clearcoatRoughness: 0.12,
    ...(archetype === "silk" ? { iridescence: 1, iridescenceIOR: 1.5, iridescenceThicknessRange: [200, 600] } : {}),
  });
  const accentCoreMat = new THREE.MeshPhysicalMaterial({
    color: primary,
    emissive: deepPrimary,
    emissiveIntensity: 0.22,
    metalness: 0.78,
    roughness: 0.18,
    clearcoat: 0.6,
  });
  const hdrGlowMat = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    emissive: glow,
    emissiveIntensity: 2.75,
    roughness: 0.16,
    metalness: 0.1,
  });
  const hdrPrimaryGlowMat = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    emissive: primary,
    emissiveIntensity: 2.45,
    roughness: 0.18,
    metalness: 0.1,
  });

  // 1. Central Emblem Construction (AutoPromote SVG OR Archetype Hero Sculpture)
  if (isDefaultBrand) {
    const unit = 3.35 / 192;
    logoGeometry.symbolParts.forEach((part, index) => {
      const isForward = part.id === "forward-fold";
      const faceMat = isForward ? brushedAlloyMat : accentCoreMat;
      const tiers = [
        { depth: 0.26, bevelSize: 0.032, bevelThickness: 0.026, bevelSegments: 4, z: -0.1, mat: darkTitaniumMat },
        { depth: 0.15, bevelSize: 0.018, bevelThickness: 0.016, bevelSegments: 3, z: 0.0, mat: accentCoreMat },
        { depth: 0.06, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 3, z: 0.09, mat: faceMat },
      ];
      tiers.forEach(tier => {
        const geom = extrudeBrandSvgPart(
          part.path,
          logoGeometry.symbolTransform,
          -96,
          -96,
          unit,
          {
            depth: tier.depth,
            bevelSize: tier.bevelSize,
            bevelThickness: tier.bevelThickness,
            bevelSegments: tier.bevelSegments,
          }
        );
        geom.translate(0, 0, -tier.depth * 0.5);
        const mesh = new THREE.Mesh(geom, tier.mat);
        mesh.position.z = tier.z;
        mesh.userData.baseZ = tier.z;
        mesh.userData.partDelay = index * 0.12;
        mesh.userData.partSide = index === 0 ? -1 : 1;
        mark.add(mesh);
      });
    });
  } else {
    const crest = buildSculpturalCrestGeometries(1.18);
    const monogram = extractBrandMonogram(text);
    const monoSize = monogram.length > 1 ? 0.84 : 1.18;

    if (archetype !== "silk") {
      const shieldMesh = new THREE.Mesh(crest.shieldBezel, darkTitaniumMat);
      shieldMesh.position.z = -0.18;
      shieldMesh.userData.baseZ = -0.18;
      shieldMesh.userData.partDelay = 0.04;
      shieldMesh.userData.partSide = -1;
      mark.add(shieldMesh);

      if (archetype === "forge" || archetype === "cyber") {
        const wingMat = archetype === "forge" ? brushedAlloyMat : darkTitaniumMat;
        const leftWingMesh = new THREE.Mesh(crest.leftWing, wingMat);
        leftWingMesh.position.z = -0.1;
        leftWingMesh.userData.baseZ = -0.1;
        leftWingMesh.userData.slideX = -2.2;
        leftWingMesh.userData.partDelay = 0.12;
        leftWingMesh.userData.partSide = -1;

        const rightWingMesh = new THREE.Mesh(crest.rightWing, wingMat);
        rightWingMesh.position.z = -0.1;
        rightWingMesh.userData.baseZ = -0.1;
        rightWingMesh.userData.slideX = 2.2;
        rightWingMesh.userData.partDelay = 0.12;
        rightWingMesh.userData.partSide = 1;
        mark.add(leftWingMesh, rightWingMesh);
        group.userData.wingMeshes = [leftWingMesh, rightWingMesh];
      }

      // Glowing inner plasma recess ring
      const innerRing = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.02, 16, 96), hdrGlowMat);
      innerRing.position.z = -0.06;
      innerRing.userData.baseZ = -0.06;
      innerRing.userData.partDelay = 0.18;
      innerRing.userData.partSide = -1;
      innerRing.castShadow = false;
      mark.add(innerRing);
    }

    const monoFaceMat = archetype === "forge" || archetype === "silk" ? brushedAlloyMat : accentCoreMat;
    const monoBackMat = archetype === "cyber" ? brushedAlloyMat : darkTitaniumMat;
    const monoMeshes = createMonogramTieredMeshes(
      monogram,
      archetype === "silk" ? monoSize * 0.88 : monoSize,
      monoBackMat,
      accentCoreMat,
      monoFaceMat,
      fallbackFont
    );
    monoMeshes.forEach(m => mark.add(m));
  }

  mark.position.set(0, 0.88, 0);
  mark.scale.setScalar(0.92);
  group.add(mark);
  group.userData.logoMark = mark;

  // 2. Archetype-Specific Architectural Hero Assemblies
  if (archetype === "silk") {
    // Liquid Chrome Trefoil Sculpture behind monogram + faceted refractive crystal core
    const knotMat = new THREE.MeshPhysicalMaterial({
      color: "#a5b4fc",
      metalness: 0.96,
      roughness: 0.09,
      iridescence: 1.0,
      iridescenceIOR: 1.55,
      iridescenceThicknessRange: [180, 580],
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
    });
    const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(1.06, 0.135, 220, 32, 2, 3), knotMat);
    knot.position.set(0, 0.88, -0.64);
    knot.scale.set(1.06, 1.06, 0.44);
    knot.castShadow = false;
    group.add(knot);
    group.userData.liquidKnot = knot;

    const crystalMat = new THREE.MeshPhysicalMaterial({
      color: "#ffffff",
      metalness: 0.05,
      roughness: 0.04,
      transmission: 0.76,
      ior: 2.15,
      thickness: 0.8,
      iridescence: 0.9,
      clearcoat: 1.0,
    });
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), crystalMat);
    crystal.scale.set(0.85, 1.4, 0.85);
    crystal.position.set(0, 0.88, -0.32);
    crystal.castShadow = false;
    group.add(crystal);
    group.userData.crystalPrism = crystal;

    group.userData.gimbals = [1.46, 1.66].map((r, idx) =>
      buildSegmentedApertureRing(
        r,
        idx === 0 ? 0.016 : 0.011,
        4,
        0.72,
        darkTitaniumMat,
        brushedAlloyMat,
        hdrGlowMat
      )
    );
    group.userData.gimbals.forEach((g, idx) => {
      g.position.set(0, 0.88, -0.35 - idx * 0.08);
      group.add(g);
    });
  } else if (archetype === "monolith") {
    // 7 Beveled Smoked Optical Glass Cathedral Slats parting on reveal + Laser Scan Blade
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: "#cbdcf6",
      emissive: "#0e1d36",
      emissiveIntensity: 0.16,
      metalness: 0.06,
      roughness: 0.06,
      transmission: 0.72,
      ior: 1.52,
      thickness: 1.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
    });
    const slatGeom = createBeveledMonolithGeometry(0.32, 2.32, 0.36, 0.032);
    const slats = [-3, -2, -1, 0, 1, 2, 3].map(slot => {
      const slatGroup = new THREE.Group();
      const body = new THREE.Mesh(slatGeom, glassMat);
      const topTrim = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.016, 0.34), hdrGlowMat);
      topTrim.position.y = 1.15;
      const bottomTrim = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.016, 0.34), hdrPrimaryGlowMat);
      bottomTrim.position.y = -1.15;
      body.castShadow = false;
      topTrim.castShadow = false;
      bottomTrim.castShadow = false;
      slatGroup.add(body, topTrim, bottomTrim);
      const baseX = slot * 0.76;
      const baseZ = -0.32 - Math.abs(slot) * 0.14;
      slatGroup.position.set(baseX, 0.88, baseZ);
      slatGroup.userData.slot = slot;
      slatGroup.userData.baseX = baseX;
      slatGroup.userData.baseZ = baseZ;
      group.add(slatGroup);
      return slatGroup;
    });
    group.userData.glassMonoliths = slats;

    // Volumetric Holographic Laser Scan Plane
    const scanTex = createSoftLightBeamTexture(scene.glowColor);
    const scanGroup = new THREE.Group();
    const scanCore = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.022, 0.04), hdrGlowMat);
    const scanSkirt = new THREE.Mesh(
      new THREE.PlaneGeometry(5.8, 0.62),
      new THREE.MeshBasicMaterial({
        map: scanTex,
        color: "#ffffff",
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    scanSkirt.position.y = -0.3;
    scanGroup.add(scanCore, scanSkirt);
    scanGroup.position.set(0, 2.2, 0.25);
    group.add(scanGroup);
    group.userData.laserScan = scanGroup;
  } else if (archetype === "cyber") {
    // Counter-Rotating Segmented Precision Aperture Rings + Dual Volumetric Searchlight Cones
    const ringOuter = buildSegmentedApertureRing(1.48, 0.028, 6, 0.62, darkTitaniumMat, brushedAlloyMat, hdrPrimaryGlowMat);
    const ringInner = buildSegmentedApertureRing(1.26, 0.02, 8, 0.56, darkTitaniumMat, darkTitaniumMat, hdrGlowMat);
    ringOuter.position.set(0, 0.88, -0.32);
    ringInner.position.set(0, 0.88, -0.24);
    group.add(ringOuter, ringInner);
    group.userData.gimbals = [ringOuter, ringInner];

    const beamColors = [scene.primaryColor, scene.glowColor];
    const cones = beamColors.map((col, idx) => {
      const mat = new THREE.MeshBasicMaterial({
        map: createSoftLightBeamTexture(col),
        color: "#ffffff",
        transparent: true,
        opacity: 0.38,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 2.1, 7.6, 24, 1, true), mat);
      cone.position.set(idx === 0 ? -1.4 : 1.4, 2.8, -1.8);
      cone.rotation.z = idx === 0 ? -0.38 : 0.38;
      cone.castShadow = false;
      group.add(cone);
      return cone;
    });
    group.userData.searchlightCones = cones;
  } else {
    // "forge" heavy machined gimbal + twin molten forge rim collars
    const ring = buildSegmentedApertureRing(1.42, 0.026, 6, 0.68, darkTitaniumMat, brushedAlloyMat, hdrPrimaryGlowMat);
    ring.position.set(0, 0.88, -0.3);
    group.add(ring);
    group.userData.gimbals = [ring];
  }

  // 3. Shared Anamorphic Impact Streak, Dual Plasma Orbital Filaments, GPU Vortex Swarm & Lights
  const impactFlare = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: createAnamorphicStreakTexture(scene.glowColor),
      color: "#ffffff",
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  impactFlare.position.set(0, 0.88, -0.35);
  impactFlare.scale.set(0.001, 0.001, 1);
  group.add(impactFlare);
  group.userData.impactFlare = impactFlare;

  const bokehTex = createGlowBokehTexture();
  const filamentDefs = [
    { rx: 2.68, ry: 1.12, rz: 0.82, phase: 0.25, radius: 0.014, haloRadius: 0.036, color: scene.primaryColor, opacity: 0.14 },
    { rx: 2.42, ry: 0.96, rz: 0.72, phase: Math.PI + 0.55, radius: 0.012, haloRadius: 0.032, color: scene.glowColor, opacity: 0.13 },
  ];
  group.userData.filaments = filamentDefs.map(def => {
    const fGroup = new THREE.Group();
    const coreGeom = buildOrbitalRibbonTube(def.rx, def.ry, def.rz, def.phase, 1.04, def.radius);
    const haloGeom = buildOrbitalRibbonTube(def.rx, def.ry, def.rz, def.phase, 1.04, def.haloRadius);
    coreGeom.setDrawRange(0, 0);
    haloGeom.setDrawRange(0, 0);
    const coreMat = new THREE.MeshStandardMaterial({
      color: def.color,
      emissive: def.color,
      emissiveIntensity: 1.95,
      roughness: 0.16,
      metalness: 0.1,
    });
    const haloMat = new THREE.MeshBasicMaterial({
      color: def.color,
      transparent: true,
      opacity: def.opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const core = new THREE.Mesh(coreGeom, coreMat);
    const halo = new THREE.Mesh(haloGeom, haloMat);
    core.castShadow = false;
    halo.castShadow = false;
    const flare = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: bokehTex,
        color: "#ffffff",
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    flare.scale.setScalar(0.001);
    fGroup.add(halo, core, flare);
    group.add(fGroup);
    return {
      group: fGroup,
      core,
      halo,
      flare,
      curve: coreGeom.parameters.path,
    };
  });

  // GPU Helical Vortex Particle System (2,200 particles)
  const particleCount = archetype === "forge" ? 2400 : 1800;
  const vortexParticles = createVortexParticleSystem(particleCount, scene.primaryColor, scene.glowColor);
  vortexParticles.frustumCulled = false;
  group.add(vortexParticles);
  group.userData.vortexParticles = vortexParticles;

  // Dual Dynamic Sweep & Back-Rim Point Lights
  const sweepLight = new THREE.PointLight("#ffffff", 0, 14, 1.3);
  sweepLight.position.set(-4.8, 1.65, 3.2);
  group.add(sweepLight);
  group.userData.sweepLight = sweepLight;

  const accentRimLight = new THREE.PointLight(scene.glowColor, 1.4, 15, 1.4);
  accentRimLight.position.set(3.2, 2.2, -2.4);
  group.add(accentRimLight);
  group.userData.accentRimLight = accentRimLight;

  // 4. Typography Wordmark + Divider Rule + Subtitle
  buildLogoWordmarkAndSubtitle(group, scene, archetype, fallbackFont);
}

/**
 * Per-frame cinema VFX animation update for `neon_logo` scene groups.
 */
export function animateNeonLogoStageVFX(group, scene, local, portrait = false) {
  const archetype = group.userData.logoArchetype || resolveLogoArchetype(scene);
  const duration = Math.max(2.5, Number(scene.duration) || 5);
  const mark = group.userData.logoMark;

  // Magnetic arrival locks at ~1.06s, followed by continuous living cinema motion
  const reveal = smooth(local / 0.88);
  const pop = Math.max(0.001, overshoot(local / 0.92));
  const breath = Math.sin(local * 1.35) * 0.036;
  const lockPulse = smooth((local - 0.94) / 0.14) * (1 - smooth((local - 1.16) / 0.55));
  const arenaWave = clamp01((local - 1.0) / 1.45);

  if (group.userData.vfxTelemetry) {
    group.userData.vfxTelemetry.chromaticPulse = 0.00045 + lockPulse * 0.0052;
    group.userData.vfxTelemetry.arenaPulse = local > 1.0 ? arenaWave : 0;
  }

  if (mark) {
    mark.position.set(0, 0.88 + (1 - reveal) * 0.22 + breath, (1 - reveal) * 1.2);
    mark.scale.setScalar((portrait ? 0.8 : 0.92) * pop);
    mark.rotation.y = THREE.MathUtils.degToRad((1 - reveal) * -42 + Math.sin(local * 0.65) * 4.5);
    mark.rotation.x = THREE.MathUtils.degToRad((1 - reveal) * -10 + Math.cos(local * 0.55) * 2.0);

    mark.children.forEach(part => {
      if (part.userData.partDelay === undefined) return;
      const p = smooth((local - part.userData.partDelay) / 0.68);
      const o = Math.max(0.001, overshoot((local - part.userData.partDelay) / 0.72));
      if (part.userData.slideX !== undefined) {
        part.position.x = (1 - p) * part.userData.slideX;
      }
      part.position.z = (part.userData.baseZ ?? 0) + (1 - p) * (part.userData.partSide || 1) * 1.1;
      part.scale.setScalar(o);
    });
  }

  // Wordmark staggered magnetic snap + continuous ultra-subtle metallic shimmer drift
  const letters = group.userData.wordmarkLetters;
  if (Array.isArray(letters) && letters.length) {
    letters.forEach((mesh, index) => {
      const delay = 0.42 + index * 0.044;
      const p = smooth((local - delay) / 0.58);
      const o = Math.max(0.001, overshoot((local - delay) / 0.62));
      const settleWave = Math.sin(local * 1.4 - index * 0.35) * 0.012 * smooth((local - 1.2) / 0.5);
      mesh.position.set(
        mesh.userData.basePosition.x,
        mesh.userData.basePosition.y - (1 - p) * 0.16 + settleWave,
        (1 - p) * 2.1
      );
      mesh.rotation.x = THREE.MathUtils.degToRad((1 - p) * 32);
      mesh.rotation.y = THREE.MathUtils.degToRad((1 - p) * (index % 2 ? 20 : -20));
      mesh.scale.copy(mesh.userData.baseScale).multiplyScalar(o);
    });
  } else if (group.userData.title?.userData.baseScale) {
    const title = group.userData.title;
    const p = smooth((local - 0.5) / 0.65);
    const o = Math.max(0.001, overshoot((local - 0.5) / 0.7));
    title.position.set(title.userData.basePosition.x, title.userData.basePosition.y - (1 - p) * 0.16, (1 - p) * 1.25);
    title.rotation.x = THREE.MathUtils.degToRad((1 - p) * 24);
    title.scale.copy(title.userData.baseScale).multiplyScalar(o);
  }

  // Divider bar wipe
  const dividerBar = group.userData.dividerBar;
  if (dividerBar) {
    const w = smooth((local - 0.86) / 0.52);
    dividerBar.scale.set(Math.max(0.001, w), 1, 1);
  }

  // Subtitle reveal
  const subtitle = group.userData.subtitle;
  if (subtitle?.userData.baseScale) {
    const p = smooth((local - 1.05) / 0.56);
    subtitle.scale.setScalar(Math.max(0.001, p));
    subtitle.position.y = subtitle.userData.basePosition.y - (1 - p) * 0.14;
  }

  // Liquid Chrome Knot + Refractive Diamond Crystal ("silk")
  const knot = group.userData.liquidKnot;
  if (knot) {
    const kScale = 0.38 + 0.62 * smooth(local / 0.85);
    knot.scale.set(1.06 * kScale, 1.06 * kScale, 0.44 * kScale);
    knot.rotation.z = local * 0.24;
    knot.rotation.y = Math.sin(local * 0.42) * 0.35 + (1 - smooth(local / 0.85)) * 1.1;
    knot.rotation.x = Math.cos(local * 0.36) * 0.22;
  }
  const crystal = group.userData.crystalPrism;
  if (crystal) {
    const cScale = Math.max(0.001, smooth((local - 0.18) / 0.8));
    crystal.scale.set(0.85 * cScale, 1.4 * cScale, 0.85 * cScale);
    crystal.rotation.y = -local * 0.85;
    crystal.rotation.z = Math.sin(local * 0.7) * 0.15;
  }

  // Smoked Glass Monolith Cathedral Shutters + Laser Scan Plane ("monolith")
  const slats = group.userData.glassMonoliths;
  if (Array.isArray(slats)) {
    const partT = smooth((local - 0.2) / 1.05);
    slats.forEach(slat => {
      const slot = slat.userData.slot;
      const spread = slot === 0 ? 0 : Math.sign(slot) * (0.28 + Math.abs(slot) * 0.12) * partT;
      const centerDrop = slot === 0 ? -0.25 * partT : 0;
      slat.position.x = slat.userData.baseX + spread;
      slat.position.y = 0.88 + centerDrop + Math.sin(local * 0.75 + slot) * 0.025;
      slat.position.z = slat.userData.baseZ - (slot === 0 ? 0.32 * partT : 0);
      slat.rotation.y = slot * 0.08 * partT + Math.sin(local * 0.48 + slot * 0.6) * 0.06;
    });
  }
  const laserScan = group.userData.laserScan;
  if (laserScan) {
    // Two luxury scan passes: dramatic initial sweep + gentle secondary pass
    const pass1 = clamp01((local - 0.55) / 1.45);
    const pass2 = clamp01((local - 2.95) / 1.75);
    const ySweep = pass2 > 0 && pass2 < 1
      ? 2.15 - pass2 * 3.85
      : pass1 < 1
        ? 2.25 - pass1 * 3.95
        : -2.6;
    const scanVisible = (pass1 > 0.01 && pass1 < 0.99) || (pass2 > 0.01 && pass2 < 0.99);
    laserScan.visible = scanVisible;
    laserScan.position.y = ySweep;
  }

  // Segmented Precision Aperture Rings
  const gimbals = group.userData.gimbals || [];
  gimbals.forEach((ring, index) => {
    const gScale = Math.max(0.001, smooth((local - 0.12 - index * 0.12) / 0.75));
    ring.scale.setScalar(gScale);
    ring.rotation.z = local * (index === 0 ? -0.22 : 0.34);
    ring.rotation.x = THREE.MathUtils.degToRad((index === 0 ? 14 : -18) + Math.sin(local * 0.52 + index) * 5);
    ring.rotation.y = Math.cos(local * 0.44 + index) * 0.16;
  });

  // Searchlight Cones ("cyber")
  const cones = group.userData.searchlightCones || [];
  cones.forEach((cone, idx) => {
    const beamIn = smooth((local - 0.25) / 0.95);
    cone.rotation.z = (idx === 0 ? -0.38 : 0.38) + Math.sin(local * 0.55 + idx * 1.4) * 0.14;
    if (cone.material) cone.material.opacity = beamIn * (0.28 + 0.12 * Math.sin(local * 1.6 + idx));
  });

  // Impact Anamorphic Streak
  const impactFlare = group.userData.impactFlare;
  if (impactFlare) {
    const burst = smooth((local - 0.85) / 0.24) * (1 - smooth((local - 1.28) / 0.7));
    const settleGlow = smooth((local - 0.9) / 0.55) * 0.32;
    impactFlare.scale.set(4.8 + burst * 8.2, 0.28 + burst * 0.45, 1);
    if (impactFlare.material) {
      impactFlare.material.opacity = Math.min(0.9, settleGlow + burst * 0.58);
    }
  }

  // Plasma Orbital Filaments
  const filaments = group.userData.filaments || [];
  const totalSegs = 144;
  filaments.forEach((item, index) => {
    const stagger = index * 0.12;
    const endFrac = clamp01((local - stagger) / 1.15);
    const tailWindow = Math.max(0, (local - (duration - 0.95 - stagger * 0.5)) / 0.85);
    const startFrac = clamp01(tailWindow * 0.92);
    const segStart = Math.floor(startFrac * totalSegs);
    const segCount = Math.max(0, Math.floor((endFrac - startFrac) * totalSegs));
    const drawCount = segCount * FILAMENT_SEGMENT_INDICES;
    item.core.geometry.setDrawRange(segStart * FILAMENT_SEGMENT_INDICES, drawCount);
    item.halo.geometry.setDrawRange(segStart * FILAMENT_SEGMENT_INDICES, drawCount);
    item.group.rotation.y = THREE.MathUtils.degToRad(Math.sin(local * 0.65 + index * 1.3) * 14 + (1 - smooth(local / 1.25)) * -32);
    item.group.rotation.z = THREE.MathUtils.degToRad((index === 0 ? 7 : -9) + Math.cos(local * 0.55 + index) * 3.5);
    if (item.flare && item.curve) {
      const tipT = endFrac % 1;
      const tipPos = item.curve.getPointAt(tipT);
      item.flare.position.copy(tipPos);
      const flareAlpha = endFrac > 0.02 && segCount > 2 ? Math.sin(Math.min(1, endFrac) * Math.PI) * 0.72 + 0.32 : 0;
      item.flare.scale.setScalar(Math.max(0.001, (0.55 + Math.sin(local * 6 + index) * 0.12) * flareAlpha));
    }
  });

  // GPU Vortex / Swarm Particle Uniforms
  const vortex = group.userData.vortexParticles;
  if (vortex?.material?.uniforms) {
    const u = vortex.material.uniforms;
    u.uTime.value = local;
    u.uConverge.value = archetype === "silk"
      ? smooth(local / 1.45) * 0.72
      : smooth(local / 1.04);
    u.uShock.value = archetype === "forge"
      ? clamp01((local - 1.02) / 1.35)
      : clamp01((local - 1.05) / 1.8) * 0.55;
  }

  // Dual Animated Studio Rim / Sweep Lights (glints run across bevels throughout the reel!)
  const sweepLight = group.userData.sweepLight;
  if (sweepLight) {
    const passA = smooth((local - 0.75) / 1.45);
    const passB = local > 2.6 ? smooth((local - 2.6) / 2.2) : 0;
    const sweepX = passB > 0 ? 4.4 - passB * 8.8 : -4.4 + passA * 8.8;
    const activeA = smooth((local - 0.6) / 0.3) * (1 - smooth((local - 2.35) / 0.4));
    const activeB = smooth((local - 2.65) / 0.35) * (1 - smooth((local - 4.75) / 0.55));
    sweepLight.position.set(sweepX, 1.95, 4.25);
    sweepLight.intensity = 0.95 + 1.85 * Math.max(activeA, activeB * 0.85);
  }
  const accentRimLight = group.userData.accentRimLight;
  if (accentRimLight) {
    accentRimLight.position.set(
      Math.cos(local * 0.55) * 3.8,
      1.6 + Math.sin(local * 0.7) * 0.8,
      -2.2
    );
    accentRimLight.intensity = 1.65 + Math.sin(local * 1.9) * 0.25;
  }
}

/**
 * Compute continuous hero crane plunge -> magnetic impact settle -> smooth
 * Steadicam drift camera pose for `neon_logo`.
 */
export function computeLogoCameraPose(projection, scene, local) {
  const crane = 1 - smooth(local / 1.08);
  const orbitT = Math.max(0, local - 1.08);
  const impactShake = Math.exp(-Math.max(0, local - 1.0) * 6.5) * (local > 0.96 ? Math.sin(local * 38) * 0.055 : 0);
  const baseY = scene.background !== "transparent" ? 0.14 : 0;
  const lookY = scene.background !== "transparent" ? -0.18 : 0;
  const steadicamX = Math.sin(orbitT * 0.44) * 0.62 * smooth(orbitT / 0.75);
  const steadicamY = Math.sin(orbitT * 0.34) * 0.11 * smooth(orbitT / 0.75);
  const pullbackZ = orbitT * 0.16;

  return {
    x: projection.x - 2.15 * crane + steadicamX + impactShake,
    y: baseY + 0.72 * crane + steadicamY + impactShake * 0.6,
    z: projection.distance - 2.85 * crane + pullbackZ,
    lookX: 0,
    lookY,
    lookZ: 0,
  };
}
