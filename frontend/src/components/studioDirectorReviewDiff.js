import { validateStudioProjectDocument } from "./studioProjectDocument";

const range = value => value
  ? { startTick: value.startTick, endTick: value.endTick }
  : null;
const point = value => Number.isSafeInteger(value) ? { atTick: value } : null;
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const indexed = (items, keyFor) => {
  const seen = new Map();
  return items.map((item, index) => {
    const base = keyFor(item, index);
    const ordinal = seen.get(base) || 0;
    seen.set(base, ordinal + 1);
    return { ...item, key: `${base}#${ordinal}` };
  });
};

const clipRows = document => indexed(document.clipOccurrences.map(occurrence => ({
  id: occurrence.occurrenceId,
  label: `Clip ${occurrence.occurrenceId}`,
  sourceRange: range(occurrence.sourceRange),
  programmeRange: range(occurrence.programmeRange),
})), item => `clip:${item.id}`);

const timingRows = document => {
  const cues = Object.entries(document.linkedTiming?.cues || {}).flatMap(([track, entries]) =>
    indexed(entries.map(cue => ({
      id: cue.cueId,
      label: `${track} cue ${cue.cueId}`,
      sourceRange: point(cue.sourceStartTick),
      programmeRange: range(cue.programmeRange),
      trimStartTick: cue.trimStartTick ?? null,
    })), item => `cue:${track}:${item.id}`));
  const keys = Object.entries(document.linkedTiming?.keys || {}).flatMap(([track, entries]) =>
    indexed(entries.map((key, index) => ({
      id: String(key.parameters?.id || `${track}-${index + 1}`),
      label: `${track} key ${key.parameters?.id || index + 1}`,
      sourceRange: null,
      programmeRange: point(key.atProgrammeTick),
      trimStartTick: null,
      parameters: key.parameters,
    })), item => `key:${track}:${item.parameters?.id || JSON.stringify(item.parameters)}`));
  const speeds = indexed((document.programmeSpeedKeys || []).map((key, index) => ({
    id: `speed-${index + 1}`,
    label: `Speed key ${index + 1} (${key.rate}×)`,
    sourceRange: null,
    programmeRange: point(key.atProgrammeTick),
    trimStartTick: null,
    rate: key.rate,
    easing: key.easing,
  })), item => `speed:${item.rate}:${item.easing}`);
  const layers = indexed((document.layers || []).map(layer => ({
    id: layer.layerId,
    label: `${layer.type} layer ${layer.layerId}`,
    sourceRange: range(layer.sourceRange),
    programmeRange: range(layer.programmeRange),
    trimStartTick: null,
  })), item => `layer:${item.id}`);
  return [...cues, ...keys, ...speeds, ...layers];
};

const changedRows = (before, after) => {
  const previous = new Map(before.map(row => [row.key, row]));
  const next = new Map(after.map(row => [row.key, row]));
  const order = [...previous.keys(), ...[...next.keys()].filter(key => !previous.has(key))];
  return order.flatMap(key => {
    const left = previous.get(key);
    const right = next.get(key);
    const beforeSourceRange = left?.sourceRange || null;
    const afterSourceRange = right?.sourceRange || null;
    const beforeProgrammeRange = left?.programmeRange || null;
    const afterProgrammeRange = right?.programmeRange || null;
    const beforeTrimStartTick = left?.trimStartTick ?? null;
    const afterTrimStartTick = right?.trimStartTick ?? null;
    if (same([beforeSourceRange, beforeProgrammeRange, beforeTrimStartTick],
      [afterSourceRange, afterProgrammeRange, afterTrimStartTick])) return [];
    return [{
      id: right?.id || left?.id,
      label: right?.label || left?.label,
      beforeSourceRange,
      afterSourceRange,
      beforeProgrammeRange,
      afterProgrammeRange,
      beforeTrimStartTick,
      afterTrimStartTick,
    }];
  });
};

// These rows describe the exact canonical dry run. The UI formats ticks; it
// does not infer timing from React state or replay an operation independently.
export const describeStudioDirectorReview = ({ document, previewDocument, proposal }) => {
  validateStudioProjectDocument(document);
  validateStudioProjectDocument(previewDocument);
  if (document.projectId !== previewDocument.projectId ||
      document.projectId !== proposal?.projectId ||
      document.revision !== proposal.baseRevision) {
    throw new Error("Director review documents do not match the proposal base.");
  }
  const operation = proposal.batch?.operations?.[0];
  if (!operation || proposal.batch.operations.length !== 1 ||
      !["split_clip", "trim_clip"].includes(operation.type)) {
    throw new Error("Director review requires one split or trim operation.");
  }
  return {
    operationLabel: operation.type === "split_clip" ? "Split clip" : "Trim clip",
    clipRows: changedRows(clipRows(document), clipRows(previewDocument)),
    timingRows: changedRows(timingRows(document), timingRows(previewDocument)),
  };
};
