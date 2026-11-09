import * as THREE from "three";
import { footageMaterial, revealMaterial } from "./motionMaterials";
import { MOTION_TEXTURES } from "./motionAssetManifest";
import { clamp, cue, chapterAt, SEQUENCE_DURATION, scrollSequenceTime } from "./editingSequence";
import {
  labelTexture,
  cover,
  loadSceneImage,
  makeTexture,
  panelTexture,
  roundRect,
} from "./sceneTextures";

// A small product-film set: physical panels, a perspective camera, native video,
// separate timeline objects, and a scored sequence. No editor APIs are imported.
export async function createEditingScene(
  canvas,
  { compact = false, mode = "opening", onChapter, onFrame }
) {
  const [host, guest, wide] = await Promise.all([
    loadSceneImage(MOTION_TEXTURES.host),
    loadSceneImage(MOTION_TEXTURES.guest),
    loadSceneImage(MOTION_TEXTURES.wide),
  ]);
  const context = canvas.getContext("webgl2", {
    alpha: true,
    antialias: !compact,
    powerPreference: "low-power",
  });
  if (!context) throw new Error("webgl-unavailable");
  const renderer = new THREE.WebGLRenderer({ canvas, context, alpha: true, antialias: !compact });
  renderer.setClearColor(0x080812, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, compact ? 1.25 : 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
  const world = new THREE.Group();
  scene.add(world);
  const textures = new Set(),
    geometries = new Set(),
    materials = new Set();
  const geometry = value => {
    geometries.add(value);
    return value;
  };
  const material = value => {
    materials.add(value);
    return value;
  };
  const texture = value => {
    textures.add(value.texture || value);
    return value.texture || value;
  };
  const video = MOTION_TEXTURES.video ? document.createElement("video") : null;
  let videoTexture, playPending = false, videoBlocked = false, videoFailed = false;
  let videoFrame = 0, decodedFrames = 0, lastVideoFrame = -1;
  if (video) {
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "none";
    videoTexture = texture(new THREE.VideoTexture(video));
    videoTexture.colorSpace = THREE.SRGBColorSpace;
  }
  const footagePanels = [];
  const faceGeometry = geometry(new THREE.PlaneGeometry(1, 1));
  const cubeGeometry = geometry(new THREE.BoxGeometry(1, 1, 1));
  const lineMaterial = material(
    new THREE.LineBasicMaterial({ color: "#8b829a", transparent: true, opacity: 0.32 })
  );
  const metal = material(
    new THREE.MeshStandardMaterial({ color: "#181720", roughness: 0.6, metalness: 0.2 })
  );
  scene.add(new THREE.AmbientLight(0xd4c0ff, 1.8));
  const key = new THREE.PointLight(0xc092ff, 40, 20);
  key.position.set(-3, 4, 5);
  scene.add(key);
  const blue = new THREE.PointLight(0x568aff, 30, 15);
  blue.position.set(5, -1, 4);
  scene.add(blue);

  function face(map, width, height, parent = world, matte = false) {
    const source = texture(map);
    const mesh = new THREE.Mesh(
      faceGeometry,
      material(
        matte
          ? revealMaterial(source)
          : new THREE.MeshBasicMaterial({
              map: source,
              transparent: true,
              alphaTest: 0.02,
              toneMapped: false,
            })
      )
    );
    mesh.scale.set(width, height, 1);
    parent.add(mesh);
    return mesh;
  }
  function solid(color, width, height, depth, parent) {
    const mesh = new THREE.Mesh(
      cubeGeometry,
      material(new THREE.MeshBasicMaterial({ color, transparent: true }))
    );
    mesh.scale.set(width, height, depth);
    parent.add(mesh);
    return mesh;
  }
  function panel(map, width, height, parent = world, matte = false) {
    const group = new THREE.Group();
    parent.add(group);
    const slab = new THREE.Mesh(cubeGeometry, metal);
    slab.scale.set(width, height, 0.06);
    slab.position.z = -0.05;
    group.add(slab);
    const edgeGeometry = geometry(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(width, height, 0.06))
    );
    const edges = new THREE.LineSegments(edgeGeometry, lineMaterial);
    edges.position.z = -0.05;
    group.add(edges);
    const surface = face(map, width, height, group, matte);
    surface.position.z = 0.01;
    group.userData.surface = surface;
    return group;
  }
  function attachFootage(group, title, subtitle, width, height, options) {
    if (!video) return;
    const { width: pixelsWide = 640, height: pixelsHigh = 400, focusX = 0.5, zoom = 1 } = options;
    const surface = group.userData.surface;
    const posterMap = surface.material.uniforms?.map.value || surface.material.map;
    const chromeMap = texture(panelTexture(title, subtitle, null, { ...options, videoWindow: true }));
    const picture = new THREE.Mesh(faceGeometry, material(footageMaterial(videoTexture, {
      aspect: (pixelsWide - 20) / (pixelsHigh - 100), focusX, zoom,
    })));
    picture.scale.set(width * (pixelsWide - 20) / pixelsWide, height * (pixelsHigh - 100) / pixelsHigh, 1);
    picture.position.set(0, -height * 3 / pixelsHigh, 0.005);
    picture.visible = false;
    group.add(picture);
    footagePanels.push({ group, surface, picture, posterMap, chromeMap, pixelsWide });
  }
  const glow = makeTexture(256, 256, (ctx, w, h) => {
    const gradient = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gradient.addColorStop(0, "#9a33df44");
    gradient.addColorStop(0.5, "#392c9955");
    gradient.addColorStop(1, "#00000000");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  });
  const lightPool = face(glow, 14, 11);
  lightPool.position.set(0, 0, -3);
  const logo = new THREE.Group();
  world.add(logo);
  logo.userData.surface = face(
    makeTexture(1024, 260, ctx => {
      const gradient = ctx.createLinearGradient(0, 0, 180, 180);
      gradient.addColorStop(0, "#b460ff");
      gradient.addColorStop(1, "#5f45ed");
      roundRect(ctx, 10, 20, 160, 160, 42);
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(74, 62);
      ctx.lineTo(74, 135);
      ctx.lineTo(126, 99);
      ctx.closePath();
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.font = "bold 99px Segoe UI, sans-serif";
      ctx.fillText("AutoPromote", 200, 133);
      ctx.fillStyle = "#bfa9d8";
      ctx.font = "27px Segoe UI, sans-serif";
      ctx.fillText("YOUR NEXT STORY STARTS HERE.", 205, 198);
    }),
    4.5,
    1.14,
    logo,
    true
  );
  const sources = [host, guest, wide].map((image, index) => {
    const title = ["CAM A · HOST", "CAM B · GUEST", "CAM C · WIDE"][index];
    const subtitle = "ILLUSTRATIVE CAMERA CROP";
    const options = { focusX: [0.22, 0.9, 0.5][index], zoom: index === 2 ? 1 : 1.7 };
    const group = panel(panelTexture(title, subtitle, image, options), 1.85, 1.16, world, true);
    attachFootage(group, title, subtitle, 1.85, 1.16, options);
    return group;
  });
  const sourceTargets = [
    [-2.75, 2.72, -0.3],
    [0, 2.8, -0.55],
    [2.75, 2.72, -0.8],
  ];

  const preview = new THREE.Group();
  world.add(preview);
  const previewFrame = panel(
    makeTexture(1280, 768, (ctx, w, h) => {
      roundRect(ctx, 2, 2, w - 4, h - 4, 14);
      ctx.fillStyle = "#17161f";
      ctx.fill();
      ctx.strokeStyle = "#71667f";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#aaa3b7";
      ctx.font = "21px Segoe UI, sans-serif";
      ctx.fillText("●  ●  ●     AUTOPROMOTE", 24, 34);
      ctx.fillStyle = "#9b94a8";
      ctx.font = "17px Segoe UI, sans-serif";
      ctx.fillText("PROGRAMME / 16:9", 1080, 34);
    }),
    6,
    3.6,
    preview
  );
  previewFrame.position.z = -0.03;
  const programmeTexture = (image, focusX) => texture(
    makeTexture(1280, 720, (ctx, w, h) => cover(ctx, image, 0, 0, w, h, focusX, 1.65))
  );
  const wideTexture = programmeTexture(host, 0.22);
  const guestTexture = programmeTexture(guest, 0.9);
  const screen = face(wideTexture, 5.88, 3.3075, preview);
  screen.position.set(0, -0.095, 0.08);
  const posterScreenMaterial = screen.material;
  const programmeMaterials = video ? [0.22, 0.9].map(focusX => material(
    footageMaterial(videoTexture, { focusX, zoom: 1.65 })
  )) : [];
  const captionMap = makeTexture(768, 105, () => {});
  texture(captionMap);
  const caption = face(captionMap, 3.65, 0.49, preview, true);
  caption.position.set(0, -1.26, 0.25);
  let lastCaption = -1;
  const scan = solid("#67cdd3", 5.86, 0.015, 0.01, preview);
  scan.material.opacity = 0.7;
  scan.position.z = 0.19;
  const crop = new THREE.Group();
  preview.add(crop);
  const cropLine = material(
    new THREE.LineBasicMaterial({ color: "#7fe4e1", transparent: true, opacity: 0.9 })
  );
  const cropGeometry = geometry(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.5, -0.5, 0),
      new THREE.Vector3(0.5, -0.5, 0),
      new THREE.Vector3(0.5, -0.5, 0),
      new THREE.Vector3(0.5, 0.5, 0),
      new THREE.Vector3(0.5, 0.5, 0),
      new THREE.Vector3(-0.5, 0.5, 0),
      new THREE.Vector3(-0.5, 0.5, 0),
      new THREE.Vector3(-0.5, -0.5, 0),
    ])
  );
  const cropFrame = new THREE.LineSegments(cropGeometry, cropLine);
  crop.add(cropFrame);
  crop.position.set(0, -0.015, 0.27);
  const cropLabel = face(labelTexture("16:9 → 9:16", "Subject in frame"), 1.46, 0.292, preview);
  cropLabel.position.set(-1.1, 1.05, 0.3);
  const subjectBox = new THREE.LineSegments(
    cropGeometry,
    material(new THREE.LineBasicMaterial({ color: "#b799ec", transparent: true, opacity: 0.7 }))
  );
  subjectBox.scale.set(1.14, 1.6, 1);
  subjectBox.position.set(-1.25, 0.15, 0.28);
  preview.add(subjectBox);
  const activeSpeaker = face(labelTexture("ACTIVE SPEAKER", "Cam A · Host"), 1.88, 0.376);
  activeSpeaker.position.set(-3.15, 1.73, 1.3);
  const speakerLabels = [
    activeSpeaker.material.map,
    texture(labelTexture("ACTIVE SPEAKER", "Cam B · Guest")),
  ];
  const director = panel(
    labelTexture("AI DIRECTOR", "Split + trim · your review first"),
    2.38,
    0.476
  );
  director.position.set(4.35, 2.6, 1.0);
  const contextTags = face(
    labelTexture("Dialogue · Shots · Audio", "Project context → suggestions"),
    2.48,
    0.496
  );
  contextTags.position.set(2.7, 1, 1.3);

  const timeline = new THREE.Group();
  world.add(timeline);
  panel(
    makeTexture(1400, 350, (ctx, w, h) => {
      roundRect(ctx, 2, 2, w - 4, h - 4, 15);
      ctx.fillStyle = "#11121f";
      ctx.fill();
      ctx.strokeStyle = "#6c518c";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = "#c0a6e2";
      ctx.font = "21px Segoe UI, sans-serif";
      ctx.fillText("THE EDIT / CAMERA CUTS + CAPTIONS + CLEAN AUDIO", 28, 36);
      ctx.font = "17px Segoe UI, sans-serif";
      for (let i = 0; i < 5; i++)
        ctx.fillText(`00:${String(i * 12).padStart(2, "0")}`, 80 + i * 285, 77);
      ctx.fillStyle = "#aa92be";
      ctx.font = "15px Segoe UI, sans-serif";
      ctx.fillText("V1", 20, 150);
      ctx.fillText("CC", 20, 207);
      ctx.fillText("A1", 20, 267);
      ctx.fillText("A2", 20, 315);
    }),
    7.2,
    1.8,
    timeline
  );
  const cuts = Array.from({ length: 8 }, (_, index) => {
    const map = index % 3 === 1 ? guestTexture : wideTexture;
    const group = new THREE.Group();
    timeline.add(group);
    const back = solid("#8052be", 0.81, 0.4, 0.04, group);
    const image = face(map, 0.78, 0.34, group);
    image.position.z = 0.04;
    return { group, back, image };
  });
  const captionTracks = Array.from({ length: 3 }, (_, index) => {
    const mesh = solid("#74529c", 1.94, 0.14, 0.035, timeline);
    mesh.position.set(-2.22 + index * 2.16, -0.09, 0.06);
    return mesh;
  });
  const splitLine = solid("#0a0812", 0.025, 0.42, 0.02, cuts[3].group);
  splitLine.position.z = 0.09;
  const waveCount = compact ? 38 : 72;
  const cameraWave = new THREE.Group(),
    cleanWave = new THREE.Group();
  timeline.add(cameraWave, cleanWave);
  const waveform = parent => {
    const bars = new THREE.InstancedMesh(
      cubeGeometry,
      material(
        new THREE.MeshBasicMaterial({ color: parent === cameraWave ? "#608d9b" : "#5bddcb" })
      ),
      waveCount
    );
    bars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    bars.frustumCulled = false;
    parent.add(bars);
    return bars;
  };
  const barTransform = new THREE.Object3D();
  const cameraBars = waveform(cameraWave),
    cleanBars = waveform(cleanWave);
  cameraWave.position.y = -0.39;
  cleanWave.position.y = -0.66;
  const synced = face(labelTexture("CLEAN AUDIO · SYNCED"), 2.5, 0.5);
  synced.position.set(-3.6, -3.2, 0.6);
  const markers = ["Hook", "Viral Moment", "Key Point", "B-Roll", "CTA"].map((name, index) => {
    const mesh = face(labelTexture(name, "", 360, 120), index === 1 ? 1.17 : 1, 0.31, timeline);
    mesh.position.set(-2.8 + index * 1.42, 0.87, 0.15);
    return mesh;
  });
  const broll = face(labelTexture("B-ROLL", "", 360, 120), 1.45, 0.26, timeline);
  broll.position.set(1.2, 0.59, 0.17);
  const playhead = solid("#e6adff", 0.014, 1.5, 0.018, timeline);
  playhead.position.set(-2.9, -0.03, 0.21);
  const playheadDot = new THREE.Mesh(
    geometry(new THREE.SphereGeometry(0.045, 10, 8)),
    material(new THREE.MeshBasicMaterial({ color: "#f1bdff" }))
  );
  timeline.add(playheadDot);
  const selection = solid("#b16aec", 2.08, 1.33, 0.01, timeline);
  selection.material.opacity = 0.2;
  selection.position.set(0.17, -0.01, 0.19);
  const selectedMoment = panel(
    labelTexture("MOMENT FOUND", "Choose the section worth sharing"),
    2.57,
    0.514
  );
  selectedMoment.position.set(2.5, -1.0, 1.2);
  const socials = ["TikTok", "YouTube Shorts", "Instagram Reels"].map((name, index) => {
    const options = { width: 320, height: 568, portrait: true, focusX: index === 1 ? 0.9 : 0.22 };
    const group = panel(panelTexture("9:16", name, index === 1 ? guest : host, options), 1.3, 2.31);
    attachFootage(group, "9:16", name, 1.3, 2.31, options);
    return group;
  });

  let disposed = false,
    active = false,
    paused = false,
    frame = 0,
    lastTick = 0,
    elapsed = 0;
  let progress = 0,
    displayedTime = 0,
    currentChapter = -1,
    renderCount = 0,
    baseDistance = 11,
    pointerX = 0,
    pointerY = 0;
  function renderScore(time) {
    const cameraEntry = cue(time, 0, 3.8);
    camera.position.set(
      (compact ? 0.12 : 0.9) * (1 - cameraEntry) + pointerX,
      0.32 + pointerY,
      baseDistance + 0.6 * (1 - cameraEntry) - 0.15 * cue(time, 17, 22)
    );
    camera.lookAt(0, 0.02, 0);
    world.rotation.set(compact ? 0 : 0.015, compact ? 0 : -0.035 + cue(time, 18, 23) * 0.03, 0);
    logo.visible = time < 2.3;
    logo.position.set(-1.9 * cue(time, 1.5, 4), 2.8 * cue(time, 1.5, 4), -1.6 * cue(time, 1.5, 4));
    logo.scale.setScalar(1 - cue(time, 2, 4) * 0.58);
    const logoUniforms = logo.userData.surface.material.uniforms;
    logoUniforms.reveal.value = cue(time, 0, 0.9) * 1.04;
    logoUniforms.blur.value = compact ? 0 : 1 - cue(time, 0, 0.9);
    logoUniforms.sweep.value = -0.25 + cue(time, 0.35, 1.5) * 1.5;
    const guestSpeaking = time >= 9.8 && time < 12.3;
    sources.forEach((source, index) => {
      const appear = cue(time, 0.7 + index * 0.38, 2.7 + index * 0.32);
      const dock = cue(time, 3.2, 6.6);
      const clear = cue(time, 6.6, 8.6);
      source.visible = time >= 0.7 + index * 0.38 && time < 8.6;
      const [x, y, z] = sourceTargets[index];
      const spread = compact ? 3.0 : 4.35;
      source.position.set(
        (index - 1) * spread * (1 - dock) + x * dock,
        0.25 + dock * (y - 0.25) + clear * 3,
        z - (1 - appear) * 4 - clear * 1.4
      );
      source.rotation.set(
        0.05 * (1 - appear),
        (index - 1) * (0.09 + (1 - appear) * 0.32),
        (index - 1) * -0.025 * (1 - dock)
      );
      const forward = time >= 9 && time < 16 && index === (guestSpeaking ? 1 : 0) ? 0.24 : 0;
      source.position.z += forward;
      source.scale.setScalar((compact ? 1.35 : 3.05) * appear * (1 - dock) + 0.76 * dock + forward * 0.12);
      const uniforms = source.userData.surface.material.uniforms;
      uniforms.reveal.value = cue(time, 0.9 + index * 0.38, 2.45 + index * 0.32) * 1.04;
      uniforms.blur.value = compact ? 0 : (1 - appear) * 1.5;
    });
    const expand = cue(time, 3.5, 6.8),
      exportCue = cue(time, 18, 23);
    preview.visible = time >= 3.5;
    preview.position.set(
      -exportCue * (compact ? 2.2 : 3.0),
      0.6 + (1 - expand) * -0.5,
      -0.25 - (1 - expand) * 2
    );
    preview.scale.setScalar(0.3 + expand * (compact ? 1.05 : 1.15) - exportCue * (compact ? 0.55 : 0.47));
    preview.rotation.y = 0.035 - exportCue * 0.07;
    const readyVideo = video?.readyState >= 2 && !videoFailed;
    posterScreenMaterial.map = guestSpeaking ? guestTexture : wideTexture;
    screen.material = readyVideo ? programmeMaterials[guestSpeaking ? 1 : 0] : posterScreenMaterial;
    footagePanels.forEach(({ surface, picture, posterMap, chromeMap, pixelsWide }) => {
      picture.visible = Boolean(readyVideo);
      if (surface.material.uniforms) {
        surface.material.uniforms.map.value = readyVideo ? chromeMap : posterMap;
        // Match the matte in the surrounding chrome, including its inset.
        picture.material.uniforms.reveal.value =
          (surface.material.uniforms.reveal.value - 10 / pixelsWide) / (1 - 20 / pixelsWide);
        picture.material.uniforms.blur.value = surface.material.uniforms.blur.value;
      } else surface.material.map = readyVideo ? chromeMap : posterMap;
    });
    const letters = Math.floor(cue(time, 12.4, 14.0) * 23);
    caption.visible = time >= 12.4;
    const captionEntry = cue(time, 12.4, 13.15);
    caption.position.y = -1.26 - (1 - captionEntry) * 0.35;
    caption.rotation.z = (1 - captionEntry) * 0.025;
    caption.material.uniforms.reveal.value = captionEntry * 1.04;
    caption.material.uniforms.blur.value = compact ? 0 : 1 - captionEntry;
    crop.visible = time >= 17.2 && time < 21.2;
    const cropCue = cue(time, 17.2, 19.6);
    cropFrame.scale.set(5.8 - cropCue * 4.005625, 3.19, 1);
    crop.position.x = -1.1 * cropCue;
    cropLine.opacity = 0.55 + Math.sin(Math.min(cropCue, 0.999) * Math.PI) * 0.35;
    cropLabel.visible = crop.visible;
    subjectBox.visible = time >= 8.8 && time < 11.7;
    subjectBox.position.x = guestSpeaking ? 0.55 : -0.65;
    subjectBox.material.opacity = 0.4 + Math.sin(cue(time, 8.8, 9.65) * Math.PI) * 0.35;
    if (letters !== lastCaption) {
      lastCaption = letters;
      const ctx = captionMap.context;
      ctx.clearRect(0, 0, 768, 105);
      roundRect(ctx, 4, 4, 760, 97, 13);
      ctx.fillStyle = "#160b21ee";
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 43px Segoe UI, sans-serif";
      const text = "This is a game changer.".slice(0, letters);
      const prefix = ctx.measureText("This is a ").width;
      if (letters > 10) {
        ctx.fillStyle = "#913cf0";
        roundRect(
          ctx,
          26 + prefix,
          20,
          Math.max(0, ctx.measureText(text.slice(10)).width + 14),
          61,
          7
        );
        ctx.fill();
      }
      ctx.fillStyle = "#fff";
      ctx.fillText(text, 26, 68);
      captionMap.texture.needsUpdate = true;
    }
    scan.visible = time >= 8.6 && time < 11.6;
    scan.position.y = 1.3 - cue(time, 8.6, 11.6) * 2.5;
    activeSpeaker.visible = time >= 9 && time < 11.4;
    activeSpeaker.material.map = speakerLabels[guestSpeaking ? 1 : 0];
    activeSpeaker.position.z = 1.15 + cue(time, 9, 10) * 0.2;
    director.visible = time >= 11.4 && time < 17.8;
    director.position.x = (compact ? 3.1 : 4.35) + (1 - cue(time, 11.4, 12.3)) * 0.8;
    contextTags.visible = false;
    const assemble = cue(time, 5.7, 7.4);
    timeline.visible = time >= 5.7;
    timeline.position.set(0, -2.85 - (1 - assemble) * 1.1, 0.2 - (1 - assemble) * 3);
    timeline.scale.set(compact ? 1.28 : 1.35, 0.82, 1.35);
    timeline.rotation.x = -0.035 + exportCue * 0.025;
    cuts.forEach(({ group, image }, index) => {
      const cutCue = cue(time, 6.2 + index * 0.15, 7.4 + index * 0.15);
      group.visible = time >= 6.2 + index * 0.15;
      group.position.set(-2.87 + index * 0.82, 0.23 + (1 - cutCue) * 0.8, 0.1 + (1 - cutCue) * 1.5);
      group.rotation.z = (1 - cutCue) * (index % 2 ? -0.12 : 0.12);
      if (index === 3) {
        image.scale.x = 0.78 - cue(time, 13.4, 14.4) * 0.13;
        group.position.x += cue(time, 13.4, 14.4) * 0.05;
      }
    });
    captionTracks.forEach((track, index) => {
      track.visible = time >= 12.8 + index * 0.14;
      track.scale.x = 1.94 * cue(time, 12.8 + index * 0.14, 13.7 + index * 0.14);
    });
    splitLine.visible = time >= 13.5;
    splitLine.scale.y = 0.42 * cue(time, 13.5, 14.2);
    cameraWave.visible = time >= 7;
    cleanWave.visible = time >= 7.8;
    cleanWave.position.x = (1 - cue(time, 7.8, 10.8)) * 0.62;
    [cameraBars, cleanBars].forEach(bars => {
      for (let index = 0; index < waveCount; index++) {
        const value =
          0.04 +
          (0.1 + 0.09 * Math.sin(index * 1.7 + Math.sin(time * 2) * 0.4)) *
            (0.6 + Math.abs(Math.sin(index * 0.42 + time * 1.4)) * 0.4);
        barTransform.position.set(-2.98 + (index * 5.96) / waveCount, 0, 0.08);
        barTransform.scale.set((5.96 / waveCount) * 0.65, value, 0.028);
        barTransform.updateMatrix();
        bars.setMatrixAt(index, barTransform.matrix);
      }
      bars.instanceMatrix.needsUpdate = true;
    });
    synced.visible = time >= 10.8 && time < 12.4;
    markers.forEach((marker, index) => {
      marker.visible = time >= 10.9 + index * 0.6;
      marker.position.y = 0.86 + (1 - cue(time, 10.9 + index * 0.6, 11.7 + index * 0.6)) * 0.6;
    });
    broll.visible = time >= 14.7;
    broll.scale.x = 1.45 * cue(time, 14.7, 15.6);
    playhead.visible = time >= 7.2;
    playhead.position.x = -2.95 + cue(time, 7.2, 18) * 5.85;
    playheadDot.visible = playhead.visible;
    playheadDot.position.set(playhead.position.x, 0.73, 0.24);
    selection.visible = time >= 16;
    selectedMoment.visible = time >= 16 && time < 18;
    socials.forEach((social, index) => {
      const lift = cue(time, 17.3 + index * 0.45, 21.2 + index * 0.35);
      social.visible = time >= 17.3 + index * 0.45;
      social.position.set(
        0.1 + lift * ((compact ? 0.8 : 1.2) + index * (compact ? 1.42 : 1.65)),
        -2.3 + lift * (2.8 + index * 0.09),
        0.4 + lift * (0.65 - index * 0.1)
      );
      social.scale.set(0.62 + lift * 0.38, 0.21 + lift * 0.79, 1);
      social.rotation.set(-0.14 * (1 - lift), -0.12 + index * 0.09, (index - 1) * -0.025 * lift);
    });
    renderer.render(scene, camera);
    renderCount++;
    canvas.dataset.renderCount = String(renderCount);
    canvas.dataset.drawCalls = String(renderer.info.render.calls);
    canvas.dataset.time = time.toFixed(3);
    canvas.dataset.camera = camera.position
      .toArray()
      .map(value => value.toFixed(3))
      .join(",");
    canvas.dataset.speaker = guestSpeaking ? "guest" : "host";
    updateVideoDiagnostics();
    canvas.dataset.cutCount = String(cuts.filter(cut => cut.group.visible).length);
    canvas.dataset.captionLetters = String(lastCaption);
    canvas.dataset.selected = String(selection.visible);
    canvas.dataset.cropAspect = crop.visible ? (cropFrame.scale.x / 3.19).toFixed(3) : "hidden";
    canvas.dataset.matteCount = String(
      sources.filter(
        source => source.visible && source.userData.surface.material.uniforms.reveal.value < 1.04
      ).length
    );
    canvas.dataset.verticalCount = String(
      socials.filter(social => social.visible && social.scale.y > 0.8).length
    );
    const chapter = chapterAt(time);
    if (chapter !== currentChapter) {
      currentChapter = chapter;
      onChapter?.(chapter);
    }
    onFrame?.(time);
  }
  function updateVideoDiagnostics() {
    const ready = video?.readyState >= 2 && !videoFailed;
    canvas.dataset.videoTime = (video?.currentTime || 0).toFixed(3);
    canvas.dataset.videoFrames = String(video?.getVideoPlaybackQuality?.().totalVideoFrames || decodedFrames);
    canvas.dataset.videoPaused = String(!video || video.paused);
    canvas.dataset.videoDecoders = video ? "1" : "0";
    canvas.dataset.videoSurfaces = ready ? String(
      footagePanels.filter(({ group, picture }) => group.visible && picture.visible).length + Number(preview.visible)
    ) : "0";
    canvas.dataset.previewSource = ready && preview.visible ? "video" : "poster";
  }
  const decoded = () => {
    decodedFrames++;
    if (!disposed) videoFrame = video.requestVideoFrameCallback(decoded);
  };
  const mediaReady = () => {
    if (!disposed && active && !paused) wake();
  };
  const mediaFailed = () => {
    videoFailed = true;
    video?.pause();
    mediaReady();
  };
  video?.addEventListener("loadeddata", mediaReady);
  video?.addEventListener("error", mediaFailed);
  if (video?.requestVideoFrameCallback) videoFrame = video.requestVideoFrameCallback(decoded);
  const ensureVideo = time => {
    if (!video) return;
    const shouldPlay = active && !paused && time >= 0.7 && !videoBlocked && !videoFailed;
    if (shouldPlay && !video.getAttribute("src")) video.src = MOTION_TEXTURES.video;
    if (shouldPlay && video.paused && !playPending) {
      playPending = true;
      video.play().then(() => {
        if (disposed || !active || paused) video.pause();
      }).catch(() => { videoBlocked = true; }).finally(() => { playPending = false; });
    }
    if (!shouldPlay && !video.paused) video.pause();
  };
  function tick(stamp) {
    frame = 0;
    if (disposed || !active || paused) return;
    const delta = lastTick ? stamp - lastTick : 0;
    if (lastTick && delta < (compact ? 1000 / 24 : 1000 / 30)) {
      frame = requestAnimationFrame(tick);
      return;
    }
    lastTick = stamp;
    if (mode === "opening") {
      elapsed = Math.min(SEQUENCE_DURATION, elapsed + delta / 1000);
      displayedTime = elapsed;
    } else {
      const target = scrollSequenceTime(progress);
      displayedTime += (target - displayedTime) * Math.min(1, delta * 0.012);
      if (Math.abs(displayedTime - target) < 0.003) displayedTime = target;
    }
    ensureVideo(displayedTime);
    const moving =
      mode === "opening"
        ? elapsed < SEQUENCE_DURATION
        : Math.abs(displayedTime - scrollSequenceTime(progress)) > 0.003;
    // Choreography finishes once. Visible video keeps playing in the held edit;
    // only new footage frames cause a redraw after the score has settled.
    if (moving || displayedTime !== Number(canvas.dataset.time) || video?.readyState < 2 || videoFailed)
      renderScore(displayedTime);
    else if (video && !video.paused && video.currentTime !== lastVideoFrame) {
      renderScore(displayedTime);
    }
    lastVideoFrame = video?.currentTime ?? -1;
    if (moving || (video && !video.paused && !videoFailed)) frame = requestAnimationFrame(tick);
    else {
      canvas.dataset.running = "false";
    }
  }
  function wake() {
    if (disposed || !active || paused || frame) return;
    lastTick = 0;
    canvas.dataset.running = "true";
    frame = requestAnimationFrame(tick);
  }
  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
    lastTick = 0;
    video?.pause();
    updateVideoDiagnostics();
    canvas.dataset.running = "false";
  }
  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / rect.height;
    baseDistance =
      Math.max(mode === "scroll" ? 8.25 : 7.45, (compact ? 11.1 : 14.6) / camera.aspect) /
      (2 * Math.tan(THREE.MathUtils.degToRad(19)));
    camera.updateProjectionMatrix();
    renderScore(displayedTime);
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  const move = event => {
    if (!active || compact || paused || mode !== "opening") return;
    const rect = canvas.getBoundingClientRect();
    pointerX = ((event.clientX - rect.left) / rect.width - 0.5) * 0.22;
    pointerY = -((event.clientY - rect.top) / rect.height - 0.5) * 0.1;
    wake();
  };
  const leave = () => {
    pointerX = pointerY = 0;
  };
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerleave", leave);
  const contextLost = event => {
    event.preventDefault();
    stop();
    canvas.dispatchEvent(new CustomEvent("sceneunavailable"));
  };
  canvas.addEventListener("webglcontextlost", contextLost);
  let meshCount = 0;
  scene.traverse(object => {
    if (object.isMesh) meshCount++;
  });
  canvas.dataset.meshCount = String(meshCount);
  resize();
  return {
    setActive(value) {
      active = value;
      if (active) wake();
      else stop();
    },
    setPaused(value) {
      paused = value;
      if (paused) stop();
      else wake();
    },
    setProgress(value) {
      progress = clamp(value);
      wake();
    },
    replay() {
      elapsed = 0;
      displayedTime = 0;
      lastCaption = -1;
      currentChapter = -1;
      videoBlocked = false;
      if (video?.readyState >= 1) video.currentTime = 0;
      wake();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      resizeObserver.disconnect();
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("webglcontextlost", contextLost);
      video?.removeEventListener("loadeddata", mediaReady);
      video?.removeEventListener("error", mediaFailed);
      if (videoFrame) video.cancelVideoFrameCallback?.(videoFrame);
      video?.removeAttribute("src");
      video?.load();
      textures.forEach(value => value.dispose());
      materials.forEach(value => value.dispose());
      geometries.forEach(value => value.dispose());
      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.dataset.disposed = "true";
    },
  };
}
