import { getStudioCapability } from "./studioCapabilities";
import {
  applyStudioCommandInverse,
  createStudioCommandInverse,
  latestUndoableStudioCommand,
} from "./studioCommandHistory";
import {
  buildStudioLayersFromSnapshot,
  buildStudioLinkedTimingFromSnapshot,
  buildStudioOutputTimeMap,
  projectStudioLinkedTimingToSnapshot,
  projectDocumentToLegacyTimeline,
  reconcileStudioDocument,
  validateStudioProjectDocument,
} from "./studioProjectDocument";
import { mapOutputTickToProgrammeTick, TICKS_PER_SECOND } from "./studioTime";
import {
  rippleProgrammeSpeedKeys,
  rippleStudioSnapshotLinkedTimeline,
  studioTrimGaps,
} from "./studioTrimTransaction";

const commandError = (code, message, details = {}) => {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  throw error;
};

const expectKeys = (value, keys, name) => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    commandError("INVALID_COMMAND", `${name} must be an object.`);
  const unknown = Object.keys(value).filter(key => !keys.includes(key));
  if (unknown.length)
    commandError("UNSUPPORTED_PARAMETER", `${name} has unsupported field ${unknown[0]}.`, {
      field: unknown[0],
    });
};

const validTick = value => Number.isSafeInteger(value) && value >= 0;
const stableStringify = value =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map(key => [key, item[key]])
        )
      : item
  );
const validRange = (range, space) => {
  expectKeys(range, ["space", "startTick", "endTick"], "range");
  if (
    range.space !== space ||
    !validTick(range.startTick) ||
    !validTick(range.endTick) ||
    range.endTick <= range.startTick
  ) {
    commandError("INVALID_TIME_RANGE", `Expected a half-open ${space} range in integer ticks.`);
  }
};

const checkId = (value, name) => {
  if (typeof value !== "string" || !value.trim() || value.length > 160)
    commandError("INVALID_COMMAND", `${name} must be a nonempty ID.`);
};

export const validateStudioCommandBatch = batch => {
  expectKeys(
    batch,
    ["projectId", "baseRevision", "idempotencyKey", "actor", "operations"],
    "batch"
  );
  checkId(batch.projectId, "projectId");
  checkId(batch.idempotencyKey, "idempotencyKey");
  if (!Number.isSafeInteger(batch.baseRevision) || batch.baseRevision < 0)
    commandError("INVALID_REVISION", "baseRevision must be a nonnegative integer.");
  expectKeys(batch.actor, ["type", "id"], "actor");
  if (!["human", "ai", "system"].includes(batch.actor.type))
    commandError("INVALID_ACTOR", "Unknown actor type.");
  checkId(batch.actor.id, "actor.id");
  if (!Array.isArray(batch.operations) || !batch.operations.length || batch.operations.length > 100)
    commandError("INVALID_COMMAND", "A batch needs 1–100 operations.");
  batch.operations.forEach(operation => {
    if (!operation || typeof operation !== "object")
      commandError("INVALID_COMMAND", "Operation must be an object.");
    const capability = getStudioCapability(operation.type);
    if (!capability?.executable)
      commandError(
        "UNSUPPORTED_CAPABILITY",
        `Capability ${operation.type || "unknown"} is unavailable.`
      );
    if (operation.type === "split_clip") {
      expectKeys(
        operation,
        ["type", "target", "at", "newOccurrenceIds", "preconditions"],
        "split_clip"
      );
      expectKeys(operation.target, ["occurrenceId"], "target");
      checkId(operation.target.occurrenceId, "occurrenceId");
      expectKeys(operation.at, ["space", "ticks"], "at");
      if (
        !["source", "programme", "clip_local", "output"].includes(operation.at.space) ||
        !validTick(operation.at.ticks)
      ) {
        commandError(
          "INVALID_TIME_POINT",
          "Split point needs declared time space and integer ticks."
        );
      }
      expectKeys(operation.newOccurrenceIds, ["left", "right"], "newOccurrenceIds");
      checkId(operation.newOccurrenceIds.left, "left occurrence ID");
      checkId(operation.newOccurrenceIds.right, "right occurrence ID");
      if (operation.newOccurrenceIds.left === operation.newOccurrenceIds.right)
        commandError("DUPLICATE_OCCURRENCE", "Split IDs must differ.");
    } else if (operation.type === "trim_clip") {
      expectKeys(operation, ["type", "target", "keep", "preconditions"], "trim_clip");
      expectKeys(operation.target, ["occurrenceId"], "target");
      checkId(operation.target.occurrenceId, "occurrenceId");
      validRange(operation.keep, "source");
    } else if (operation.type === "preserve_range") {
      expectKeys(
        operation,
        ["type", "target", "range", "lockId", "preconditions"],
        "preserve_range"
      );
      expectKeys(operation.target, ["occurrenceId"], "target");
      checkId(operation.target.occurrenceId, "occurrenceId");
      checkId(operation.lockId, "lockId");
      validRange(operation.range, "source");
    } else {
      commandError("UNSUPPORTED_CAPABILITY", `No command executor for ${operation.type}.`);
    }
    if (operation.preconditions !== undefined) {
      expectKeys(operation.preconditions, ["sourceRange"], "preconditions");
      if (operation.preconditions.sourceRange)
        validRange(operation.preconditions.sourceRange, "source");
    }
  });
  return batch;
};

const overlap = (a, b) => a.startTick < b.endTick && b.startTick < a.endTick;

const sourcePoint = (operation, occurrence, document) => {
  const { space, ticks } = operation.at;
  if (space === "source") return ticks;
  if (space === "clip_local") return occurrence.sourceRange.startTick + ticks;
  const programmeTick =
    space === "output" ? mapOutputTickToProgrammeTick(document.outputTimeMap, ticks) : ticks;
  if (programmeTick === null)
    commandError("INVALID_TIME_POINT", "Output split point is outside the mapped programme.");
  return occurrence.sourceRange.startTick + programmeTick - occurrence.programmeRange.startTick;
};

const assertUnlocked = (locks, occurrenceId, range) => {
  const conflict = locks.find(
    lock => lock.occurrenceId === occurrenceId && overlap(lock.sourceRange, range)
  );
  if (conflict)
    commandError("LOCKED_RANGE", `Edit intersects preserved range ${conflict.lockId}.`, {
      lockId: conflict.lockId,
    });
};

const reflow = document => {
  let programmeTick = 0;
  const clipOccurrences = document.clipOccurrences.map(occurrence => {
    const duration = occurrence.sourceRange.endTick - occurrence.sourceRange.startTick;
    const next = {
      ...occurrence,
      programmeRange: {
        space: "programme",
        startTick: programmeTick,
        endTick: programmeTick + duration,
      },
      timeMapId: `map:${occurrence.occurrenceId}`,
    };
    programmeTick += duration;
    return next;
  });
  return {
    ...document,
    clipOccurrences,
    timeMaps: clipOccurrences.map(occurrence => ({
      timeMapId: occurrence.timeMapId,
      occurrenceId: occurrence.occurrenceId,
      segments: [
        {
          sourceRange: occurrence.sourceRange,
          clipLocalRange: {
            space: "clip_local",
            startTick: 0,
            endTick: occurrence.sourceRange.endTick - occurrence.sourceRange.startTick,
          },
          programmeRange: occurrence.programmeRange,
          rate: { numerator: 1, denominator: 1 },
          direction: "forward",
          freeze: false,
        },
      ],
    })),
    outputTimeMap: buildStudioOutputTimeMap({
      durationTick: programmeTick,
      programmeSpeedKeys: document.programmeSpeedKeys,
      fallbackSpeed: document.fallbackSpeed,
    }),
  };
};

const applyOne = (document, operation, idempotencyKey) => {
  const index = document.clipOccurrences.findIndex(
    item => item.occurrenceId === operation.target.occurrenceId
  );
  if (index < 0)
    commandError(
      "OCCURRENCE_NOT_FOUND",
      `Occurrence ${operation.target.occurrenceId} does not exist.`
    );
  const occurrence = document.clipOccurrences[index];
  if (occurrence.playback?.freeze || occurrence.playback?.direction === "reverse") {
    commandError(
      "UNSUPPORTED_TIME_MAPPING",
      "This edit is not enabled for frozen or reversed occurrences."
    );
  }
  const expected = operation.preconditions?.sourceRange;
  if (
    expected &&
    (expected.startTick !== occurrence.sourceRange.startTick ||
      expected.endTick !== occurrence.sourceRange.endTick)
  ) {
    commandError("PRECONDITION_FAILED", "Occurrence source range changed.");
  }
  if (operation.type === "preserve_range") {
    if (
      operation.range.startTick < occurrence.sourceRange.startTick ||
      operation.range.endTick > occurrence.sourceRange.endTick
    ) {
      commandError("INVALID_TIME_RANGE", "Preserved range must be inside the occurrence.");
    }
    if (document.constraints.locks.some(lock => lock.lockId === operation.lockId))
      commandError("DUPLICATE_LOCK", "Lock ID already exists.");
    return {
      ...document,
      constraints: {
        ...document.constraints,
        locks: [
          ...document.constraints.locks,
          {
            lockId: operation.lockId,
            occurrenceId: occurrence.occurrenceId,
            sourceRange: operation.range,
            mode: "preserve",
          },
        ],
      },
    };
  }
  if (operation.type === "split_clip") {
    const point = sourcePoint(operation, occurrence, document);
    if (point <= occurrence.sourceRange.startTick || point >= occurrence.sourceRange.endTick) {
      commandError("INVALID_TIME_POINT", "Split point must lie strictly inside the occurrence.");
    }
    if (
      document.clipOccurrences.some(
        item =>
          item.occurrenceId === operation.newOccurrenceIds.left ||
          item.occurrenceId === operation.newOccurrenceIds.right
      )
    ) {
      commandError("DUPLICATE_OCCURRENCE", "A requested split ID already exists.");
    }
    assertUnlocked(document.constraints.locks, occurrence.occurrenceId, {
      startTick: point,
      endTick: point + 1,
    });
    const left = {
      ...occurrence,
      occurrenceId: operation.newOccurrenceIds.left,
      inheritedFromOccurrenceId: occurrence.occurrenceId,
      legacyParentIds: [occurrence.occurrenceId, ...(occurrence.legacyParentIds || [])],
      sourceRange: { ...occurrence.sourceRange, endTick: point },
    };
    const right = {
      ...occurrence,
      occurrenceId: operation.newOccurrenceIds.right,
      inheritedFromOccurrenceId: occurrence.occurrenceId,
      legacyParentIds: [occurrence.occurrenceId, ...(occurrence.legacyParentIds || [])],
      sourceRange: { ...occurrence.sourceRange, startTick: point },
    };
    const migratedLocks = document.constraints.locks.flatMap(lock => {
      if (lock.occurrenceId !== occurrence.occurrenceId) return [lock];
      return [
        {
          ...lock,
          occurrenceId: lock.sourceRange.endTick <= point ? left.occurrenceId : right.occurrenceId,
        },
      ];
    });
    return reflow({
      ...document,
      clipOccurrences: [
        ...document.clipOccurrences.slice(0, index),
        left,
        right,
        ...document.clipOccurrences.slice(index + 1),
      ],
      constraints: { ...document.constraints, locks: migratedLocks },
    });
  }
  const keep = operation.keep;
  if (!document.linkedTiming) {
    commandError(
      "UNSUPPORTED_LINKED_TIMING",
      "Trim requires migrated programme cue and key timing."
    );
  }
  if (
    keep.startTick < occurrence.sourceRange.startTick ||
    keep.endTick > occurrence.sourceRange.endTick
  ) {
    commandError("INVALID_TIME_RANGE", "Trim must keep a nonempty range inside the occurrence.");
  }
  assertUnlocked(document.constraints.locks, occurrence.occurrenceId, {
    startTick: occurrence.sourceRange.startTick,
    endTick: keep.startTick,
  });
  assertUnlocked(document.constraints.locks, occurrence.occurrenceId, {
    startTick: keep.endTick,
    endTick: occurrence.sourceRange.endTick,
  });
  const clipOccurrences = [...document.clipOccurrences];
  clipOccurrences[index] = { ...occurrence, sourceRange: keep };
  let linkedSnapshot = projectStudioLinkedTimingToSnapshot(document);
  let programmeSpeedKeys = document.programmeSpeedKeys;
  for (const gap of studioTrimGaps(occurrence, keep)) {
    if (
      Object.values(document.linkedTiming?.cues || {}).some(cues =>
        cues.some(cue => cue.programmeRange === null)
      ) ||
      Object.values(document.linkedTiming?.keys || {}).some(keys =>
        keys.some(key => key.atProgrammeTick === null)
      )
    ) {
      commandError(
        "UNSUPPORTED_LINKED_TIMING",
        "Trim needs valid timing for every linked programme cue and key."
      );
    }
    linkedSnapshot = rippleStudioSnapshotLinkedTimeline(linkedSnapshot, gap, idempotencyKey);
    programmeSpeedKeys = rippleProgrammeSpeedKeys(programmeSpeedKeys, gap);
  }
  const layers = [
    ...buildStudioLayersFromSnapshot(linkedSnapshot),
    ...document.layers.filter(layer => layer.type === "caption"),
  ];
  return reflow({
    ...document,
    clipOccurrences,
    layers,
    linkedTiming: buildStudioLinkedTimingFromSnapshot(linkedSnapshot),
    programmeSpeedKeys,
  });
};

export const resolveStudioCommandBatch = (document, batch) => {
  validateStudioProjectDocument(document);
  validateStudioCommandBatch(batch);
  if (document.projectId !== batch.projectId)
    commandError("PROJECT_MISMATCH", "Command targets a different project.");
  const fingerprint = stableStringify(batch);
  const duplicate = document.idempotency?.[batch.idempotencyKey];
  if (duplicate) {
    if (duplicate.fingerprint !== fingerprint)
      commandError("IDEMPOTENCY_CONFLICT", "Idempotency key was used for another command.");
    return { document, batch, duplicate: true, fingerprint, readSet: [], writeSet: [] };
  }
  if (document.revision !== batch.baseRevision)
    commandError("STALE_REVISION", "Project changed since this command was prepared.", {
      currentRevision: document.revision,
    });
  let candidate = document;
  const linkedEdits = [];
  for (const operation of batch.operations) {
    if (operation.type === "trim_clip") {
      const occurrence = candidate.clipOccurrences.find(
        item => item.occurrenceId === operation.target.occurrenceId
      );
      if (occurrence) linkedEdits.push(...studioTrimGaps(occurrence, operation.keep));
    }
    candidate = applyOne(candidate, operation, batch.idempotencyKey);
  }
  const readNodes = [...new Set(batch.operations.map(operation => operation.target.occurrenceId))];
  const affected = [
    ...new Set(
      batch.operations.flatMap(operation => [
        operation.target.occurrenceId,
        ...(operation.type === "split_clip"
          ? [operation.newOccurrenceIds.left, operation.newOccurrenceIds.right]
          : []),
      ])
    ),
  ];
  const readSet = readNodes.map(id => `occurrence:${id}`);
  if (linkedEdits.length)
    readSet.push("programme:layers", "programme:linked_timing", "programme:speed_keys");
  const writeSet = [
    ...affected.map(id => `occurrence:${id}`),
    ...(batch.operations.some(operation => operation.type !== "preserve_range")
      ? ["programme:timeline", "time_maps"]
      : []),
    ...(batch.operations.some(
      operation => operation.type === "preserve_range" || document.constraints.locks.length
    )
      ? ["constraints:locks"]
      : []),
    ...(linkedEdits.length
      ? ["programme:layers", "programme:linked_timing", "programme:speed_keys"]
      : []),
  ];
  return {
    document,
    batch,
    candidate,
    duplicate: false,
    fingerprint,
    affected,
    readSet,
    writeSet,
    linkedEdits,
  };
};

export const dryRunStudioCommandBatch = (document, batch) => {
  const plan = resolveStudioCommandBatch(document, batch);
  return {
    duplicate: plan.duplicate,
    baseRevision: document.revision,
    newRevision: plan.duplicate ? document.revision : document.revision + 1,
    affectedNodes: plan.affected || [],
    readSet: plan.readSet,
    writeSet: plan.writeSet,
    previewDocument: plan.duplicate ? document : plan.candidate,
  };
};

export const applyStudioCommandTransaction = plan => {
  if (plan.duplicate) return { document: plan.document, duplicate: true, journalEntry: null };
  const { document, batch, candidate } = plan;
  const newRevision = document.revision + 1;
  const journalEntry = {
    journalId: `revision:${newRevision}`,
    baseRevision: document.revision,
    newRevision,
    idempotencyKey: batch.idempotencyKey,
    actor: batch.actor,
    operations: batch.operations,
    affectedNodes: plan.affected,
    readSet: plan.readSet,
    writeSet: plan.writeSet,
    inverse: createStudioCommandInverse(document, candidate),
  };
  const next = {
    ...candidate,
    revision: newRevision,
    journal: [...(document.journal || []), journalEntry],
    idempotency: {
      ...(document.idempotency || {}),
      [batch.idempotencyKey]: { fingerprint: plan.fingerprint, revision: newRevision },
    },
  };
  validateStudioProjectDocument(next);
  return { document: next, duplicate: false, journalEntry };
};

export const executeStudioCommandBatch = (document, batch) =>
  applyStudioCommandTransaction(resolveStudioCommandBatch(document, batch));

export const undoStudioCommandBatch = (document, { baseRevision, actor, idempotencyKey }) => {
  validateStudioProjectDocument(document);
  checkId(idempotencyKey, "idempotencyKey");
  expectKeys(actor, ["type", "id"], "actor");
  if (!["human", "ai", "system"].includes(actor.type))
    commandError("INVALID_ACTOR", "Unknown actor type.");
  checkId(actor.id, "actor.id");
  const fingerprint = stableStringify({ action: "undo", baseRevision, actor, idempotencyKey });
  const prior = document.idempotency?.[idempotencyKey];
  if (prior) {
    if (prior.fingerprint !== fingerprint)
      commandError("IDEMPOTENCY_CONFLICT", "Idempotency key was used for another command.");
    return { document, duplicate: true, undoneJournalId: prior.undoneJournalId };
  }
  if (document.revision !== baseRevision)
    commandError("STALE_REVISION", "Project changed since undo was prepared.");
  const last = latestUndoableStudioCommand(document);
  if (!last)
    commandError("UNDO_UNAVAILABLE", "No latest command batch can be undone.");
  const newRevision = document.revision + 1;
  const content = applyStudioCommandInverse(document, last.inverse);
  const restored = {
    ...content,
    revision: newRevision,
    journal: [
      ...document.journal,
      {
        journalId: `revision:${newRevision}`,
        baseRevision,
        newRevision,
        actor,
        idempotencyKey,
        operations: [{ type: "undo", journalId: last.journalId }],
        affectedNodes: last.affectedNodes,
        inverse: createStudioCommandInverse(document, content),
      },
    ],
    idempotency: {
      ...document.idempotency,
      [idempotencyKey]: { fingerprint, revision: newRevision, undoneJournalId: last.journalId },
    },
  };
  validateStudioProjectDocument(restored);
  return { document: restored, duplicate: false, undoneJournalId: last.journalId };
};

export const projectStudioCommandResultOnSnapshot = ({ snapshot, projectId, plan, result }) => {
  if (result.duplicate) return { ...result, snapshot };
  let linkedSnapshot = snapshot;
  for (const gap of plan.linkedEdits) {
    linkedSnapshot = rippleStudioSnapshotLinkedTimeline(
      linkedSnapshot,
      gap,
      plan.batch.idempotencyKey
    );
  }
  const nextSnapshot = {
    ...linkedSnapshot,
    timeline: projectDocumentToLegacyTimeline(result.document, snapshot.timeline),
    studioDocument: result.document,
  };
  const reconciled = reconcileStudioDocument({
    snapshot: nextSnapshot,
    projectId,
    storedDocument: result.document,
  });
  if (reconciled.revision !== result.document.revision) {
    const mismatchedFields = [
      "assets",
      "clipOccurrences",
      "layers",
      "linkedTiming",
      "audioGraph",
      "programmeSpeedKeys",
      "fallbackSpeed",
      "outputTimeMap",
    ].filter(field => JSON.stringify(reconciled[field]) !== JSON.stringify(result.document[field]));
    commandError(
      "SNAPSHOT_PROJECTION_MISMATCH",
      "Command timing disagrees with the editor snapshot.",
      { mismatchedFields }
    );
  }
  return {
    ...result,
    snapshot: nextSnapshot,
  };
};

export const runStudioCommandOnSnapshot = ({ snapshot, projectId, batch }) => {
  const document = reconcileStudioDocument({
    snapshot,
    projectId,
    storedDocument: snapshot.studioDocument || null,
  });
  const plan = resolveStudioCommandBatch(document, batch);
  const result = applyStudioCommandTransaction(plan);
  return projectStudioCommandResultOnSnapshot({ snapshot, projectId, plan, result });
};

export const MINIMUM_SPLIT_DISTANCE_TICKS = Math.round(0.2 * TICKS_PER_SECOND);
