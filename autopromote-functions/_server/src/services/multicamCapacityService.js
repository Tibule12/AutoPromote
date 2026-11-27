const admin = require("firebase-admin");

const CAPACITY_COLLECTION = "system_runtime";
const CAPACITY_DOCUMENT = "multicam_render_capacity";
const DEFAULT_MAX_ACTIVE_JOBS = 3;
const DEFAULT_RESERVATION_HOURS = 6;

function readPositiveInteger(value, fallback, maximum) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

function getMaxActiveJobs() {
  return readPositiveInteger(
    process.env.MULTICAM_MAX_ACTIVE_JOBS,
    DEFAULT_MAX_ACTIVE_JOBS,
    20
  );
}

function getReservationTtlMs() {
  const hours = readPositiveInteger(
    process.env.MULTICAM_CAPACITY_RESERVATION_HOURS,
    DEFAULT_RESERVATION_HOURS,
    24
  );
  return hours * 60 * 60 * 1000;
}

function normalizeActiveJobs(value, nowMs = Date.now()) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value).filter(([, reservation]) => {
      if (!reservation || typeof reservation !== "object") return false;
      const expiresAtMs = Date.parse(String(reservation.expiresAt || ""));
      return Number.isFinite(expiresAtMs) && expiresAtMs > nowMs;
    })
  );
}

function capacityError(message, code, statusCode, retryAfterSeconds = null) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  if (retryAfterSeconds) error.retryAfterSeconds = retryAfterSeconds;
  return error;
}

async function reserveMulticamRenderCapacity({ jobId, userId }) {
  if (!jobId || !userId) {
    throw new Error("A job ID and user ID are required to reserve render capacity");
  }

  const db = admin.firestore();
  const ref = db.collection(CAPACITY_COLLECTION).doc(CAPACITY_DOCUMENT);
  const maxActiveJobs = getMaxActiveJobs();

  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    const activeJobs = normalizeActiveJobs(snapshot.exists ? snapshot.data()?.activeJobs : {}, nowMs);

    const existingForUser = Object.values(activeJobs).find(
      reservation => reservation.userId === userId && reservation.jobId !== jobId
    );
    if (existingForUser) {
      throw capacityError(
        "You already have a Cam Combiner render running. Wait for it to finish before starting another.",
        "MULTICAM_USER_RENDER_ACTIVE",
        409,
        60
      );
    }

    if (!activeJobs[jobId] && Object.keys(activeJobs).length >= maxActiveJobs) {
      throw capacityError(
        "Cam Combiner is at safe render capacity right now. Please retry shortly.",
        "MULTICAM_RENDER_CAPACITY_FULL",
        429,
        60
      );
    }

    const reservation = {
      jobId,
      userId,
      reservedAt: activeJobs[jobId]?.reservedAt || now,
      expiresAt: new Date(nowMs + getReservationTtlMs()).toISOString(),
    };
    activeJobs[jobId] = reservation;

    transaction.set(
      ref,
      {
        activeJobs,
        activeCount: Object.keys(activeJobs).length,
        maxActiveJobs,
        updatedAt: now,
      },
      { merge: true }
    );

    return { ...reservation, activeCount: Object.keys(activeJobs).length, maxActiveJobs };
  });
}

async function releaseMulticamRenderCapacity(jobId, reason = "terminal") {
  if (!jobId) return { released: false, reason: "missing_job_id" };

  const db = admin.firestore();
  const ref = db.collection(CAPACITY_COLLECTION).doc(CAPACITY_DOCUMENT);

  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return { released: false, reason: "capacity_document_missing" };

    const nowMs = Date.now();
    const activeJobs = normalizeActiveJobs(snapshot.data()?.activeJobs, nowMs);
    const existed = Boolean(activeJobs[jobId]);
    delete activeJobs[jobId];

    transaction.set(
      ref,
      {
        activeJobs,
        activeCount: Object.keys(activeJobs).length,
        maxActiveJobs: getMaxActiveJobs(),
        lastRelease: {
          jobId,
          reason: String(reason || "terminal").slice(0, 200),
          releasedAt: new Date(nowMs).toISOString(),
        },
        updatedAt: new Date(nowMs).toISOString(),
      },
      { merge: true }
    );

    return { released: existed, activeCount: Object.keys(activeJobs).length };
  });
}

module.exports = {
  getMaxActiveJobs,
  normalizeActiveJobs,
  releaseMulticamRenderCapacity,
  reserveMulticamRenderCapacity,
};
