// metadataOptimizer.js
// Phase 4: Basic heuristic metadata optimization for YouTube uploads

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "with",
  "for",
  "to",
  "of",
  "in",
  "on",
]);
const MAX_TITLE_LEN = 95; // keep under 100

function generateHashtags(tags = []) {
  return tags
    .filter(Boolean)
    .map(t => t.replace(/[^a-zA-Z0-9]/g, ""))
    .filter(t => t.length > 2 && t.length <= 30)
    .slice(0, 6)
    .map(t => `#${t}`);
}

function extractKeywords(text = "") {
  const freq = {};
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .forEach(w => {
      if (!w || STOPWORDS.has(w) || w.length < 3) return;
      freq[w] = (freq[w] || 0) + 1;
    });
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([w]) => w);
}

function clamp(str, max) {
  if (!str) return str;
  return str.length > max ? str.slice(0, max - 1).trim() + "…" : str;
}

function optimize({ title, description, tags = [], contentType = "video", shortsMode = false }) {
  let newTitle = title || "Untitled Video";
  const kw = extractKeywords(`${title} ${description}`);
  if (kw.length) {
    const missing = kw.filter(k => !newTitle.toLowerCase().includes(k));
    if (missing.length) {
      newTitle = `${newTitle} | ${missing
        .slice(0, 2)
        .map(w => w[0].toUpperCase() + w.slice(1))
        .join(" ")}`;
    }
  }
  if (shortsMode && !/#shorts/i.test(newTitle)) newTitle = `${newTitle} #shorts`;
  newTitle = clamp(newTitle, MAX_TITLE_LEN);

  const hashTags = generateHashtags([...tags, ...kw]);
  let newDesc = description || "";
  if (hashTags.length) {
    if (!newDesc.includes(hashTags[0])) {
      newDesc = `${newDesc ? newDesc + "\n\n" : ""}${hashTags.join(" ")}`;
    }
  }
  if (!/subscribe/i.test(newDesc)) {
    newDesc += `\n\nSubscribe for more ${contentType === "video" ? "videos" : "content"}!`;
  }
  return { title: newTitle, description: newDesc, applied: true, hashtags: hashTags, keywords: kw };
}

module.exports = { optimize };
