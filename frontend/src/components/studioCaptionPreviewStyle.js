// Generated definitions are checked against the Python renderer; do not author
// a separate style here. The completed preview uses the actual exported pixels.
import styles from "./studioCaptionRenderStyles.json";
import fontMetrics from "./studioCaptionFontMetrics.json";
import { mapProgrammeTickToOutputTick, secondsToTicks, ticksToSeconds } from "./studioTime";

// Fade durations belong to the delivered clock, including trims, repeated
// source occurrences and changes of speed inside a cue.
export const getCaptionPreviewOutputClock = ({
  chunk,
  time,
  timeMap,
  sourceStart = 0,
  sourceEnd = Infinity,
  programmeStart = 0,
}) => {
  // Manually entered copy has word groups, not source-timed cue bounds.
  // It must not enter the integer source/programme clock with undefined times.
  if (
    !chunk ||
    !timeMap?.length ||
    ![time, chunk.start, chunk.end, sourceStart, programmeStart].every(Number.isFinite) ||
    sourceStart < 0 ||
    programmeStart < 0
  )
    return null;
  const map = sourceTime => {
    const bounded = Math.max(sourceStart, Math.min(sourceEnd, sourceTime));
    const tick = mapProgrammeTickToOutputTick(
      timeMap,
      secondsToTicks(programmeStart + bounded - sourceStart)
    );
    return tick === null ? null : ticksToSeconds(tick);
  };
  const clock = { start: map(chunk.start), end: map(chunk.end), time: map(time) };
  return Object.values(clock).every(Number.isFinite) ? clock : null;
};

export const captionAssColor = value => {
  const hex = String(value || "")
    .replace(/^&H/i, "")
    .replace(/&$/, "")
    .padStart(8, "0");
  if (!/^[0-9a-f]{8}$/i.test(hex)) return "transparent";
  const [alpha, blue, green, red] = hex.match(/../g).map(pair => parseInt(pair, 16));
  return `rgba(${red}, ${green}, ${blue}, ${Number((1 - alpha / 255).toFixed(4))})`;
};

export const getCaptionStyleHighlightHex = (styleName, fallback = "#ffb33d") => {
  const raw = styles[styleName]?.highlight_color;
  if (!raw) return fallback;
  const hex = String(raw).replace(/^&H/i, "").replace(/&$/, "").padStart(8, "0");
  if (!/^[0-9a-f]{8}$/i.test(hex)) return fallback;
  const b = hex.slice(2, 4);
  const g = hex.slice(4, 6);
  const r = hex.slice(6, 8);
  return `#${r}${g}${b}`.toLowerCase();
};

const widthUnit = ratio => `calc(var(--caption-programme-ref-dim, var(--caption-programme-width, 320px)) * ${ratio})`;

const extractAlignedSegmentWordTimings = (segment, expectedWords) => {
  if (!segment || !Array.isArray(expectedWords) || !expectedWords.length) return null;
  const rawWords = Array.isArray(segment.wordTimings)
    ? segment.wordTimings
    : Array.isArray(segment.words) && segment.words.some(word => word && typeof word === "object")
      ? segment.words
      : null;
  if (!rawWords || rawWords.length !== expectedWords.length) return null;
  const segStart = Number(segment.start);
  const segEnd = Number(segment.end);
  if (!Number.isFinite(segStart) || !Number.isFinite(segEnd) || segEnd <= segStart) return null;
  const normalized = [];
  for (let i = 0; i < expectedWords.length; i += 1) {
    const raw = rawWords[i];
    if (!raw || typeof raw !== "object") return null;
    const token = String(raw.word ?? "").trim();
    if (!token || token !== expectedWords[i]) return null;
    const wStart = Number(raw.start);
    const wEnd = Number(raw.end);
    if (!Number.isFinite(wStart) || !Number.isFinite(wEnd)) return null;
    const clampedStart = Math.max(segStart, Math.min(segEnd, wStart));
    const clampedEnd = Math.max(clampedStart + 0.01, Math.min(segEnd + 0.05, wEnd));
    normalized.push({ word: token, start: clampedStart, end: clampedEnd });
  }
  return normalized;
};

export const resolveActiveWordTimingState = (chunk, clock, wordsCount) => {
  if (!chunk || !clock || !Number.isFinite(clock.time) || !Number.isFinite(clock.start) || !Number.isFinite(clock.end)) {
    return { activeIdx: 0, wordFrac: 1, localWordElapsed: 0.25 };
  }
  const count = Math.max(1, wordsCount || 1);
  if (
    Array.isArray(chunk.wordTimings) &&
    chunk.wordTimings.length === count &&
    Number.isFinite(chunk.start) &&
    Number.isFinite(chunk.end) &&
    chunk.end > chunk.start
  ) {
    const chunkSpan = Math.max(0.05, chunk.end - chunk.start);
    const clockSpan = Math.max(0.05, clock.end - clock.start);
    const scale = clockSpan / chunkSpan;
    const mapped = chunk.wordTimings.map(w => ({
      start: clock.start + (w.start - chunk.start) * scale,
      end: clock.start + (w.end - chunk.start) * scale,
    }));
    if (clock.time < mapped[0].start) {
      return { activeIdx: 0, wordFrac: 0, localWordElapsed: 0 };
    }
    let activeIdx = 0;
    for (let i = 0; i < mapped.length; i += 1) {
      if (clock.time >= mapped[i].start) {
        activeIdx = i;
      } else {
        break;
      }
    }
    const current = mapped[activeIdx];
    const wordDur = Math.max(0.05, current.end - current.start);
    const localWordElapsed = Math.max(0, clock.time - current.start);
    const wordFrac = Math.max(0, Math.min(1, localWordElapsed / wordDur));
    return { activeIdx, wordFrac, localWordElapsed };
  }
  const dur = Math.max(0.05, clock.end - clock.start);
  const elapsed = Math.max(0, clock.time - clock.start);
  const progress = Math.max(0, Math.min(0.999, elapsed / dur));
  const activeIdx = Math.min(count - 1, Math.floor(progress * count));
  const wordDur = dur / count;
  const wordStart = clock.start + activeIdx * wordDur;
  const localWordElapsed = Math.max(0, clock.time - wordStart);
  const wordFrac = Math.max(0, Math.min(1, localWordElapsed / Math.max(0.05, wordDur)));
  return { activeIdx, wordFrac, localWordElapsed };
};

const computeWordTimingState = resolveActiveWordTimingState;

export const sliceTypewriterWord = (word, frac, isDone = false) => {
  const clean = String(word || "");
  if (isDone || !clean) return clean;
  const visibleChars = Math.max(1, Math.min(clean.length, Math.ceil(clean.length * Math.max(0.05, frac))));
  return clean.slice(0, visibleChars);
};

export const getCaptionPreviewStyles = (
  styleName,
  captionScale = 1,
  accent = "#ffb33d",
  { hasIcon = false, chunk, time, outputClock } = {}
) => {
  const resolvedStyleKey = styles[styleName] ? styleName : "bold_pop";
  const style = styles[resolvedStyleKey] || styles.bold_pop;
  const scale = Math.max(0.8, Math.min(1.35, Number(captionScale) || 1));
  const fontSize = Math.round(style.fontsize * scale);
  // ASS sizes the font's Windows ascent+descent; CSS sizes its em square.
  // Convert using the exact bundled face instead of assuming equal units.
  const metric = fontMetrics[style.fontname]?.[style.bold ? "700" : "400"];
  const sizeRatio = metric?.cssSizePerAssSize || 1;
  // Keep minimal's exact existing contract while letting editorial, luxury, and
  // wall_type stay readable primary ink with crisp active-word emphasis.
  const textColor =
    resolvedStyleKey === "minimal" && style.animation === "fade_word" && !hasIcon
      ? accent
      : captionAssColor(style.primary_color);
  const clock =
    outputClock ||
    (chunk && [time, chunk.start, chunk.end].every(Number.isFinite) ? { ...chunk, time } : null);
  const wordsCount = chunk?.words?.length || 1;
  const { activeIdx, wordFrac, localWordElapsed } = computeWordTimingState(chunk, clock, wordsCount);
  const anim = style.animation;
  const opacity =
    anim === "fade_word" && clock
      ? Math.max(0, Math.min(1, (clock.time - clock.start) / 0.1, (clock.end - clock.time) / 0.15))
      : 1;
  const card = style.border_style === 3;
  const isPillAnim = ["active_pill", "sticker_pill", "marker_swipe"].includes(anim);
  const isGlassCard = anim === "glass_card";
  const isKineticBar = anim === "kinetic_bar";
  const isTypewriter = anim === "true_typewriter";
  const isNeonBloom = anim === "neon_bloom";
  const isSpringPop = anim === "spring_pop";
  const isVerticalBounce = anim === "vertical_bounce";
  const isEditorialDuo = anim === "editorial_duo";

  let pillBackground = card ? captionAssColor(style.outline_color) : "transparent";
  let pillBorder = 0;
  let pillRadius = 0;
  let pillPadding = card ? widthUnit(style.outline / 1080) : 0;
  let pillShadow = "none";
  let pillBackdrop = "none";

  if (isGlassCard) {
    pillBackground = "linear-gradient(135deg, rgba(255, 255, 255, 0.22), rgba(14, 22, 36, 0.66))";
    pillBorder = "1px solid rgba(255, 255, 255, 0.36)";
    pillRadius = widthUnit(15 / 1080);
    pillPadding = `${widthUnit(8 / 1080)} ${widthUnit(16 / 1080)}`;
    pillShadow = "0 14px 32px rgba(0, 0, 0, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.4)";
    pillBackdrop = "blur(16px) saturate(1.3)";
  } else if (isKineticBar) {
    pillBackground = "linear-gradient(160deg, rgba(16, 22, 34, 0.84), rgba(10, 14, 22, 0.78))";
    pillBorder = `1px solid ${accent}55`;
    pillRadius = widthUnit(14 / 1080);
    pillPadding = `${widthUnit(8 / 1080)} ${widthUnit(16 / 1080)} ${widthUnit(11 / 1080)}`;
    pillShadow = "0 10px 26px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.14)";
    pillBackdrop = "blur(12px)";
  } else if (isTypewriter) {
    pillBackground = "rgba(11, 17, 24, 0.84)";
    pillBorder = `1px solid ${accent}88`;
    pillRadius = widthUnit(10 / 1080);
    pillPadding = `${widthUnit(6 / 1080)} ${widthUnit(14 / 1080)}`;
    pillShadow = "0 6px 18px rgba(0, 0, 0, 0.36)";
    pillBackdrop = "blur(10px)";
  } else if (resolvedStyleKey === "wall_type") {
    pillBackground = "transparent";
    pillBorder = 0;
    pillRadius = 0;
    pillPadding = `0 ${widthUnit(8 / 1080)} 0 ${widthUnit(14 / 1080)}`;
  }

  let wordTextShadow = card
    ? "none"
    : `0 0 ${widthUnit(style.outline / 1080)} ${captionAssColor(style.outline_color)}`;
  let wordStroke = card
    ? 0
    : `${widthUnit(style.outline / 2160)} ${captionAssColor(style.outline_color)}`;

  if (isNeonBloom) {
    wordTextShadow = `0 0 ${widthUnit(10 / 1080)} ${accent}, 0 0 ${widthUnit(24 / 1080)} ${accent}88`;
    wordStroke = `${widthUnit(2 / 2160)} ${captionAssColor(style.outline_color)}`;
  }

  let activeWordStyle = {
    display: "inline-block",
    color:
      resolvedStyleKey === "marker" || (anim === "fade_word" && resolvedStyleKey === "minimal")
        ? textColor
        : accent,
    ...( ["scale_pop", "story_pop", "focus_cut", "rainbow_words"].includes(anim)
      ? {
          margin: `0 ${widthUnit(6 / 1080)}`,
          transform: "scale(1.15)",
        }
      : anim === "fade_word" && resolvedStyleKey !== "minimal"
        ? {
            margin: `0 ${widthUnit(3 / 1080)}`,
            transform: "scale(1.05)",
          }
        : { transform: "none" } ),
  };

  if (anim === "active_pill") {
    const isNewsroom = resolvedStyleKey === "newsroom";
    activeWordStyle = {
      display: "inline-block",
      color: isNewsroom ? "#ffffff" : "#0b0d13",
      background: isNewsroom ? "#d91a25" : accent,
      padding: `${widthUnit(3 / 1080)} ${widthUnit(14 / 1080)}`,
      borderRadius: widthUnit(14 / 1080),
      transform: "scale(1.08)",
      textShadow: "none",
      WebkitTextStroke: 0,
      boxShadow: isNewsroom
        ? "0 6px 18px rgba(217, 26, 37, 0.45)"
        : `0 6px 22px ${accent}66, inset 0 1px 0 rgba(255, 255, 255, 0.42)`,
    };
  } else if (anim === "sticker_pill") {
    activeWordStyle = {
      display: "inline-block",
      color: "#14101c",
      background: "#f8fbfd",
      border: `${widthUnit(3 / 1080)} solid ${accent}`,
      padding: `${widthUnit(2 / 1080)} ${widthUnit(13 / 1080)}`,
      borderRadius: widthUnit(13 / 1080),
      transform: "scale(1.09) rotate(-2deg)",
      margin: `0 ${widthUnit(4 / 1080)}`,
      textShadow: "none",
      WebkitTextStroke: 0,
      boxShadow: `4px 4px 0 ${accent}, 6px 6px 0 #140e0a`,
    };
  } else if (anim === "marker_swipe") {
    activeWordStyle = {
      display: "inline-block",
      color: "#121110",
      background: `linear-gradient(180deg, transparent 8%, ${accent} 8% 94%, transparent 94%)`,
      padding: `0 ${widthUnit(11 / 1080)}`,
      borderRadius: widthUnit(7 / 1080),
      transform: "scale(1.05)",
      textShadow: "none",
      WebkitTextStroke: 0,
    };
  } else if (isKineticBar) {
    activeWordStyle = {
      display: "inline-block",
      color: accent,
      borderBottom: `${widthUnit(5 / 1080)} solid ${accent}`,
      paddingBottom: widthUnit(2 / 1080),
      textShadow: `0 0 ${widthUnit(14 / 1080)} ${accent}66`,
      transform: "none",
    };
  } else if (isNeonBloom) {
    activeWordStyle = {
      display: "inline-block",
      color: "#ffffff",
      margin: `0 ${widthUnit(6 / 1080)}`,
      textShadow: `0 0 ${widthUnit(6 / 1080)} #ffffff, 0 0 ${widthUnit(18 / 1080)} ${accent}, 0 0 ${widthUnit(36 / 1080)} ${accent}, 0 0 ${widthUnit(52 / 1080)} ${accent}`,
      transform: "scale(1.12)",
    };
  } else if (isSpringPop) {
    const springT = clock ? Math.min(1, localWordElapsed / 0.18) : 0.45;
    const springScale =
      springT < 0.42
        ? 0.86 + (springT / 0.42) * 0.34
        : 1.2 - ((springT - 0.42) / 0.58) * 0.14;
    const tiltDeg =
      resolvedStyleKey === "spring_slam" && springT < 0.9
        ? (activeIdx % 2 === 0 ? -2 : 2) * (1 - springT)
        : 0;
    activeWordStyle = {
      display: "inline-block",
      color: accent,
      margin: `0 ${widthUnit(4 / 1080)}`,
      textShadow: `0 4px 16px ${accent}55`,
      transform: `scale(${springScale.toFixed(3)}) rotate(${tiltDeg.toFixed(2)}deg)`,
    };
  } else if (isVerticalBounce) {
    const hopT = clock ? Math.min(1, localWordElapsed / 0.12) : 1;
    const hopPx = Math.round(14 * (1 - (1 - hopT) * (1 - hopT)));
    activeWordStyle = {
      display: "inline-block",
      color: accent,
      margin: `0 ${widthUnit(4 / 1080)}`,
      transform: `translateY(${widthUnit((-hopPx) / 1080)}) scale(1.12)`,
    };
  } else if (isEditorialDuo) {
    activeWordStyle = {
      display: "inline-block",
      fontFamily: '"DejaVu Serif", "Noto Serif", Georgia, serif',
      fontStyle: "italic",
      fontWeight: 700,
      textTransform: "none",
      color: accent,
      margin: `0 ${widthUnit(12 / 1080)}`,
      textShadow: `0 4px 18px ${accent}66`,
      transform: "scale(1.22)",
    };
  } else if (isTypewriter) {
    activeWordStyle = {
      display: "inline-block",
      color: accent,
      transform: "none",
    };
  }

  return {
    animation: anim,
    activeWordProgress: wordFrac,
    isPillActive: isPillAnim,
    pill: {
      display: "block",
      textWrap: "balance",
      fontFamily: `"${metric ? `Studio Caption ${style.fontname}` : style.fontname}", sans-serif`,
      fontSize: widthUnit((fontSize * sizeRatio) / 1080),
      fontWeight: style.bold ? 700 : 400,
      fontStyle: style.italic ? "italic" : "normal",
      letterSpacing: widthUnit((style.spacing || 0) / 1080),
      textTransform: style.uppercase ? "uppercase" : "none",
      color: textColor,
      background: pillBackground,
      border: pillBorder,
      borderRadius: pillRadius,
      padding: pillPadding,
      boxShadow: pillShadow,
      backdropFilter: pillBackdrop,
      overflow: "visible",
      lineHeight: 1.16,
      textShadow: "none",
      animation: "none",
      transition: "none",
      opacity,
    },
    word: {
      color: textColor,
      background: "transparent",
      padding: 0,
      borderRadius: 0,
      animation: "none",
      transform: "none",
      textShadow: wordTextShadow,
      WebkitTextStroke: wordStroke,
    },
    activeWord: activeWordStyle,
    icon: {
      fontFamily: '"Studio Caption Noto Sans Symbols2", sans-serif',
      fontSize: widthUnit(
        (fontSize * 1.36 * fontMetrics["Noto Sans Symbols2"]["400"].cssSizePerAssSize) / 1080
      ),
      // A mixed ASS font run shares its full Windows ascent/descent baseline.
      // Inheriting the text's shorter CSS line-height shifts the whole cue.
      lineHeight: 1 / fontMetrics["Noto Sans Symbols2"]["400"].cssSizePerAssSize,
      marginRight: widthUnit((fontSize * sizeRatio * (651 / 2048)) / 1080),
    },
  };
};

// Reviewed Studio cues are rendered with uniform word timing by the existing
// worker contract. Use the same groups and clock instead of showing seven
// preview words while the export shows five (or four for Story Pop).
export const buildCaptionRenderPreviewChunks = (segments, styleName, captionScale = 1) => {
  const style = styles[styleName] || styles.bold_pop;
  const story = style.animation === "story_pop";
  const size = Math.round(
    style.fontsize * Math.max(0.8, Math.min(1.35, Number(captionScale) || 1))
  );
  const maxCharacters = story ? Math.max(20, Math.min(34, Math.floor(1080 / (size * 0.58)))) : null;
  return segments.flatMap(segment => {
    const words = String(segment.text || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const groups = [];
    let group = [],
      first = 0;
    const flush = () => {
      if (group.length) groups.push({ words: group, first });
      group = [];
    };
    words.forEach((word, index) => {
      if (group.length && maxCharacters && [...group, word].join(" ").length > maxCharacters)
        flush();
      if (!group.length) first = index;
      group.push(word);
      if (group.length >= (story ? 4 : 5)) flush();
    });
    flush();
    const alignedTimings = extractAlignedSegmentWordTimings(segment, words);
    const wordDuration = (segment.end - segment.start) / Math.max(1, words.length);
    return groups.map(group => {
      const groupWordTimings = alignedTimings
        ? alignedTimings.slice(group.first, group.first + group.words.length)
        : null;
      const start = groupWordTimings
        ? groupWordTimings[0].start
        : segment.start + group.first * wordDuration;
      const end = groupWordTimings
        ? Math.max(start + 0.05, groupWordTimings[groupWordTimings.length - 1].end)
        : segment.start + (group.first + group.words.length) * wordDuration;
      return {
        ...segment,
        // Keep the cue's ID and full text for inspector selection/semantic accent.
        words: group.words,
        ...(groupWordTimings ? { wordTimings: groupWordTimings } : {}),
        start,
        end,
        duration: Math.max(0.05, end - start),
      };
    });
  });
};
