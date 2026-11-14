export const STUDIO_PRESET_BUNDLE_VERSION = 1;

/**
 * Exports a portable JSON Look + Audio Mastering preset bundle without media binary data.
 */
export function serializeStudioPresetBundle({
  name = "Studio Look Preset",
  finishFx = {},
  advancedColor = null,
  audioRestoration = null,
} = {}) {
  const safeAdv = advancedColor || finishFx?.advancedColor || null;
  const cleanAdv = safeAdv
    ? {
        curve: safeAdv.curve || { shadows: 0, midtones: 0, highlights: 0 },
        hsl: safeAdv.hsl || { hue: 0, saturation: 1, luminance: 0 },
        lutName: safeAdv.lutName || "",
        lutPresetId: safeAdv.lutPresetId || "",
        lutIntensity: Number(safeAdv.lutIntensity ?? 100),
        cameraProfile: safeAdv.cameraProfile || "rec709",
        qualifierPresetId: safeAdv.qualifierPresetId || "",
        qualifier: safeAdv.qualifier || null,
        powerWindowPresetId: safeAdv.powerWindowPresetId || "",
        powerWindow: safeAdv.powerWindow || null,
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
    lift: Number(finishFx.lift ?? 0),
    gamma: Number(finishFx.gamma ?? 1),
    gain: Number(finishFx.gain ?? 1),
    vignette: Number(finishFx.vignette ?? 0),
    filmEmulation: finishFx.filmEmulation || "none",
    halation: Number(finishFx.halation ?? 0),
    chromaticAberration: Number(finishFx.chromaticAberration ?? 0),
    filmGrain: Number(finishFx.filmGrain ?? 0),
  };

  return JSON.stringify(
    {
      version: STUDIO_PRESET_BUNDLE_VERSION,
      name: String(name || "Studio Look Preset").slice(0, 80),
      finishFx: cleanFinish,
      advancedColor: cleanAdv,
      audioRestoration: audioRestoration ? { ...audioRestoration } : null,
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
  };
}
