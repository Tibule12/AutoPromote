// One small, admin-only activity document shares demand across API/worker hosts.
// Only successful authenticated feature requests renew it. Health/status polling
// and anonymous requests never keep optional database scans alive.
const CATEGORIES = new Set(["general", "analytics"]);
const TTL_MS = 2 * 60000;
const RENEW_MS = 60000;
function createBackgroundActivity({
  db,
  now = Date.now,
  mode = () => process.env.BACKGROUND_WORK_MODE,
  enabled = () => process.env.ENABLE_BACKGROUND_JOBS === "true",
} = {}) {
  let until = {},
    lastWrite = {},
    stop = null;
  const listeners = new Map();
  const notify = category => {
    for (const listener of listeners.get(category) || [])
      Promise.resolve()
        .then(listener)
        .catch(error => {
          console.warn("[background-demand] Wake failed:", error.code || "worker_failed");
        });
  };
  const database = () => db || require("../firebaseAdmin").db;
  const reference = () => database().collection("system_runtime").doc("background_activity");
  const active = category => mode() === "continuous" || Number(until[category] || 0) > now();
  return {
    active,
    start() {
      if (stop) return;
      const ref = reference();
      if (typeof ref.onSnapshot !== "function") return;
      stop = ref.onSnapshot(
        snapshot => {
          const remote = snapshot.exists ? snapshot.data() || {} : {};
          for (const category of CATEGORIES) {
            const wasActive = active(category);
            until[category] = Math.max(until[category] || 0, Number(remote[category] || 0));
            if (!wasActive && active(category)) notify(category);
          }
        },
        error => {
          console.warn(
            "[background-demand] Activity listener unavailable:",
            error.code || "read_failed"
          );
          stop?.();
          stop = null;
        }
      );
    },
    onActive(category, listener) {
      if (!CATEGORIES.has(category)) throw new Error("Unknown background activity category");
      if (!listeners.has(category)) listeners.set(category, new Set());
      listeners.get(category).add(listener);
      if (active(category))
        Promise.resolve()
          .then(listener)
          .catch(() => {});
      return () => listeners.get(category)?.delete(listener);
    },
    async mark(category) {
      if (!CATEGORIES.has(category)) return;
      const time = now();
      const wasActive = active(category);
      until[category] = time + TTL_MS;
      if (!wasActive) notify(category);
      if (lastWrite[category] && time - lastWrite[category] < RENEW_MS) return;
      lastWrite[category] = time;
      try {
        await reference().set({ [category]: time + TTL_MS }, { merge: true });
      } catch (error) {
        delete lastWrite[category];
        console.warn("[background-demand] Activity renewal failed:", error.code || "write_failed");
      }
    },
    middleware(req, res, next) {
      res.once("finish", () => {
        const path = String(req.originalUrl || req.url || "").split("?")[0];
        if (
          !enabled() ||
          !req.user?.uid ||
          res.statusCode >= 400 ||
          !path.startsWith("/api/") ||
          /\/(health|status|credits|balance|notifications|recovery)(\/|$)/i.test(path) ||
          // Account/allowance/connection polling must not turn into paid
          // analytics demand or keep optional scans awake across hosts.
          /^\/api\/(usage|auth|users?|profile|platform-connections)(\/|$)/i.test(path) ||
          /^\/api\/platforms?\/connections(\/|$)/i.test(path)
        )
          return;
        void this.mark("general");
        if (/\/(analytics|metrics|insights|stats|earnings|revenue|dashboard)(\/|$)/i.test(path))
          void this.mark("analytics");
      });
      next();
    },
    close() {
      stop?.();
      stop = null;
      until = {};
      lastWrite = {};
      listeners.clear();
    },
  };
}
module.exports = { createBackgroundActivity, TTL_MS, RENEW_MS, ...createBackgroundActivity() };
