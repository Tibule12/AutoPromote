import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { FontLoader } from "three/examples/jsm/loaders/FontLoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import studioFont from "./helvetiker_bold.typeface.json";
import { buildMergedInterTextGeometry } from "./studio3DBrandGeometry";
import {
  addNeonLogoStageVFX,
  animateNeonLogoStageVFX,
  computeLogoCameraPose,
  resolveLogoArchetype,
} from "./studio3DLogoVFX";
import {
  addStudio3DStageAccentsVFX,
  animateStudio3DStageAccentsVFX,
  computeStageCameraPose,
} from "./studio3DSceneVFX";
import {
  CinemaPostShader,
  createArenaFloorMaterial,
  createDarkCinemaStudioEnv,
  createVolumetricBackdropMaterial,
} from "./studio3DVFXShaders";
import { normalizeStudio3DScene, studio3DPose } from "./studio3DModel";
import { studio3DCameraProjection } from "./studio3DProjection";
import { studio3DFrameSample, studio3DTextureFrameRequest, studio3DCanShareVideo } from "./studio3DSampling";
import { loadStudioSourceFrame } from "../studioSourceFrameClient";
import { studio3DObjectPose } from "./studio3DObjects";
import { ribbonMesh } from "./studio3DRibbon";
import "./studio3D.css";

const font = new FontLoader().parse(studioFont);

function createFloorVignetteTexture(hexColor = "#060511") {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const c = new THREE.Color(hexColor);
  const rgb = `${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}`;
  const grad = ctx.createRadialGradient(128, 128, 18, 128, 128, 128);
  grad.addColorStop(0, `rgba(${rgb}, 0.84)`);
  grad.addColorStop(0.5, `rgba(${rgb}, 0.92)`);
  grad.addColorStop(1, `rgba(${rgb}, 1)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function materialFor(scene) {
  const color = new THREE.Color(scene.primaryColor);
  const glow = new THREE.Color(scene.glowColor);
  // Transmission samples the opaque scene. Marking every object transparent
  // hides the dial/lens parts behind glass in Three's transmission pass.
  const common = { color, metalness: 0.25, roughness: scene.surfaceRoughness ?? .4, transparent: scene.template !== "object_scene" };
  const rough = value => scene.surfaceRoughness ?? value;
  switch (scene.material) {
    case "architecture": {
      const canvas = document.createElement("canvas"); canvas.width = 128; canvas.height = 256;
      const context = canvas.getContext("2d"); context.fillStyle = scene.primaryColor; context.fillRect(0, 0, 128, 256);
      context.fillStyle = "#143140";
      for (let row = 0; row < 12; row++) for (let column = 0; column < 4; column++) context.fillRect(column * 32 + 5, row * 21 + 4, 22, 14);
      const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
      return new THREE.MeshPhysicalMaterial({ ...common, color: "#ffffff", map, metalness: .5, roughness: rough(.24) });
    }
    case "chrome": return new THREE.MeshPhysicalMaterial({ ...common, metalness: 1, roughness: rough(.16), clearcoat: 1 });
    case "gold": return new THREE.MeshPhysicalMaterial({ ...common, color: scene.template === "object_scene" ? color : "#e7ba55", metalness: 0.85, roughness: rough(.21), clearcoat: 0.8 });
    case "glass": return new THREE.MeshPhysicalMaterial({ ...common, metalness: scene.template === "object_scene" ? 0 : .1,
      roughness: rough(scene.template === "object_scene" ? .045 : .08), transmission: scene.template === "object_scene" ? 1 : .38,
      ior: 1.45, thickness: 0.25, side: THREE.DoubleSide });
    case "brushed": return new THREE.MeshPhysicalMaterial({ ...common, metalness: 1, roughness: rough(.24), anisotropy: .7 });
    case "silk": return new THREE.MeshPhysicalMaterial({ ...common, metalness: 0, roughness: rough(.38), sheen: .9, sheenRoughness: .35, sheenColor: new THREE.Color("#fff1df") });
    case "neon": return new THREE.MeshStandardMaterial({ ...common, roughness: rough(.4), emissive: glow, emissiveIntensity: 0.28 + scene.bloom * 0.36, metalness: 0.1 });
    case "holographic": return new THREE.MeshPhysicalMaterial({ ...common, metalness: 0.7, roughness: rough(.18), iridescence: 1, iridescenceIOR: 1.5, clearcoat: 1 });
    default: return new THREE.MeshStandardMaterial({ ...common, roughness: rough(.72) });
  }
}

function textMesh(text, scene, size, material) {
  if (!String(text || '').trim()) return new THREE.Mesh(new THREE.PlaneGeometry(0,0),material);
  const isSubtitle = size < 0.35;
  const geometry = buildMergedInterTextGeometry(text || " ", {
    weight: isSubtitle ? "600" : "900",
    size: size * (isSubtitle ? 1.0 : 1.06),
    depth: scene.extrusionDepth,
    bevelSize: isSubtitle ? scene.bevel * 0.25 : scene.bevel * 0.52,
    bevelThickness: isSubtitle ? scene.bevel * 0.25 : scene.bevel * 0.65,
    bevelSegments: scene.bevel > 0 ? 3 : 1,
    letterSpacing: isSubtitle ? 0.22 : 0.11,
    textAlign: scene.textAlign,
    fallbackFont: font,
  });
  return new THREE.Mesh(geometry, material);
}

function makeGroup(scene) {
  const group = new THREE.Group();
  if (scene.template === "object_scene") {
    group.userData.sceneObjects = scene.objects.map(object => {
      if (object.shape === "gltf") {
        const container = new THREE.Group();
        container.name = object.name;
        const proxyMesh = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.9, 1),
          materialFor({ ...scene, primaryColor: object.color, glowColor: object.color, material: object.material || scene.material, surfaceRoughness: object.roughness })
        );
        proxyMesh.castShadow = scene.shadows !== false;
        proxyMesh.receiveShadow = scene.shadows !== false;
        container.add(proxyMesh);
        if (object.gltfUrl) {
          try {
            const loader = new GLTFLoader();
            loader.load(
              object.gltfUrl,
              gltf => {
                const loaded = gltf?.scene;
                if (!loaded) return;
                const box = new THREE.Box3().setFromObject(loaded);
                const size = new THREE.Vector3();
                box.getSize(size);
                const maxDim = Math.max(0.01, size.x, size.y, size.z);
                const center = new THREE.Vector3();
                box.getCenter(center);
                loaded.position.sub(center);
                loaded.scale.multiplyScalar(2.0 / maxDim);
                loaded.traverse(node => {
                  if (node.isMesh) {
                    node.castShadow = scene.shadows !== false;
                    node.receiveShadow = scene.shadows !== false;
                  }
                });
                container.remove(proxyMesh);
                proxyMesh.geometry?.dispose?.();
                container.add(loaded);
              },
              undefined,
              () => {}
            );
          } catch (_e) {}
        }
        group.add(container);
        return { object, mesh: container };
      }
      let geometry;
      if (object.shape === "ribbon") {
        const data = ribbonMesh(object.ribbon);
        geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(data.positions, 3));
        const uv = [];
        for (let index = 0; index < data.positions.length / 3; index += 1) uv.push(Math.floor(index / 16) / 192, (index % 16) / 16);
        geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
        geometry.setIndex(data.indices); geometry.computeVertexNormals(); geometry.computeTangents();
      }
      else if (object.shape === "plane") geometry = new THREE.PlaneGeometry(10, 10);
      else if (object.shape === "sphere") geometry = new THREE.SphereGeometry(1, 32, 16);
      else if (object.shape === "torus") geometry = new THREE.TorusGeometry(1, .22, 12, 48);
      else if (object.shape === "cylinder") { geometry = new THREE.CylinderGeometry(1, 1, 2, 48); geometry.rotateX(Math.PI / 2); }
      else if (object.shape === "icosphere") geometry = new THREE.IcosahedronGeometry(1, 1);
      else geometry = object.bevel ? new RoundedBoxGeometry(2, 2, 2, 3, object.bevel) : new THREE.BoxGeometry(2, 2, 2);
      const mesh = new THREE.Mesh(geometry, materialFor({ ...scene, primaryColor: object.color, glowColor: object.color, material: object.material || scene.material, surfaceRoughness: object.roughness }));
      mesh.name = object.name; group.add(mesh); return { object, mesh };
    });
    addStudio3DStageAccentsVFX(group, scene);
    return group;
  }
  if (scene.template === "neon_logo") {
    addNeonLogoStageVFX(group, scene, { fallbackFont: font });
    return group;
  }
  const material = materialFor(scene);
  const title = textMesh(scene.text, scene, scene.text.length > 22 ? 0.4 : scene.text.length > 13 ? 0.55 : 0.78, material);
  title.geometry.computeBoundingBox();
  const width = (title.geometry.boundingBox.max.x - title.geometry.boundingBox.min.x) * title.scale.x;
  if (width > 8) title.scale.x = 8 / (title.geometry.boundingBox.max.x - title.geometry.boundingBox.min.x);
  const isSpectrum = scene.template === "audio_reactive_text";
  title.position.y = isSpectrum ? 0.56 : scene.secondary ? 0.08 : -0.35;
  group.add(title);
  title.userData.basePosition = title.position.clone();
  title.userData.baseScale = title.scale.clone();
  group.userData.title = title;
  if (scene.secondary) {
    const subMaterial = new THREE.MeshStandardMaterial({ color: scene.secondaryColor, roughness: 0.42, transparent: true });
    const subtitle = textMesh(scene.secondary, scene, 0.22, subMaterial);
    subtitle.geometry.computeBoundingBox();
    const subWidth = subtitle.geometry.boundingBox.max.x - subtitle.geometry.boundingBox.min.x;
    if (subWidth > 7.8) subtitle.scale.x = 7.8 / subWidth;
    subtitle.position.y = isSpectrum ? -0.18 : -0.78 * scene.lineSpacing;
    group.add(subtitle);
    subtitle.userData.basePosition = subtitle.position.clone();
    subtitle.userData.baseScale = subtitle.scale.clone();
    group.userData.subtitle = subtitle;
  }
  addStudio3DStageAccentsVFX(group, scene);
  [group.userData.plate, group.userData.edge, group.userData.bottomEdge, group.userData.ring].forEach(object => {
    if (!object) return;
    object.userData.basePosition = object.position.clone();
    object.userData.baseScale = object.scale.clone();
  });
  if (scene.assetUrl) {
    const attach = texture => {
      texture.colorSpace = THREE.SRGBColorSpace;
      const video = scene.assetType === 'video';
      const art = new THREE.Mesh(new THREE.PlaneGeometry(video ? 6.8 : 1.8, video ? 6.8/scene.assetAspect : 1.8), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: true, side: THREE.DoubleSide, toneMapped: !video }));
      art.position.set(0, scene.template==='media_plane'?0:1.38, 0.18);
      group.add(art);
      if (video) group.userData.videoAsset.art = art;
    };
    if (scene.assetType === 'video') {
      const video = document.createElement('video');
      video.crossOrigin='anonymous';video.muted=true;video.volume=0;video.playsInline=true;video.preload='auto';
      video.src=scene.assetUrl;
      const texture=new THREE.VideoTexture(video);
      group.userData.videoAsset={video,texture};
      attach(texture);
    } else new THREE.TextureLoader().load(scene.assetUrl, attach, undefined, () => {});
  }
  return group;
}

// This canvas is an edit proxy. HQ Blender frames use the same bounded scene
// model and timeline clock, but not the browser's light/geometry budget.
export default function Studio3DCanvas({ scenes = [], time = 0, getTime, getSourceVideo, getAudioLevel, playing = false, playbackRate = 1, audioLevel = 0, zIndex }) {
  const hostRef = useRef(null);
  const clockRef = useRef(getTime);
  const levelRef = useRef(audioLevel);
  const audioLevelGetterRef = useRef(getAudioLevel);
  const timeRef = useRef(time);
  const playbackRef = useRef({ playing, playbackRate });
  const sourceVideoRef = useRef(getSourceVideo);
  const pausedFramesRef = useRef({});
  const [webglFailed, setWebglFailed] = useState(false);
  clockRef.current = getTime;
  levelRef.current = audioLevel;
  audioLevelGetterRef.current = getAudioLevel;
  timeRef.current = time;
  playbackRef.current = { playing, playbackRate };
  sourceVideoRef.current = getSourceVideo;
  const signature = JSON.stringify(scenes);
  const textureRequests = playing ? [] : scenes.map(scene => ({ id: scene.id, request: studio3DTextureFrameRequest(scene, time) }))
    .filter(item => item.request);
  const textureRequestKey = JSON.stringify(textureRequests);

  useEffect(() => {
    const requests = JSON.parse(textureRequestKey);
    pausedFramesRef.current = Object.fromEntries(requests.map(item => [item.id,
      { key: JSON.stringify(item.request), status: 'loading' }]));
    if (!requests.length) return undefined;
    const controller = new AbortController();
    const deadline = setTimeout(() => {
      for (const { id, request } of requests) pausedFramesRef.current[id] = { key: JSON.stringify(request), status: 'unavailable' };
      controller.abort();
    }, 30000);
    // Share the existing owner-bounded source decoder, including during a
    // programme seek. Superseded seeks cannot paint an older texture.
    const timer = setTimeout(async () => {
      for (const { id, request } of requests) {
        try {
          const frame = await loadStudioSourceFrame(request, controller.signal);
          if (controller.signal.aborted) return;
          pausedFramesRef.current[id] = { ...frame, key: JSON.stringify(request), status: 'accurate' };
        } catch (_) {
          if (controller.signal.aborted) return;
          pausedFramesRef.current[id] = { key: JSON.stringify(request), status: 'unavailable' };
        }
      }
      clearTimeout(deadline);
    }, 300);
    return () => { clearTimeout(timer); clearTimeout(deadline); controller.abort(); };
  }, [textureRequestKey]);
  const modelRef = useRef({ scenes, signature });
  modelRef.current = { scenes, signature };
  const hasScenes = scenes.length > 0;

  useEffect(() => {
    if (!hasScenes || !hostRef.current) return undefined;
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
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);
    const world = new THREE.Scene();
    let environment;
    let logoEnvironment;
    let logoEnvKey = "";
    const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 100);
    camera.position.set(0, 0, 13);
    const ambient = new THREE.AmbientLight("#bfc9ff", 0.8);
    const key = new THREE.DirectionalLight("#ffffff", 1.1);
    key.position.set(-3, 5, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0005;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 30;
    key.shadow.camera.left = -7;
    key.shadow.camera.right = 7;
    key.shadow.camera.top = 7;
    key.shadow.camera.bottom = -7;
    const rim = new THREE.DirectionalLight("#8899ff", 0.65);
    rim.position.set(4, -2, -4);
    const backdropMat = createVolumetricBackdropMaterial("#a855f7", "#00e5ff", "cyber");
    backdropMat.depthTest = false;
    backdropMat.depthWrite = false;
    const stageBackdrop = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), backdropMat);
    stageBackdrop.frustumCulled = false;
    stageBackdrop.renderOrder = -100;
    stageBackdrop.visible = false;
    const reflector = new Reflector(new THREE.CircleGeometry(6.4, 64), {
      clipBias: 0.003,
      textureWidth: 1024,
      textureHeight: 1024,
      color: 0x0d0b16,
      multisample: 2,
    });
    reflector.rotation.x = -Math.PI / 2;
    reflector.position.set(0, -1.78, 0);
    reflector.receiveShadow = false;
    reflector.visible = false;
    const arenaFloorMat = createArenaFloorMaterial("#a855f7", "#00e5ff");
    const lightFloorMat = new THREE.MeshBasicMaterial({
      map: createFloorVignetteTexture("#eef2ff"),
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    const reflectorVeil = new THREE.Mesh(new THREE.CircleGeometry(15, 64), arenaFloorMat);
    reflectorVeil.rotation.x = -Math.PI / 2;
    reflectorVeil.position.set(0, -1.774, 0);
    reflectorVeil.visible = false;
    const shadowCatcher = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 14),
      new THREE.ShadowMaterial({ opacity: 0.32, transparent: true })
    );
    shadowCatcher.rotation.x = -Math.PI / 2;
    shadowCatcher.position.set(0, -2.25, 0);
    shadowCatcher.receiveShadow = true;
    shadowCatcher.visible = false;
    world.add(ambient, key, rim, stageBackdrop, reflector, reflectorVeil, shadowCatcher);
    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(world, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.36, 0.44, 1.08);
    const outputPass = new OutputPass();
    const cinemaPass = new ShaderPass(CinemaPostShader);
    composer.addPass(renderPass);
    composer.addPass(bloomPass);
    composer.addPass(outputPass);
    composer.addPass(cinemaPass);
    let objects = [], lastSignature, retired = [];
    const disposeGroup = group => group.traverse(object => {
      object.geometry?.dispose?.();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(material => { material?.map?.dispose?.(); material?.dispose?.(); });
    });
    let width = 0, height = 0, raf, lastPlayhead, lastAudioLevel;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (document.hidden) return;
      const rect = { width: host.clientWidth, height: host.clientHeight };
      if (!rect.width || !rect.height) return;
      const changed = lastSignature !== modelRef.current.signature;
      if (changed) {
        // Reuse the context, reflection environment and shader programmes when
        // editing. Retire old materials after the replacement's first draw.
        for (const { group } of objects) { world.remove(group); retired.push(group); }
        const needsEnvironment = modelRef.current.scenes.some(
          scene => scene.reflections !== false || scene.template === "object_scene"
        );
        if (needsEnvironment && !environment) {
          const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
          environment = pmrem.fromScene(room, .04); room.dispose(); pmrem.dispose();
        }
        objects = modelRef.current.scenes.map(raw => {
          const scene = normalizeStudio3DScene(raw), group = makeGroup(scene);
          const enableShadows = scene.shadows !== false;
          const isCinemaStage = scene.template === "neon_logo" || scene.background === "dark" || scene.lightingRig === "sculpture";
          const reflIntensity = scene.reflections !== false ? (isCinemaStage ? 1.42 : 1.15) : 0.0;
          group.traverse(child => {
            if (child.isMesh) {
              child.castShadow = enableShadows;
              child.receiveShadow = enableShadows;
              if (child.material && "envMapIntensity" in child.material) {
                child.material.envMapIntensity = reflIntensity;
              }
            }
          });
          group.visible = false; world.add(group); return { scene, group };
        });
        const firstCinema = objects.find(({ scene }) => scene.template === "neon_logo" || scene.background === "dark" || scene.lightingRig === "sculpture")?.scene;
        if (firstCinema) {
          const nextEnvKey = `${firstCinema.primaryColor}|${firstCinema.glowColor}`;
          if (nextEnvKey !== logoEnvKey) {
            logoEnvironment?.dispose?.();
            logoEnvironment = createDarkCinemaStudioEnv(renderer, firstCinema.primaryColor, firstCinema.glowColor);
            logoEnvKey = nextEnvKey;
          }
        }
        world.environment = firstCinema && logoEnvironment
          ? logoEnvironment.texture
          : (needsEnvironment ? environment?.texture || null : null);
        lastSignature = modelRef.current.signature;
      }
      const resized = rect.width !== width || rect.height !== height;
      if (rect.width && rect.height && (rect.width !== width || rect.height !== height)) {
        width = rect.width; height = rect.height;
        renderer.setSize(width, height, false);
        composer.setSize(width, height);
        bloomPass.setSize(width, height);
        reflector.getRenderTarget().setSize(
          Math.max(256, Math.round(width * 0.75)),
          Math.max(256, Math.round(height * 0.75))
        );
        camera.aspect = width / height;
        camera.position.z = Math.max(13, (8.5 / 2) / (Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect) * 1.17);
        camera.updateProjectionMatrix();
      }
      const playhead = clockRef.current?.() ?? timeRef.current;
      // Play the silent texture continuously during transport. Re-seeking on
      // every animation frame prevents its decoder from presenting smoothly.
      // Paused inspection instead consumes the exact native raw texture frame.
      let textureChanged=false;
      for (const {scene,group} of objects) {
        const asset=group.userData.videoAsset;if(!asset)continue;
        const sample=studio3DFrameSample(scene,playhead);
        const video=asset.video,local=playhead-scene.startTime;
        const transport=playbackRef.current;
        const running=transport.playing && !!sample;
        const now=performance.now();
        const shared=running?sourceVideoRef.current?.():null;
        if(studio3DCanShareVideo(scene,playhead,shared)){
          video.pause();
          if(asset.sharedVideo!==shared.video){
            asset.sharedTexture?.dispose();asset.sharedVideo=shared.video;
            asset.sharedTexture=new THREE.VideoTexture(shared.video);
            asset.sharedTexture.colorSpace=THREE.SRGBColorSpace;
          }
          if(asset.art.material.map!==asset.sharedTexture){asset.art.material.map=asset.sharedTexture;textureChanged=true;}
          host.dataset.sceneFrameIndex=String(sample.frameIndex);
          host.dataset.textureSampling='shared-decoded';host.dataset.textureFrameIndex='';
          host.dataset.textureSourceTime=String(shared.sourceTime);
          host.dataset.textureTransport=shared.video.paused?'paused':'playing';
          host.dataset.textureSeeking='false';
          asset.running=false;asset.lastPlayhead=playhead;
          continue;
        }
        const target=scene.assetSourceStart+Math.max(0,Math.min(scene.duration,running?local:(sample?.localTime??local)));
        if(!running)video.pause();
        const request=!running&&sample?studio3DTextureFrameRequest(scene,playhead):null;
        const frame=request?pausedFramesRef.current[scene.id]:null;
        const exact=frame?.status==='accurate'&&frame.key===JSON.stringify(request)?frame:null;
        if(exact){
          if(asset.pausedImage!==exact.image){
            asset.pausedTexture?.dispose();
            asset.pausedTexture=new THREE.Texture(exact.image);
            asset.pausedTexture.colorSpace=THREE.SRGBColorSpace;
            asset.pausedTexture.generateMipmaps=false;
            asset.pausedTexture.minFilter=THREE.LinearFilter;
            asset.pausedTexture.needsUpdate=true;
            asset.pausedImage=exact.image;
            textureChanged=true;
          }
          if(asset.art.material.map!==asset.pausedTexture){asset.art.material.map=asset.pausedTexture;textureChanged=true;}
        }else{
          if(asset.art.material.map!==asset.texture){asset.art.material.map=asset.texture;textureChanged=true;}
          const jumped=asset.lastPlayhead!==undefined&&Math.abs(playhead-asset.lastPlayhead)>.5;
          // Allow a seek to settle and the silent decoder to run before a
          // further drift correction. Per-RAF seeks otherwise starve decoding.
          const canCorrect=!running||!asset.running||jumped||now-(asset.lastSeekAt??-Infinity)>=750;
          if(sample&&video.readyState>=1&&!video.seeking&&canCorrect&&Math.abs(video.currentTime-target)>(running ? .12 : 1/120)){
            video.currentTime=target;asset.lastSeekAt=now;
          }
          if(running){
            video.playbackRate=Math.max(.1,Math.min(4,Number(transport.playbackRate)||1));
            if(video.paused&&!video.seeking&&!asset.playPending){
              asset.playPending=true;video.play().catch(()=>{}).finally(()=>{asset.playPending=false;});
            }
          }
        }
        if(sample){
          host.dataset.sceneFrameIndex=String(sample.frameIndex);
          host.dataset.textureSampling=exact?'accurate-paused':frame?.status==='loading'?'loading':'native';
          host.dataset.textureFrameIndex=exact?String(exact.receipt.frameIndex):'';
          host.dataset.textureSourceTime=String(video.currentTime);
          host.dataset.textureTransport=video.paused?'paused':'playing';
          host.dataset.textureSeeking=String(video.seeking);
        }
        if(!video.seeking && video.readyState>=2 && asset.presentedTime!==video.currentTime){
          asset.presentedTime=video.currentTime;asset.texture.needsUpdate=true;textureChanged=true;
        }
        asset.running=running;asset.lastPlayhead=playhead;
      }
      const reactive = objects.some(({ scene }) => scene.audioReactiveIntensity > 0);
      const sampledAudio = reactive ? Math.max(Number(levelRef.current) || 0, Number(audioLevelGetterRef.current?.()) || 0) : 0;
      const audio = Math.max(0, Math.min(1, sampledAudio));
      if (!resized && !textureChanged && !changed && playhead === lastPlayhead && audio === lastAudioLevel) return;
      lastPlayhead = playhead;
      lastAudioLevel = audio;
      let anyVisibleShadow = false;
      let stageBgMode = "transparent";
      let anyStageReflect = false;
      let bloomMax = 0;
      let activeCinemaScene = null;
      let activeCinemaGroup = null;
      for (const { scene, group } of objects) {
        const sample = studio3DFrameSample(scene, playhead);
        const pose = sample && studio3DPose(scene, sample.programmeTime);
        group.visible = Boolean(pose);
        if (!pose) continue;
        if (scene.shadows !== false) anyVisibleShadow = true;
        if (scene.background && scene.background !== "transparent") stageBgMode = scene.background;
        if ((scene.template === "neon_logo" || scene.background === "dark") && scene.reflections !== false) anyStageReflect = true;
        bloomMax = Math.max(bloomMax, Number(scene.bloom) || 0);
        if (group.userData.vfxParticles?.material?.uniforms?.uPixelRatio) {
          group.userData.vfxParticles.material.uniforms.uPixelRatio.value = renderer.getPixelRatio();
        }
        if (scene.template === "neon_logo") {
          activeCinemaScene = scene;
          activeCinemaGroup = group;
          const portrait = height > width;
          animateNeonLogoStageVFX(group, scene, sample.localTime, portrait);
        } else {
          if (scene.background === "dark" || scene.lightingRig === "sculpture") {
            activeCinemaScene = scene;
            activeCinemaGroup = group;
          }
          animateStudio3DStageAccentsVFX(group, scene, sample.localTime, audio);
        }
        const sound = 1 + audio * scene.audioReactiveIntensity * 0.25;
        group.position.set(pose.x, pose.y, pose.z);
        group.scale.setScalar(pose.scale * sound);
        group.rotation.set(pose.rotationX * Math.PI / 180, pose.rotationY * Math.PI / 180, pose.rotationZ * Math.PI / 180, 'ZYX');
        ambient.intensity = scene.template === "neon_logo" ? .32 : scene.lightingRig === "sculpture" ? .18 : scene.background === "dark" ? .36 : .8;
        rim.intensity = scene.template === "neon_logo" ? 1.25 : scene.lightingRig === "sculpture" ? 1.15 : scene.background === "dark" ? 1.1 : .65;
        for (const { object, mesh } of group.userData.sceneObjects || []) {
          if (object.shape === "ribbon" && object.ribbon.speed !== 0) {
            mesh.geometry.attributes.position.array.set(ribbonMesh(object.ribbon, playhead - scene.startTime).positions);
            mesh.geometry.attributes.position.needsUpdate = true; mesh.geometry.computeVertexNormals(); mesh.geometry.computeTangents();
          }
          const current = studio3DObjectPose(object, playhead - scene.startTime);
          mesh.position.set(current.x, current.y, current.z);
          mesh.scale.set(current.scaleX, current.scaleY, current.scaleZ);
          mesh.rotation.set(current.rotationX * Math.PI / 180, current.rotationY * Math.PI / 180, current.rotationZ * Math.PI / 180);
        }
        group.traverse(child => {
          if (child.isMesh && child.material) {
            if ("emissiveIntensity" in child.material && scene.audioReactiveIntensity > 0) {
              if (child.material.userData.baseEmissive === undefined) {
                child.material.userData.baseEmissive = child.material.emissiveIntensity || 0;
              }
              child.material.emissiveIntensity = child.material.userData.baseEmissive + audio * scene.audioReactiveIntensity * 0.65;
            }
            if (scene.template === "object_scene" || child.material.transparent) {
              if (child.material.userData.baseOpacity === undefined) child.material.userData.baseOpacity = child.material.opacity;
              child.material.opacity = pose.opacity * child.material.userData.baseOpacity;
              if (scene.template === "object_scene") {
                const transparent = child.material.opacity < 1;
                if (child.material.transparent !== transparent) {
                  child.material.transparent = transparent;
                  child.material.needsUpdate = true;
                }
              }
            }
          }
        });
        key.castShadow = scene.shadows !== false;
        key.color.set(scene.lightColor);
        key.intensity = scene.lightIntensity / 2;
        key.position.set(Math.sin(scene.lightDirection * Math.PI / 180) * 6, 5, 8);
        const projection = studio3DCameraProjection(scene, width / height, sample.localTime);
        camera.fov = projection.verticalFov;
        if (scene.template === "neon_logo") {
          const camPose = computeLogoCameraPose(projection, scene, sample.localTime);
          camera.position.set(camPose.x, camPose.y, camPose.z);
          camera.lookAt(camPose.lookX, camPose.lookY, camPose.lookZ);
        } else if (scene.background === "dark" || scene.lightingRig === "sculpture" || (scene.cameraMotion || 0) > 0) {
          const camPose = computeStageCameraPose(projection, scene, sample.localTime);
          camera.position.set(camPose.x, camPose.y, camPose.z);
          camera.lookAt(camPose.lookX, camPose.lookY, camPose.lookZ);
        } else {
          camera.position.set(projection.x, 0, projection.distance);
          camera.lookAt(0, 0, 0);
        }
        camera.updateProjectionMatrix();
      }
      if (activeCinemaScene && logoEnvironment) {
        world.environment = logoEnvironment.texture;
      } else if (environment) {
        world.environment = environment.texture;
      }
      renderer.toneMappingExposure = activeCinemaScene && stageBgMode === "dark" ? 1.12 : 1.0;
      if (stageBgMode !== "transparent") {
        const isLight = stageBgMode === "light";
        world.background = new THREE.Color(isLight ? "#eef2ff" : "#04040a");
        world.fog = isLight ? null : new THREE.FogExp2("#04040a", 0.036);
        stageBackdrop.visible = !isLight;
        const themeScene = activeCinemaScene || objects[0]?.scene;
        if (stageBackdrop.visible && themeScene) {
          const arch = activeCinemaGroup?.userData.logoArchetype || resolveLogoArchetype(themeScene);
          const modeIdx = arch === "forge" ? 1.0 : arch === "monolith" ? 2.0 : arch === "cyber" ? 3.0 : 0.0;
          backdropMat.uniforms.uTime.value = playhead;
          backdropMat.uniforms.uMode.value = modeIdx;
          backdropMat.uniforms.uIntensity.value = activeCinemaScene ? 1.0 : 0.68;
          backdropMat.uniforms.uPrimary.value.set(themeScene.primaryColor);
          backdropMat.uniforms.uGlow.value.set(themeScene.glowColor);
        }
        reflector.visible = anyStageReflect;
        reflectorVeil.visible = anyStageReflect;
        reflectorVeil.material = isLight ? lightFloorMat : arenaFloorMat;
        if (!isLight && anyStageReflect && themeScene) {
          arenaFloorMat.uniforms.uTime.value = playhead;
          arenaFloorMat.uniforms.uPulse.value = activeCinemaGroup?.userData.vfxTelemetry?.arenaPulse ?? 0;
          arenaFloorMat.uniforms.uPrimary.value.set(themeScene.primaryColor);
          arenaFloorMat.uniforms.uGlow.value.set(themeScene.glowColor);
        }
        if (reflector.material?.uniforms?.color?.value) {
          reflector.material.uniforms.color.value.set(isLight ? "#cfd7eb" : "#0d0b16");
        }
        shadowCatcher.visible = anyVisibleShadow && !reflector.visible;
        if (bloomMax > 0.04 || activeCinemaScene) {
          bloomPass.strength = 0.2 + bloomMax * 0.28;
          bloomPass.radius = 0.46;
          bloomPass.threshold = 1.08;
          cinemaPass.uniforms.uTime.value = playhead;
          cinemaPass.uniforms.uChromatic.value = activeCinemaGroup?.userData.vfxTelemetry?.chromaticPulse ?? 0.0005;
          composer.render();
        } else {
          renderer.render(world, camera);
        }
      } else {
        world.background = null;
        world.fog = null;
        stageBackdrop.visible = false;
        reflector.visible = false;
        reflectorVeil.visible = false;
        shadowCatcher.visible = anyVisibleShadow;
        renderer.render(world, camera);
      }
      retired.forEach(disposeGroup); retired = [];
    };
    draw();
    return () => {
      cancelAnimationFrame(raf);
      retired.forEach(disposeGroup);
      world.fog = null;
      world.background = null;
      world.traverse(object => {
        const asset=object.userData?.videoAsset;
        if(asset){asset.video.pause();asset.video.removeAttribute('src');asset.video.load();asset.texture.dispose();asset.pausedTexture?.dispose();asset.sharedTexture?.dispose();}
        object.geometry?.dispose?.();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(material => { material?.map?.dispose?.(); material?.dispose?.(); });
      });
      backdropMat.dispose?.();
      arenaFloorMat.dispose?.();
      lightFloorMat.map?.dispose?.();
      lightFloorMat.dispose?.();
      reflector.dispose?.();
      renderPass.dispose?.();
      bloomPass.dispose?.();
      outputPass.dispose?.();
      cinemaPass.dispose?.();
      composer.dispose?.();
      renderer.dispose();
      environment?.dispose();
      logoEnvironment?.dispose?.();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    };
  }, [hasScenes]);

  if (!scenes.length) return null;
  return <div className="studio-3d-canvas" ref={hostRef} style={zIndex === undefined ? undefined : { zIndex }} data-testid="studio-3d-preview" aria-label="3D motion graphics preview">
    {webglFailed ? <div className="studio-3d-fallback">3D live preview is unavailable in this browser. Your scene settings are preserved.</div> : null}
  </div>;
}
