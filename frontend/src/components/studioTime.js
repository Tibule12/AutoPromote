// Studio's domain clock. Ranges are half-open integer ticks; seconds are only
// converted at browser/render boundaries. 90 kHz exactly represents common
// video frame rates (including 30000/1001) and whole millisecond positions.
export const TICKS_PER_SECOND = 90000;

export const STUDIO_TIME_SPACES = Object.freeze({
  SOURCE: "source",
  PROGRAMME: "programme",
  CLIP_LOCAL: "clip_local",
  OUTPUT: "output",
});

const TIME_SPACES = new Set(Object.values(STUDIO_TIME_SPACES));

const assertTick = (tick, label = "tick") => {
  if (!Number.isSafeInteger(tick) || tick < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer tick`);
  }
  return tick;
};

const asSafeNumber = (value, label) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number))
    throw new RangeError(`${label} exceeds the safe integer range`);
  return number;
};

const roundRatio = (numerator, denominator, mode = "nearest") => {
  if (denominator <= 0n) throw new RangeError("denominator must be positive");
  if (numerator < 0n) throw new RangeError("media time must be non-negative");
  if (mode === "floor") return numerator / denominator;
  if (mode === "ceil") return (numerator + denominator - 1n) / denominator;
  if (mode === "nearest") return (numerator + denominator / 2n) / denominator;
  throw new RangeError(`unsupported rounding mode: ${mode}`);
};

export const secondsToTicks = seconds => {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0)
    throw new RangeError("seconds must be finite and non-negative");
  return asSafeNumber(Math.round(value * TICKS_PER_SECOND), "time");
};

export const ticksToSeconds = ticks => assertTick(ticks) / TICKS_PER_SECOND;

export const createTimeRange = (timeSpace, startTick, endTick) => {
  if (!TIME_SPACES.has(timeSpace)) throw new RangeError(`unknown time space: ${timeSpace}`);
  assertTick(startTick, "startTick");
  assertTick(endTick, "endTick");
  if (endTick < startTick) throw new RangeError("endTick must be at or after startTick");
  return { space: timeSpace, startTick, endTick };
};

const requireTimeRange = (timeSpace, range) => {
  if (range?.space !== timeSpace) throw new RangeError(`expected a ${timeSpace} time range`);
  return createTimeRange(timeSpace, range.startTick, range.endTick);
};

export const intersectTimeRanges = (left, right) => {
  if (left?.space !== right?.space) throw new RangeError("time spaces must match");
  const a = createTimeRange(left.space, left.startTick, left.endTick);
  const b = createTimeRange(right.space, right.startTick, right.endTick);
  const startTick = Math.max(a.startTick, b.startTick);
  const endTick = Math.min(a.endTick, b.endTick);
  return endTick > startTick ? createTimeRange(a.space, startTick, endTick) : null;
};

export const containsTick = (range, tick) => {
  createTimeRange(range.space, range.startTick, range.endTick);
  return assertTick(tick) >= range.startTick && tick < range.endTick;
};

// Rounding happens once at each media boundary. The rational form avoids
// 29.97 fps and 48 kHz drift when long projects are converted repeatedly.
export const ticksToFrameIndex = (ticks, fpsNumerator, fpsDenominator = 1, mode = "nearest") => {
  assertTick(ticks);
  assertTick(fpsNumerator, "fpsNumerator");
  assertTick(fpsDenominator, "fpsDenominator");
  if (!fpsNumerator || !fpsDenominator) throw new RangeError("frame rate must be positive");
  return asSafeNumber(
    roundRatio(
      BigInt(ticks) * BigInt(fpsNumerator),
      BigInt(TICKS_PER_SECOND) * BigInt(fpsDenominator),
      mode
    ),
    "frame index"
  );
};

export const frameIndexToTicks = (
  frameIndex,
  fpsNumerator,
  fpsDenominator = 1,
  mode = "nearest"
) => {
  assertTick(frameIndex, "frameIndex");
  assertTick(fpsNumerator, "fpsNumerator");
  assertTick(fpsDenominator, "fpsDenominator");
  if (!fpsNumerator || !fpsDenominator) throw new RangeError("frame rate must be positive");
  return asSafeNumber(
    roundRatio(
      BigInt(frameIndex) * BigInt(TICKS_PER_SECOND) * BigInt(fpsDenominator),
      BigInt(fpsNumerator),
      mode
    ),
    "frame tick"
  );
};

export const ticksToSampleIndex = (ticks, sampleRate, mode = "nearest") => {
  assertTick(ticks);
  assertTick(sampleRate, "sampleRate");
  if (!sampleRate) throw new RangeError("sample rate must be positive");
  return asSafeNumber(
    roundRatio(BigInt(ticks) * BigInt(sampleRate), BigInt(TICKS_PER_SECOND), mode),
    "sample index"
  );
};

export const sampleIndexToTicks = (sampleIndex, sampleRate, mode = "nearest") => {
  assertTick(sampleIndex, "sampleIndex");
  assertTick(sampleRate, "sampleRate");
  if (!sampleRate) throw new RangeError("sample rate must be positive");
  return asSafeNumber(
    roundRatio(BigInt(sampleIndex) * BigInt(TICKS_PER_SECOND), BigInt(sampleRate), mode),
    "sample tick"
  );
};

// One occurrence is one use of an immutable source. Two uses of the same
// source have different IDs and can map a source caption to two programme spans.
export const createClipOccurrence = ({
  occurrenceId,
  sourceAssetId,
  sourceRange,
  programmeRange,
  direction = "forward",
  anchorSourceTick,
}) => {
  if (!occurrenceId || !sourceAssetId)
    throw new RangeError("occurrence and source asset IDs are required");
  if (!["forward", "reverse", "freeze"].includes(direction)) {
    throw new RangeError(`unsupported clip direction: ${direction}`);
  }
  const source = requireTimeRange("source", sourceRange);
  const programme = requireTimeRange("programme", programmeRange);
  const programmeDuration = programme.endTick - programme.startTick;
  if (!programmeDuration)
    throw new RangeError("clip occurrence must have positive programme duration");
  if (direction === "freeze") {
    assertTick(anchorSourceTick, "anchorSourceTick");
    if (anchorSourceTick < source.startTick || anchorSourceTick >= source.endTick) {
      throw new RangeError("freeze anchor must be inside its source range");
    }
  } else if (source.endTick - source.startTick !== programmeDuration) {
    throw new RangeError(
      "forward/reverse clip source and programme durations must match; use the output speed map for speed changes"
    );
  }
  return {
    occurrenceId: String(occurrenceId),
    sourceAssetId: String(sourceAssetId),
    sourceRange: source,
    programmeRange: programme,
    direction,
    ...(direction === "freeze" ? { anchorSourceTick } : {}),
  };
};

export const mapProgrammeTickToSource = (occurrences, programmeTick) => {
  assertTick(programmeTick, "programmeTick");
  const occurrence = (occurrences || []).find(item =>
    containsTick(item.programmeRange, programmeTick)
  );
  if (!occurrence) return null;
  const localTick = programmeTick - occurrence.programmeRange.startTick;
  const sourceTick =
    occurrence.direction === "freeze"
      ? occurrence.anchorSourceTick
      : occurrence.direction === "reverse"
        ? occurrence.sourceRange.endTick - localTick - 1
        : occurrence.sourceRange.startTick + localTick;
  return {
    occurrenceId: occurrence.occurrenceId,
    sourceAssetId: occurrence.sourceAssetId,
    sourceTick,
    clipLocalTick: localTick,
  };
};

export const mapSourceRangeToProgrammeRanges = (occurrences, sourceAssetId, sourceRange) => {
  const source = requireTimeRange("source", sourceRange);
  return (occurrences || []).flatMap(occurrence => {
    if (String(occurrence.sourceAssetId) !== String(sourceAssetId)) return [];
    if (occurrence.direction === "freeze") {
      return containsTick(source, occurrence.anchorSourceTick)
        ? [{ occurrenceId: occurrence.occurrenceId, programmeRange: occurrence.programmeRange }]
        : [];
    }
    const visible = intersectTimeRanges(source, occurrence.sourceRange);
    if (!visible) return [];
    const startTick =
      occurrence.programmeRange.startTick +
      (occurrence.direction === "reverse"
        ? occurrence.sourceRange.endTick - visible.endTick
        : visible.startTick - occurrence.sourceRange.startTick);
    return [
      {
        occurrenceId: occurrence.occurrenceId,
        programmeRange: createTimeRange(
          "programme",
          startTick,
          startTick + visible.endTick - visible.startTick
        ),
      },
    ];
  });
};

export const splitClipOccurrence = (occurrence, programmeTick, rightOccurrenceId) => {
  const clip = createClipOccurrence(occurrence);
  if (!rightOccurrenceId || String(rightOccurrenceId) === clip.occurrenceId) {
    throw new RangeError("split requires a distinct right occurrence ID");
  }
  if (
    programmeTick <= clip.programmeRange.startTick ||
    programmeTick >= clip.programmeRange.endTick
  ) {
    throw new RangeError("split tick must be inside the occurrence");
  }
  const leftDuration = programmeTick - clip.programmeRange.startTick;
  const sourceCut =
    clip.direction === "reverse"
      ? clip.sourceRange.endTick - leftDuration
      : clip.sourceRange.startTick + leftDuration;
  const leftSource =
    clip.direction === "freeze"
      ? clip.sourceRange
      : createTimeRange(
          "source",
          clip.direction === "reverse" ? sourceCut : clip.sourceRange.startTick,
          clip.direction === "reverse" ? clip.sourceRange.endTick : sourceCut
        );
  const rightSource =
    clip.direction === "freeze"
      ? clip.sourceRange
      : createTimeRange(
          "source",
          clip.direction === "reverse" ? clip.sourceRange.startTick : sourceCut,
          clip.direction === "reverse" ? sourceCut : clip.sourceRange.endTick
        );
  return [
    createClipOccurrence({
      ...clip,
      sourceRange: leftSource,
      programmeRange: createTimeRange("programme", clip.programmeRange.startTick, programmeTick),
    }),
    createClipOccurrence({
      ...clip,
      occurrenceId: rightOccurrenceId,
      sourceRange: rightSource,
      programmeRange: createTimeRange("programme", programmeTick, clip.programmeRange.endTick),
    }),
  ];
};

export const trimClipOccurrence = (occurrence, programmeRange) => {
  const clip = createClipOccurrence(occurrence);
  const retained = requireTimeRange("programme", programmeRange);
  if (
    retained.startTick < clip.programmeRange.startTick ||
    retained.endTick > clip.programmeRange.endTick ||
    retained.startTick === retained.endTick
  ) {
    throw new RangeError("trim must retain a positive range inside the occurrence");
  }
  if (clip.direction === "freeze")
    return createClipOccurrence({ ...clip, programmeRange: retained });
  const leftTrim = retained.startTick - clip.programmeRange.startTick;
  const rightTrim = clip.programmeRange.endTick - retained.endTick;
  const sourceRange =
    clip.direction === "reverse"
      ? createTimeRange(
          "source",
          clip.sourceRange.startTick + rightTrim,
          clip.sourceRange.endTick - leftTrim
        )
      : createTimeRange(
          "source",
          clip.sourceRange.startTick + leftTrim,
          clip.sourceRange.endTick - rightTrim
        );
  return createClipOccurrence({ ...clip, sourceRange, programmeRange: retained });
};

export const reorderClipOccurrences = (occurrences, orderedOccurrenceIds) => {
  const clips = new Map(
    (occurrences || []).map(clip => [String(clip.occurrenceId), createClipOccurrence(clip)])
  );
  if (
    clips.size !== (occurrences || []).length ||
    !Array.isArray(orderedOccurrenceIds) ||
    orderedOccurrenceIds.length !== clips.size ||
    new Set(orderedOccurrenceIds.map(String)).size !== clips.size
  ) {
    throw new RangeError("reorder must name every occurrence exactly once");
  }
  let cursor = 0;
  return orderedOccurrenceIds.map(id => {
    const clip = clips.get(String(id));
    if (!clip) throw new RangeError(`unknown occurrence: ${id}`);
    const duration = clip.programmeRange.endTick - clip.programmeRange.startTick;
    const rebased = createClipOccurrence({
      ...clip,
      programmeRange: createTimeRange("programme", cursor, cursor + duration),
    });
    cursor += duration;
    return rebased;
  });
};

const speedRatio = segment => {
  if (segment.rateNumerator !== undefined || segment.rateDenominator !== undefined) {
    const numerator = assertTick(segment.rateNumerator, "rateNumerator");
    const denominator = assertTick(segment.rateDenominator, "rateDenominator");
    if (!numerator || !denominator) throw new RangeError("speed ratio must be positive");
    return [numerator, denominator];
  }
  const rate = Number(segment.rate);
  if (!Number.isFinite(rate) || rate <= 0) throw new RangeError("speed rate must be positive");
  const numerator = asSafeNumber(Math.round(rate * 1000000), "speed rate");
  if (!numerator) throw new RangeError("speed rate is below rational precision");
  return [numerator, 1000000];
};

export const createOutputTimeMap = (programmeDurationTick, speedSegments = []) => {
  assertTick(programmeDurationTick, "programmeDurationTick");
  if (!programmeDurationTick) return [];
  const segments = speedSegments.length
    ? speedSegments
    : [
        {
          programmeRange: createTimeRange("programme", 0, programmeDurationTick),
          rateNumerator: 1,
          rateDenominator: 1,
        },
      ];
  let programmeCursor = 0;
  let outputCursor = 0;
  const result = segments.map(segment => {
    const programmeRange = requireTimeRange("programme", segment.programmeRange);
    if (
      programmeRange.startTick !== programmeCursor ||
      programmeRange.endTick <= programmeCursor ||
      programmeRange.endTick > programmeDurationTick
    ) {
      throw new RangeError(
        "speed segments must partition the entire programme range without gaps or overlaps"
      );
    }
    const [rateNumerator, rateDenominator] = speedRatio(segment);
    const durationTick = asSafeNumber(
      roundRatio(
        BigInt(programmeRange.endTick - programmeRange.startTick) * BigInt(rateDenominator),
        BigInt(rateNumerator)
      ),
      "output duration"
    );
    if (!durationTick) throw new RangeError("speed segment is shorter than one output tick");
    const outputRange = createTimeRange("output", outputCursor, outputCursor + durationTick);
    programmeCursor = programmeRange.endTick;
    outputCursor = outputRange.endTick;
    return { programmeRange, outputRange, rateNumerator, rateDenominator };
  });
  if (programmeCursor !== programmeDurationTick) {
    throw new RangeError("speed segments do not cover the full programme duration");
  }
  return result;
};

export const mapProgrammeTickToOutputTick = (timeMap, programmeTick) => {
  assertTick(programmeTick, "programmeTick");
  const last = timeMap?.[timeMap.length - 1];
  if (!last) return null;
  if (programmeTick === last.programmeRange.endTick) return last.outputRange.endTick;
  const segment = timeMap.find(item => containsTick(item.programmeRange, programmeTick));
  if (!segment) return null;
  const offset = asSafeNumber(
    roundRatio(
      BigInt(programmeTick - segment.programmeRange.startTick) * BigInt(segment.rateDenominator),
      BigInt(segment.rateNumerator)
    ),
    "output tick"
  );
  return Math.min(segment.outputRange.endTick, segment.outputRange.startTick + offset);
};

export const mapOutputTickToProgrammeTick = (timeMap, outputTick) => {
  assertTick(outputTick, "outputTick");
  const last = timeMap?.[timeMap.length - 1];
  if (!last) return null;
  if (outputTick === last.outputRange.endTick) return last.programmeRange.endTick;
  const segment = timeMap.find(item => containsTick(item.outputRange, outputTick));
  if (!segment) return null;
  const offset = asSafeNumber(
    roundRatio(
      BigInt(outputTick - segment.outputRange.startTick) * BigInt(segment.rateNumerator),
      BigInt(segment.rateDenominator)
    ),
    "programme tick"
  );
  return Math.min(segment.programmeRange.endTick, segment.programmeRange.startTick + offset);
};

export const mapProgrammeRangeToOutputRanges = (timeMap, programmeRange) => {
  const range = requireTimeRange("programme", programmeRange);
  return (timeMap || []).flatMap(segment => {
    const visible = intersectTimeRanges(range, segment.programmeRange);
    if (!visible) return [];
    const startTick = mapProgrammeTickToOutputTick(timeMap, visible.startTick);
    const endTick = mapProgrammeTickToOutputTick(timeMap, visible.endTick);
    return endTick > startTick ? [createTimeRange("output", startTick, endTick)] : [];
  });
};

export const mapSourceCaptionToOutputRanges = (occurrences, timeMap, sourceAssetId, sourceRange) =>
  mapSourceRangeToProgrammeRanges(occurrences, sourceAssetId, sourceRange).flatMap(mapped =>
    mapProgrammeRangeToOutputRanges(timeMap, mapped.programmeRange).map(outputRange => ({
      occurrenceId: mapped.occurrenceId,
      outputRange,
    }))
  );
