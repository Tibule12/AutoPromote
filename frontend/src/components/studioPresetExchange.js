export const STUDIO_PRESET_BUNDLE_VERSION = 1;

/**
 * Exports a portable JSON Look + Audio Mastering preset bundle without media binary data.
 */
export function serializeStudioPresetBundle({
  name = "Studio Look Preset",
  finishFx = {},
  advancedColor = null,
  audioRestoration = null,
  mainFrame = null,
  captionStyle = "",
  audioRemix = null,
} = {}) {
  const safeAdv = advancedColor || finishFx?.advancedColor || null;
  const cleanAdv = safeAdv
    ? {
        curve: safeAdv.curve || { shadows: 0, midtones: 0, highlights: 0 },
        hsl: safeAdv.hsl || { hue: 0, saturation: 1, luminance: 0 },
        lutName: safeAdv.lutName || "",
        lutPresetId: safeAdv.lutPresetId || "",
        lutIntensity: Number(safeAdv.lutIntensity ?? 100),
        lutData: safeAdv.lutData ?? safeAdv.lut ?? null,
        cameraProfile: safeAdv.cameraProfile || "rec709",
        qualifierPresetId: safeAdv.qualifierPresetId || "",
        qualifier: safeAdv.qualifier || null,
        powerWindowPresetId: safeAdv.powerWindowPresetId || "",
        powerWindow: safeAdv.powerWindow || null,
        revitalizer: safeAdv.revitalizer || null,
      }
    : null;

  const cleanFinish = {
    preset: finishFx.preset || "natural",
    precisionGrade: finishFx.precisionGrade !== false,
    exposureStops: Number(finishFx.exposureStops ?? 0),
    brightness: Number(finishFx.brightness ?? 1),
    contrast: Number(finishFx.contrast ?? 1),
    saturation: Number(finishFx.saturation ?? 1),
    temperature: Number(finishFx.temperature ?? 0),
    tint: Number(finishFx.tint ?? 0),
    sharpness: Number(finishFx.sharpness ?? 0),
    lift: Number(finishFx.lift ?? 0),
    gamma: Number(finishFx.gamma ?? 1),
    gain: Number(finishFx.gain ?? 1),
    vignette: Number(finishFx.vignette ?? 0),
    dehaze: Number(finishFx.dehaze ?? 0),
    clarity: Number(finishFx.clarity ?? 0),
    shadowRecovery: Number(finishFx.shadowRecovery ?? 0),
    highlightRollOff: Number(finishFx.highlightRollOff ?? 0),
    vibrance: Number(finishFx.vibrance ?? 0),
    skinToneProtect: Number(finishFx.skinToneProtect ?? 0.85),
    revitalizerPresetId: finishFx.revitalizerPresetId || "",
    filmEmulation: finishFx.filmEmulation || "none",
    halation: Number(finishFx.halation ?? 0),
    chromaticAberration: Number(finishFx.chromaticAberration ?? 0),
    filmGrain: Number(finishFx.filmGrain ?? 0),
    dreamGlow: Number(finishFx.dreamGlow ?? 0),
    anamorphicFlare: Number(finishFx.anamorphicFlare ?? 0),
    lensBlur: Number(finishFx.lensBlur ?? 0),
  };

  return JSON.stringify(
    {
      version: STUDIO_PRESET_BUNDLE_VERSION,
      name: String(name || "Studio Look Preset").slice(0, 80),
      finishFx: cleanFinish,
      advancedColor: cleanAdv,
      audioRestoration: audioRestoration ? { ...audioRestoration } : null,
      ...(mainFrame && typeof mainFrame === "object" ? { mainFrame: { ...mainFrame } } : {}),
      ...(captionStyle ? { captionStyle: String(captionStyle) } : {}),
      ...(audioRemix && typeof audioRemix === "object" ? { audioRemix: { ...audioRemix } } : {}),
    },
    null,
    2
  );
}

/**
 * Validates and parses an imported Studio preset bundle safely.
 */
export function parseStudioPresetBundle(jsonText) {
  if (typeof jsonText !== "string" || !jsonText.trim()) {
    throw new Error("Preset bundle cannot be empty.");
  }
  const parsed = JSON.parse(jsonText);
  if (!parsed || typeof parsed !== "object" || Number(parsed.version) !== STUDIO_PRESET_BUNDLE_VERSION) {
    throw new Error("Unsupported or unrecognized Studio preset version.");
  }
  return {
    name: String(parsed.name || "Imported Preset").slice(0, 80),
    finishFx: parsed.finishFx && typeof parsed.finishFx === "object" ? parsed.finishFx : {},
    advancedColor:
      parsed.advancedColor && typeof parsed.advancedColor === "object" ? parsed.advancedColor : null,
    audioRestoration:
      parsed.audioRestoration && typeof parsed.audioRestoration === "object"
        ? parsed.audioRestoration
        : null,
    ...(parsed.mainFrame && typeof parsed.mainFrame === "object"
      ? { mainFrame: { ...parsed.mainFrame } }
      : {}),
    ...(typeof parsed.captionStyle === "string" && parsed.captionStyle
      ? { captionStyle: parsed.captionStyle }
      : {}),
    ...(parsed.audioRemix && typeof parsed.audioRemix === "object"
      ? { audioRemix: { ...parsed.audioRemix } }
      : {}),
  };
}
