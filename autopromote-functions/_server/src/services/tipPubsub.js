// Minimal SSE pubsub for tips per liveId
const subscribers = new Map(); // liveId -> Set of res

function subscribe(liveId, res) {
  if (!subscribers.has(liveId)) subscribers.set(liveId, new Set());
  subscribers.get(liveId).add(res);
}

function unsubscribe(liveId, res) {
  const s = subscribers.get(liveId);
  if (!s) return;
  s.delete(res);
  if (s.size === 0) subscribers.delete(liveId);
}

function publish(liveId, event) {
  const s = subscribers.get(liveId);
  if (!s) return 0;
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of Array.from(s)) {
    try {
      res.write(payload);
    } catch (_) {
      // ignore write errors; cleanup will occur on close
      try {
        unsubscribe(liveId, res);
      } catch (_) {}
    }
  }
  // Also emit via Socket.IO if attached
  try {
    const io = global.__io;
    if (io && typeof io.to === "function") {
      try {
        io.to(`live:${liveId}`).emit("tip", event);
      } catch (_) {}
    }
  } catch (_) {}
  return s.size;
}

module.exports = { subscribe, unsubscribe, publish };
