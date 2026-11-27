const toMillis = value => {
  if (!value) return 0;
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

/**
 * Decide whether a temporary object has expired.
 *
 * Only object metadata may override the normal retention window. Object names
 * often begin with Date.now() to make them unique; that timestamp is a creation
 * identifier, not a delete deadline.
 */
const shouldDeleteTemporaryObject = ({ metadata = {}, now = Date.now(), retentionMs }) => {
  const explicitExpiry =
    toMillis(metadata.metadata?.expiresAt) || toMillis(metadata.metadata?.deleteAfter);
  if (explicitExpiry > 0) return now >= explicitExpiry;

  const createdTime = toMillis(metadata.timeCreated);
  if (!createdTime || !Number.isFinite(retentionMs) || retentionMs < 0) return false;
  return now - createdTime >= retentionMs;
};

module.exports = {
  shouldDeleteTemporaryObject,
  toMillis,
};
