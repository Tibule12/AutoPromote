import { mapCaptionSegmentsToTimeline } from "./viralRenderPayload";
import {
  createOutputTimeMap,
  createTimeRange,
  mapStudioContinuousSeconds,
  secondsToTicks,
} from "./studioTime";
import { buildStudioOutputTimeMap } from "./studioProjectDocument";

function sanitizeCueText(text) {
  return String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .join("\n");
}

function escapeVttVoiceName(name) {
  return String(name ?? "")
    .replace(/[<>]/g, "")
    .replace(/\r?\n+/g, " ")
    .trim();
}

export function formatSrtTimestamp(seconds) {
  const totalMs = Math.max(0, Math.round((Number(seconds) || 0) * 1000));
  const ms = totalMs % 1000;
  const totalSecs = Math.floor(totalMs / 1000);
  const secs = totalSecs % 60;
  const mins = Math.floor(totalSecs / 60) % 60;
  const hours = Math.floor(totalSecs / 3600);
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

export function formatVttTimestamp(seconds) {
  return formatSrtTimestamp(seconds).replace(",", ".");
}

function computeProgrammeDurationSeconds(cues, timelineSegments, durationSeconds) {
  const explicitDuration = Number(durationSeconds);
  if (Number.isFinite(explicitDuration) && explicitDuration > 0) {
    return explicitDuration;
  }
  const timelineTotal = (Array.isArray(timelineSegments) ? timelineSegments : []).reduce(
    (sum, clip) => {
      const s = Number(clip?.start_time ?? clip?.startTime ?? clip?.start);
      const e = Number(clip?.end_time ?? clip?.endTime ?? clip?.end);
      const dur = Number.isFinite(Number(clip?.duration))
        ? Math.max(0, Number(clip.duration))
        : Number.isFinite(s) && Number.isFinite(e) && e > s
          ? e - s
          : 0;
      return sum + dur;
    },
    0
  );
  const maxCueEnd = cues.reduce((max, cue) => Math.max(max, Number(cue?.end_time ?? 0)), 0);
  return Math.max(timelineTotal, maxCueEnd);
}

function resolveOutputTimeMap({
  outputTimeMap,
  programmeSpeedKeys,
  speedSegments,
  playbackRate = 1,
  programmeDuration,
}) {
  if (Array.isArray(outputTimeMap) && outputTimeMap.length) {
    return outputTimeMap;
  }
  if (!(programmeDuration > 0)) return [];
  const durationTick = Math.max(1, secondsToTicks(programmeDuration));

  if (Array.isArray(speedSegments) && speedSegments.length) {
    const sorted = [...speedSegments]
      .map(seg => ({
        start: Math.max(0, Number(seg.startTime ?? seg.start ?? 0)),
        end: Math.min(programmeDuration, Number(seg.endTime ?? seg.end ?? programmeDuration)),
        rate: Math.max(0.05, Math.min(16, Number(seg.rate ?? seg.speed ?? 1) || 1)),
      }))
      .filter(seg => seg.end > seg.start)
      .sort((a, b) => a.start - b.start);

    if (sorted.length) {
      const normalized = [];
      let cursor = 0;
      for (const seg of sorted) {
        if (seg.start > cursor + 1e-5) {
          normalized.push({ start: cursor, end: seg.start, rate: Number(playbackRate) || 1 });
        }
        const s = Math.max(cursor, seg.start);
        if (seg.end > s + 1e-5) {
          normalized.push({ start: s, end: seg.end, rate: seg.rate });
          cursor = seg.end;
        }
      }
      if (cursor < programmeDuration - 1e-5) {
        normalized.push({ start: cursor, end: programmeDuration, rate: Number(playbackRate) || 1 });
      }
      if (normalized.length) {
        const tickSegments = normalized
          .map(seg => ({
            startTick: secondsToTicks(seg.start),
            endTick: Math.min(durationTick, secondsToTicks(seg.end)),
            rate: seg.rate,
          }))
          .filter(seg => seg.endTick > seg.startTick);
        if (tickSegments.length) {
          tickSegments[0].startTick = 0;
          tickSegments[tickSegments.length - 1].endTick = durationTick;
          return createOutputTimeMap(
            durationTick,
            tickSegments.map(seg => ({
              programmeRange: createTimeRange("programme", seg.startTick, seg.endTick),
              rate: seg.rate,
            }))
          );
        }
      }
    }
  }

  return buildStudioOutputTimeMap({
    durationTick,
    programmeSpeedKeys: Array.isArray(programmeSpeedKeys) ? programmeSpeedKeys : [],
    fallbackSpeed: Number.isFinite(Number(playbackRate)) && Number(playbackRate) > 0 ? Number(playbackRate) : 1,
  });
}

export function buildTimelineSidecarCues({
  captionSegments = [],
  timelineSegments = [],
  fallbackSourceClipId = null,
  alreadyMappedToTimeline = false,
  outputTimeMap = null,
  programmeSpeedKeys = [],
  speedSegments = [],
  playbackRate = 1,
  durationSeconds = null,
} = {}) {
  const normalizedTimeline = (Array.isArray(timelineSegments) ? timelineSegments : []).map(clip => {
    const startVal = clip?.start_time ?? clip?.startTime ?? clip?.startRequest ?? clip?.start;
    const endVal = clip?.end_time ?? clip?.endTime ?? clip?.endRequest ?? clip?.end;
    return {
      ...clip,
      ...(startVal !== undefined ? { start_time: startVal, startTime: startVal } : {}),
      ...(endVal !== undefined ? { end_time: endVal, endTime: endVal } : {}),
    };
  });
  const programmeCues = alreadyMappedToTimeline
    ? (Array.isArray(captionSegments) ? captionSegments : [])
        .map((cue, index) => ({
          id: cue?.id || `caption-${index + 1}`,
          start_time: Number(cue?.start_time ?? cue?.startTime ?? 0),
          end_time: Number(cue?.end_time ?? cue?.endTime ?? 0),
          text: cue?.text ?? "",
          speaker: cue?.speaker ?? cue?.speaker_label ?? "",
        }))
        .filter(cue => Number.isFinite(cue.start_time) && Number.isFinite(cue.end_time) && cue.end_time > cue.start_time)
    : mapCaptionSegmentsToTimeline({
        captionSegments,
        timelineSegments: normalizedTimeline,
        fallbackSourceClipId,
      });

  const programmeDuration = computeProgrammeDurationSeconds(
    programmeCues,
    timelineSegments,
    durationSeconds
  );
  const resolvedTimeMap = resolveOutputTimeMap({
    outputTimeMap,
    programmeSpeedKeys,
    speedSegments,
    playbackRate,
    programmeDuration,
  });

  const cues = [];
  for (let i = 0; i < programmeCues.length; i += 1) {
    const cue = programmeCues[i];
    const cleanText = sanitizeCueText(cue.text);
    if (!cleanText) continue;
    const rawStart = Number(cue.start_time ?? 0);
    const rawEnd = Number(cue.end_time ?? 0);
    if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd) || rawEnd <= rawStart) continue;

    const outStart = resolvedTimeMap.length
      ? mapStudioContinuousSeconds(resolvedTimeMap, rawStart, "programme")
      : rawStart / (Number(playbackRate) || 1);
    const outEnd = resolvedTimeMap.length
      ? mapStudioContinuousSeconds(resolvedTimeMap, rawEnd, "programme")
      : rawEnd / (Number(playbackRate) || 1);

    const startMs = Math.max(0, Math.round(outStart * 1000));
    const endMs = Math.round(outEnd * 1000);
    if (endMs <= startMs) continue;

    cues.push({
      id: cue.id || `cue-${i + 1}`,
      startTime: startMs / 1000,
      endTime: endMs / 1000,
      startMs,
      endMs,
      text: cleanText,
      speaker: String(cue.speaker_label || cue.speaker || "").trim(),
    });
  }

  cues.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  return cues;
}

function formatCueBody(cue, format, { includeSpeakers = false, vttVoiceTag = true } = {}) {
  if (!includeSpeakers || !cue.speaker) {
    return cue.text;
  }
  const speaker = escapeVttVoiceName(cue.speaker);
  if (!speaker) return cue.text;
  if (format === "vtt" && vttVoiceTag) {
    return `<v ${speaker}>${cue.text}</v>`;
  }
  return `${speaker}: ${cue.text}`;
}

export function buildCaptionSidecarFilename(projectName = "viral-clip", format = "srt") {
  const safeBase = String(projectName || "viral-clip")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "viral-clip";
  const ext = String(format).toLowerCase() === "vtt" ? "vtt" : "srt";
  return `${safeBase}.${ext}`;
}

export function exportStudioCaptionSidecar(options = {}) {
  const format = String(options.format || "srt").toLowerCase() === "vtt" ? "vtt" : "srt";
  const includeSpeakers = Boolean(options.includeSpeakers);
  const vttVoiceTag = options.vttVoiceTag !== false;
  const cues = buildTimelineSidecarCues(options);

  let content = "";
  if (format === "vtt") {
    const header = options.title ? `WEBVTT - ${escapeVttVoiceName(options.title)}\n\n` : "WEBVTT\n\n";
    const blocks = cues.map((cue, index) => {
      const start = formatVttTimestamp(cue.startTime);
      const end = formatVttTimestamp(cue.endTime);
      const body = formatCueBody(cue, "vtt", { includeSpeakers, vttVoiceTag });
      return `${index + 1}\n${start} --> ${end}\n${body}`;
    });
    content = blocks.length ? `${header}${blocks.join("\n\n")}\n` : header;
  } else {
    const blocks = cues.map((cue, index) => {
      const start = formatSrtTimestamp(cue.startTime);
      const end = formatSrtTimestamp(cue.endTime);
      const body = formatCueBody(cue, "srt", { includeSpeakers, vttVoiceTag: false });
      return `${index + 1}\n${start} --> ${end}\n${body}`;
    });
    content = blocks.length ? `${blocks.join("\n\n")}\n` : "";
  }

  return {
    format,
    extension: format,
    mimeType: format === "vtt" ? "text/vtt;charset=utf-8" : "application/x-subrip;charset=utf-8",
    filename: buildCaptionSidecarFilename(options.projectName, format),
    cueCount: cues.length,
    cues,
    content,
  };
}
