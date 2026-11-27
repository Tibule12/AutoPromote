import captionStyles from "./studioCaptionRenderStyles.json";

const VALID_CAPTION_STYLE_IDS = new Set(Object.keys(captionStyles || {}));

const DEFAULT_ACCENT_BY_LOOK = {
  kodak_2383: "#ffb33d",
  teal_orange: "#3ce0d0",
  noir_silver: "#e8eef7",
  neon_cyber: "#ff5d8f",
  ultraviolet_pulse: "#b48cff",
};

const safeText = value =>
  String(value || "")
    .trim()
    .toLowerCase();

const clamp = (value, min, max, fallback = min) => {
  const num = Number(value);
  return Number.isFinite(num) ? Math.min(max, Math.max(min, num)) : fallback;
};

const styleLabel = styleId => captionStyles[styleId]?.label || styleId;

const resolveHighlightHex = (styleId, fallback = "#ffb33d") => {
  const raw = captionStyles[styleId]?.highlight_color;
  if (!raw) return fallback;
  const hex = String(raw)
    .replace(/^&H/i, "")
    .replace(/&$/, "")
    .padStart(8, "0");
  if (!/^[0-9a-f]{8}$/i.test(hex)) return fallback;
  return `#${hex.slice(6, 8)}${hex.slice(4, 6)}${hex.slice(2, 4)}`.toLowerCase();
};

const aggregateTelemetry = (telemetryInput, pixelEvidenceInput) => {
  const list = Array.isArray(telemetryInput)
    ? telemetryInput
    : telemetryInput && typeof telemetryInput === "object"
      ? [telemetryInput]
      : [];

  if (list.length > 0) {
    const primary = list[0];
    const avgLumaIre =
      list.reduce((sum, item) => sum + clamp(item?.avgLumaIre, 0, 100, 46), 0) / list.length;
    const peakChroma =
      list.reduce((sum, item) => sum + clamp(item?.peakChroma, 0, 255, 28), 0) / list.length;
    const tonalEntropy =
      list.reduce((sum, item) => sum + clamp(item?.tonalEntropy, 0, 8, 2.9), 0) / list.length;
    const maxFrameDifference = Math.max(
      ...list.map(item => clamp(item?.maxFrameDifference, 0, 255, 16))
    );
    const focalCentroid =
      Array.isArray(primary?.focalCentroid) && primary.focalCentroid.length === 2
        ? [clamp(primary.focalCentroid[0], 5, 95, 50), clamp(primary.focalCentroid[1], 5, 95, 48)]
        : [50, 48];
    return {
      hasPixelTelemetry: true,
      avgLumaIre: Number(avgLumaIre.toFixed(1)),
      peakChroma: Number(peakChroma.toFixed(1)),
      tonalEntropy: Number(tonalEntropy.toFixed(2)),
      maxFrameDifference: Number(maxFrameDifference.toFixed(2)),
      focalCentroid,
    };
  }

  const evList = Array.isArray(pixelEvidenceInput) ? pixelEvidenceInput : [];
  const samples = evList.flatMap(ev => (Array.isArray(ev?.samples) ? ev.samples : []));
  if (samples.length > 0) {
    const avgLuma = samples.reduce((s, x) => s + clamp(x?.luma, 0, 255, 118), 0) / samples.length;
    const avgEntropy =
      samples.reduce((s, x) => s + clamp(x?.tonalEntropy, 0, 8, 2.9), 0) / samples.length;
    const maxDiff = Math.max(...samples.map(x => clamp(x?.frameDifference, 0, 255, 16)));
    const chroma =
      samples.reduce((s, x) => s + clamp(x?.peakChroma, 0, 255, 28), 0) / samples.length;
    const mc = samples[0]?.motionCentroid;
    return {
      hasPixelTelemetry: true,
      avgLumaIre: Number(((avgLuma / 255) * 100).toFixed(1)),
      peakChroma: Number(chroma.toFixed(1)),
      tonalEntropy: Number(avgEntropy.toFixed(2)),
      maxFrameDifference: Number(maxDiff.toFixed(2)),
      focalCentroid:
        Array.isArray(mc) && mc.length === 2
          ? [clamp(mc[0], 5, 95, 50), clamp(mc[1], 5, 95, 48)]
          : [50, 48],
    };
  }

  return {
    hasPixelTelemetry: false,
    avgLumaIre: 46,
    peakChroma: 28,
    tonalEntropy: 2.9,
    maxFrameDifference: 16,
    focalCentroid: [50, 48],
  };
};

const analyzeTranscriptMetrics = (captionSegments = []) => {
  const segs = Array.isArray(captionSegments) ? captionSegments : [];
  if (!segs.length) {
    return { segmentCount: 0, wordsPerSecond: 2.4, avgWordsPerCue: 4, distinctSpeakers: 1 };
  }
  let totalWords = 0;
  let totalDuration = 0;
  const speakers = new Set();
  for (const seg of segs) {
    const text = String(seg?.text || "").trim();
    const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
    totalWords += words;
    const start = Number(seg?.start);
    const end = Number(seg?.end);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      totalDuration += end - start;
    } else {
      totalDuration += Math.max(0.8, words * 0.4);
    }
    const sp = safeText(seg?.speaker || seg?.speakerLabel);
    if (sp) speakers.add(sp);
  }
  return {
    segmentCount: segs.length,
    wordsPerSecond: Number((totalWords / Math.max(0.5, totalDuration)).toFixed(2)),
    avgWordsPerCue: Number((totalWords / Math.max(1, segs.length)).toFixed(1)),
    distinctSpeakers: Math.max(1, speakers.size),
  };
};

/**
 * Sample live HTMLVideoElement pixels into Director-compatible clip telemetry
 * so captions can choose a style grounded in brightness, busyness, motion & focus.
 */
export function sampleVideoTelemetryForDirectorCaption(videoElement) {
  if (!videoElement || !videoElement.videoWidth || !videoElement.videoHeight) {
    return null;
  }
  if (typeof document === "undefined") return null;
  try {
    const width = 96;
    const height = 54;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(videoElement, 0, 0, width, height);
    const rgba = ctx.getImageData(0, 0, width, height).data;
    const total = width * height;
    const bins = new Float32Array(16);
    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    let lumaSum = 0;
    let chromaSum = 0;
    let salX = 0;
    let salY = 0;
    let salSum = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = (y * width + x) * 4;
        const r = rgba[idx];
        const g = rgba[idx + 1];
        const b = rgba[idx + 2];
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        const chroma = maxC - minC;
        rSum += r;
        gSum += g;
        bSum += b;
        lumaSum += luma;
        chromaSum += chroma;
        bins[Math.min(15, Math.floor(luma / 16))] += 1;

        let edge = 0;
        if (x > 0 && y > 0 && x < width - 1 && y < height - 1) {
          const left = rgba[idx - 4];
          const right = rgba[idx + 4];
          edge = Math.abs(right - left);
        }
        const weight = edge * 0.7 + chroma * 0.3;
        if (weight > 12) {
          salX += (x / width) * 100 * weight;
          salY += (y / height) * 100 * weight;
          salSum += weight;
        }
      }
    }
    let entropy = 0;
    for (let i = 0; i < 16; i += 1) {
      const p = bins[i] / Math.max(1, total);
      if (p > 0) entropy -= p * Math.log2(p);
    }
    return {
      id: "active-video",
      name: "Active Frame",
      meanRgb: [Math.round(rSum / total), Math.round(gSum / total), Math.round(bSum / total)],
      avgLumaIre: Number((((lumaSum / total) / 255) * 100).toFixed(1)),
      peakChroma: Number((chromaSum / total).toFixed(1)),
      tonalEntropy: Number(entropy.toFixed(2)),
      maxFrameDifference: 18,
      focalCentroid:
        salSum > 0
          ? [Math.round(salX / salSum), Math.round(salY / salSum)]
          : [50, 48],
    };
  } catch {
    return null;
  }
}

/**
 * Recommends the best Studio caption template, stage placement, Smart Safe face
 * avoidance toggle, and harmonized accent color based on real video metrics,
 * dialogue structure, Cinema Look/Archetype, brief, and active frame aspect ratio.
 */
export function recommendDirectorCaptionTemplate({
  telemetry = null,
  pixelEvidence = null,
  brief = "",
  lookId = "auto",
  archetypeId = "auto",
  reframeAspect = "9:16",
  smartCropMode = "speaker_track",
  speakerStackCameraCount = 2,
  captionSegments = [],
  soundEffects = [],
  creativeIntent = "",
  pacingLevel = "",
  contentProfile = "",
} = {}) {
  const scope = aggregateTelemetry(telemetry, pixelEvidence);
  const transcript = analyzeTranscriptMetrics(captionSegments);
  const textSignal = `${safeText(brief)} ${safeText(creativeIntent)} ${safeText(contentProfile)}`;
  const normalizedAspect = String(reframeAspect || "9:16").trim();
  const isWidescreen = normalizedAspect === "16:9";
  const isSquare = normalizedAspect === "1:1";
  const resolvedLook = lookId && lookId !== "auto" ? lookId : "";

  const isBusyOutdoorScene =
    scope.hasPixelTelemetry &&
    ((scope.tonalEntropy >= 3.25 && scope.peakChroma >= 34) || scope.avgLumaIre >= 64);

  const isMultiSpeaker =
    transcript.distinctSpeakers >= 2 ||
    safeText(smartCropMode) === "speaker_stack" ||
    (Number(speakerStackCameraCount) > 1 && safeText(smartCropMode).includes("stack")) ||
    /(podcast|co-?host|two[\s-]*speakers|debate|panel|conversation)/.test(textSignal) ||
    (/interview/.test(textSignal) && !isBusyOutdoorScene);

  const isCyberOrMusic =
    resolvedLook === "neon_cyber" ||
    resolvedLook === "ultraviolet_pulse" ||
    /(neon|cyber|concert|music|choir|sing|rave|club|nightlife|synth|bass|beat|edm)/.test(textSignal) ||
    (scope.hasPixelTelemetry && scope.avgLumaIre < 34 && scope.peakChroma >= 28);

  const isNewsOrDocumentary = /(breaking|news|report|headline|update|analysis|explained|react|commentary|documentary)/.test(
    textSignal
  );

  const isCodeOrTypewriter = /(code|coding|script|typewriter|terminal|developer|prompt|ai workflow|typing)/.test(
    textSignal
  );

  const isTutorialOrNotes = /(tutorial|how to|guide|lesson|study|notes|tips|walkthrough|steps|checklist)/.test(
    textSignal
  );

  const isLuxuryEditorial =
    resolvedLook === "noir_silver" ||
    archetypeId === "noir_color_splash" ||
    /(luxury|editorial|noir|monochrome|fashion|vogue|serif|poetry|cinema|aesthetic|perfume|minimalist)/.test(
      textSignal
    );

  const isCalmArchitectural =
    scope.hasPixelTelemetry &&
    scope.tonalEntropy < 2.55 &&
    scope.maxFrameDifference < 22 &&
    transcript.wordsPerSecond <= 2.35 &&
    (scope.focalCentroid[1] > 42 || Math.abs(scope.focalCentroid[0] - 50) > 8);

  const isComicOrSticker = /(comic|meme|cartoon|funny|roast|sketch|sticker|scrapbook|collage)/.test(
    textSignal
  );

  const isFastEnergyHook =
    safeText(pacingLevel) === "fast" ||
    transcript.wordsPerSecond >= 3.15 ||
    scope.maxFrameDifference >= 34 ||
    Boolean((soundEffects || []).some(s => /riser|punch|hit|whoosh/i.test(String(s?.tone || s?.name || "")))) ||
    /(viral|hook|fast|hype|challenge|gym|fitness|sport|energetic|slam|kinetic)/.test(textSignal);

  const isStoryMonologue =
    archetypeId === "omniscient_showpiece" ||
    /(story|journey|confession|truth|behind the scenes|lesson learned|experience)/.test(textSignal);

  let captionStyle = "word_pill";
  let captionPosition = "smart_safe";
  let captionAccent =
    DEFAULT_ACCENT_BY_LOOK[resolvedLook] || resolveHighlightHex(captionStyle, "#ffb33d");
  let reason =
    "High-contrast pill highlights keep speaking hooks crisp and legible while Smart Safe keeps faces clear.";
  let alternatives = ["bold_pop", "glass", "story_pop"];

  if (isMultiSpeaker) {
    if (/(viral|tiktok|shorts|fast|hype)/.test(textSignal) && transcript.wordsPerSecond > 2.9) {
      captionStyle = "word_pill";
      captionPosition = isWidescreen ? "side_by_side" : "smart_safe";
      captionAccent = resolvedLook === "teal_orange" ? "#3ce0d0" : "#ffb33d";
      reason = `Multi-speaker fast reel (${transcript.wordsPerSecond} wps, ${normalizedAspect}): vibrant word pill paired with speaker-aware ${isWidescreen ? "Side-by-Side" : "Smart Safe"} pockets.`;
      alternatives = ["editorial_duo", "watch_me", "glass"];
    } else {
      captionStyle = "editorial_duo";
      captionPosition = isWidescreen ? "side_by_side" : "smart_safe";
      captionAccent = DEFAULT_ACCENT_BY_LOOK[resolvedLook] || "#3db3ff";
      reason = `Multi-speaker dialogue detected (${transcript.distinctSpeakers} voices, ${normalizedAspect}): Editorial Duo pairs uppercase sans with italic serif emphasis${isWidescreen ? " in crisp left/right speaker zones" : " guided by Smart Safe face dodge"}.`;
      alternatives = ["word_pill", "watch_me", "boxed"];
    }
  } else if (isCyberOrMusic) {
    captionStyle = resolvedLook === "ultraviolet_pulse" ? "gradient" : "neon_bloom";
    captionPosition = "smart_safe";
    captionAccent = resolvedLook === "ultraviolet_pulse" ? "#ff5d8f" : "#52e6f6";
    reason = `Low-key / vibrant atmosphere (Luma ${scope.avgLumaIre} IRE, Chroma ${scope.peakChroma}): ${styleLabel(captionStyle)} adds optical bloom glow without boxing the dark grade.`;
    alternatives = ["glow", "gradient", "kinetic_bar"];
  } else if (isNewsOrDocumentary) {
    captionStyle = "newsroom";
    captionPosition = isBusyOutdoorScene ? "smart_safe" : "smart_safe";
    captionAccent = "#ff4d57";
    reason = `Editorial commentary / news framing (${normalizedAspect}): Newsroom delivers high-authority headline clarity with clean edge padding.`;
    alternatives = ["headline", "boxed", "bold_pop"];
  } else if (isCodeOrTypewriter) {
    captionStyle = "typewriter";
    captionPosition = "smart_safe";
    captionAccent = "#7ee8fa";
    reason = `Technical / script-driven pacing: Typewriter character reveal reinforces precision while frosted backing guards complex UI frames.`;
    alternatives = ["kinetic_bar", "glass", "marker"];
  } else if (isTutorialOrNotes) {
    captionStyle = scope.tonalEntropy > 3.15 ? "kinetic_bar" : "marker";
    captionPosition = "smart_safe";
    captionAccent = captionStyle === "kinetic_bar" ? "#3ce0d0" : "#ffe45e";
    reason = `Instructional / walkthrough cues: ${styleLabel(captionStyle)} calls out key takeaways clearly across ${normalizedAspect} framing.`;
    alternatives = ["kinetic_bar", "marker", "word_pill"];
  } else if (isLuxuryEditorial) {
    captionStyle = scope.tonalEntropy > 3.1 && scope.avgLumaIre > 56 ? "glass" : "luxury";
    captionPosition = isSquare ? "smart_safe" : "smart_safe";
    captionAccent = resolvedLook === "noir_silver" ? "#f5d380" : "#ffd275";
    reason = `Editorial / monochrome visual direction (Entropy ${scope.tonalEntropy}): ${styleLabel(captionStyle)} elevates refined serif pacing without overpowering subject lighting.`;
    alternatives = ["editorial", "minimal", "glass"];
  } else if (isCalmArchitectural) {
    captionStyle = "wall_type";
    captionPosition = isWidescreen || normalizedAspect === "9:16" ? "creative" : "smart_safe";
    captionAccent = DEFAULT_ACCENT_BY_LOOK[resolvedLook] || "#ffe48f";
    reason = `Calm uncluttered backdrop (Entropy ${scope.tonalEntropy}, Motion ${scope.maxFrameDifference}) with off-center subject at (${scope.focalCentroid[0]}%, ${scope.focalCentroid[1]}%): Wall Type lets typography live in the background headroom.`;
    alternatives = ["editorial", "minimal", "luxury"];
  } else if (isBusyOutdoorScene) {
    captionStyle = scope.avgLumaIre >= 68 ? "boxed" : "glass";
    captionPosition = "smart_safe";
    captionAccent = DEFAULT_ACCENT_BY_LOOK[resolvedLook] || "#d0e03c";
    reason = `Bright / high-detail scene (Luma ${scope.avgLumaIre} IRE, Entropy ${scope.tonalEntropy}): ${styleLabel(captionStyle)} adds a clean translucent scrim so active words stay readable over highlights.`;
    alternatives = ["boxed", "word_pill", "sticker"];
  } else if (isComicOrSticker) {
    captionStyle = /sticker|collage|scrapbook/.test(textSignal) ? "sticker" : "comic";
    captionPosition = captionStyle === "sticker" && !isSquare ? "creative" : "smart_safe";
    captionAccent = captionStyle === "sticker" ? "#ff7a59" : "#52e6f6";
    reason = `Playful punchy brief: ${styleLabel(captionStyle)} amplifies comedic beats and rhythmic reactions inside safe frame bounds.`;
    alternatives = ["comic", "sticker", "bounce"];
  } else if (isFastEnergyHook) {
    captionStyle = scope.maxFrameDifference >= 36 ? "spring_slam" : "word_pill";
    captionPosition = "smart_safe";
    captionAccent = DEFAULT_ACCENT_BY_LOOK[resolvedLook] || "#ffb33d";
    reason = `High-tempo delivery (${transcript.wordsPerSecond} wps, Motion ${scope.maxFrameDifference}): ${styleLabel(captionStyle)} locks viewer attention to every stressed beat while dodging subject faces.`;
    alternatives = ["bounce", "bold_pop", "headline"];
  } else if (archetypeId === "split_diptych") {
    captionStyle = "headline";
    captionPosition = "smart_safe";
    captionAccent = DEFAULT_ACCENT_BY_LOOK[resolvedLook] || "#ffe45e";
    reason = `Split diptych comparison (${normalizedAspect}): Headline stays compact and bold in uncluttered top/bottom pockets away from the split seam.`;
    alternatives = ["boxed", "word_pill", "editorial_duo"];
  } else if (isStoryMonologue) {
    captionStyle = "story_pop";
    captionPosition = "smart_safe";
    captionAccent = DEFAULT_ACCENT_BY_LOOK[resolvedLook] || "#ffb33d";
    reason = `Narrative talking-head delivery (${transcript.avgWordsPerCue} words/cue, ${normalizedAspect}): Story Pop frames short punchy phrases with warm contrast and face-safe zones.`;
    alternatives = ["word_pill", "editorial_duo", "glass"];
  } else {
    captionStyle = isWidescreen ? "glass" : "word_pill";
    captionPosition = "smart_safe";
    captionAccent = DEFAULT_ACCENT_BY_LOOK[resolvedLook] || resolveHighlightHex(captionStyle, "#ffb33d");
    reason = `Balanced ${normalizedAspect} creator frame (Luma ${scope.avgLumaIre} IRE, Focus ${scope.focalCentroid[0]}%, ${scope.focalCentroid[1]}%): ${styleLabel(captionStyle)} + Smart Safe gives clean typography and zero face overlap.`;
    alternatives = ["bold_pop", "story_pop", "editorial_duo"];
  }

  if (!VALID_CAPTION_STYLE_IDS.has(captionStyle)) {
    captionStyle = "word_pill";
  }
  const filteredAlts = alternatives.filter(id => id !== captionStyle && VALID_CAPTION_STYLE_IDS.has(id));

  return {
    captionStyle,
    label: styleLabel(captionStyle),
    captionPosition,
    captionAvoidSubjects: true,
    captionAccent,
    reason,
    confidence: scope.hasPixelTelemetry ? "telemetry+context" : "context",
    signals: {
      aspect: normalizedAspect,
      avgLumaIre: scope.avgLumaIre,
      tonalEntropy: scope.tonalEntropy,
      peakChroma: scope.peakChroma,
      maxFrameDifference: scope.maxFrameDifference,
      wordsPerSecond: transcript.wordsPerSecond,
      distinctSpeakers: transcript.distinctSpeakers,
    },
    alternatives: filteredAlts.map(id => ({ id, label: styleLabel(id) })),
  };
}
