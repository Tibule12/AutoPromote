/* memeticWorker
 * Simple worker that processes scheduled memetic_experiments and creates seed tasks
 */
const { db } = require("../../firebaseAdmin");
const logger = require("../utils/logger");

async function fetchScheduledExperiments(limit = 10, dbInstance = db) {
  // Query memetic_experiments with status 'scheduled'
  const qsnap = await dbInstance
    .collection("memetic_experiments")
    .where("status", "==", "scheduled")
    .orderBy("createdAt")
    .limit(limit)
    .get();

  const exps = [];
  qsnap.forEach(doc => {
    exps.push({ id: doc.id, data: doc.data() });
  });
  return exps;
}

async function createSeedDocs(experimentId, variant, options = {}, dbInstance = db) {
  const seedSize = typeof options.seedSize === "number" ? options.seedSize : 200;
  const doc = {
    experimentId,
    variantId: variant.variantId,
    variant: variant.variant,
    seedSize,
    status: "scheduled",
    createdAt: new Date().toISOString(),
  };
  const ref = await dbInstance.collection("memetic_seeds").add(doc);
  return { id: ref.id, doc };
}

async function markExperimentSeeded(experimentId, updates = {}, dbInstance = db) {
  const patch = { status: "seeded", seededAt: new Date().toISOString(), ...updates };
  await dbInstance.collection("memetic_experiments").doc(experimentId).update(patch);
  return patch;
}

async function runOnce({ limit = 10, seedLimitPerVariant = null } = {}, dbInstance = db) {
  const exps = await fetchScheduledExperiments(limit, dbInstance);
  const results = [];
  for (const exp of exps) {
    try {
      const plan = exp.data.plan || [];
      const options = exp.data.options || {};
      const createdSeeds = [];
      for (const p of plan) {
        // Respect an overall cap if provided
        const seedOptions = { seedSize: options.seedSize };
        if (seedLimitPerVariant)
          seedOptions.seedSize = Math.min(seedOptions.seedSize || 200, seedLimitPerVariant);
        const seedRef = await createSeedDocs(exp.id, p, seedOptions, dbInstance);
        createdSeeds.push(seedRef);
      }
      await markExperimentSeeded(exp.id, { seedCount: createdSeeds.length }, dbInstance);
      results.push({ experimentId: exp.id, seeded: createdSeeds.length });
    } catch (err) {
      logger.error("memeticWorker: failed to process experiment", {
        experimentId: exp.id,
        error: err && err.message,
      });
      // Attempt to mark failed
      try {
        await dbInstance
          .collection("memetic_experiments")
          .doc(exp.id)
          .update({ status: "failed", error: err && err.message });
      } catch (e) {
        // ignore
      }
      results.push({ experimentId: exp.id, error: err && err.message });
    }
  }
  return results;
}

module.exports = { runOnce, fetchScheduledExperiments, createSeedDocs, markExperimentSeeded };
