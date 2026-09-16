import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { FontLoader } from "three/examples/jsm/loaders/FontLoader.js";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";
import studioFont from "./helvetiker_bold.typeface.json";
import { normalizeStudio3DScene, studio3DPose } from "./studio3DModel";
import "./studio3D.css";

const font = new FontLoader().parse(studioFont);
const clamp01 = value => Math.max(0, Math.min(1, value));
const smooth = value => { const p = clamp01(value); return p * p * (3 - 2 * p); };
const overshoot = value => { const p = clamp01(value); return 1 + 2.70158 * (p - 1) ** 3 + 1.70158 * (p - 1) ** 2; };

function animateLogo(group, scene, local, portrait) {
  const mark = group.userData.logoMark;
  if (!mark) return;
  const markProgress = Math.max(.001, overshoot(local / .72));
  const layoutScale = portrait ? 1.38 : .88;
  mark.position.set(portrait ? 0 : -3.42, portrait ? 2.25 : 0, .18);
  mark.scale.setScalar(layoutScale * markProgress);
  mark.rotation.y = THREE.MathUtils.degToRad((1 - smooth(local / .7)) * -72);
  mark.rotation.z = THREE.MathUtils.degToRad((1 - smooth(local / .6)) * 8);
  mark.children.forEach(child => {
    const baseScale = child.userData.baseScale;
    const basePosition = child.userData.basePosition;
    if (!baseScale || !basePosition) return;
    if (child.name.startsWith("Brand glint")) {
      const index = Number(child.name.slice(-2));
      const burst = smooth((local - .12 - index * .018) / .45) * (1 - smooth((local - .8) / .6));
      const travel = 1.45 - .55 * smooth(local / .75);
      child.position.set(basePosition.x * travel, basePosition.y * travel, basePosition.z);
      child.scale.copy(baseScale).multiplyScalar(Math.max(.001, burst));
    } else if (["A left beam", "A right beam", "A crossbar"].includes(child.name)) {
      child.scale.copy(baseScale);
      child.scale.y *= Math.max(.001, overshoot((local - .18) / .48));
    } else if (child.name === "Promotion spark") {
      child.scale.copy(baseScale).multiplyScalar(Math.max(.001, overshoot((local - .52) / .38)));
    }
  });
  const plateProgress = Math.max(.001, smooth((local - .32) / .66));
  [group.userData.plate, group.userData.edge].forEach(object => {
    if (!object?.userData.baseScale) return;
    object.scale.copy(object.userData.baseScale);
    object.scale.x *= plateProgress;
  });
  if (group.userData.title?.userData.basePosition) {
    group.userData.title.userData.basePosition.x = portrait ? -2.75 : -2.55;
  }
  if (group.userData.promote?.userData.basePosition) {
    group.userData.promote.userData.basePosition.x = portrait ? -.78 : -.55;
  }
  [[group.userData.title, .62, -1], [group.userData.promote, .75, 1]].forEach(([object, delay, direction]) => {
    if (!object?.userData.baseScale) return;
    const progress = Math.max(.001, overshoot((local - delay) / .62));
    const basePosition = object.userData.basePosition;
    object.position.x = basePosition.x + direction * (1 - smooth((local - delay) / .55)) * .72;
    object.position.z = basePosition.z + (1 - smooth((local - delay) / .55)) * .8;
    object.scale.copy(object.userData.baseScale);
    object.scale.x *= progress;
  });
  const subtitle = group.userData.subtitle;
  if (subtitle?.userData.baseScale) {
    const progress = Math.max(.001, smooth((local - 1.05) / .55));
    subtitle.scale.copy(subtitle.userData.baseScale);
    subtitle.scale.x *= progress;
    subtitle.position.y = subtitle.userData.basePosition.y - (1 - progress) * .22;
  }
  const ring = group.userData.ring;
  if (ring?.userData.baseScale) {
    ring.scale.copy(ring.userData.baseScale).multiplyScalar(Math.max(.001, overshoot((local - .5) / .9)));
    ring.rotation.set(THREE.MathUtils.degToRad(68), local * .22, local * -.38);
  }
}

function materialFor(scene) {
  const color = new THREE.Color(scene.primaryColor);
  const glow = new THREE.Color(scene.glowColor);
  const common = { color, metalness: 0.25, roughness: 0.4, transparent: true };
  switch (scene.material) {
    case "chrome": return new THREE.MeshPhysicalMaterial({ ...common, metalness: 1, roughness: 0.16, clearcoat: 1 });
    case "gold": return new THREE.MeshPhysicalMaterial({ ...common, color: "#e7ba55", metalness: 0.85, roughness: 0.21, clearcoat: 0.8 });
    case "glass": return new THREE.MeshPhysicalMaterial({ ...common, metalness: 0.1, roughness: 0.08, transmission: 0.38, thickness: 0.25, side: THREE.DoubleSide });
    case "neon": return new THREE.MeshStandardMaterial({ ...common, emissive: glow, emissiveIntensity: 0.28 + scene.bloom * 0.36, metalness: 0.1 });
    case "holographic": return new THREE.MeshPhysicalMaterial({ ...common, metalness: 0.7, roughness: 0.18, iridescence: 1, iridescenceIOR: 1.5, clearcoat: 1 });
    default: return new THREE.MeshStandardMaterial({ ...common, roughness: 0.72 });
  }
}

function textMesh(text, scene, size, material) {
  const geometry = new TextGeometry(text || " ", {
    font, size, depth: scene.extrusionDepth,
    curveSegments: 5, bevelEnabled: scene.bevel > 0,
    bevelThickness: scene.bevel, bevelSize: scene.bevel * 0.6, bevelSegments: 2,
  });
  geometry.computeBoundingBox();
  const width = geometry.boundingBox.max.x - geometry.boundingBox.min.x;
  if (scene.textAlign === "center") geometry.translate(-width / 2, 0, 0);
  if (scene.textAlign === "right") geometry.translate(-width, 0, 0);
  return new THREE.Mesh(geometry, material);
}

function addAccent(group, scene) {
  const accent = new THREE.MeshBasicMaterial({ color: scene.glowColor, transparent: true, opacity: 0.8 });
  const plateMat = new THREE.MeshPhysicalMaterial({ color: "#090d1c", metalness: 0.12, roughness: 0.42, transparent: true, opacity: 0.95, side: THREE.DoubleSide });
  const template = scene.template;
  if (["neon_logo", "floating_callout", "speaker_intro", "comparison_card"].includes(template)) {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(8.2, template === "comparison_card" ? 3.3 : 2.35, 0.12), plateMat);
    plate.position.z = -0.34;
    group.add(plate);
    group.userData.plate = plate;
    const edge = new THREE.Mesh(new THREE.BoxGeometry(7.8, 0.022, 0.025), accent);
    edge.position.set(0, 1.17, -0.25);
    group.add(edge);
    group.userData.edge = edge;
  }
  if (template === "neon_logo" || template === "audio_reactive_text") {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.02, 0.022, 8, 96), accent);
    ring.position.z = -0.65;
    group.add(ring);
    group.userData.ring = ring;
  }
  if (template === "neon_logo") {
    const mark = new THREE.Group();
    const tileMat = new THREE.MeshPhysicalMaterial({ color: "#36136f", metalness: .3, roughness: .28 });
    const beamMat = new THREE.MeshStandardMaterial({ color: "#f6f2ff", emissive: "#5d3188", emissiveIntensity: .12 });
    const block = (w, h, d, x, y, z, mat, angle = 0, name = "Mark detail") => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.name = name;
      mesh.position.set(x, y, z);
      mesh.rotation.z = angle;
      mark.add(mesh);
    };
    block(1.35, 1.35, .18, 0, 0, -.08, tileMat, 0, "Signature tile");
    block(.13, .8, .13, -.19, 0, .06, beamMat, -.43, "A left beam");
    block(.13, .8, .13, .19, 0, .06, beamMat, .43, "A right beam");
    block(.55, .12, .12, 0, -.14, .07, accent, 0, "A crossbar");
    block(.11, .11, .11, .52, .47, .08, accent, 0, "Promotion spark");
    for (let index = 0; index < 12; index += 1) {
      const angle = index * Math.PI * 2 / 12;
      block(.035 + (index % 2) * .025, .035 + ((index + 1) % 2) * .025, .04,
        Math.cos(angle) * (1.1 + (index % 3) * .18), Math.sin(angle) * (1.1 + (index % 2) * .15), -.02,
        accent, angle, `Brand glint ${String(index).padStart(2, "0")}`);
    }
    mark.children.forEach(child => {
      child.userData.basePosition = child.position.clone();
      child.userData.baseScale = child.scale.clone();
    });
    group.add(mark);
    group.userData.logoMark = mark;
  }
  if (template === "chrome_lyric" || template === "impact_explosion") {
    for (let i = 0; i < 9; i += 1) {
      const ray = new THREE.Mesh(new THREE.BoxGeometry(0.035, 1.4 + (i % 3) * 0.42, 0.06), accent.clone());
      ray.position.set(Math.cos(i * Math.PI * 2 / 9) * 4.4, Math.sin(i * Math.PI * 2 / 9) * 2.1, -0.55);
      ray.rotation.z = -i * Math.PI * 2 / 9;
      group.add(ray);
    }
  }
  if (template === "cinematic_title" || template === "speaker_intro" || template === "comparison_card") {
    const line = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.035, 0.035), accent);
    line.position.set(0, -0.8, 0.1);
    group.add(line);
  }
}

function makeGroup(scene) {
  const group = new THREE.Group();
  const material = materialFor(scene);
  let title = textMesh(scene.text, scene, scene.text.length > 22 ? 0.4 : scene.text.length > 13 ? 0.55 : 0.78, material);
  if (scene.template === "neon_logo" && scene.text.toLowerCase() === "autopromote") {
    title.geometry.dispose();
    const pearl = new THREE.MeshPhysicalMaterial({ color: "#f7f8ff", metalness: .38, roughness: .2, transparent: true });
    title = textMesh("Auto", { ...scene, textAlign: "left" }, .78, pearl);
    title.position.x = -2.75;
    const promote = textMesh("Promote", { ...scene, textAlign: "left" }, .78, material);
    promote.position.set(-.78, scene.secondary ? .05 : -.35, .18);
    promote.userData.basePosition = promote.position.clone();
    promote.userData.baseScale = promote.scale.clone();
    group.add(promote);
    group.userData.promote = promote;
  }
  title.geometry.computeBoundingBox();
  const width = title.geometry.boundingBox.max.x - title.geometry.boundingBox.min.x;
  if (width > 8) title.scale.x = 8 / width;
  title.position.y = scene.secondary ? 0.05 : -0.35;
  group.add(title);
  title.userData.basePosition = title.position.clone();
  title.userData.baseScale = title.scale.clone();
  group.userData.title = title;
  if (scene.secondary) {
    const subMaterial = new THREE.MeshStandardMaterial({ color: scene.secondaryColor, roughness: 0.45, transparent: true });
    const subtitle = textMesh(scene.secondary, scene, 0.28, subMaterial);
    subtitle.geometry.computeBoundingBox();
    const subWidth = subtitle.geometry.boundingBox.max.x - subtitle.geometry.boundingBox.min.x;
    if (subWidth > 7.8) subtitle.scale.x = 7.8 / subWidth;
    subtitle.position.y = -0.7 * scene.lineSpacing;
    group.add(subtitle);
    subtitle.userData.basePosition = subtitle.position.clone();
    subtitle.userData.baseScale = subtitle.scale.clone();
    group.userData.subtitle = subtitle;
  }
  addAccent(group, scene);
  [group.userData.plate, group.userData.edge, group.userData.ring, group.userData.logoMark].forEach(object => {
    if (!object) return;
    object.userData.basePosition = object.position.clone();
    object.userData.baseScale = object.scale.clone();
  });
  if (scene.assetUrl) {
    new THREE.TextureLoader().load(scene.assetUrl, texture => {
      texture.colorSpace = THREE.SRGBColorSpace;
      const art = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      art.position.set(0, 1.38, 0.18);
      group.add(art);
    }, undefined, () => {});
  }
  return group;
}

// This canvas is an edit proxy. HQ Blender frames use the same bounded scene
// model and timeline clock, but not the browser's light/geometry budget.
export default function Studio3DCanvas({ scenes = [], time = 0, getTime, audioLevel = 0 }) {
  const hostRef = useRef(null);
  const clockRef = useRef(getTime);
  const levelRef = useRef(audioLevel);
  const timeRef = useRef(time);
  const [webglFailed, setWebglFailed] = useState(false);
  clockRef.current = getTime;
  levelRef.current = audioLevel;
  timeRef.current = time;
  const signature = JSON.stringify(scenes);

  useEffect(() => {
    if (!scenes.length || !hostRef.current) return undefined;
    const host = hostRef.current;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
    } catch (_) {
      setWebglFailed(true);
      return undefined;
    }
    setWebglFailed(false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    host.appendChild(renderer.domElement);
    const world = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 100);
    camera.position.set(0, 0, 13);
    const ambient = new THREE.AmbientLight("#bfc9ff", 0.8);
    const key = new THREE.DirectionalLight("#ffffff", 1.1);
    key.position.set(-3, 5, 8);
    const rim = new THREE.DirectionalLight("#8899ff", 0.65);
    rim.position.set(4, -2, -4);
    world.add(ambient, key, rim);
    const objects = scenes.map(raw => {
      const scene = normalizeStudio3DScene(raw);
      const group = makeGroup(scene);
      group.visible = false;
      world.add(group);
      return { scene, group };
    });
    let width = 0, height = 0, raf;
    const draw = () => {
      const rect = host.getBoundingClientRect();
      if (rect.width && rect.height && (rect.width !== width || rect.height !== height)) {
        width = rect.width; height = rect.height;
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.position.z = Math.max(13, (8.5 / 2) / (Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect) * 1.17);
        camera.updateProjectionMatrix();
      }
      const playhead = clockRef.current?.() ?? timeRef.current;
      for (const { scene, group } of objects) {
        const pose = studio3DPose(scene, playhead);
        group.visible = Boolean(pose);
        if (!pose) continue;
        if (scene.template === "neon_logo") {
          const portrait = height > width;
          animateLogo(group, scene, playhead - scene.startTime, portrait);
        }
        const sound = 1 + Math.min(1, levelRef.current) * scene.audioReactiveIntensity * 0.25;
        group.position.set(pose.x, pose.y, pose.z);
        group.scale.setScalar(pose.scale * sound);
        group.rotation.set(pose.rotationX * Math.PI / 180, pose.rotationY * Math.PI / 180, pose.rotationZ * Math.PI / 180);
        group.traverse(child => {
          if (child.isMesh && child.material?.transparent) {
            if (child.material.userData.baseOpacity === undefined) child.material.userData.baseOpacity = child.material.opacity;
            child.material.opacity = pose.opacity * child.material.userData.baseOpacity;
          }
        });
        key.color.set(scene.lightColor);
        key.intensity = scene.lightIntensity / 2;
        key.position.set(Math.sin(scene.lightDirection * Math.PI / 180) * 6, 5, 8);
        camera.fov = Math.max(25, Math.min(70, 70 - scene.focalLength * 0.55));
        camera.updateProjectionMatrix();
      }
      renderer.render(world, camera);
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(raf);
      world.traverse(object => {
        object.geometry?.dispose?.();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(material => { material?.map?.dispose?.(); material?.dispose?.(); });
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    };
  }, [signature]);

  if (!scenes.length) return null;
  return <div className="studio-3d-canvas" ref={hostRef} data-testid="studio-3d-preview" aria-label="3D motion graphics preview">
    {webglFailed ? <div className="studio-3d-fallback">3D live preview is unavailable in this browser. Your scene settings are preserved.</div> : null}
  </div>;
}
