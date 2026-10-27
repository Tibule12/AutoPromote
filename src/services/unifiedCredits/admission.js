const crypto = require("crypto");
const { assertSandbox } = require("./runtime");
const { fail, integer, OPERATIONS } = require("./policy");
const key = (...args) => crypto.createHash("sha256").update(JSON.stringify(args)).digest("hex");

// Adapter contract for server-owned source metadata. Not mounted on production.
function createAdmission({ db, service, now = Date.now }) {
  assertSandbox(process.env, db);
  async function source(uid, sourceId) {
    assertSandbox(process.env, db);
    if (typeof sourceId !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(sourceId))
      fail("INVALID_SOURCE");
    const snap = await db.collection("credits_v2_inputs").doc(key(uid, sourceId)).get();
    if (!snap.exists || snap.data().userId !== uid) fail("SOURCE_NOT_FOUND", 404);
    const data = snap.data();
    if (data.resourceClass !== "media-cpu" || data.gpu === true) fail("UNCALIBRATED_RESOURCE", 409);
    if (
      typeof data.contentHash !== "string" ||
      !/^[a-f0-9]{64}$/.test(data.contentHash) ||
      typeof data.objectGeneration !== "string" ||
      !/^[0-9]+$/.test(data.objectGeneration)
    )
      fail("UNVERSIONED_SOURCE", 409);
    return data;
  }
  return {
    async quote(uid, { sourceId, operation, destinations = [] }) {
      if (!OPERATIONS.includes(operation)) fail("UNSUPPORTED_OPERATION");
      const data = await source(uid, sourceId);
      let units;
      if (["queue.dispatch", "publisher.publish"].includes(operation)) {
        if (
          !Array.isArray(destinations) ||
          destinations.length < 1 ||
          destinations.length > 6 ||
          new Set(destinations).size !== destinations.length ||
          !destinations.every(d => data.allowedDestinations?.includes(d))
        )
          fail("INVALID_DESTINATIONS");
        units = destinations.length;
      } else {
        if (
          typeof data.enforcedMaxSeconds !== "number" ||
          !Number.isFinite(data.enforcedMaxSeconds)
        )
          fail("INVALID_SOURCE");
        units = integer(Math.ceil(data.enforcedMaxSeconds), "WORKLOAD_SECONDS", 1);
      }
      const quoted = service.quote(operation, units);
      const sourceFingerprint = key(sourceId, data, destinations.slice().sort());
      const quoteId = crypto.randomUUID();
      const record = {
        ...quoted,
        quoteId,
        userId: uid,
        sourceId,
        destinations,
        sourceFingerprint,
        expiresAt: now() + 600000,
        sandbox: true,
      };
      await db.collection("credits_v2_quotes").doc(quoteId).create(record);
      return record;
    },
    async reserveApproved(
      uid,
      { quoteId, requestId, approvedCredits, pricingRevision },
      validateSource = null
    ) {
      assertSandbox(process.env, db);
      if (typeof quoteId !== "string" || !/^[a-f0-9-]{36}$/.test(quoteId)) fail("INVALID_QUOTE");
      const snap = await db.collection("credits_v2_quotes").doc(quoteId).get();
      if (!snap.exists || snap.data().userId !== uid) fail("QUOTE_NOT_FOUND", 404);
      const q = snap.data();
      if (q.expiresAt <= now()) fail("QUOTE_EXPIRED", 409);
      const data = await source(uid, q.sourceId);
      if (key(q.sourceId, data, q.destinations.slice().sort()) !== q.sourceFingerprint)
        fail("SOURCE_CHANGED", 409);
      if (approvedCredits !== q.credits || pricingRevision !== q.pricingRevision)
        fail("PRICE_CHANGED", 409);
      if (validateSource) validateSource(q, data);
      // Remote workers must use the exact quoted hash/object generation and enforce
      // this ceiling. A URL or current object at the same path is not sufficient.
      return service.reserve(uid, {
        operation: q.operation,
        units: q.units,
        requestId,
        approvedCredits,
        pricingRevision,
        sourceFingerprint: q.sourceFingerprint,
        sourceDescriptor: {
          sourceId: q.sourceId,
          contentHash: data.contentHash,
          objectGeneration: data.objectGeneration,
          enforcedMaxSeconds: data.enforcedMaxSeconds,
          resourceClass: data.resourceClass,
          destinations: q.destinations.slice().sort(),
          ...(data.workflowInput ? { workflowInput: data.workflowInput } : {}),
        },
      });
    },
    // Queue→Publisher hand-off carries this ID; it must not reserve a second time.
    continueOperation: (uid, operationId) => service.getOperation(uid, operationId),
  };
}
module.exports = { createAdmission };
