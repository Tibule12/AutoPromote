const crypto = require("crypto");
const { db } = require("../firebaseAdmin");

const BINDING_VERSION = 1;

const validId = value =>
  typeof value === "string" && value.length > 0 && value.length <= 160 &&
  value === value.trim() && !/[\x00-\x1f\x7f]/.test(value);
const validUid = value =>
  validId(value) && value !== "." && value !== ".." && !value.includes("/");
const validHash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const bindingIdFor = (projectId, sourceAssetId) =>
  sha256(`${projectId}\0${sourceAssetId}`);

const bindingError = (code, statusCode) => {
  const error = new Error(code);
  error.code = code;
  error.statusCode = statusCode;
  return error;
};

const requireBindingInput = ({ uid, projectId, sourceAssetId, sourceSha256 }) => {
  if (!validUid(uid) || !validId(projectId) || !validId(sourceAssetId) ||
      (sourceSha256 !== undefined && !validHash(sourceSha256))) {
    throw bindingError("PROJECT_SOURCE_BINDING_INVALID", 400);
  }
};

const bindingReference = ({ uid, projectId, sourceAssetId, firestore }) =>
  firestore.collection("users").doc(uid)
    .collection("studioDirectorProjectBindings")
    .doc(bindingIdFor(projectId, sourceAssetId));

const sameBinding = (record, { uid, projectId, sourceAssetId, sourceSha256 }) =>
  record?.schemaVersion === BINDING_VERSION &&
  record.bindingId === bindingIdFor(projectId, sourceAssetId) &&
  record.ownerUid === uid &&
  record.projectId === projectId &&
  record.sourceAssetId === sourceAssetId &&
  validHash(record.sourceSha256) &&
  (sourceSha256 === undefined || record.sourceSha256 === sourceSha256) &&
  typeof record.createdAt === "string" &&
  !Number.isNaN(Date.parse(record.createdAt));

const alreadyExists = error =>
  error?.code === 6 || error?.code === "already-exists" ||
  error?.code === "ALREADY_EXISTS";

// Project IDs and source asset IDs originate in the browser. The authenticated
// upload supplies the byte hash. This binding attests that the same UID first
// associated that asset ID with those bytes; it does not attest to the browser's
// full Studio document or to ownership of an arbitrary local project ID.
const assertOwnedStudioSourceBinding = async ({
  uid, projectId, sourceAssetId, sourceSha256, firestore = db,
}) => {
  requireBindingInput({ uid, projectId, sourceAssetId, sourceSha256 });
  if (!validHash(sourceSha256))
    throw bindingError("PROJECT_SOURCE_BINDING_INVALID", 400);
  const bindingId = bindingIdFor(projectId, sourceAssetId);
  const record = {
    schemaVersion: BINDING_VERSION,
    bindingId,
    ownerUid: uid,
    projectId,
    sourceAssetId,
    sourceSha256,
    createdAt: new Date().toISOString(),
  };
  const ref = bindingReference({ uid, projectId, sourceAssetId, firestore });
  try {
    await ref.create(record);
    return record;
  } catch (error) {
    if (!alreadyExists(error))
      throw bindingError("PROJECT_SOURCE_STORE_UNAVAILABLE", 503);
    let snapshot;
    try {
      snapshot = await ref.get();
    } catch (_) {
      throw bindingError("PROJECT_SOURCE_STORE_UNAVAILABLE", 503);
    }
    if (!snapshot.exists)
      throw bindingError("PROJECT_SOURCE_STORE_UNAVAILABLE", 503);
    const prior = snapshot.data();
    if (!sameBinding(prior, { uid, projectId, sourceAssetId }))
      throw bindingError("PROJECT_SOURCE_STORE_UNAVAILABLE", 503);
    if (prior.sourceSha256 !== sourceSha256)
      throw bindingError("PROJECT_SOURCE_CONFLICT", 409);
    return prior;
  }
};

const getOwnedStudioSourceBinding = async ({
  uid, projectId, sourceAssetId, firestore = db,
}) => {
  requireBindingInput({ uid, projectId, sourceAssetId });
  let snapshot;
  try {
    snapshot = await bindingReference({ uid, projectId, sourceAssetId, firestore }).get();
  } catch (_) {
    throw bindingError("PROJECT_SOURCE_STORE_UNAVAILABLE", 503);
  }
  if (!snapshot.exists) return null;
  const record = snapshot.data();
  if (!sameBinding(record, { uid, projectId, sourceAssetId }))
    throw bindingError("PROJECT_SOURCE_STORE_UNAVAILABLE", 503);
  return record;
};

module.exports = {
  assertOwnedStudioSourceBinding,
  getOwnedStudioSourceBinding,
};
