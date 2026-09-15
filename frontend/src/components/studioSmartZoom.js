/**
 * AI Smart Zoom & Dramatic Punch-Ins (The Hormozi / MrBeast Retention Engine)
 *
 * Generates frame-accurate, dynamic camera scale keyframes (1.15x-1.35x)
 * designed to maximize viewer retention on Shorts, Reels, and TikToks.
 */

const createSecureId = (prefix = "punch") =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const round = (num, decimals = 3) => {
  const factor = 10 ** decimals;
  return Math.round((Number(num) || 0) * factor) / factor;
};

export const PUNCH_SCALES = [
  { id: 1.15, label: "1.15× (Subtle)", value: 1.15 },
  { id: 1.25, label: "1.25× (Viral)", value: 1.25 },
  { id: 1.35, label: "1.35× (Dramatic)", value: 1.35 },
];

export const PUNCH_STYLES = [
  { id: "punch", label: "Fast Punch", desc: "0.12s dynamic snappy zoom-in" },
  { id: "snap", label: "Instant Cut", desc: "Hard frame cut like DaVinci/Premiere" },
  { id: "smooth", label: "Cinematic Ease", desc: "0.28s smooth push-in" },
];

export const PUNCH_MODES = [
  { id: "cadence", label: "Viral Cadence (3.5s)", desc: "Hormozi alternating retention rhythm" },
  { id: "emphasis", label: "Speech Emphasis", desc: "Punches on key statements and hook lines" },
  { id: "hook", label: "Opening Hook (0–3s)", desc: "Immediate 0–3s viewer hook punch" },
];

/**
 * Creates discrete keyframes for a single punch-in event.
 */
export const createSinglePunchKeyframes = ({
  startTime,
  duration = 2.5,
  punchScale = 1.25,
  punchStyle = "punch",
  baseScale = 1.0,
  punchId = null,
}) => {
  const id = punchId || createSecureId("punch-zone");
  const start = Math.max(0, Number(startTime || 0));
  const dur = Math.max(0.4, Number(duration || 2.5));
  const scale = Number(punchScale || 1.25);
  const base = Number(baseScale || 1.0);
  const end = round(start + dur);

  if (punchStyle === "snap") {
    return [
      ...(start > 0.02
        ? [
            {
              id: createSecureId("punch-pre"),
              targetId: "main-video",
              property: "scale",
              time: round(start - 0.01),
              value: round(base),
              easing: "hold",
              isPunch: false,
              punchId: id,
              punchStart: start,
              punchEnd: end,
            },
          ]
        : []),
      {
        id: createSecureId("punch-in"),
        targetId: "main-video",
        property: "scale",
        time: round(start),
        value: round(scale),
        easing: "hold",
        isPunch: true,
        punchId: id,
        punchStart: start,
        punchEnd: end,
      },
      {
        id: createSecureId("punch-out"),
        targetId: "main-video",
        property: "scale",
        time: end,
        value: round(base),
        easing: "hold",
        isPunch: false,
        punchId: id,
        punchStart: start,
        punchEnd: end,
      },
    ];
  }

  const rampTime = punchStyle === "smooth" ? 0.28 : 0.12;
  const safeRamp = Math.min(rampTime, dur * 0.35);

  return [
    {
      id: createSecureId("punch-in-start"),
      targetId: "main-video",
      property: "scale",
      time: round(start),
      value: round(base),
      easing: punchStyle === "smooth" ? "ease_in_out" : "ease_out",
      isPunch: false,
      punchId: id,
      punchStart: start,
      punchEnd: end,
    },
    {
      id: createSecureId("punch-hold-start"),
      targetId: "main-video",
      property: "scale",
      time: round(start + safeRamp),
      value: round(scale),
      easing: "hold",
      isPunch: true,
      punchId: id,
      punchStart: start,
      punchEnd: end,
    },
    {
      id: createSecureId("punch-hold-end"),
      targetId: "main-video",
      property: "scale",
      time: round(end - safeRamp),
      value: round(scale),
      easing: "ease_in_out",
      isPunch: true,
      punchId: id,
      punchStart: start,
      punchEnd: end,
    },
    {
      id: createSecureId("punch-out-end"),
      targetId: "main-video",
      property: "scale",
      time: end,
      value: round(base),
      easing: "ease_in_out",
      isPunch: false,
      punchId: id,
      punchStart: start,
      punchEnd: end,
    },
  ];
};

/**
 * Generates an automated sequence of Smart Zoom punch-ins across the entire timeline.
 */
export const generateSmartZoomKeyframes = ({
  duration = 30,
  captionSegments = [],
  punchScale = 1.25,
  punchStyle = "punch",
  punchMode = "cadence",
  punchDuration = 2.5,
  baseScale = 1.0,
}) => {
  const totalDuration = Math.max(1.0, Number(duration || 30));
  const defaultDur = Math.max(1.2, Number(punchDuration || 2.5));
  const scale = Number(punchScale || 1.25);
  const base = Number(baseScale || 1.0);

  const punchIntervals = [];

  if (punchMode === "hook") {
    // Opening 0 to 3.0s punch only
    punchIntervals.push({
      start: 0,
      duration: Math.min(3.0, Math.max(1.5, totalDuration * 0.4)),
      scale,
    });
  } else if (punchMode === "emphasis" && Array.isArray(captionSegments) && captionSegments.length > 0) {
    // Speech emphasis mode based on AI transcript captions
    let lastPunchEnd = -1;

    for (let i = 0; i < captionSegments.length; i += 1) {
      const seg = captionSegments[i];
      const start = Math.max(0, Number(seg.start || 0));
      const end = Math.min(totalDuration, Number(seg.end || start + 2.0));
      const text = String(seg.text || "").trim();

      const isFirst = i === 0;
      const hasEmphasisPunctuation = /[.!?]$/.test(text) || text.length < 30;
      const isSpacedEnough = start >= lastPunchEnd + 1.0;

      if ((isFirst || hasEmphasisPunctuation) && isSpacedEnough && start < totalDuration - 1.0) {
        const dur = Math.min(Math.max(1.6, end - start), 3.5);
        if (start + dur <= totalDuration + 0.1) {
          punchIntervals.push({
            start: round(start),
            duration: round(Math.min(dur, totalDuration - start)),
            scale: punchIntervals.length % 2 === 1 ? Math.min(1.4, scale + 0.05) : scale,
          });
          lastPunchEnd = start + dur;
        }
      }
    }
  } else {
    // Viral Cadence mode: alternating 3.5s normal / 2.5s punch rhythm
    let cursor = 2.4; // Start normal for 2.4s establishing shot
    let intervalIndex = 0;

    while (cursor + defaultDur <= totalDuration - 0.8) {
      const currentScale = intervalIndex % 2 === 1 ? Math.min(1.4, scale + 0.05) : scale;
      punchIntervals.push({
        start: round(cursor),
        duration: round(defaultDur),
        scale: round(currentScale),
      });

      // Advance by punch duration + 3.2s normal breathing room
      cursor += defaultDur + 3.2;
      intervalIndex += 1;
    }
  }

  // Convert intervals to keyframes
  const allKeyframes = [];
  for (const interval of punchIntervals) {
    const keys = createSinglePunchKeyframes({
      startTime: interval.start,
      duration: interval.duration,
      punchScale: interval.scale,
      punchStyle,
      baseScale: base,
    });
    allKeyframes.push(...keys);
  }

  // Sort and remove exact duplicate timestamps
  return allKeyframes
    .sort((a, b) => Number(a.time) - Number(b.time))
    .filter((key, idx, arr) => idx === 0 || Math.abs(Number(key.time) - Number(arr[idx - 1].time)) > 0.005);
};

/**
 * Identifies contiguous punch-in zones from the main-video scale keyframes
 * for rendering visual punch badges on the timeline motion track.
 */
export const extractPunchZonesFromKeyframes = (keyframes = []) => {
  const scaleKeys = (keyframes || [])
    .filter(k => k.targetId === "main-video" && k.property === "scale")
    .sort((a, b) => Number(a.time) - Number(b.time));

  if (!scaleKeys.length) return [];

  // Group by punchId if present
  const byPunchId = new Map();
  const ungrouped = [];

  for (const k of scaleKeys) {
    if (k.punchId) {
      if (!byPunchId.has(k.punchId)) byPunchId.set(k.punchId, []);
      byPunchId.get(k.punchId).push(k);
    } else {
      ungrouped.push(k);
    }
  }

  const zones = [];

  for (const [punchId, group] of byPunchId.entries()) {
    const punchKeys = group.filter(k => k.value > 1.01 || k.isPunch);
    if (!punchKeys.length) continue;
    const maxScale = Math.max(...group.map(k => Number(k.value || 1)));
    const startTime = group[0].punchStart !== undefined
      ? Number(group[0].punchStart)
      : Number(group[0].time);
    const endTime = group[0].punchEnd !== undefined
      ? Number(group[0].punchEnd)
      : Number(group[group.length - 1].time);

    zones.push({
      id: punchId,
      punchId,
      startTime: round(startTime),
      endTime: round(endTime),
      duration: Math.max(0.1, round(endTime - startTime)),
      maxScale: round(maxScale),
    });
  }

  // Handle any custom keyframes without punchId
  if (ungrouped.length) {
    let currentZone = null;
    for (const k of ungrouped) {
      const val = Number(k.value || 1);
      const time = Number(k.time || 0);
      if (val > 1.01) {
        if (!currentZone) {
          currentZone = {
            id: `punch-zone-${zones.length + 1}`,
            startTime: time,
            endTime: time,
            maxScale: val,
          };
        } else {
          currentZone.endTime = Math.max(currentZone.endTime, time);
          currentZone.maxScale = Math.max(currentZone.maxScale, val);
        }
      } else if (currentZone) {
        currentZone.endTime = Math.max(currentZone.endTime, time);
        currentZone.duration = Math.max(0.1, round(currentZone.endTime - currentZone.startTime));
        zones.push({ ...currentZone });
        currentZone = null;
      }
    }
    if (currentZone) {
      currentZone.duration = Math.max(0.1, round(currentZone.endTime - currentZone.startTime));
      zones.push({ ...currentZone });
    }
  }

  return zones.sort((a, b) => a.startTime - b.startTime);
};

/**
 * Checks if a given timestamp is currently inside an active punch zone.
 */
export const isTimePunched = (keyframes = [], time = 0) => {
  const zones = extractPunchZonesFromKeyframes(keyframes);
  const t = Number(time || 0);
  return zones.some(zone => t >= zone.startTime - 0.05 && t <= zone.endTime + 0.05);
};

