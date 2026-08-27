const cleanText = value => String(value || "").replace(/\s+/g, " ").trim();

const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

const STORY_RULES = [
  {
    id: "online_discovery",
    label: "Online discovery",
    style: "proof",
    query: "warm close up hands scrolling a social media feed on smartphone",
    visual: "Real hands scrolling a social feed on a phone",
    terms: [
      [/facebook/i, 4],
      [/scroll[a-z]*/i, 4],
      [/\btimeline\b/i, 2],
      [/\bsocial\s+media\b/i, 3],
      [/\bonline\b/i, 1],
    ],
  },
  {
    id: "choir_memory",
    label: "Choir memory",
    style: "detail",
    query: "cinematic real choir singing together live performance",
    visual: "A real choir singing together in performance",
    terms: [
      [/\bchoir\b/i, 4],
      [/\bsing(?:ing|er|ers)?\b/i, 3],
      [/\bngiyocula\b/i, 4],
      [/\bbrothers\s+and\s+sisters\b/i, 4],
      [/\bmusic(?:al)?\b/i, 2],
    ],
  },
  {
    id: "location_memory",
    label: "Place memory",
    style: "detail",
    query: "cinematic establishing footage of the spoken location",
    visual: "An establishing view of the location being discussed",
    terms: [
      [/\bdurban\b/i, 4],
      [/\bcape\s+town\b/i, 4],
      [/\bjohannesburg\b/i, 4],
      [/\bsoweto\b/i, 4],
      [/\bpretoria\b/i, 4],
      [/\beastern\s+cape\b/i, 4],
    ],
  },
];

const SPEAKER_PAYOFF_PATTERN =
  /\b(i can do this|i decided|my decision|no man|angivuke|realised|realized|that changed me)\b/i;

const normalizeSegments = segments =>
  (Array.isArray(segments) ? segments : [])
    .map((segment, index) => {
      const start = Math.max(0, number(segment?.start ?? segment?.start_time));
      const end = Math.max(start + 0.05, number(segment?.end ?? segment?.end_time, start + 0.8));
      const text = cleanText(segment?.text);
      if (!text) return null;
      return {
        id: segment?.id || `caption-${index + 1}`,
        start,
        end,
        text,
        speaker: cleanText(segment?.speaker || segment?.speaker_id),
        speakerLabel: cleanText(segment?.speakerLabel || segment?.speaker_label),
        languages: Array.isArray(segment?.languages) ? segment.languages.filter(Boolean) : [],
        language: cleanText(segment?.language || segment?.language_code),
        reviewRequired: Boolean(segment?.reviewRequired ?? segment?.review_required),
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.start - right.start);

const matchStoryRule = text => {
  const scored = STORY_RULES.map(rule => ({
    rule,
    score: rule.terms.reduce(
      (total, [pattern, weight]) => total + (pattern.test(text) ? weight : 0),
      0
    ),
  })).filter(item => item.score > 0);
  scored.sort((left, right) => right.score - left.score);
  return scored[0] || null;
};

export const buildTranscriptGroundedBRollSuggestions = ({
  captionSegments,
  sourceStart = 0,
  sourceEnd,
  maxBeats = 4,
}) => {
  const segments = normalizeSegments(captionSegments);
  const safeStart = Math.max(0, number(sourceStart));
  const inferredEnd = segments.length ? Math.max(...segments.map(segment => segment.end)) : safeStart;
  const safeEnd = Math.max(safeStart + 0.05, number(sourceEnd, inferredEnd));
  const duration = safeEnd - safeStart;
  const overlapsAbsoluteWindow = segments.some(
    segment => segment.end > safeStart && segment.start < safeEnd
  );
  const looksClipRelative =
    !overlapsAbsoluteWindow &&
    safeStart > 0 &&
    segments.some(segment => segment.start < duration && segment.end <= duration + 0.75);

  const candidates = [];
  segments.forEach(segment => {
    const sourceSegmentStart = looksClipRelative ? safeStart + segment.start : segment.start;
    const sourceSegmentEnd = looksClipRelative ? safeStart + segment.end : segment.end;
    if (sourceSegmentEnd <= safeStart || sourceSegmentStart >= safeEnd) return;
    if (SPEAKER_PAYOFF_PATTERN.test(segment.text)) return;

    const matched = matchStoryRule(segment.text);
    if (!matched) return;
    const relativeStart = clamp(sourceSegmentStart - safeStart + 0.15, 0.35, duration - 0.45);
    const available = Math.max(0.7, Math.min(sourceSegmentEnd, safeEnd) - sourceSegmentStart);
    const shotDuration = clamp(available * 0.62, 1.15, 1.9);
    const evidenceQuote = segment.text.length > 110 ? `${segment.text.slice(0, 107)}…` : segment.text;
    candidates.push({
      id: `story-beat-${segment.id}-${matched.rule.id}`,
      time: Math.round(relativeStart * 10) / 10,
      duration: Math.round(Math.min(shotDuration, duration - relativeStart) * 10) / 10,
      style: matched.rule.style,
      concept: matched.rule.id,
      kicker: "STORY EVIDENCE",
      title: matched.rule.visual,
      subtitle: `From: “${evidenceQuote}”`,
      reason: `Literal moving visual grounded in the spoken line “${evidenceQuote}”.`,
      searchQuery: matched.rule.query,
      evidenceQuote,
      captionSegmentId: segment.id,
      speaker: segment.speaker,
      speakerLabel: segment.speakerLabel,
      languages: segment.languages.length ? segment.languages : segment.language ? [segment.language] : [],
      reviewRequired: segment.reviewRequired,
      approvalStatus: segment.reviewRequired ? "blocked_by_transcript_review" : "proposed",
      confidence: segment.reviewRequired ? 0.35 : Math.min(0.96, 0.62 + matched.score * 0.05),
    });
  });

  const deduped = [];
  for (const candidate of candidates) {
    const previousSameConcept = [...deduped]
      .reverse()
      .find(item => item.concept === candidate.concept);
    if (previousSameConcept && candidate.time - previousSameConcept.time < 3.2) continue;
    if (deduped.some(item => Math.abs(item.time - candidate.time) < 1.15)) continue;
    deduped.push(candidate);
    if (deduped.length >= Math.max(1, number(maxBeats, 4))) break;
  }
  return deduped;
};
