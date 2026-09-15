/**
 * studioBeatEngine.js
 * Music Beat-Transient Auto-Snapping & Cut-to-Beat Viral Rhythm Engine.
 * Aligns timeline cuts, B-roll, and punch-ins to musical beats, kicks, and drops.
 */

/**
 * Normalizes beat markers into a structured array with downbeat flags and bar indices.
 * @param {Array} rawMarkers - Array of timestamps or { time, strength } objects
 * @param {number} timeSignatureBeats - Beats per bar (default: 4 for 4/4 time)
 * @returns {Array} Normalized beat objects [{ time, strength, isDownbeat, beatIndex, barIndex }]
 */
export function normalizeBeatMarkers(rawMarkers = [], timeSignatureBeats = 4) {
  if (!Array.isArray(rawMarkers) || !rawMarkers.length) return [];

  const sorted = [...rawMarkers]
    .map((item, idx) => {
      const time = typeof item === "number" ? item : Number(item?.time ?? item?.t ?? 0);
      const strength = typeof item === "object" ? Number(item?.strength ?? item?.energy ?? 1.0) : 1.0;
      return { time, strength, originalIndex: idx };
    })
    .filter(item => Number.isFinite(item.time) && item.time >= 0)
    .sort((a, b) => a.time - b.time);

  return sorted.map((item, idx) => {
    const isDownbeat = idx % timeSignatureBeats === 0 || item.strength > 0.85;
    const barIndex = Math.floor(idx / timeSignatureBeats) + 1;
    const beatIndex = (idx % timeSignatureBeats) + 1;

    return {
      time: Math.round(item.time * 1000) / 1000,
      strength: item.strength,
      isDownbeat,
      barIndex,
      beatIndex,
    };
  });
}

/**
 * Estimates BPM from beat markers.
 * @param {Array} beatMarkers - Normalized beat markers
 * @returns {number|null} Estimated BPM (rounded to nearest integer)
 */
export function calculateBpm(beatMarkers = []) {
  if (!beatMarkers || beatMarkers.length < 2) return null;
  const intervals = [];
  for (let i = 1; i < beatMarkers.length; i += 1) {
    const delta = beatMarkers[i].time - beatMarkers[i - 1].time;
    if (delta > 0.15 && delta < 2.0) {
      intervals.push(delta);
    }
  }
  if (!intervals.length) return null;
  const avgInterval = intervals.reduce((sum, v) => sum + v, 0) / intervals.length;
  const bpm = Math.round(60 / avgInterval);
  return bpm >= 40 && bpm <= 240 ? bpm : null;
}

/**
 * Finds the nearest beat marker to a target time.
 * @param {number} targetTime - Target timestamp in seconds
 * @param {Array} beatMarkers - Array of beat markers
 * @param {number} maxThreshold - Maximum distance to consider snapped (default 0.35s)
 * @returns {Object} { time, nearestBeat, delta, isSnapped }
 */
export function findNearestBeat(targetTime, beatMarkers = [], maxThreshold = 0.35) {
  const safeTime = Math.max(0, Number(targetTime || 0));
  if (!beatMarkers || !beatMarkers.length) {
    return { time: safeTime, nearestBeat: null, delta: 0, isSnapped: false };
  }

  let closest = beatMarkers[0];
  let minDelta = Math.abs(closest.time - safeTime);

  for (let i = 1; i < beatMarkers.length; i += 1) {
    const delta = Math.abs(beatMarkers[i].time - safeTime);
    if (delta < minDelta) {
      minDelta = delta;
      closest = beatMarkers[i];
    }
  }

  const isSnapped = minDelta <= maxThreshold;
  return {
    time: isSnapped ? closest.time : safeTime,
    nearestBeat: closest,
    delta: minDelta,
    isSnapped,
  };
}

/**
 * Automatically shifts timeline clip cuts to align with nearest musical beat transients.
 * When a cut is aligned, subsequent clips naturally ripple downstream.
 * @param {Array} timelineSegments - Video timeline segments
 * @param {Array} beatMarkers - Musical beat markers
 * @param {Object} options - Snapping options { threshold: 0.35, preferDownbeats: true }
 * @returns {Object} { updatedTimeline, cutsAligned, totalShift }
 */
export function alignTimelineCutsToMusicBeats(timelineSegments = [], beatMarkers = [], options = {}) {
  if (!timelineSegments || timelineSegments.length <= 1 || !beatMarkers || !beatMarkers.length) {
    return { updatedTimeline: timelineSegments || [], cutsAligned: 0, totalShift: 0 };
  }

  const threshold = options.threshold ?? 0.35;
  const preferDownbeats = options.preferDownbeats ?? false;
  const activeMarkers = preferDownbeats
    ? beatMarkers.filter(b => b.isDownbeat)
    : beatMarkers;

  let cutsAligned = 0;
  let totalShift = 0;
  let runningOutputTime = 0;

  const updatedTimeline = timelineSegments.map((clip, index) => {
    const rawStart = Number(clip.startRequest ?? clip.start_time ?? clip.start ?? 0);
    const rawEnd = Number(clip.endRequest ?? clip.end_time ?? clip.end);
    let duration = Math.max(
      0.08,
      Number.isFinite(rawEnd) && rawEnd > rawStart ? rawEnd - rawStart : Number(clip.duration) || 0.08
    );

    // If it's not the last clip, calculate where its cut lands on the timeline
    if (index < timelineSegments.length - 1) {
      const naturalCutTime = runningOutputTime + duration;
      const snapResult = findNearestBeat(naturalCutTime, activeMarkers.length ? activeMarkers : beatMarkers, threshold);

      if (snapResult.isSnapped && Math.abs(snapResult.time - naturalCutTime) > 0.02) {
        const delta = snapResult.time - naturalCutTime;
        const newDuration = Math.max(0.2, duration + delta);
        const appliedDelta = newDuration - duration;

        duration = newDuration;
        cutsAligned += 1;
        totalShift += Math.abs(appliedDelta);

        runningOutputTime += duration;
        return {
          ...clip,
          duration,
          endRequest: rawStart + duration,
          end_time: rawStart + duration,
          end: rawStart + duration,
        };
      }
    }

    runningOutputTime += duration;
    return {
      ...clip,
      duration,
    };
  });

  return {
    updatedTimeline,
    cutsAligned,
    totalShift: Math.round(totalShift * 1000) / 1000,
  };
}

/**
 * Snaps B-roll overlay clips to musical beat markers.
 * @param {Array} brollClips - B-roll overlays
 * @param {Array} beatMarkers - Musical beat markers
 * @param {number} threshold - Snapping tolerance (default: 0.3s)
 * @returns {Object} { updatedBRoll, alignedCount }
 */
export function alignBRollToMusicBeats(brollClips = [], beatMarkers = [], threshold = 0.3) {
  if (!brollClips || !brollClips.length || !beatMarkers || !beatMarkers.length) {
    return { updatedBRoll: brollClips || [], alignedCount: 0 };
  }

  let alignedCount = 0;
  const updatedBRoll = brollClips.map(clip => {
    const currentStart = Number(clip.startTime ?? clip.start_time ?? clip.start ?? 0);
    const currentDuration = Number(clip.duration || 3);
    const currentEnd = currentStart + currentDuration;

    const snapStart = findNearestBeat(currentStart, beatMarkers, threshold);
    const newStart = snapStart.isSnapped ? snapStart.time : currentStart;

    const snapEnd = findNearestBeat(currentEnd, beatMarkers, threshold);
    const newEnd = snapEnd.isSnapped ? snapEnd.time : currentEnd;

    const newDuration = Math.max(0.4, newEnd - newStart);
    if (snapStart.isSnapped || snapEnd.isSnapped) {
      alignedCount += 1;
    }

    return {
      ...clip,
      startTime: newStart,
      start_time: newStart,
      duration: newDuration,
    };
  });

  return { updatedBRoll, alignedCount };
}

/**
 * Auto-generates punch-in keyframes on musical beat drops.
 * @param {Array} beatMarkers - Musical beat markers
 * @param {number} sequenceDuration - Total sequence duration
 * @param {string} cadence - 'drops' (every 4th bar), 'bars' (every bar), or 'kicks' (every 2 beats)
 * @param {number} punchScale - Scale multiplier (e.g. 1.25)
 * @returns {Array} Scale keyframes array
 */
export function generateBeatPunchIns(
  beatMarkers = [],
  sequenceDuration = 30,
  cadence = "bars",
  punchScale = 1.25
) {
  if (!beatMarkers || !beatMarkers.length) return [];

  const intervalStep = cadence === "drops" ? 16 : cadence === "bars" ? 4 : 2;
  const punchHoldDuration = 0.45;
  const punchKeyframes = [];

  for (let i = 0; i < beatMarkers.length; i += intervalStep) {
    const beatTime = beatMarkers[i].time;
    if (beatTime + punchHoldDuration > sequenceDuration) break;

    const punchId = `beat-punch-${Math.round(beatTime * 100)}`;
    punchKeyframes.push(
      {
        targetId: "main-video",
        property: "scale",
        time: beatTime,
        value: punchScale,
        easing: "ease_out",
        punchId,
        punchStart: beatTime,
        punchEnd: beatTime + punchHoldDuration,
      },
      {
        targetId: "main-video",
        property: "scale",
        time: beatTime + punchHoldDuration,
        value: 1.0,
        easing: "ease_in_out",
        punchId,
        punchStart: beatTime,
        punchEnd: beatTime + punchHoldDuration,
      }
    );
  }

  return punchKeyframes;
}

