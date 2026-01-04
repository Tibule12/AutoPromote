// pinterestService.js - minimal placeholder implementation
const { db } = require("../firebaseAdmin");
const { tokensFromDoc } = require("./connectionTokenUtils");
const { safeFetch } = require("../utils/ssrfGuard");

let fetchFn = global.fetch;
if (!fetchFn) {
  try {
    fetchFn = require("node-fetch");
  } catch (e) {
    fetchFn = null;
  }
}

async function postToPinterest({ contentId, payload, reason, uid }) {
  let userTokens = null;
  const { tokensFromDoc } = require("./connectionTokenUtils");
  if (uid) {
    try {
      const snap = await db
        .collection("users")
        .doc(uid)
        .collection("connections")
        .doc("pinterest")
        .get();
      if (snap.exists) {
        const d = snap.data() || {};
        userTokens = tokensFromDoc(d) || null;
      }
    } catch (_) {}
  }
  const hasCreds =
    userTokens || (process.env.PINTEREST_CLIENT_ID && process.env.PINTEREST_CLIENT_SECRET);
  if (!hasCreds) return { platform: "pinterest", simulated: true, reason: "missing_credentials" };
  // If we have a user token, try to create a real Pin
  const tokens = userTokens || {};
  const accessToken = tokens.access_token || null;
  const boardId =
    (payload && payload.boardId) ||
    (payload &&
      payload.platformOptions &&
      payload.platformOptions.pinterest &&
      payload.platformOptions.pinterest.boardId) ||
    null;
  const note = (payload && (payload.note || payload.description || payload.message)) || "";
  const link = (payload && (payload.link || payload.url)) || null;
  const imageUrl = (payload && (payload.imageUrl || payload.mediaUrl || payload.videoUrl)) || null;
  if (!accessToken) {
    // Fallback: do not fail—simulate if server-side client credentials are available
    if (!(process.env.PINTEREST_CLIENT_ID && process.env.PINTEREST_CLIENT_SECRET)) {
      return { platform: "pinterest", simulated: true, reason: "missing_credentials" };
    }
  }
  if (!boardId) return { platform: "pinterest", success: false, error: "boardId_required" };
  try {
    // Build create pin payload
    const body = { board_id: boardId, note };
    if (link) body.link = link;
    if (imageUrl) body.media_source = { source_type: "image_url", url: imageUrl };
    const response = await safeFetch("https://api.pinterest.com/v5/pins", fetchFn, {
      fetchOptions: {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      requireHttps: true,
      allowHosts: ["api.pinterest.com"],
    });
    const json = await (response.ok ? response.json() : response.text().then(t => ({ error: t })));
    if (!response.ok) {
      return { platform: "pinterest", success: false, error: json.error || JSON.stringify(json) };
    }
    const pinId = json.id || json.pin_id || null;
    if (contentId && pinId && uid) {
      try {
        const contentRef = db.collection("content").doc(contentId);
        await contentRef.set(
          { pinterest: { pinId, boardId, note, postedAt: new Date().toISOString() } },
          { merge: true }
        );
      } catch (_) {}
    }
    return { platform: "pinterest", success: true, pinId, reason, raw: json };
  } catch (e) {
    return { platform: "pinterest", success: false, error: e.message || "pinterest_post_failed" };
  }
}

async function createBoard({ name, description, uid }) {
  if (!name || !String(name).trim()) return { ok: false, error: "name_required" };
  const userRef = db.collection("users").doc(uid);
  try {
    const snap = await userRef.collection("connections").doc("pinterest").get();
    const conn = snap.exists ? snap.data() || {} : {};
    const tokens = tokensFromDoc(conn) || null;
    const hasAccessToken = tokens && tokens.access_token;
    if (hasAccessToken) {
      const accessToken = tokens.access_token;
      const postBody = { name: String(name).trim() };
      if (description) postBody.description = String(description).trim();
      const r = await safeFetch("https://api.pinterest.com/v5/boards", fetchFn, {
        fetchOptions: {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(postBody),
        },
        requireHttps: true,
        allowHosts: ["api.pinterest.com"],
      });
      const j = await (r.ok ? r.json() : r.text().then(t => ({ error: t })));
      if (!r.ok) return { ok: false, error: j.error || "pinterest_api_error" };
      const board = {
        id: j.id || j.board_id || null,
        name: j.name || postBody.name,
        description: j.description || postBody.description || null,
      };
      const existing = conn.meta && Array.isArray(conn.meta.boards) ? conn.meta.boards : [];
      existing.push(board);
      await userRef
        .collection("connections")
        .doc("pinterest")
        .set(
          { meta: { ...(conn.meta || {}), boards: existing }, updatedAt: new Date().toISOString() },
          { merge: true }
        );
      return { ok: true, board };
    }
    // Simulate board creation when no access token available (test/dev)
    const now = new Date().toISOString();
    const curMetaBoards = conn.meta && Array.isArray(conn.meta.boards) ? conn.meta.boards : [];
    const id = `sim_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const board = {
      id,
      name: String(name).trim(),
      description: description ? String(description).trim() : null,
    };
    curMetaBoards.push(board);
    await userRef
      .collection("connections")
      .doc("pinterest")
      .set(
        { meta: { ...(conn.meta || {}), boards: curMetaBoards }, updatedAt: now, simulated: true },
        { merge: true }
      );
    return { ok: true, board, simulated: true };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : "unknown_error" };
  }
}

module.exports = { postToPinterest, createBoard };
