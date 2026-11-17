import {
  DIRECTOR_CINEMA_LOOK_PROFILES,
  buildDirectorFinishGradeAction,
  buildSourceBoundDirectorProposal,
  compileDirectorComposition,
  inferDirectorLookProfileId,
  sha256HexSync,
} from './studioDirectorComposition';
import { createStudio3DScene, normalizeStudio3DScene } from './threeD/studio3DModel';

const validNumber = (v, min, max) =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;

export const DIRECTOR_CINEMA_3D_MODES = {
  brand_vfx: {
    id: 'brand_vfx',
    label: '3D WebGL2 Brand VFX Reveal',
    description: 'Extruded Inter 900 crest, GPU vortex particles, dark cinema softbox HDRI & floor shockwave.',
  },
  sculpture_ribbon: {
    id: 'sculpture_ribbon',
    label: '3D Morphing Ribbon & Sculpture Stage',
    description: 'Parametric swept 3D liquid-chrome ribbon, refractive crystal core & volumetric silk stage.',
  },
  audio_spectrum: {
    id: 'audio_spectrum',
    label: 'Audio-Reactive 3D Harmonic Spectrum',
    description: '22-pylon glowing crystal equalizer amphitheater, counter-rotating rings & beat LUT pulses.',
  },
  hud_title_slate: {
    id: 'hud_title_slate',
    label: '3D Smoked-Glass HUD & Title Sequence',
    description: 'Multi-scene sequence combining chamfered glass HUD slate into radial impact 3D typography.',
  },
  hybrid_film_3d: {
    id: 'hybrid_film_3d',
    label: 'Full-Stack Hybrid Video + 3D VFX Composite',
    description: 'Source-bound split-diptych rotoscope composition layered with transparent 3D lower-third & brand lock.',
  },
};

const LOOK_COLORS = {
  teal_orange: { primary: '#f59e0b', glow: '#38bdf8', secondary: '#e2e8f0' },
  ultraviolet_pulse: { primary: '#a855f7', glow: '#22d3ee', secondary: '#f1f5f9' },
  neon_cyber: { primary: '#f43f5e', glow: '#00e5ff', secondary: '#e2e8f0' },
  kodak_2383: { primary: '#fbbf24', glow: '#38bdf8', secondary: '#f8fafc' },
  golden_hour: { primary: '#f59e0b', glow: '#fef08a', secondary: '#fffbeb' },
  noir_silver: { primary: '#e2e8f0', glow: '#38bdf8', secondary: '#f8fafc' },
  emerald_matrix: { primary: '#10b981', glow: '#34d399', secondary: '#ecfdf5' },
};

function sanitizeCopy(value, fallback, maxLen = 40) {
  const cleaned = String(value || '')
    .replace(/[<>\u0000-\u001f]/g, ' ') // eslint-disable-line no-control-regex
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
  return cleaned || fallback;
}

function extractBrandAndSubtitle(brief, mode) {
  const quoted = String(brief || '').match(/["'`]([^"'`]{2,28})["'`]/);
  const allCaps = String(brief || '').match(/\b([A-Z]{3,14}(?:\s+[A-Z]{2,14})?)\b/);
  let main =
    quoted?.[1] ||
    allCaps?.[1] ||
    (mode === 'audio_spectrum'
      ? 'SONIC HORIZON'
      : mode === 'hud_title_slate'
        ? 'BEYOND STATIC'
        : mode === 'sculpture_ribbon'
          ? 'ORBITAL FORM'
          : 'APEX NOVA');
  main = sanitizeCopy(main.toUpperCase(), 'APEX NOVA', 32);

  const subMap = {
    brand_vfx: 'CINEMA WEBGL2 VFX ARCHITECTURE',
    sculpture_ribbon: 'PARAMETRIC LIQUID CHROME STAGE',
    audio_spectrum: '22-BAND HARMONIC FREQUENCY ARENA',
    hud_title_slate: 'REAL-TIME OPTICAL TELEMETRY',
    hybrid_film_3d: 'DIRECTOR MULTI-LAYER COMPOSITION',
  };
  return { main, subtitle: subMap[mode] || 'CINEMA GRADE VISUALS' };
}

export function inferCinema3DMode(brief = '', hasFootage = false) {
  const text = String(brief || '').toLowerCase();
  if (/\b(hybrid|diptych|rotoscope|footage|overlay|film\s*\+\s*3d)\b/.test(text)) {
    return hasFootage ? 'hybrid_film_3d' : 'brand_vfx';
  }
  if (/\b(ribbon|sculpture|morph|product|object|knot)\b/.test(text)) {
    return 'sculpture_ribbon';
  }
  if (/\b(audio|spectrum|equalizer|sonic|music|lyric|frequency|harmonic)\b/.test(text)) {
    return 'audio_spectrum';
  }
  if (/\b(hud|slate|comparison|callout|lower[\s-]third|title\s+sequence|headline)\b/.test(text)) {
    return 'hud_title_slate';
  }
  if (/\b(logo|brand|emblem|crest|forge|monolith|reveal)\b/.test(text)) {
    return 'brand_vfx';
  }
  return hasFootage ? 'hybrid_film_3d' : 'brand_vfx';
}

function inferLogoStyleFromBrief(brief = '', lookId = 'neon_cyber') {
  const text = String(brief || '').toLowerCase();
  if (/\b(monolith|glass|cathedral|laser|frost|ice|arctic)\b/.test(text)) {
    return { entrance: 'dolly', material: 'glass' };
  }
  if (/\b(silk|liquid|holographic|quantum|violet|iridescent|nebula)\b/.test(text) || lookId === 'ultraviolet_pulse') {
    return { entrance: 'orbit', material: 'holographic' };
  }
  if (/\b(gold|molten|forge|amber|solar)\b/.test(text) || lookId === 'golden_hour') {
    return { entrance: 'burst', material: 'gold' };
  }
  return { entrance: 'pulse', material: 'chrome' };
}

/**
 * Validate timeline + optional project footage context for AI Director v5 Cinema 3D planning.
 */
export function directorCinema3DContext(snapshot, brief, duration) {
  const document = snapshot?.studioDocument;
  const rawSeconds = (document?.outputTimeMap?.at(-1)?.outputRange.endTick || 0) / 90000;
  const maxSeconds = rawSeconds >= 2 ? Math.min(30, rawSeconds) : 30;
  if (!document || !validNumber(duration, 2, maxSeconds)) {
    throw Error('Choose 2–30 seconds within this project.');
  }
  if (typeof brief !== 'string' || !brief.trim() || brief.length > 1200) {
    throw Error('Describe the edit in at most 1,200 characters.');
  }
  const media = (snapshot.projectMedia || [])
    .filter(
      m =>
        m.status === 'ready' &&
        m.storagePath &&
        m.url &&
        m.duration >= 0.5 &&
        /^[a-f0-9]{64}$/.test(m.contentHash || '') &&
        m.type !== 'image'
    )
    .slice(0, 12)
    .map(m => ({
      id: m.id,
      name: String(m.name || 'Project clip').slice(0, 160),
      duration: Number(m.duration),
      contentHash: m.contentHash,
    }));

  return {
    compositionVersion: 5,
    brief: brief.trim(),
    projectId: document.projectId,
    baseRevision: document.revision,
    duration,
    media,
  };
}

/**
 * Author a reviewed, hash-bound AI Director Cinema 3D + Video Composition proposal (v5).
 */
export function buildDirectorCinema3DProposal(snapshot, brief, duration = 6, options = {}) {
  const context = directorCinema3DContext(snapshot, brief, duration);
  const hasFootage = context.media.length > 0;
  const requestedMode =
    options.mode && options.mode !== 'auto' && DIRECTOR_CINEMA_3D_MODES[options.mode]
      ? options.mode
      : inferCinema3DMode(context.brief, hasFootage);
  const mode = requestedMode === 'hybrid_film_3d' && !hasFootage ? 'brand_vfx' : requestedMode;

  const lookId =
    options.lookId && options.lookId !== 'auto' && DIRECTOR_CINEMA_LOOK_PROFILES[options.lookId]
      ? options.lookId
      : inferDirectorLookProfileId(context.brief, options.pixelEvidence || []);
  const colors = LOOK_COLORS[lookId] || LOOK_COLORS.teal_orange;
  const { main, subtitle } = extractBrandAndSubtitle(context.brief, mode);
  const dur = Number(context.duration);
  const roundT = v => Math.round(v * 90000) / 90000;

  let threeDScenes = [];
  let sourceComposition = null;
  let shots = [];

  if (mode === 'sculpture_ribbon') {
    const sc = normalizeStudio3DScene({
      ...createStudio3DScene('object_scene', 0, 'dir-3d-sculpture'),
      name: `Director Sculpture · ${main}`,
      duration: dur,
      lightingRig: 'sculpture',
      background: 'dark',
      material: 'holographic',
      primaryColor: colors.primary,
      secondaryColor: colors.secondary,
      glowColor: colors.glow,
      bloom: 0.78,
      cameraMotion: 0.9,
      focalLength: 45,
      objects: [
        {
          id: 'dir-ribbon-1',
          name: 'Morphing Quantum Ribbon',
          shape: 'ribbon',
          color: colors.primary,
          material: 'holographic',
          roughness: 0.1,
          ribbon: { path: 'knot', width: 0.62, thickness: 0.08, wave: 0.72, lobes: 3, twists: 2, speed: 0.55, phase: 0 },
          x: 0,
          y: 1.1,
          z: 0,
          scaleX: 0.98,
          scaleY: 0.98,
          scaleZ: 0.98,
          rotationX: 16,
          rotationY: -14,
          rotationZ: 0,
          keyframes: [
            { id: 'rk-0', time: 0, easing: 'ease_out', values: { x: 0, y: 1.1, z: -0.8, scaleX: 0.62, scaleY: 0.62, scaleZ: 0.62, rotationX: 28, rotationY: -65, rotationZ: -12 } },
            { id: 'rk-1', time: roundT(dur * 0.48), easing: 'ease_in_out', values: { x: 0, y: 1.16, z: 0.1, scaleX: 1.0, scaleY: 1.0, scaleZ: 1.0, rotationX: 12, rotationY: 42, rotationZ: 8 } },
            { id: 'rk-2', time: dur, easing: 'ease_in_out', values: { x: 0, y: 1.1, z: 0, scaleX: 0.96, scaleY: 0.96, scaleZ: 0.96, rotationX: -10, rotationY: 148, rotationZ: 18 } },
          ],
        },
        {
          id: 'dir-core-crystal',
          name: 'Refractive Crystal Core',
          shape: 'icosphere',
          color: colors.glow,
          material: 'glass',
          roughness: 0.04,
          x: 0,
          y: 1.1,
          z: 0.05,
          scaleX: 0.48,
          scaleY: 0.48,
          scaleZ: 0.48,
          keyframes: [
            { id: 'ck-0', time: 0, easing: 'ease_out', values: { x: 0, y: 1.1, z: 0.05, scaleX: 0.2, scaleY: 0.2, scaleZ: 0.2, rotationX: 0, rotationY: 0, rotationZ: 0 } },
            { id: 'ck-1', time: dur, easing: 'linear', values: { x: 0, y: 1.14, z: 0.05, scaleX: 0.56, scaleY: 0.56, scaleZ: 0.56, rotationX: 85, rotationY: 180, rotationZ: 45 } },
          ],
        },
        {
          id: 'dir-orbit-ring',
          name: 'Gyro Accent Ring',
          shape: 'torus',
          color: '#f8fafc',
          material: 'gold',
          roughness: 0.14,
          x: 0,
          y: 1.1,
          z: -0.25,
          scaleX: 2.0,
          scaleY: 2.0,
          scaleZ: 0.25,
          rotationX: 68,
          keyframes: [
            { id: 'tk-0', time: 0, easing: 'ease_out', values: { x: 0, y: 1.1, z: -0.25, scaleX: 1.38, scaleY: 1.38, scaleZ: 0.22, rotationX: 78, rotationY: -25, rotationZ: 0 } },
            { id: 'tk-1', time: dur, easing: 'linear', values: { x: 0, y: 1.1, z: -0.25, scaleX: 2.05, scaleY: 2.05, scaleZ: 0.25, rotationX: 52, rotationY: 36, rotationZ: 170 } },
          ],
        },
      ],
    });
    const hudTitle = normalizeStudio3DScene({
      ...createStudio3DScene('cinematic_title', roundT(Math.min(0.6, dur * 0.12)), 'dir-3d-sculpture-title'),
      name: `Director Title Overlay · ${main}`,
      text: main,
      secondary: subtitle,
      duration: roundT(Math.max(0.8, dur - Math.min(0.6, dur * 0.12))),
      background: 'transparent',
      material: 'chrome',
      primaryColor: '#f1f5f9',
      secondaryColor: '#e2e8f0',
      glowColor: colors.glow,
      y: 61,
      z: 1.6,
      scale: 0.62,
      bloom: 0.55,
      cameraMotion: 0,
    });
    threeDScenes = [sc, hudTitle];
    shots = [
      { startTime: 0, endTime: dur, sourceName: 'Morphing 3D Ribbon + Crystal', treatment: 'sculpture_ribbon', reason: 'Live parametric ribbonMesh sculpture under Dark Cinema HDRI.' },
      { startTime: hudTitle.startTime, endTime: dur, sourceName: `${main} Callout`, treatment: 'cinematic_title', reason: 'Transparent 3D chrome title label composited cleanly over sculpture foreground.' },
    ];
  } else if (mode === 'audio_spectrum') {
    const sc = normalizeStudio3DScene({
      ...createStudio3DScene('audio_reactive_text', 0, 'dir-3d-spectrum'),
      name: `Director Audio Spectrum · ${main}`,
      text: main,
      secondary: subtitle,
      duration: dur,
      material: 'chrome',
      entrance: 'pulse',
      background: 'dark',
      primaryColor: colors.primary,
      secondaryColor: colors.secondary,
      glowColor: colors.glow,
      bloom: 0.84,
      audioReactiveIntensity: 0.92,
      cameraMotion: 0.92,
      focalLength: 45,
    });
    threeDScenes = [sc];
    shots = [
      { startTime: 0, endTime: dur, sourceName: `${main} Spectrum Arena`, treatment: 'audio_reactive_text', reason: '22-pylon crystal harmonic equalizer synchronized to audio intensity and camera drift.' },
    ];
  } else if (mode === 'hud_title_slate') {
    const splitT = roundT(Math.max(1.2, dur * 0.45));
    const cardScene = normalizeStudio3DScene({
      ...createStudio3DScene('comparison_card', 0, 'dir-3d-hud'),
      name: 'Director HUD Telemetry Card',
      text: sanitizeCopy(main.split(' ')[0] || 'STUDIO PRO', 'STUDIO PRO', 24),
      secondary: subtitle,
      duration: splitT,
      material: 'glass',
      entrance: 'slide',
      background: 'dark',
      primaryColor: colors.primary,
      secondaryColor: colors.secondary,
      glowColor: colors.glow,
      bloom: 0.72,
      cameraMotion: 0.85,
    });
    const titleScene = normalizeStudio3DScene({
      ...createStudio3DScene('cinematic_title', roundT(Math.max(0.5, splitT - 0.15)), 'dir-3d-title'),
      name: `Director Hero Title · ${main}`,
      text: main,
      secondary: 'ENGINEERED FOR PRECISION',
      duration: roundT(Math.max(1.0, dur - Math.max(0.5, splitT - 0.15))),
      material: 'gold',
      entrance: 'burst',
      background: 'dark',
      primaryColor: colors.primary,
      secondaryColor: colors.secondary,
      glowColor: colors.glow,
      bloom: 0.82,
      cameraMotion: 0.95,
    });
    threeDScenes = [cardScene, titleScene];
    shots = [
      { startTime: cardScene.startTime, endTime: cardScene.endTime, sourceName: cardScene.text, treatment: 'comparison_card', reason: 'Beveled smoked-glass 3D HUD slate opens the visual narrative.' },
      { startTime: titleScene.startTime, endTime: dur, sourceName: main, treatment: 'cinematic_title', reason: 'Volumetric god-ray and particle-burst Inter 900 blockbuster lockup.' },
    ];
  } else if (mode === 'hybrid_film_3d') {
    const baseProposal = buildSourceBoundDirectorProposal(snapshot, context.brief, dur, {
      lookId,
      archetypeId: options.archetypeId || 'split_diptych',
      beatSyncPulses: options.beatSyncPulses !== false,
      pixelEvidence: options.pixelEvidence,
    });
    sourceComposition = baseProposal.composition;
    const style = lookId === 'ultraviolet_pulse'
      ? { entrance: 'orbit', material: 'holographic' }
      : lookId === 'neon_cyber'
        ? { entrance: 'pulse', material: 'chrome' }
        : { entrance: 'burst', material: 'gold' };
    const introDur = roundT(Math.max(1.2, Math.min(2.8, dur * 0.42)));
    const stingerStart = roundT(Math.max(introDur + 0.2, dur * 0.55));
    const lowerThird = normalizeStudio3DScene({
      ...createStudio3DScene('speaker_intro', 0.35, 'dir-3d-lower-third'),
      name: 'Director 3D Lower-Third',
      text: main,
      secondary: subtitle,
      duration: roundT(Math.min(introDur, dur - 0.45)),
      background: 'transparent',
      material: 'glass',
      entrance: 'slide',
      primaryColor: colors.primary,
      secondaryColor: '#f8fafc',
      glowColor: colors.glow,
      y: 78,
      scale: 0.64,
      bloom: 0.65,
      cameraMotion: 0.35,
    });
    const stinger = normalizeStudio3DScene({
      ...createStudio3DScene('neon_logo', stingerStart, 'dir-3d-stinger'),
      name: `Director 3D Closing Brand · ${main}`,
      text: main,
      secondary: subtitle,
      duration: roundT(Math.max(1.2, dur - stingerStart)),
      background: 'transparent',
      entrance: style.entrance,
      material: style.material,
      primaryColor: colors.primary,
      secondaryColor: colors.secondary,
      glowColor: colors.glow,
      bloom: 0.82,
      cameraMotion: 0.9,
    });
    threeDScenes = [lowerThird, stinger];
    shots = [
      { startTime: 0, endTime: dur, sourceName: 'Split Diptych & Rotoscope Mask', treatment: 'hybrid_source_lut', reason: `Source-bound footage choreography with ${lookId} 3D LUT finish grade.` },
      { startTime: lowerThird.startTime, endTime: lowerThird.endTime, sourceName: main, treatment: 'speaker_intro', reason: 'Transparent 3D optical glass lower-third composited over graded video.' },
      { startTime: stingerStart, endTime: dur, sourceName: `${main} 3D Reveal`, treatment: 'neon_logo', reason: 'Transparent WebGL2 3D VFX brand lockup finale over footage.' },
    ];
  } else {
    const style = inferLogoStyleFromBrief(context.brief, lookId);
    const logoScene = normalizeStudio3DScene({
      ...createStudio3DScene('neon_logo', 0, 'dir-3d-brand-vfx'),
      name: `Director 3D VFX · ${main}`,
      text: main,
      secondary: subtitle,
      duration: dur,
      background: 'dark',
      entrance: style.entrance,
      material: style.material,
      primaryColor: colors.primary,
      secondaryColor: colors.secondary,
      glowColor: colors.glow,
      bloom: 0.82,
      cameraMotion: 1.0,
      focalLength: 45,
    });
    threeDScenes = [logoScene];
    shots = [
      { startTime: 0, endTime: dur, sourceName: main, treatment: 'neon_logo', reason: `Full Dark-Cinema HDRI + GLSL volumetric WebGL2 VFX lock (${style.entrance}/${style.material}).` },
    ];
  }

  const threeDPlan = {
    name: `${DIRECTOR_CINEMA_3D_MODES[mode].label} · ${main}`,
    concept: `AI Director v5 authored ${DIRECTOR_CINEMA_3D_MODES[mode].label} (${main}) with ${lookId} finish profile${sourceComposition ? ' + source-bound footage rotoscope rig' : ''}.`,
    mode,
    lookId,
    beatSyncPulses: options.beatSyncPulses !== false,
    threeDScenes,
    ...(sourceComposition ? { sourceComposition } : {}),
    shots,
  };

  const core = {
    version: 5,
    projectId: context.projectId,
    baseRevision: context.baseRevision,
    brief: context.brief,
    duration: context.duration,
    sourceEvidence: context.media.map(({ id, contentHash }) => ({ id, contentHash })),
    threeDPlan,
  };

  return {
    ...core,
    fingerprint: sha256HexSync(JSON.stringify(core)),
    provenance: {
      provider: 'autopromote_director_3d_v5',
      automaticModelPlanning: true,
      mode,
      lookId,
      paidProviderCalls: 0,
    },
  };
}

/**
 * Validate and compile a Director v5 proposal into standard `autopromote-scene-actions`.
 */
export function compileDirectorCinema3DPlan(result, snapshot) {
  const context = directorCinema3DContext(snapshot, result.brief, result.duration);
  if (
    result.version !== 5 ||
    result.projectId !== context.projectId ||
    result.baseRevision !== context.baseRevision ||
    !/^[a-f0-9]{64}$/.test(result.fingerprint || '') ||
    result.provenance?.automaticModelPlanning !== true
  ) {
    throw Error('The project changed or the Director 3D proposal is invalid. Ask for a new plan.');
  }
  const requiredEvidence = Array.isArray(result.sourceEvidence) ? result.sourceEvidence : [];
  if (
    requiredEvidence.length !== context.media.length ||
    new Set(requiredEvidence.map(e => e.id)).size !== context.media.length ||
    requiredEvidence.some(e => !context.media.some(m => m.id === e.id && m.contentHash === e.contentHash))
  ) {
    throw Error('The project footage changed after the Director planned this 3D edit.');
  }

  const planSpec = result.threeDPlan;
  if (!planSpec || !Array.isArray(planSpec.threeDScenes) || !planSpec.threeDScenes.length || planSpec.threeDScenes.length > 8) {
    throw Error('The Director 3D plan contains no valid 3D scenes.');
  }

  const actions = [];
  let sourceGraphics = null;
  if (planSpec.sourceComposition) {
    const sourceCompiled = compileDirectorComposition(
      {
        version: 2,
        projectId: context.projectId,
        baseRevision: context.baseRevision,
        brief: context.brief,
        duration: context.duration,
        sourceEvidence: requiredEvidence,
        fingerprint: result.fingerprint,
        provenance: { automaticModelPlanning: true },
        composition: planSpec.sourceComposition,
      },
      snapshot
    );
    actions.push(...sourceCompiled.plan.actions);
    if (sourceCompiled.plan.graphics) {
      sourceGraphics = sourceCompiled.plan.graphics;
    }
  }

  planSpec.threeDScenes.forEach((rawScene, index) => {
    const normalized = normalizeStudio3DScene(rawScene);
    if (normalized.endTime > context.duration + 0.001) {
      throw Error('Director 3D scene exceeds requested edit duration.');
    }
    actions.push({
      type: 'three_d_scene',
      id: `dir-3d-${index + 1}`,
      name: normalized.name,
      startTime: normalized.startTime,
      duration: normalized.duration,
      scene: normalized,
    });
  });

  if (planSpec.lookId && !actions.some(a => a.type === 'finish_grade')) {
    actions.push(
      buildDirectorFinishGradeAction(planSpec.lookId, {
        duration: context.duration,
        beatSyncPulses: Boolean(planSpec.beatSyncPulses),
      })
    );
  }

  return {
    plan: {
      format: 'autopromote-scene-actions',
      version: 1,
      projectId: context.projectId,
      baseRevision: context.baseRevision,
      name: planSpec.name || 'Director Cinema 3D Stage',
      ...(sourceGraphics ? { graphics: sourceGraphics } : {}),
      actions,
    },
    concept: planSpec.concept || 'AI Director Cinema 3D VFX & multi-layer timeline edit.',
    shots: Array.isArray(planSpec.shots) ? planSpec.shots : [],
    topologySummary: {
      videoLayers: actions.filter(a => a.type === 'media_plane').length,
      threeDScenes: actions.filter(a => a.type === 'three_d_scene').length,
      nullRigs: actions.filter(a => a.type === 'null').length,
      shapeLayers: sourceGraphics?.layers?.length || actions.filter(a => a.type === 'shape').length,
      parentLinks: actions.filter(a => a.type === 'parent').length,
      trackMattes: actions.filter(a => a.type === 'matte').length,
      softMasks: actions.filter(a => a.type === 'media_plane' && Number(a.mask?.feather) > 0).length,
      motionDrivers: actions.filter(
        a => a.type === 'motion_driver' || (a.motionDrivers && Object.keys(a.motionDrivers).length > 0)
      ).length,
      animatedMaskKeys: actions
        .filter(a => a.type === 'keys')
        .reduce(
          (sum, a) => sum + (a.keys || []).filter(k => /^maskPoint\d+[XY]$/.test(k.property)).length,
          0
        ),
    },
  };
}
