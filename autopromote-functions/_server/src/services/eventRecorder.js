const { db } = require('../firebaseAdmin');

// Generic event recorder. Minimal schema for future aggregation.
// type: string (e.g., content_uploaded, youtube_upload, platform_post_enqueued)
// payload: arbitrary, trimmed & sanitized.
// userId optional.
// NOTE: For scale, move to batch writes or BigQuery export.

function trimObject(obj, depth = 2) {
  if (!obj || typeof obj !== 'object') return obj;
  if (depth <= 0) return undefined;
  const out = Array.isArray(obj) ? [] : {};
  const keys = Object.keys(obj).slice(0, 25); // cap keys
  for (const k of keys) {
    const v = obj[k];
    if (v && typeof v === 'object') {
      out[k] = trimObject(v, depth - 1);
    } else if (typeof v === 'string') {
      out[k] = v.length > 400 ? v.slice(0, 400) + '…' : v;
    } else {
      out[k] = v;
    }
  }
  return out;
}

async function recordEvent(type, { userId = null, payload = {}, contentId = null } = {}) {
  try {
    const doc = {
      type,
      userId,
      contentId: contentId || payload.contentId || null,
      payload: trimObject(payload),
      createdAt: new Date().toISOString()
    };
    await db.collection('events').add(doc);
    return { ok: true };
  } catch (e) {
    console.log('[eventRecorder] failed:', e.message);
    return { ok: false, error: e.message };
  }
}

module.exports = { recordEvent };
