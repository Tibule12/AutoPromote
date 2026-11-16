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
      mode: isRibbon ? "sculpture_ribbon" : isAudio ? "audio_spectrum" : "brand_vfx",
      lookId: "teal_orange",
      beatSyncPulses: true,
      threeDScenes,
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
