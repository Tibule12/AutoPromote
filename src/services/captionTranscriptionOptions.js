const SOUTH_AFRICAN = new Set(["xh", "zu", "st", "tn", "ts", "nr", "ve", "za-mixed"]);
const SUPPORTED = new Set(["auto", "en", "af", ...SOUTH_AFRICAN]);

function captionTranscriptionOptions(body = {}) {
  const sourceLanguage = String(body.source_language ?? body.sourceLanguage ?? "auto").trim().toLowerCase() || "auto";
  const translateToEnglish = ["1", "true", "yes", "on"].includes(
    String(body.translate_to_english ?? body.translateToEnglish ?? "").trim().toLowerCase()
  );
  if (!SUPPORTED.has(sourceLanguage))
    throw Object.assign(new Error("Choose a supported speech language or automatic detection."), { status: 400 });
  if (translateToEnglish && SOUTH_AFRICAN.has(sourceLanguage))
    throw Object.assign(new Error("Automatic English translation is unavailable for this speech-language choice. Keep the spoken-language captions or import reviewed English subtitles."), { status: 400 });
  return { sourceLanguage, translateToEnglish };
}

module.exports = { captionTranscriptionOptions };
