const crypto = require("crypto");

function sanitize(value, fallback, maxLen = 40) {
  const s = String(value || "")
    .replace(/[<>\x00-\x1f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
  return s || fallback;
}

function createDirectorCinema3DPlan(context, { now = () => new Date().toISOString() } = {}) {
  const brief = String(context.brief || "").trim();
  const dur = Math.max(2, Math.min(30, Number(context.duration) || 6));
  const quoted = brief.match(/["'`]([^"'`]{2,28})["'`]/);
  const title = sanitize((quoted && quoted[1]) || "APEX NOVA", "APEX NOVA", 32).toUpperCase();
  const isRibbon = /\b(ribbon|sculpture|morph|knot|product)\b/i.test(brief);
  const isAudio = /\b(audio|spectrum|harmonic|sonic|lyric)\b/i.test(brief);
  const isOmniscient =
    Array.isArray(context.media) &&
    context.media.length > 0 &&
    /\b(omniscient|masterpiece|showpiece|8-track|hybrid|everything)\b/i.test(brief);

  let sourceComposition = null;
  if (isOmniscient) {
    const clipA = context.media[0];
    const clipB = context.media[1] || clipA;
    const revealStart = Number(Math.max(0.4, dur * 0.22).toFixed(3));
    const revealEnd = Number(Math.min(dur, dur * 0.88).toFixed(3));
    const midReveal = Number(((revealStart + revealEnd) * 0.5).toFixed(3));
    sourceComposition = {
      name: `Teal & Orange Blockbuster · 8-Track Omniscient Studio Masterpiece`,
      concept:
        "Server-authored 8-track omniscient studio masterpiece combining Camera Null Rig, Alpha Portal, Rotoscope Polygon, B-Roll Circle Portal, Vector Reticle Trim HUD, Kinetic Hero Title, Dead-Clip Revival, and Selective HSL/Power-Window Grade.",
      layers: [
        {
          id: "anchorPlate",
          name: `${clipA.name} · Primary Anchor Plate`,
          kind: "video",
          sourceMediaId: clipA.id,
          sourceStart: 0,
          start: 0,
          end: dur,
          shape: "none",
          polygon: "",
          color: "",
          parentId: "",
          matteId: "",
          matteMode: "",
          curvePreset: "cinematic_ease",
          poses: [
            { at: 0, x: 50, y: 50, scale: 1, rotation: 0, opacity: 1 },
            { at: dur, x: 50, y: 50, scale: 1.1, rotation: 0, opacity: 1 },
          ],
        },
        {
          id: "cameraRig",
          name: "Director Camera Null Rig",
          kind: "rig",
          sourceMediaId: "",
          sourceStart: 0,
          start: revealStart,
          end: revealEnd,
          shape: "none",
          polygon: "",
          color: "",
          parentId: "",
          matteId: "",
          matteMode: "",
          curvePreset: "whip_snap",
          poses: [
            { at: revealStart, x: 46, y: 52, scale: 0.94, rotation: -2, opacity: 1 },
            { at: revealEnd, x: 52, y: 48, scale: 1.02, rotation: 1.5, opacity: 1 },
          ],
        },
        {
          id: "portalMatte",
          name: "Focal Portal Alpha Stencil",
          kind: "shape",
          sourceMediaId: "",
          sourceStart: 0,
          start: revealStart,
          end: revealEnd,
          shape: "ellipse",
          feather: 12,
          polygon: "",
          color: "#ffffff",
          parentId: "cameraRig",
          matteId: "",
          matteMode: "",
          poses: [
            { at: revealStart, x: 50, y: 50, scale: 0.48, rotation: 0, opacity: 0.95 },
            { at: revealEnd, x: 50, y: 50, scale: 0.84, rotation: 18, opacity: 1 },
          ],
        },
        {
          id: "matteRevealWindow",
          name: `${clipB.name} · Alpha-Matted Focal Portal`,
          kind: "video",
          sourceMediaId: clipB.id,
          sourceStart: 0,
          start: revealStart,
          end: revealEnd,
          shape: "none",
          polygon: "",
          color: "",
          parentId: "cameraRig",
          matteId: "portalMatte",
          matteMode: "alpha",
          curvePreset: "whip_snap",
          poses: [
            { at: revealStart, x: 50, y: 50, scale: 1.05, rotation: 0, opacity: 0.92 },
            { at: revealEnd, x: 50, y: 50, scale: 1.18, rotation: 0, opacity: 1 },
          ],
        },
        {
          id: "brollCirclePortal",
          name: `${clipB.name} · Circle Spotlight B-Roll Portal`,
          kind: "video",
          sourceMediaId: clipB.id,
          sourceStart: 0,
          start: revealStart,
          end: revealEnd,
          shape: "none",
          polygon: "",
          color: "",
          parentId: "cameraRig",
          matteId: "",
          matteMode: "",
          curvePreset: "whip_snap",
          bRollLayoutPreset: "circle_portal",
          bRollAudioPreset: "voice_first_duck",
          bRollLookPreset: "cool_tech_glass",
          motionBlur: { enabled: true, samples: 6, shutter: 0.65 },
          poses: [
            { at: revealStart, x: 52, y: 32, scale: 0.48, rotation: -8, opacity: 0, spatialCurve: [12, -8] },
            { at: midReveal, x: 72, y: 28, scale: 0.85, rotation: 0, opacity: 1, spatialCurve: [-10, 10] },
            { at: revealEnd, x: 74, y: 26, scale: 0.8, rotation: 4, opacity: 0.94 },
          ],
        },
        {
          id: "vectorReticleHud",
          name: "Target Reticle Vector HUD (v2 Cutout)",
          kind: "vector",
          primitiveId: "target_reticle",
          width: 34,
          height: 34,
          sourceMediaId: "",
          sourceStart: 0,
          start: revealStart,
          end: revealEnd,
          shape: "none",
          polygon: "",
          color: "#38bdf8",
          parentId: "cameraRig",
          matteId: "",
          matteMode: "",
          curvePreset: "expo_punch",
          poses: [
            { at: revealStart, x: 72, y: 28, scale: 0.55, rotation: -45, opacity: 0.4 },
            { at: revealEnd, x: 74, y: 26, scale: 0.88, rotation: 45, opacity: 0.9 },
          ],
        },
        {
          id: "kineticHeroTitle",
          name: "Omniscient Kinetic Hero Headline",
          kind: "title",
          text: `${title} STUDIO MASTERPIECE`,
          textAnimatorPreset: "elastic_wave_cascade",
          color: "#f8fafc",
          sourceMediaId: "",
          sourceStart: 0,
          start: revealStart,
          end: revealEnd,
          shape: "none",
          polygon: "",
          parentId: "cameraRig",
          matteId: "",
          matteMode: "",
          curvePreset: "elastic_overshoot",
          poses: [
            { at: revealStart, x: 50, y: 84, scale: 0.86, rotation: 0, opacity: 0.85 },
            { at: revealEnd, x: 50, y: 78, scale: 0.98, rotation: 0, opacity: 0.98 },
          ],
        },
      ],
      colorGrade: {
        lookId: "teal_orange",
        beatSyncPulses: true,
        revitalizerPresetId: "dead_phone_enhancer",
        qualifierPresetId: "skin_radiance",
        powerWindowPresetId: "subject_spotlight",
      },
    };
  }

  const threeDScenes = isRibbon
    ? [
        {
          version: 1,
          id: "dir-srv-sculpture",
          template: "object_scene",
          name: `Director Sculpture · ${title}`,
          text: "",
          secondary: "",
          lightingRig: "sculpture",
          background: "dark",
          material: "holographic",
          primaryColor: "#a855f7",
          secondaryColor: "#f1f5f9",
          glowColor: "#22d3ee",
          bloom: 0.78,
          cameraMotion: 0.9,
          startTime: 0,
          duration: dur,
          endTime: dur,
          objects: [
            {
              id: "srv-ribbon",
              name: "Morphing Ribbon",
              shape: "ribbon",
              color: "#a855f7",
              material: "holographic",
              roughness: 0.1,
              ribbon: { path: "knot", width: 0.62, thickness: 0.08, wave: 0.7, lobes: 3, twists: 2, speed: 0.52, phase: 0 },
              x: 0, y: 0.25, z: 0, scaleX: 1.08, scaleY: 1.08, scaleZ: 1.08,
            },
          ],
        },
      ]
    : isAudio
      ? [
          {
            version: 1,
            id: "dir-srv-audio",
            template: "audio_reactive_text",
            name: `Director Audio Spectrum · ${title}`,
            text: title,
            secondary: "22-BAND HARMONIC FREQUENCY ARENA",
            material: "chrome",
            entrance: "pulse",
            background: "dark",
            primaryColor: "#f43f5e",
            secondaryColor: "#e2e8f0",
            glowColor: "#00e5ff",
            bloom: 0.84,
            audioReactiveIntensity: 0.92,
            cameraMotion: 0.9,
            startTime: 0,
            duration: dur,
            endTime: dur,
          },
        ]
      : [
          {
            version: 1,
            id: "dir-srv-brand",
            template: "neon_logo",
            name: `Director 3D VFX · ${title}`,
            text: title,
            secondary: "CINEMA WEBGL2 VFX ARCHITECTURE",
            material: "gold",
            entrance: "burst",
            background: "dark",
            primaryColor: "#f59e0b",
            secondaryColor: "#e2e8f0",
            glowColor: "#38bdf8",
            bloom: 0.82,
            cameraMotion: 1.0,
            startTime: 0,
            duration: dur,
            endTime: dur,
          },
        ];

  const core = {
    version: 5,
    projectId: context.projectId,
    baseRevision: context.baseRevision,
    brief,
    duration: context.duration,
    sourceEvidence: (context.media || []).map(({ id, contentHash }) => ({ id, contentHash })),
    threeDPlan: {
      name: `AI Director Cinema 3D · ${title}`,
      concept: "Server-validated AI Director v5 WebGL2 3D VFX composition.",
      mode: isOmniscient ? "hybrid_film_3d" : isRibbon ? "sculpture_ribbon" : isAudio ? "audio_spectrum" : "brand_vfx",
      lookId: "teal_orange",
      beatSyncPulses: true,
      threeDScenes,
      ...(sourceComposition ? { sourceComposition } : {}),
      shots: [{ startTime: 0, endTime: dur, sourceName: title, treatment: threeDScenes[0].template, reason: "Director v5 3D stage" }],
    },
  };

  return {
    ...core,
    fingerprint: crypto.createHash("sha256").update(JSON.stringify(core)).digest("hex"),
    provenance: {
      provider: "autopromote_director_3d_v5",
      generatedAt: now(),
      automaticModelPlanning: true,
      paidProviderCalls: 0,
    },
  };
}

module.exports = { createDirectorCinema3DPlan };
