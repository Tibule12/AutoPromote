// variantQualityService.js - heuristic quality scoring for variant copy
// Score 0-100 based on structure, richness, clarity, and call-to-action presence.

function computeQualityScore(message = "") {
  if (typeof message !== "string" || !message.trim()) return 30;
  const text = message.trim();
  let score = 50;
  const len = text.length;
  if (len >= 40 && len <= 180) score += 8;
  else if (len > 180) score -= 5;
  else score -= 3;
  const hashtags = (text.match(/#[A-Za-z0-9_]+/g) || []).length;
  if (hashtags === 1) score += 4;
  else if (hashtags === 2) score += 6;
  else if (hashtags >= 3 && hashtags <= 5) score += 8;
  else if (hashtags > 7) score -= 6;
  const emojis = (text.match(/\p{Extended_Pictographic}/u) || []).length;
  if (emojis === 1) score += 3;
  else if (emojis >= 2 && emojis <= 5) score += 6;
  else if (emojis > 10) score -= 5;
  if (/\b(click|watch|join|try|learn|discover|download)\b/i.test(text)) score += 6; // CTA
  if (/[.!?]$/.test(text)) score += 2; // punctuation closure
  if (/http(s)?:\/\//.test(text)) score += 2; // link presence
  // Penalize ALL CAPS segments > 5 chars
  if (/[A-Z]{6,}/.test(text)) score -= 5;
  // Diversity of words
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9#\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  const unique = new Set(words);
  if (unique.size && words.length) {
    const diversity = unique.size / words.length; // 0..1
    if (diversity > 0.7) score += 5;
    else if (diversity < 0.35) score -= 4;
  }
  // Clamp
  return Math.max(0, Math.min(100, Math.round(score)));
}

module.exports = { computeQualityScore };
