import { normalizeSplitAudioClip } from "./studioAudioSplit";
import { formatSmpteTimecode, normalizeFrameRate, resolveDropFrameMode } from "./studioTimecode";
import { mapStudioContinuousSeconds } from "./studioTime";

function toRationalTime(seconds, rate) {
  const frames = Math.round(Math.max(0, Number(seconds) || 0) * rate);
  return {
    OTIO_SCHEMA: "RationalTime.1",
    value: frames,
    rate,
  };
}

function toTimeRange(startSeconds, durationSeconds, rate) {
  return {
    OTIO_SCHEMA: "TimeRange.1",
    start_time: toRationalTime(startSeconds, rate),
    duration: toRationalTime(Math.max(0.001, Number(durationSeconds) || 0), rate),
  };
}

function sanitizeFilenameBase(name = "viral-clip-sequence") {
  return (
    String(name || "viral-clip-sequence")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "viral-clip-sequence"
  );
}

function sanitizeEdlReel(raw = "AX", index = 0) {
  const cleaned = String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "");
  if (cleaned) return cleaned.slice(0, 8);
  return `AX${String(index + 1).padStart(3, "0")}`;
}

function sanitizeEdlTitle(title = "VIRAL CLIP STUDIO SEQUENCE") {
  return String(title || "VIRAL CLIP STUDIO SEQUENCE")
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, 72);
}

function resolveClipMediaUrl(clip = {}, fallbackUrl = "") {
  return String(clip.url || clip.mediaUrl || clip.src || clip.sourceStoragePath || fallbackUrl || "").trim();
}

function resolveSequenceClips(timelineSegments = [], defaultUrl = "", defaultPlaybackRate = 1) {
  let outputOffset = 0;
  return (Array.isArray(timelineSegments) ? timelineSegments : []).map((clip, index) => {
    const start = Number(clip?.startRequest ?? clip?.start_time ?? clip?.startTime ?? clip?.start ?? 0);
    const rawEnd = clip?.endRequest ?? clip?.end_time ?? clip?.endTime ?? clip?.end;
    const parsedEnd = rawEnd !== undefined && rawEnd !== null ? Number(rawEnd) : NaN;
    const videoDuration = Math.max(
      0.04,
      Number.isFinite(parsedEnd) && parsedEnd > start ? parsedEnd - start : Number(clip?.duration) || 0.04
    );
    const end = Number.isFinite(parsedEnd) && parsedEnd > start ? parsedEnd : start + videoDuration;
    const normalizedAudio = normalizeSplitAudioClip(
      { ...clip, startRequest: start, endRequest: end },
      index,
      outputOffset
    );
    const clipRate = Number(clip?.speed ?? clip?.playbackRate ?? defaultPlaybackRate ?? 1) || 1;
    const mediaUrl = resolveClipMediaUrl(clip, defaultUrl);
    const reelName = sanitizeEdlReel(clip?.reel || clip?.sourceClipId || clip?.id, index);
    const sourceDuration = Number(clip?.sourceDuration ?? Math.max(end, start + videoDuration));

    const entry = {
      index,
      id: clip?.id || `clip-${index + 1}`,
      name: String(clip?.name || `Source clip ${index + 1}`),
      reel: reelName,
      mediaUrl,
      sourceStart: Math.max(0, start),
      sourceEnd: Math.max(start + videoDuration, end),
      sourceDuration: Number.isFinite(sourceDuration) && sourceDuration > 0 ? sourceDuration : Math.max(start + videoDuration, videoDuration),
      programmeStart: outputOffset,
      programmeDuration: videoDuration,
      speed: clipRate,
      transitionIn: clip?.transition_in || null,
      transitionOut: clip?.transition_out || null,
      audioDetached: normalizedAudio.audioDetached === true,
      audioProgrammeStart: Number.isFinite(normalizedAudio.audioTimelineStart)
        ? normalizedAudio.audioTimelineStart
        : outputOffset,
      audioProgrammeDuration: Number.isFinite(normalizedAudio.audioTimelineDuration)
        ? normalizedAudio.audioTimelineDuration
        : videoDuration,
      audioSourceStart:
        normalizedAudio.audioDetached === true
          ? Number(clip.audioSourceStart)
          : Math.max(0, start + Number(normalizedAudio.audioTrimOffsetStart || 0)),
      hasJCut: Boolean(normalizedAudio.hasJCut),
      hasLCut: Boolean(normalizedAudio.hasLCut),
      raw: clip,
    };
    outputOffset += videoDuration;
    return entry;
  });
}

function makeMediaReference(url, sourceDuration, rate) {
  if (!url || /^blob:/i.test(url)) {
    return {
      OTIO_SCHEMA: "MissingReference.1",
      available_range: toTimeRange(0, Math.max(0.04, sourceDuration), rate),
      metadata: url ? { studio_blob_url: url } : {},
    };
  }
  return {
    OTIO_SCHEMA: "ExternalReference.1",
    target_url: url,
    available_range: toTimeRange(0, Math.max(0.04, sourceDuration), rate),
  };
}

function makeOtioClip({
  name,
  mediaUrl,
  sourceStart,
  duration,
  sourceDuration,
  rate,
  effects = [],
  markers = [],
  metadata = {},
}) {
  return {
    OTIO_SCHEMA: "Clip.1",
    name,
    source_range: toTimeRange(sourceStart, duration, rate),
    media_reference: makeMediaReference(mediaUrl, sourceDuration, rate),
    effects,
    markers,
    metadata,
  };
}

function makeOtioGap(duration, rate, name = "") {
  return {
    OTIO_SCHEMA: "Gap.1",
    name,
    source_range: toTimeRange(0, duration, rate),
  };
}

function linearTimeWarp(speed) {
  return Math.abs(speed - 1) <= 1e-4 ? [] : [{
    OTIO_SCHEMA: "LinearTimeWarp.1",
    effect_name: "LinearTimeWarp",
    name: `Speed ${speed}x`,
    time_scalar: speed,
  }];
}

function packLaneClips(items = [], rate) {
  const sorted = [...items]
    .filter(item => Number(item.duration) > 0)
    .sort((a, b) => a.timelineStart - b.timelineStart || a.duration - b.duration);

  const lanes = [];
  for (const item of sorted) {
    let targetLane = lanes.find(lane => lane.cursor <= item.timelineStart + 1e-4);
    if (!targetLane) {
      targetLane = { cursor: 0, children: [] };
      lanes.push(targetLane);
    }
    const gapSeconds = item.timelineStart - targetLane.cursor;
    if (gapSeconds > 1 / (rate * 2)) {
      targetLane.children.push(makeOtioGap(gapSeconds, rate));
      targetLane.cursor += gapSeconds;
    }
    const startSec = item.sourceStart ?? 0;
    const totalDur = Math.max(item.sourceDuration || startSec + item.duration, startSec + item.duration);
    targetLane.children.push(
      makeOtioClip({
        name: item.name,
        mediaUrl: item.mediaUrl,
        sourceStart: startSec,
        duration: item.duration,
        sourceDuration: totalDur,
        rate,
        effects: item.effects || [],
        metadata: item.metadata || {},
      })
    );
    targetLane.cursor = item.timelineStart + item.duration;
  }
  return lanes.map(lane => lane.children);
}

export function buildInterchangeTranslationReport(project = {}) {
  const {
    timelineSegments = [],
    defaultSourceUrl = "",
    outputTimeMap = [],
    playbackRate = 1,
    speedSegments = [],
    overlays = [],
    voiceovers = [],
    soundEffects = [],
    musicTrack = null,
    captionSegments = [],
    finishFx = null,
    nodeFlow = null,
    threeD = null,
    subjectVfx = null,
  } = project;

  const clips = resolveSequenceClips(timelineSegments, defaultSourceUrl, playbackRate);
  const transfersDirectly = [];
  const requiresBakeOrRecreate = [];
  const relinkWarnings = [];

  if (clips.length) {
    transfersDirectly.push(`V1 primary picture cut list (${clips.length} clip${clips.length === 1 ? "" : "s"})`);
    const splitCount = clips.filter(c => c.hasJCut || c.hasLCut || c.audioDetached).length;
    transfersDirectly.push(
      splitCount
        ? `A1 source dialogue audio including ${splitCount} J/L split or detached cut${splitCount === 1 ? "" : "s"}`
        : "A1 source dialogue audio"
    );
  }

  const brollItems = (overlays || []).filter(o => o && !o.isCaption && (o.bRollMode || o.type === "image" || o.type === "video"));
  const titleItems = (overlays || []).filter(o => o && !o.isCaption && !brollItems.includes(o));
  if (brollItems.length) {
    transfersDirectly.push(`V2+ B-roll picture placement (${brollItems.length} clip${brollItems.length === 1 ? "" : "s"})`);
  }
  if ((voiceovers || []).length) transfersDirectly.push(`Voiceover stem placement (${voiceovers.length})`);
  if ((soundEffects || []).length) transfersDirectly.push(`SFX placement (${soundEffects.length})`);
  if (musicTrack) transfersDirectly.push("Music bed placement");

  const speedModified = clips.some(c => Math.abs(c.speed - 1) > 1e-4) || (speedSegments || []).length > 1;
  if ((speedSegments || []).length > 1 || outputTimeMap.length > 1) {
    requiresBakeOrRecreate.push("Variable non-linear speed ramps must be baked into mezzanine clips or recreated in the target NLE.");
  } else if (speedModified) {
    transfersDirectly.push(`Constant speed retiming (${playbackRate}x LinearTimeWarp in OTIO)`);
  }

  if (titleItems.length) {
    requiresBakeOrRecreate.push(`Editable/kinetic title layers (${titleItems.length}) are not recreated natively in OTIO/EDL; bake clean alpha plate or rebuild titles.`);
  }
  if ((captionSegments || []).length) {
    requiresBakeOrRecreate.push(`Captions (${captionSegments.length} cues) require pairing this sequence with the exported .srt or .vtt sidecar.`);
  }
  if (finishFx && (finishFx.lutName || finishFx.advancedColor?.lutName || finishFx.colorGrade || finishFx.filmEmulation)) {
    requiresBakeOrRecreate.push("Studio Finish color grade / LUT / Revitalizer FX do not translate across OTIO/EDL; re-grade on timeline or export LUT separately.");
  }
  if (nodeFlow && ((nodeFlow.nodes || []).length > 0 || nodeFlow.enabled)) {
    requiresBakeOrRecreate.push("Node Flow masks and compositor graphs must be baked or rebuilt in your desktop editor.");
  }
  if (threeD && (threeD.enabled || (threeD.keyframes || []).length > 0)) {
    requiresBakeOrRecreate.push("3D depth / camera motion effects require baking into the source clip.");
  }
  if (subjectVfx && (subjectVfx.enabled || (subjectVfx.effects || []).length > 0)) {
    requiresBakeOrRecreate.push("Subject segmentation / background VFX must be baked prior to relinking.");
  }

  clips.forEach(clip => {
    if (!clip.mediaUrl) {
      relinkWarnings.push(`${clip.name} has no source URL and exported with MissingReference (offline).`);
    } else if (/^blob:/i.test(clip.mediaUrl)) {
      relinkWarnings.push(`${clip.name} references a browser-local blob: URL and will require manual relink in desktop NLE.`);
    }
  });
  brollItems.forEach((item, idx) => {
    const url = resolveClipMediaUrl(item, "");
    if (!url || /^blob:/i.test(url)) {
      relinkWarnings.push(`B-roll "${item.name || idx + 1}" requires manual relink to local disk media.`);
    }
  });

  return {
    transfersDirectly,
    requiresBakeOrRecreate,
    relinkWarnings,
    summary: `${transfersDirectly.length} track group(s) translate natively; ${requiresBakeOrRecreate.length} Studio FX area(s) require bake/sidecar; ${relinkWarnings.length} relink notice(s).`,
  };
}

export function buildStudioOtioDocument(project = {}) {
  const {
    title = "Viral Clip Studio Sequence",
    frameRate = 30,
    playbackRate = 1,
    outputTimeMap = [],
    timelineSegments = [],
    defaultSourceUrl = "",
    overlays = [],
    voiceovers = [],
    soundEffects = [],
    musicTrack = null,
    silenceRegions = [],
    framingCuts = [],
    punchZones = [],
  } = project;

  const rateInfo = normalizeFrameRate(frameRate);
  const otioRate = rateInfo.fps;
  const clips = resolveSequenceClips(timelineSegments, defaultSourceUrl, playbackRate);
  const outputTime = seconds => outputTimeMap.length
    ? mapStudioContinuousSeconds(outputTimeMap, seconds, "programme")
    : seconds / (Number(playbackRate) || 1);
  const programmeDuration = clips.reduce((duration, clip) => duration + clip.programmeDuration, 0);
  const presentationDuration = programmeDuration ? outputTime(programmeDuration) : 0;
  const hasRamp = outputTimeMap.length > 1;
  const constantOutputRate = outputTimeMap.length === 1
    ? outputTimeMap[0].rateNumerator / outputTimeMap[0].rateDenominator
    : null;
  const report = buildInterchangeTranslationReport(project);

  const timelineMarkers = [
    ...(silenceRegions || []).map((z, idx) => ({
      OTIO_SCHEMA: "Marker.2",
      name: `Silence #${idx + 1}`,
      color: "ORANGE",
      comment: "Dead-air region marked in Viral Clip Studio",
      marked_range: toTimeRange(
        outputTime(Number(z.timelineStart ?? z.start ?? 0)),
        Math.max(0.04, Number(z.duration ?? 0.1)),
        otioRate
      ),
    })),
    ...(framingCuts || []).map((cut, idx) => ({
      OTIO_SCHEMA: "Marker.2",
      name: cut.mode === "speaker_track" ? "Solo Speaker Reframe" : cut.mode === "group_stack" ? "Dual-Cam Reframe" : `Reframe #${idx + 1}`,
      color: "CYAN",
      comment: `Reframe cut: ${cut.mode || "custom"}`,
      marked_range: toTimeRange(outputTime(Number(cut.time ?? 0)), 1 / otioRate, otioRate),
    })),
    ...(punchZones || []).map((pz, idx) => ({
      OTIO_SCHEMA: "Marker.2",
      name: `Punch ${Number(pz.maxScale || 1.25).toFixed(2)}x #${idx + 1}`,
      color: "MAGENTA",
      comment: "Camera punch-in cue",
      marked_range: toTimeRange(outputTime(Number(pz.startTime ?? 0)), Math.max(0.04, Number(pz.duration ?? 0.5)), otioRate),
    })),
  ];

  // V1 primary picture track
  const v1Children = [];
  let outputFrameCursor = 0;
  let presentationCursor = 0;
  clips.forEach((clip, idx) => {
    presentationCursor = outputTimeMap.length
      ? outputTime(clip.programmeStart + clip.programmeDuration)
      : presentationCursor + clip.programmeDuration / clip.speed;
    const endFrame = Math.max(outputFrameCursor + 1, Math.round(presentationCursor * otioRate));
    const duration = (endFrame - outputFrameCursor) / otioRate;
    outputFrameCursor = endFrame;
    v1Children.push(
      makeOtioClip({
        name: clip.name,
        mediaUrl: clip.mediaUrl,
        sourceStart: clip.sourceStart,
        duration,
        sourceDuration: clip.sourceDuration,
        rate: otioRate,
        effects: hasRamp ? [] : linearTimeWarp(constantOutputRate || clip.speed),
        markers: idx === 0 ? timelineMarkers : [],
        metadata: { studio_clip_id: clip.id, reel: clip.reel },
      })
    );
    const outTransition = clip.transitionOut;
    if (outTransition && idx < clips.length - 1) {
      const transDur = Math.max(0.04, Number(outTransition.duration ?? 0.5));
      v1Children.push({
        OTIO_SCHEMA: "Transition.1",
        name: String(outTransition.type || outTransition.name || "SMPTE_Dissolve"),
        transition_type: "SMPTE_Dissolve",
        in_offset: toRationalTime(transDur / 2, otioRate),
        out_offset: toRationalTime(transDur / 2, otioRate),
      });
    }
  });

  const tracks = [
    {
      OTIO_SCHEMA: "Track.1",
      name: "V1",
      kind: "Video",
      children: v1Children,
    },
  ];

  // V2+ B-roll tracks
  const brollItems = (overlays || [])
    .filter(o => o && !o.isCaption && (o.bRollMode || o.type === "image" || o.type === "video"))
    .map((item, idx) => {
      const programmeStart = Math.max(0, Number(item.startTime ?? item.start_time ?? 0));
      const duration = Math.max(0.04, Number(item.duration ?? 2));
      return {
        name: String(item.name || `B-roll ${idx + 1}`),
        mediaUrl: resolveClipMediaUrl(item, ""),
        timelineStart: outputTime(programmeStart),
        duration: outputTime(programmeStart + duration) - outputTime(programmeStart),
        sourceStart: Math.max(0, Number(item.sourceStart ?? 0)),
        sourceDuration: Math.max(Number(item.sourceDuration ?? 0), Number(item.duration ?? 2)),
        metadata: { studio_overlay_id: item.id, bRollMode: item.bRollMode || "pip" },
      };
    });

  const brollLanes = packLaneClips(brollItems, otioRate);
  brollLanes.forEach((children, laneIndex) => {
    tracks.push({
      OTIO_SCHEMA: "Track.1",
      name: `V${laneIndex + 2} B-Roll`,
      kind: "Video",
      children,
    });
  });

  // A1+ Source audio dialogue tracks (checkerboarding J/L overlaps onto A2 if needed)
  const sourceAudioItems = clips.map(clip => ({
    name: `${clip.name} Audio`,
    mediaUrl: clip.mediaUrl,
    timelineStart: outputTime(clip.audioProgrammeStart),
    duration: outputTime(clip.audioProgrammeStart + clip.audioProgrammeDuration) - outputTime(clip.audioProgrammeStart),
    sourceStart: clip.audioSourceStart,
    sourceDuration: clip.sourceDuration,
    effects: hasRamp ? [] : linearTimeWarp(constantOutputRate || clip.speed),
    metadata: { studio_clip_id: clip.id, hasJCut: clip.hasJCut, hasLCut: clip.hasLCut },
  }));
  const audioDialogueLanes = packLaneClips(sourceAudioItems, otioRate);
  audioDialogueLanes.forEach((children, laneIndex) => {
    tracks.push({
      OTIO_SCHEMA: "Track.1",
      name: laneIndex === 0 ? "A1 Dialogue" : `A${laneIndex + 1} Dialogue Split`,
      kind: "Audio",
      children,
    });
  });

  // Voiceover / SFX / Music tracks
  const nextAudioTrackNum = () => tracks.filter(t => t.kind === "Audio").length + 1;

  if (Array.isArray(voiceovers) && voiceovers.length) {
    const voLanes = packLaneClips(
      voiceovers.map((vo, idx) => ({
        name: String(vo.name || vo.label || `Voiceover ${idx + 1}`),
        mediaUrl: resolveClipMediaUrl(vo, ""),
        timelineStart: outputTime(Math.max(0, Number(vo.startTime ?? vo.timelineStart ?? 0))),
        duration: Math.max(0.04, Number(vo.duration ?? 1)),
        sourceStart: Math.max(0, Number(vo.sourceStart ?? 0)),
        sourceDuration: Math.max(Number(vo.duration ?? 1), Number(vo.sourceDuration ?? 0)),
      })),
      otioRate
    );
    voLanes.forEach(children => {
      tracks.push({
        OTIO_SCHEMA: "Track.1",
        name: `A${nextAudioTrackNum()} Voiceover`,
        kind: "Audio",
        children,
      });
    });
  }

  if (Array.isArray(soundEffects) && soundEffects.length) {
    const sfxLanes = packLaneClips(
      soundEffects.map((sfx, idx) => ({
        name: String(sfx.name || sfx.label || `SFX ${idx + 1}`),
        mediaUrl: resolveClipMediaUrl(sfx, ""),
        timelineStart: outputTime(Math.max(0, Number(sfx.startTime ?? sfx.timelineStart ?? 0))),
        duration: Math.max(0.04, Number(sfx.duration ?? 0.5)),
        sourceStart: 0,
        sourceDuration: Math.max(0.5, Number(sfx.duration ?? 0.5)),
      })),
      otioRate
    );
    sfxLanes.forEach(children => {
      tracks.push({
        OTIO_SCHEMA: "Track.1",
        name: `A${nextAudioTrackNum()} SFX`,
        kind: "Audio",
        children,
      });
    });
  }

  if (musicTrack) {
    const totalProg = presentationDuration || Number(musicTrack.duration ?? 10);
    const musicStart = Math.max(0, Number(musicTrack.startTime ?? 0));
    const musicLanes = packLaneClips(
      [
        {
          name: String(musicTrack.name || musicTrack.title || "Music Bed"),
          mediaUrl: resolveClipMediaUrl(musicTrack, ""),
          timelineStart: musicStart,
          duration: Math.min(Math.max(0, totalProg - musicStart), Math.max(0.04, Number(musicTrack.duration || totalProg))),
          sourceStart: Math.max(0, Number(musicTrack.sourceStart ?? 0)),
          sourceDuration: Math.max(totalProg, Number(musicTrack.sourceDuration ?? totalProg)),
        },
      ],
      otioRate
    );
    musicLanes.forEach(children => {
      tracks.push({
        OTIO_SCHEMA: "Track.1",
        name: `A${nextAudioTrackNum()} Music`,
        kind: "Audio",
        children,
      });
    });
  }

  return {
    OTIO_SCHEMA: "Timeline.1",
    name: String(title || "Viral Clip Studio Sequence"),
    global_start_time: toRationalTime(0, otioRate),
    tracks: {
      OTIO_SCHEMA: "Stack.1",
      name: "tracks",
      children: tracks,
    },
    metadata: {
      autopromote: {
        schemaVersion: 1,
        frameRate: rateInfo.label,
        dropFrame: resolveDropFrameMode(frameRate, "auto"),
        playbackRate,
        translationReport: report,
      },
    },
  };
}

export function buildStudioCmx3600Edl(project = {}) {
  const {
    title = "Viral Clip Studio Sequence",
    frameRate = 30,
    playbackRate = 1,
    timelineSegments = [],
    defaultSourceUrl = "",
    dropFrame = "auto",
  } = project;

  const useDropFrame = resolveDropFrameMode(frameRate, dropFrame);
  const rateInfo = normalizeFrameRate(frameRate);
  const clips = resolveSequenceClips(timelineSegments, defaultSourceUrl, playbackRate);

  const lines = [
    `TITLE: ${sanitizeEdlTitle(title)}`,
    `FCM: ${useDropFrame ? "DROP FRAME" : "NON-DROP FRAME"}`,
    "",
  ];

  let eventNumber = 1;
  let recCursor = 0;
  const timecode = seconds => {
    const frames = Math.round(seconds * rateInfo.fps);
    return formatSmpteTimecode(frames / rateInfo.fps, rateInfo.fps, { dropFrame: useDropFrame });
  };

  clips.forEach((clip, idx) => {
    const srcIn = timecode(clip.sourceStart);
    const srcOut = timecode(clip.sourceEnd);
    const recDuration = clip.programmeDuration / (clip.speed || 1);
    const recIn = timecode(recCursor);
    const recOut = timecode(recCursor + recDuration);
    const evStr = String(eventNumber).padStart(3, "0");

    lines.push(`${evStr}  ${clip.reel.padEnd(8, " ")} AA/V  C        ${srcIn} ${srcOut} ${recIn} ${recOut}`);
    lines.push(`* FROM CLIP NAME: ${clip.name}`);
    if (clip.mediaUrl) {
      lines.push(`* SOURCE FILE: ${clip.mediaUrl}`);
    }
    if (Math.abs(clip.speed - 1) > 1e-4) {
      lines.push(`M2   ${clip.reel.padEnd(8, " ")} ${(clip.speed * rateInfo.fps).toFixed(3).padStart(7, " ")}  ${srcIn}`);
    }
    if (clip.transitionOut && idx < clips.length - 1) {
      const dissolveFrames = Math.max(1, Math.round(Number(clip.transitionOut.duration ?? 0.5) * rateInfo.fps));
      eventNumber += 1;
      const transEv = String(eventNumber).padStart(3, "0");
      lines.push(`${transEv}  ${clip.reel.padEnd(8, " ")} V     D    ${String(dissolveFrames).padStart(3, "0")} ${srcOut} ${srcOut} ${recOut} ${recOut}`);
    }
    lines.push("");
    recCursor += recDuration;
    eventNumber += 1;
  });

  return lines.join("\n");
}

export function exportStudioTimelineInterchange(options = {}) {
  const format = String(options.format || "otio").toLowerCase() === "edl" ? "edl" : "otio";
  const baseName = sanitizeFilenameBase(options.projectName || options.title || "viral-clip-sequence");
  const report = buildInterchangeTranslationReport(options);

  if (format === "edl") {
    return {
      format: "edl",
      extension: "edl",
      mimeType: "text/plain;charset=utf-8",
      filename: `${baseName}.edl`,
      content: buildStudioCmx3600Edl(options),
      report,
    };
  }

  const document = buildStudioOtioDocument(options);
  return {
    format: "otio",
    extension: "otio",
    mimeType: "application/json;charset=utf-8",
    filename: `${baseName}.otio`,
    document,
    content: `${JSON.stringify(document, null, 2)}\n`,
    report,
  };
}
