const normalizeText = value => String(value || "").replace(/\s+/g, " ").trim();

const wordText = word => normalizeText(typeof word === "string" ? word : word?.word);

const joinCaptionWords = words =>
  words
    .map(wordText)
    .filter(Boolean)
    .join(" ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();

const inferTimedWords = segment => {
  const start = Math.max(0, Number(segment?.start ?? segment?.start_time ?? 0));
  const end = Math.max(start + 0.05, Number(segment?.end ?? segment?.end_time ?? start + 0.8));
  const supplied = Array.isArray(segment?.words) ? segment.words : [];
  const timed = supplied
    .map(word => ({
      ...(typeof word === "object" && word ? word : {}),
      word: wordText(word),
      start: Number(typeof word === "object" ? word?.start : NaN),
      end: Number(typeof word === "object" ? word?.end : NaN),
    }))
    .filter(word => word.word && Number.isFinite(word.start) && Number.isFinite(word.end));

  if (timed.length) return timed;

  const tokens = normalizeText(segment?.text).split(/\s+/).filter(Boolean);
  const duration = end - start;
  return tokens.map((word, index) => ({
    word,
    start: start + (duration * index) / Math.max(1, tokens.length),
    end: start + (duration * (index + 1)) / Math.max(1, tokens.length),
  }));
};

/**
 * Convert coarse ASR paragraphs into editor-safe subtitle cues. The same cue
 * timings are kept in Studio state and therefore in the export payload.
 */
export const splitCaptionSegmentsForReadability = (
  segments,
  { maxWords = 7, maxCharacters = 44, maxDuration = 3.2, minWordsAtPunctuation = 3 } = {}
) =>
  (Array.isArray(segments) ? segments : []).flatMap((segment, segmentIndex) => {
    const words = inferTimedWords(segment);
    const sourceText = normalizeText(segment?.text);
    const sourceStart = Math.max(0, Number(segment?.start ?? segment?.start_time ?? 0));
    const sourceEnd = Math.max(
      sourceStart + 0.05,
      Number(segment?.end ?? segment?.end_time ?? sourceStart + 0.8)
    );
    if (!sourceText || !words.length) return [];

    const alreadyReadable = words.length <= maxWords;
    if (alreadyReadable) return [{ ...segment, text: sourceText }];

    const chunks = [];
    let current = [];
    const flush = () => {
      if (!current.length) return;
      chunks.push(current);
      current = [];
    };

    words.forEach((word, index) => {
      current.push(word);
      const text = joinCaptionWords(current);
      const duration = Number(current[current.length - 1].end) - Number(current[0].start);
      const next = words[index + 1];
      const pauseAfter = next ? Number(next.start) - Number(word.end) : 0;
      const endsPhrase = /[.!?]["')\]]?$/.test(word.word);
      if (
        current.length >= maxWords ||
        text.length >= maxCharacters ||
        duration >= maxDuration ||
        pauseAfter >= 0.55 ||
        (endsPhrase && current.length >= minWordsAtPunctuation)
      ) {
        flush();
      }
    });
    flush();

    const sourceId = segment?.id ?? `caption-${segmentIndex + 1}`;
    return chunks.map((chunk, chunkIndex) => ({
      ...segment,
      id: chunks.length === 1 ? sourceId : `${sourceId}-cue-${chunkIndex + 1}`,
      sourceSegmentId: segment?.sourceSegmentId ?? sourceId,
      start: Math.max(sourceStart, Number(chunk[0]?.start ?? sourceStart)),
      end: Math.min(sourceEnd, Number(chunk[chunk.length - 1]?.end ?? sourceEnd)),
      text: joinCaptionWords(chunk),
      words: chunk,
    }));
  });
