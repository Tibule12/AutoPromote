// Snapshot identity for asynchronous local programme review. Journal/history
// metadata do not alter pixels, but every canonical creative/media decision does.
export const programmeDocumentKey = document => JSON.stringify(document, (key, value) =>
  ["revision", "journal", "idempotency", "directorReviewJournal"].includes(key) ? undefined :
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.keys(value).sort().map(name => [name, value[name]])) : value);
