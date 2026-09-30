import { createOutputTimeMap, createTimeRange, secondsToTicks, ticksToSeconds } from "./studioTime";
import { validateStudioProjectDocument } from "./studioProjectDocument";

const fail = (code, message) => {
  const error = new Error(message);
  error.code = code;
  throw error;
};

// This compiler covers the migrated sequence boundary. Legacy overlays,
// motion, audio and hook transformations still use their existing render paths.
export const compileStudioTimelineForRender = document => {
  validateStudioProjectDocument(document);
  return document.clipOccurrences.map(occurrence => {
    const asset = document.assets.find(item => item.assetId === occurrence.assetId);
    return {
      id: occurrence.occurrenceId,
      source_clip_id: asset.sourceId,
      start_time: ticksToSeconds(occurrence.sourceRange.startTick),
      end_time: ticksToSeconds(occurrence.sourceRange.endTick),
      duration: ticksToSeconds(occurrence.sourceRange.endTick - occurrence.sourceRange.startTick),
    };
  });
};

export const assertStudioExportTimelineMatchesDocument = (document, renderSegments) => {
  const expected = compileStudioTimelineForRender(document);
  if (!Array.isArray(renderSegments) || renderSegments.length !== expected.length) {
    fail("RENDER_TIMELINE_MISMATCH", "Render clip count differs from the canonical edit document.");
  }
  expected.forEach((segment, index) => {
    const actual = renderSegments[index];
    const actualStart = Number(actual?.start_time);
    const actualEnd = Number(actual?.end_time);
    const actualDuration = Number(actual?.duration);
    // round(end - start) can differ from round(end) - round(start). Compare
    // canonical endpoints, then check duration against its own raw endpoints.
    if (
      String(actual?.id) !== segment.id ||
      String(actual?.source_clip_id) !== segment.source_clip_id ||
      !Number.isFinite(actualStart) || actualStart < 0 ||
      !Number.isFinite(actualEnd) || actualEnd <= actualStart ||
      !Number.isFinite(actualDuration) || actualDuration <= 0 ||
      secondsToTicks(actualStart) !== secondsToTicks(segment.start_time) ||
      secondsToTicks(actualEnd) !== secondsToTicks(segment.end_time) ||
      secondsToTicks(actualDuration) !== secondsToTicks(actualEnd - actualStart)
    ) {
      fail(
        "RENDER_TIMELINE_MISMATCH",
        `Render clip ${index + 1} differs from the canonical edit document.`
      );
    }
  });
  return true;
};

export const assertStudioSpeedPlanMatchesDocument = (document, renderSpeedSegments) => {
  validateStudioProjectDocument(document);
  if (
    !Array.isArray(renderSpeedSegments) ||
    (document.clipOccurrences.length > 0 && renderSpeedSegments.length === 0)
  ) {
    fail("RENDER_SPEED_MISMATCH", "Render speed plan is missing.");
  }
  const durationTick = document.clipOccurrences.at(-1)?.programmeRange.endTick || 0;
  let actual;
  try {
    actual = createOutputTimeMap(
      durationTick,
      renderSpeedSegments.map(segment => ({
        programmeRange: createTimeRange(
          "programme",
          secondsToTicks(Number(segment.startTime ?? segment.start_time)),
          secondsToTicks(Number(segment.endTime ?? segment.end_time))
        ),
        rate: Number(segment.rate),
      }))
    );
  } catch (error) {
    fail("RENDER_SPEED_MISMATCH", `Render speed plan is invalid: ${error.message}`);
  }
  const sameMap = actual.length === document.outputTimeMap.length && actual.every((segment, index) => {
    const expected = document.outputTimeMap[index];
    return segment.rateNumerator === expected.rateNumerator &&
      segment.rateDenominator === expected.rateDenominator &&
      ["programmeRange", "outputRange"].every(field =>
        ["space", "startTick", "endTick"].every(key => segment[field][key] === expected[field][key]));
  });
  if (!sameMap) {
    fail("RENDER_SPEED_MISMATCH", "Render speed plan differs from the canonical output time map.");
  }
  return true;
};
