// Generated definitions are checked against the Python renderer; do not author
// a separate style here. The completed preview uses the actual exported pixels.
import styles from "./studioCaptionRenderStyles.json";
import fontMetrics from "./studioCaptionFontMetrics.json";
import { mapProgrammeTickToOutputTick, secondsToTicks, ticksToSeconds } from "./studioTime";

// Fade durations belong to the delivered clock, including trims, repeated
// source occurrences and changes of speed inside a cue.
export const getCaptionPreviewOutputClock = ({ chunk, time, timeMap,
  sourceStart = 0, sourceEnd = Infinity, programmeStart = 0 }) => {
  if (!chunk || !timeMap?.length || !Number.isFinite(time)) return null;
  const map = sourceTime => {
    const bounded = Math.max(sourceStart, Math.min(sourceEnd, sourceTime));
    const tick = mapProgrammeTickToOutputTick(timeMap,
      secondsToTicks(programmeStart + bounded - sourceStart));
    return tick === null ? null : ticksToSeconds(tick);
  };
  const clock = { start: map(chunk.start), end: map(chunk.end), time: map(time) };
  return Object.values(clock).every(Number.isFinite) ? clock : null;
};

export const captionAssColor = value => {
  const hex = String(value || "").replace(/^&H/i, "").replace(/&$/, "").padStart(8, "0");
  if (!/^[0-9a-f]{8}$/i.test(hex)) return "transparent";
  const [alpha, blue, green, red] = hex.match(/../g).map(pair => parseInt(pair, 16));
  return `rgba(${red}, ${green}, ${blue}, ${Number((1 - alpha / 255).toFixed(4))})`;
};

const widthUnit = ratio => `calc(var(--caption-programme-width, 320px) * ${ratio})`;

export const getCaptionPreviewStyles = (styleName, captionScale = 1, accent = "#ffb33d", { hasIcon = false, chunk, time, outputClock } = {}) => {
  const style = styles[styleName] || styles.bold_pop;
  const scale = Math.max(.8, Math.min(1.35, Number(captionScale) || 1));
  const fontSize = Math.round(style.fontsize * scale);
  // ASS sizes the font's Windows ascent+descent; CSS sizes its em square.
  // Convert using the exact bundled face instead of assuming equal units.
  const metric = fontMetrics[style.fontname]?.[style.bold ? "700" : "400"];
  const sizeRatio = metric?.cssSizePerAssSize || 1;
  // The existing ASS fade treatment has no per-word emphasis. Its icon run
  // restores the base text colour; without an icon it uses the cue accent.
  const textColor = style.animation === "fade_word" && !hasIcon
    ? accent : captionAssColor(style.primary_color);
  const clock = outputClock || (chunk && Number.isFinite(time) ? { ...chunk, time } : null);
  const opacity = style.animation === "fade_word" && clock
    ? Math.max(0, Math.min(1, (clock.time - clock.start) / .1, (clock.end - clock.time) / .15)) : 1;
  const card = style.border_style === 3;
  return {
    pill: {
      display: "block",
      textWrap: "balance",
      fontFamily: `"${metric ? `Studio Caption ${style.fontname}` : style.fontname}", sans-serif`,
      fontSize: widthUnit(fontSize * sizeRatio / 1080),
      fontWeight: style.bold ? 700 : 400,
      fontStyle: style.italic ? "italic" : "normal",
      letterSpacing: widthUnit((style.spacing || 0) / 1080),
      textTransform: style.uppercase ? "uppercase" : "none",
      color: textColor,
      background: card ? captionAssColor(style.outline_color) : "transparent",
      border: 0,
      borderRadius: 0,
      padding: card ? widthUnit(style.outline / 1080) : 0,
      boxShadow: "none",
      backdropFilter: "none",
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
      textShadow: card ? "none" : `0 0 ${widthUnit(style.outline / 1080)} ${captionAssColor(style.outline_color)}`,
      WebkitTextStroke: card ? 0 : `${widthUnit(style.outline / 2160)} ${captionAssColor(style.outline_color)}`,
    },
    activeWord: {
      color: styleName === "marker" || style.animation === "fade_word" ? textColor : accent,
      transform: ["scale_pop", "story_pop", "focus_cut", "rainbow_words"].includes(style.animation)
        ? "scale(1.15)" : "none",
    },
    icon: {
      fontFamily: '"Studio Caption Noto Sans Symbols2", sans-serif',
      fontSize: widthUnit(fontSize * 1.36 * fontMetrics["Noto Sans Symbols2"]["400"].cssSizePerAssSize / 1080),
      // A mixed ASS font run shares its full Windows ascent/descent baseline.
      // Inheriting the text's shorter CSS line-height shifts the whole cue.
      lineHeight: 1 / fontMetrics["Noto Sans Symbols2"]["400"].cssSizePerAssSize,
      marginRight: widthUnit(fontSize * sizeRatio * (651 / 2048) / 1080),
    },
  };
};

// Reviewed Studio cues are rendered with uniform word timing by the existing
// worker contract. Use the same groups and clock instead of showing seven
// preview words while the export shows five (or four for Story Pop).
export const buildCaptionRenderPreviewChunks = (segments, styleName, captionScale = 1) => {
  const style = styles[styleName] || styles.bold_pop;
  const story = style.animation === "story_pop";
  const size = Math.round(style.fontsize * Math.max(.8, Math.min(1.35, Number(captionScale) || 1)));
  const maxCharacters = story ? Math.max(20, Math.min(34, Math.floor(1080 / (size * .58)))) : null;
  return segments.flatMap(segment => {
    const words = String(segment.text || "").trim().split(/\s+/).filter(Boolean);
    const groups = [];
    let group = [], first = 0;
    const flush = () => { if (group.length) groups.push({ words: group, first }); group = []; };
    words.forEach((word, index) => {
      if (group.length && maxCharacters && [...group, word].join(" ").length > maxCharacters) flush();
      if (!group.length) first = index;
      group.push(word);
      if (group.length >= (story ? 4 : 5)) flush();
    });
    flush();
    const wordDuration = (segment.end - segment.start) / Math.max(1, words.length);
    return groups.map(group => ({
      ...segment,
      // Keep the cue's ID and full text for inspector selection/semantic accent.
      words: group.words,
      start: segment.start + group.first * wordDuration,
      end: segment.start + (group.first + group.words.length) * wordDuration,
      duration: group.words.length * wordDuration,
    }));
  });
};
