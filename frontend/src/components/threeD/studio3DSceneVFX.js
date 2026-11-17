import * as THREE from "three";
import { createGlowBokehTexture } from "./studio3DBrandGeometry";
import { createVortexParticleSystem } from "./studio3DVFXShaders";

const clamp01 = v => Math.max(0, Math.min(1, v));
const smooth = v => {
  const p = clamp01(v);
  return p * p * (3 - 2 * p);
};

function createChamferedSlateGeometry(width, height, depth = 0.09, corner = 0.24) {
  const hw = width * 0.5;
  const hh = height * 0.5;
  const r = Math.min(corner, hw * 0.3, hh * 0.3);
  const shape = new THREE.Shape();
  shape.moveTo(-hw + r, -hh);
  shape.lineTo(hw - r, -hh);
  shape.lineTo(hw, -hh + r);
  shape.lineTo(hw, hh - r);
  shape.lineTo(hw - r, hh);
  shape.lineTo(-hw + r, hh);
  shape.lineTo(-hw, hh - r);
  shape.lineTo(-hw, -hh + r);
  shape.closePath();

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth,
    curveSegments: 4,
    bevelEnabled: true,
    bevelSize: 0.025,
    bevelThickness: 0.022,
    bevelSegments: 3,
  });
  geom.translate(0, 0, -depth * 0.5);
  geom.computeVertexNormals();
  return geom;
}

function createBeamGradientTexture(hexColor = "#ffffff") {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const c = new THREE.Color(hexColor);
  const rgb = `${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}`;
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, `rgba(${rgb}, 0.36)`);
  grad.addColorStop(0.35, `rgba(${rgb}, 0.14)`);
  grad.addColorStop(1, `rgba(${rgb}, 0.0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Upgrade non-logo 3D Studio templates (cards, audio spectrum, titles, object sculptures)
 * with chamfered optical glass slates, 3D harmonic pylons, GPU particles, and cinema lighting.
 */
export function addStudio3DStageAccentsVFX(group, scene) {
  const primary = new THREE.Color(scene.primaryColor);
  const glow = new THREE.Color(scene.glowColor);
  const template = scene.template;

  group.userData.vfxTelemetry = {
    chromaticPulse: 0.0004,
    arenaPulse: 0,
  };

  if (["floating_callout", "speaker_intro", "comparison_card"].includes(template)) {
    const slateWidth = template === "comparison_card" ? 8.4 : 7.8;
    const slateHeight = template === "comparison_card" ? 3.45 : 2.38;

    const glassPlateMat = new THREE.MeshPhysicalMaterial({
      color: "#1e2e4f",
      emissive: primary.clone().multiplyScalar(0.18),
      emissiveIntensity: 0.34,
      metalness: 0.22,
      roughness: 0.06,
      transmission: scene.background === "transparent" ? 0 : 0.42,
      ior: 1.52,
      thickness: 0.7,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      transparent: true,
      opacity: scene.background === "transparent" ? 0.86 : 0.94,
    });
    const plate = new THREE.Mesh(
      createChamferedSlateGeometry(slateWidth, slateHeight, 0.09, 0.28),
      glassPlateMat
    );
    plate.position.set(0, 0, -0.38);
    plate.userData.basePosition = plate.position.clone();
    plate.userData.baseScale = plate.scale.clone();
    group.add(plate);
    group.userData.plate = plate;

    const topTrimMat = new THREE.MeshBasicMaterial({
      color: glow.clone().multiplyScalar(1.35),
      transparent: true,
      opacity: 0.92,
    });
    const edge = new THREE.Mesh(new THREE.BoxGeometry(slateWidth * 0.9, 0.022, 0.03), topTrimMat);
    edge.position.set(0, slateHeight * 0.5 - 0.06, -0.3);
    edge.castShadow = false;
    edge.userData.basePosition = edge.position.clone();
    edge.userData.baseScale = edge.scale.clone();
    group.add(edge);
    group.userData.edge = edge;

    const bottomTrimMat = new THREE.MeshBasicMaterial({
      color: primary.clone().multiplyScalar(1.15),
      transparent: true,
      opacity: 0.85,
    });
    const bottomEdge = new THREE.Mesh(
      new THREE.BoxGeometry(slateWidth * 0.65, 0.016, 0.025),
      bottomTrimMat
    );
    bottomEdge.position.set(0, -slateHeight * 0.5 + 0.06, -0.3);
    bottomEdge.castShadow = false;
    bottomEdge.userData.basePosition = bottomEdge.position.clone();
    bottomEdge.userData.baseScale = bottomEdge.scale.clone();
    group.add(bottomEdge);
    group.userData.bottomEdge = bottomEdge;
  }

  if (template === "audio_reactive_text" || template === "chrome_lyric") {
    // 22-pylon harmonic 3D crystal spectrum equalizer amphitheater seated cleanly behind title
    const pylonCount = 22;
    const pylons = [];
    const pylonGeom = new THREE.BoxGeometry(0.12, 1.0, 0.12);
    for (let i = 0; i < pylonCount; i += 1) {
      const frac = i / (pylonCount - 1);
      const angle = (frac - 0.5) * Math.PI * 0.92;
      const radius = 4.45;
      const barColor = primary.clone().lerp(glow, frac);
      const mat = new THREE.MeshPhysicalMaterial({
        color: barColor,
        emissive: barColor,
        emissiveIntensity: 0.85,
        metalness: 0.35,
        roughness: 0.16,
        clearcoat: 0.85,
      });
      const mesh = new THREE.Mesh(pylonGeom, mat);
      mesh.position.set(Math.sin(angle) * radius, -1.72, -2.15 - (1 - Math.cos(angle)) * 1.65);
      mesh.rotation.y = -angle * 0.65;
      mesh.castShadow = false;
      mesh.userData.barIndex = i;
      mesh.userData.baseY = mesh.position.y;
      group.add(mesh);
      pylons.push(mesh);
    }
    group.userData.spectrumPylons = pylons;

    const ringMat = new THREE.MeshPhysicalMaterial({
      color: "#dce5f8",
      metalness: 0.94,
      roughness: 0.16,
      clearcoat: 0.8,
    });
    const innerRingMat = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      emissive: glow,
      emissiveIntensity: 1.4,
      roughness: 0.18,
    });
    const ringOuter = new THREE.Mesh(new THREE.TorusGeometry(2.52, 0.024, 14, 96), ringMat);
    ringOuter.position.set(0, 0.3, -1.1);
    const ringInner = new THREE.Mesh(new THREE.TorusGeometry(2.26, 0.014, 12, 96), innerRingMat);
    ringInner.position.set(0, 0.3, -1.0);
    ringOuter.castShadow = false;
    ringInner.castShadow = false;
    ringOuter.userData.basePosition = ringOuter.position.clone();
    ringOuter.userData.baseScale = ringOuter.scale.clone();
    group.add(ringOuter, ringInner);
    group.userData.ring = ringOuter;
    group.userData.stageRings = [ringOuter, ringInner];
  }

  if (template === "cinematic_title" || template === "impact_explosion") {
    const ruleMat = new THREE.MeshBasicMaterial({
      color: glow.clone().multiplyScalar(1.3),
      transparent: true,
      opacity: 0.95,
    });
    const divider = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.018, 0.03), ruleMat);
    divider.position.set(0, -0.45, 0.06);
    divider.castShadow = false;
    group.add(divider);
    group.userData.stageDivider = divider;

    if (scene.background !== "transparent") {
      const cones = [scene.primaryColor, scene.glowColor].map((col, idx) => {
        const coneMat = new THREE.MeshBasicMaterial({
          map: createBeamGradientTexture(col),
          color: "#ffffff",
          transparent: true,
          opacity: 0.32,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 2.5, 8.2, 24, 1, true), coneMat);
        cone.position.set(idx === 0 ? -1.8 : 1.8, 2.7, -2.1);
        cone.rotation.z = idx === 0 ? -0.34 : 0.34;
        cone.castShadow = false;
        group.add(cone);
        return cone;
      });
      group.userData.stageCones = cones;
    }
  }

  if (scene.background !== "transparent") {
    const pCount = template === "object_scene" ? 1100 : 1400;
    const particles = createVortexParticleSystem(pCount, scene.primaryColor, scene.glowColor);
    particles.frustumCulled = false;
    group.add(particles);
    group.userData.vortexParticles = particles;

    const sweepLight = new THREE.PointLight("#ffffff", 1.15, 16, 1.3);
    sweepLight.position.set(-4.2, 2.2, 4.2);
    group.add(sweepLight);
    group.userData.sweepLight = sweepLight;

    const rimPoint = new THREE.PointLight(scene.glowColor, 1.45, 16, 1.4);
    rimPoint.position.set(3.4, 2.1, -2.5);
    group.add(rimPoint);
    group.userData.rimPoint = rimPoint;
  } else if (template === "chrome_lyric" || template === "impact_explosion") {
    const bokehTex = createGlowBokehTexture();
    const mat = new THREE.SpriteMaterial({
      map: bokehTex,
      color: scene.glowColor,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const aura = new THREE.Sprite(mat);
    aura.position.set(0, 0, -0.5);
    aura.scale.set(5.5, 2.2, 1);
    group.add(aura);
  }
}

/**
 * Per-frame continuous animation update for non-logo 3D scenes.
 */
export function animateStudio3DStageAccentsVFX(group, scene, local, audio = 0) {
  const template = scene.template;

  if (group.userData.vfxTelemetry) {
    const impact = smooth((local - 0.85) / 0.16) * (1 - smooth((local - 1.1) / 0.55));
    group.userData.vfxTelemetry.chromaticPulse = 0.00038 + impact * 0.0042 + audio * 0.0014;
    group.userData.vfxTelemetry.arenaPulse = local > 0.9 ? clamp01((local - 0.9) / 1.45) : 0;
  }

  const pylons = group.userData.spectrumPylons;
  if (Array.isArray(pylons) && pylons.length) {
    const enter = smooth(local / 0.75);
    pylons.forEach((mesh, idx) => {
      const waveA = Math.sin(local * 4.4 + idx * 0.55) * 0.5 + 0.5;
      const waveB = Math.cos(local * 6.8 - idx * 0.35) * 0.5 + 0.5;
      const bell = Math.exp(-Math.pow((idx - (pylons.length - 1) * 0.5) / 8.5, 2));
      const h = (0.35 + (waveA * 0.7 + waveB * 0.45) * (0.55 + audio * 1.35) * (0.65 + bell * 0.5)) * enter;
      mesh.scale.set(1, Math.max(0.05, h), 1);
      mesh.position.y = mesh.userData.baseY + h * 0.5;
      if (mesh.material && "emissiveIntensity" in mesh.material) {
        mesh.material.emissiveIntensity = 0.6 + h * 0.45 + audio * 0.52;
      }
    });
  }

  const rings = group.userData.stageRings;
  if (Array.isArray(rings)) {
    rings.forEach((r, idx) => {
      const s = Math.max(0.001, smooth((local - 0.1 * idx) / 0.72)) * (1 + audio * 0.09);
      r.scale.setScalar(s);
      r.rotation.z = local * (idx === 0 ? 0.25 : -0.36);
      r.rotation.x = THREE.MathUtils.degToRad((idx === 0 ? 18 : -22) + Math.sin(local * 0.8 + idx) * 6);
    });
  }

  const divider = group.userData.stageDivider;
  if (divider) {
    divider.scale.set(Math.max(0.001, smooth((local - 0.45) / 0.6)), 1, 1);
  }

  const cones = group.userData.stageCones;
  if (Array.isArray(cones)) {
    cones.forEach((cone, idx) => {
      cone.rotation.z = (idx === 0 ? -0.34 : 0.34) + Math.sin(local * 0.5 + idx * 1.5) * 0.12;
      if (cone.material) cone.material.opacity = smooth(local / 0.8) * (0.26 + 0.1 * Math.sin(local * 1.5 + idx));
    });
  }

  const vortex = group.userData.vortexParticles;
  if (vortex?.material?.uniforms) {
    const u = vortex.material.uniforms;
    u.uTime.value = local;
    u.uConverge.value = template === "object_scene" ? smooth(local / 1.4) * 0.48 : smooth(local / 0.95) * 0.75;
    u.uShock.value = template === "impact_explosion"
      ? clamp01((local - 0.85) / 1.35)
      : clamp01((local - 0.95) / 1.9) * (0.35 + audio * 0.45);
  }

  const sweepLight = group.userData.sweepLight;
  if (sweepLight) {
    const sx = Math.sin(local * 0.85) * 4.5;
    sweepLight.position.set(sx, 2.1 + Math.cos(local * 0.65) * 0.6, 4.4);
    sweepLight.intensity = 1.25 + audio * 0.9;
  }

  const rimPoint = group.userData.rimPoint;
  if (rimPoint) {
    rimPoint.position.set(Math.cos(local * 0.55) * 3.8, 1.9 + Math.sin(local * 0.6) * 0.7, -2.5);
  }
}

/**
 * Compute continuous gentle Steadicam parallax for non-logo dark cinema scenes.
 */
export function computeStageCameraPose(projection, scene, local) {
  const orbitT = Math.max(0, local - 0.4);
  const ramp = smooth(orbitT / 0.9);
  const motionAmt = Number(scene.cameraMotion) || 0;
  const xDrift = Math.sin(orbitT * 0.48) * (0.55 * Math.max(0.35, motionAmt)) * ramp;
  const yDrift = (scene.background !== "transparent" ? 0.12 : 0) + Math.sin(orbitT * 0.34) * 0.1 * ramp;
  const zPush = (scene.background !== "transparent" ? -0.35 * (1 - smooth(local / 1.1)) : 0) + orbitT * 0.1;
  return {
    x: projection.x + xDrift,
    y: yDrift,
    z: projection.distance + zPush,
    lookX: 0,
    lookY: scene.background !== "transparent" ? -0.08 : 0,
    lookZ: 0,
  };
}
