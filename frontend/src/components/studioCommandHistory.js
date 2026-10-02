// Store changed JSON values, not a copy of every caption and track per edit.
const FIELDS = [
  "clipOccurrences", "timeMaps", "outputTimeMap", "constraints", "layers",
  "linkedTiming", "programmeSpeedKeys",
];
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const same = (left, right) => {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
      left.every((value, index) => same(value, right[index]));
  }
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length &&
    keys.every(key => own(right, key) && same(left[key], right[key]));
};
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

export const createStudioCommandInverse = (before, after) => {
  const patches = [];
  const visit = (left, right, path) => {
    if (same(left, right)) return;
    if (Array.isArray(left) && Array.isArray(right)) {
      if (left.length === right.length) {
        left.forEach((value, index) => visit(value, right[index], [...path, index]));
        return;
      }
      let start = 0;
      while (start < Math.min(left.length, right.length) && same(left[start], right[start])) start++;
      let end = 0;
      while (end < Math.min(left.length, right.length) - start &&
          same(left[left.length - 1 - end], right[right.length - 1 - end])) end++;
      patches.push({
        type: "splice", path, index: start, deleteCount: right.length - start - end,
        items: clone(left.slice(start, left.length - end)),
      });
      return;
    }
    if (object(left) && object(right)) {
      for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
        visit(left[key], right[key], [...path, key]);
      }
      return;
    }
    patches.push(left === undefined
      ? { type: "delete", path }
      : { type: "set", path, value: clone(left) });
  };
  FIELDS.forEach(field => visit(before[field], after[field], [field]));
  return { schemaVersion: 2, patches };
};

const invalid = () => {
  const error = new Error("The command undo data is invalid.");
  error.code = "INVALID_COMMAND_INVERSE";
  throw error;
};

export const applyStudioCommandInverse = (document, inverse) => {
  if (!object(inverse)) invalid();
  // Retain compatibility with the foundation's original full before images.
  if (inverse.schemaVersion === undefined) {
    if (Object.keys(inverse).some(field => !FIELDS.includes(field))) invalid();
    return { ...document, ...clone(inverse) };
  }
  if (inverse.schemaVersion !== 2 || !Array.isArray(inverse.patches)) invalid();
  const restored = { ...document };
  const copied = new Set();
  for (const patch of inverse.patches) {
    if (!Array.isArray(patch.path) || !FIELDS.includes(patch.path[0]) ||
        patch.path.some(key => !(typeof key === "string" || Number.isSafeInteger(key)) ||
          ["__proto__", "prototype", "constructor"].includes(key))) invalid();
    const [field] = patch.path;
    if (!copied.has(field)) {
      restored[field] = clone(document[field]);
      copied.add(field);
    }
    let parent = restored;
    for (const key of patch.path.slice(0, -1)) {
      if (!parent || !own(parent, key)) invalid();
      parent = parent[key];
    }
    const key = patch.path[patch.path.length - 1];
    if (!parent || typeof parent !== "object") invalid();
    if (patch.type === "set") parent[key] = clone(patch.value);
    else if (patch.type === "delete") delete parent[key];
    else if (patch.type === "splice") {
      const array = parent[key];
      if (!Array.isArray(array) || !Array.isArray(patch.items) ||
          !Number.isSafeInteger(patch.index) || patch.index < 0 || patch.index > array.length ||
          !Number.isSafeInteger(patch.deleteCount) || patch.deleteCount < 0 ||
          patch.index + patch.deleteCount > array.length) invalid();
      array.splice(patch.index, patch.deleteCount, ...clone(patch.items));
    } else invalid();
  }
  return restored;
};

// Select the latest original edit still applied. Unjournalled edits and UI
// history restores are barriers: their inverse is not available to this API.
export const latestUndoableStudioCommand = document => {
  const reviews = new Set((document.directorReviewJournal || [])
    .filter(record => record.receipt?.decision === "reject")
    .map(record => record.reviewRevision));
  const decisions = new Map();
  const journal = document.journal || [];
  const entries = new Map(journal.map(entry => [entry.journalId, entry]));
  let cursor = document.revision;
  for (let index = journal.length - 1; index >= 0; index--) {
    const entry = journal[index];
    while (cursor > entry.newRevision && reviews.has(cursor)) cursor--;
    if (cursor !== entry.newRevision) return null;
    cursor = entry.baseRevision;
    const operation = entry.operations?.length === 1 && entry.operations[0];
    if (operation?.type === "undo") {
      // Saved v1 undo-of-undo receipts represent reapplications.
      let target = entries.get(operation.journalId);
      let reverting = true;
      const visited = new Set();
      while (target?.operations?.length === 1 && target.operations[0].type === "undo") {
        if (visited.has(target.journalId)) return null;
        visited.add(target.journalId);
        reverting = !reverting;
        target = entries.get(target.operations[0].journalId);
      }
      if (!target) return null;
      // Traverse newest first; a later redo supersedes an earlier undo.
      if (!decisions.has(target.journalId)) decisions.set(target.journalId, reverting);
      continue;
    }
    if (decisions.get(entry.journalId)) continue;
    return entry.inverse ? entry : null;
  }
  return null;
};
