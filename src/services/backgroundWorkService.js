// Queue membership changes wake workers; idle timer ticks use memory only.
// Snapshots are hints. Publishers still reread and validate authoritative state.
const timestampMs = value => {
  if (value?.toMillis) return value.toMillis();
  if (typeof value === "number") return value;
  return Date.parse(value || "") || 0;
};

class WorkWatchCache {
  constructor({ timeoutMs = 30000 } = {}) {
    this.entries = new Map();
    this.timeoutMs = timeoutMs;
  }

  async has(key, makeQuery, eligible) {
    let entry = this.entries.get(key);
    if (!entry) {
      const query = makeQuery();
      // Test adapters without the streaming API retain their normal reads.
      if (typeof query.onSnapshot !== "function") {
        const snapshot = await query.get();
        return snapshot.docs.some(doc => eligible(doc.data()));
      }
      let resolveReady, rejectReady;
      entry = {
        snapshot: null,
        stop: null,
        ready: new Promise((resolve, reject) => {
          resolveReady = resolve;
          rejectReady = reject;
        }),
      };
      this.entries.set(key, entry);
      const fail = error => {
        if (this.entries.get(key) !== entry) return;
        entry.error = error;
        this.entries.delete(key);
        clearTimeout(entry.timer);
        entry.stop?.();
        rejectReady(error);
      };
      entry.timer = setTimeout(
        () => fail(new Error(`Work listener not ready: ${key}`)),
        this.timeoutMs
      );
      entry.timer.unref?.();
      try {
        entry.stop = query.onSnapshot(snapshot => {
          if (this.entries.get(key) !== entry) return;
          entry.snapshot = snapshot;
          clearTimeout(entry.timer);
          resolveReady();
        }, fail);
      } catch (error) {
        fail(error);
      }
    }
    await entry.ready;
    if (entry.error) throw entry.error;
    return entry.snapshot.docs.some(doc => eligible(doc.data()));
  }

  close() {
    for (const entry of this.entries.values()) {
      clearTimeout(entry.timer);
      entry.stop?.();
    }
    this.entries.clear();
  }
}

function createBackgroundWork({ db, cache = new WorkWatchCache(), now = Date.now } = {}) {
  const database = () => db || require("../firebaseAdmin").db;
  const staleMs = () => Math.max(60000, Number(process.env.TASK_STALE_PROCESSING_MS) || 45 * 60000);
  return {
    cache,
    hasTasks(type) {
      const statuses = type === "media_transform" ? ["queued"] : ["queued", "processing"];
      return cache.has(
        `tasks:${type}`,
        () =>
          database()
            .collection("promotion_tasks")
            .where("type", "==", type)
            .where("status", "in", statuses)
            .orderBy("createdAt")
            .limit(100),
        data => {
          if (data.status === "queued")
            return !data.nextAttemptAt || timestampMs(data.nextAttemptAt) <= now();
          const started = timestampMs(data.processingStartedAt || data.updatedAt);
          return data.status === "processing" && started > 0 && started + staleMs() <= now();
        }
      );
    },
    async hasSchedules() {
      const pending = await cache.has(
        "schedules:pending",
        () =>
          database()
            .collection("promotion_schedules")
            .where("isActive", "==", true)
            .where("status", "==", "pending")
            .limit(100),
        data =>
          data.isActive === true &&
          data.status === "pending" &&
          (!data.startTime || timestampMs(data.startTime) <= now())
      );
      const stale = await cache.has(
        "schedules:processing",
        () =>
          database()
            .collection("promotion_schedules")
            .where("status", "==", "processing")
            .limit(100),
        data => {
          const started = timestampMs(data.updatedAt || data.createdAt || data.startTime);
          return data.status === "processing" && (!started || started + 10 * 60000 <= now());
        }
      );
      return pending || stale;
    },
    hasRows(key, collection, field, value) {
      return cache.has(
        key,
        () => database().collection(collection).where(field, "==", value).limit(1),
        () => true
      );
    },
    async hasCampaigns() {
      const priority = await cache.has(
        "campaigns:priority",
        () =>
          database()
            .collection("engagement_campaigns")
            .where("status", "==", "active")
            .where("isPriority", "==", true)
            .orderBy("createdAt")
            .limit(1),
        data => data.status === "active" && data.isPriority === true
      );
      if (priority) return true;
      return cache.has(
        "campaigns:active",
        () =>
          database()
            .collection("engagement_campaigns")
            .where("status", "==", "active")
            .orderBy("createdAt")
            .limit(1),
        data => data.status === "active" && timestampMs(data.createdAt) + 10 * 60000 <= now()
      );
    },
  };
}

module.exports = { WorkWatchCache, createBackgroundWork, timestampMs, ...createBackgroundWork() };
