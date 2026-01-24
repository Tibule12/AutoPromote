const express = require("express");
const { db } = require("../firebaseAdmin");
const { safeFetch } = require("../utils/ssrfGuard");
const { Readable, pipeline } = require("stream");
const router = express.Router();

// Helper to convert Web/WHATWG stream to Node Readable if needed
function toNodeStream(webStream) {
  if (!webStream) return null;
  // Node 18+ supports Readable.fromWeb
  if (typeof Readable.fromWeb === "function") return Readable.fromWeb(webStream);
  // Fallback: try Readable.from
  try {
    return Readable.from(webStream);
  } catch (e) {
    // If conversion fails, return null
    return null;
  }
}

// HEAD handler - returns headers only
router.head("/media/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const snap = await db.collection("content").doc(id).get();
    if (!snap.exists) return res.status(404).send("Not found");
    const content = snap.data();
    const url = content && (content.url || content.mediaUrl || content.videoUrl);
    if (!url) return res.status(404).send("No media URL");

    const host = new URL(url).host;
    const initRes = await safeFetch(url, global.fetch || require("node-fetch"), {
      fetchOptions: { method: "HEAD" },
      allowHosts: [host],
      requireHttps: true,
    });

    // Copy selected headers
    const headersToCopy = [
      "content-type",
      "content-length",
      "accept-ranges",
      "content-range",
      "last-modified",
    ];
    headersToCopy.forEach(h => {
      const v = initRes.headers.get
        ? initRes.headers.get(h)
        : initRes.headers && initRes.headers[h];
      if (v) res.setHeader(h, v);
    });

    return res.status(initRes.status).end();
  } catch (e) {
    if (e && String(e).includes("ssrf_blocked"))
      return res.status(403).json({ error: "ssrf_blocked" });
    console.error("[media] HEAD error", e && (e.stack || e.message || e));
    return res.status(500).json({ error: "internal_error" });
  }
});

// GET handler - stream bytes from signed URL
router.get("/media/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const snap = await db.collection("content").doc(id).get();
    if (!snap.exists) return res.status(404).send("Not found");
    const content = snap.data();
    const url = content && (content.url || content.mediaUrl || content.videoUrl);
    if (!url) return res.status(404).send("No media URL");

    const host = new URL(url).host;
    const fetchRes = await safeFetch(url, global.fetch || require("node-fetch"), {
      fetchOptions: { method: "GET" },
      allowHosts: [host],
      requireHttps: true,
    });

    // Copy a small set of headers from origin
    ["content-type", "content-length", "accept-ranges", "content-range", "last-modified"].forEach(
      h => {
        const v = fetchRes.headers.get
          ? fetchRes.headers.get(h)
          : fetchRes.headers && fetchRes.headers[h];
        if (v) res.setHeader(h, v);
      }
    );

    res.status(fetchRes.status);

    // If there is no body, end with the status
    if (!fetchRes.body) return res.end();

    const nodeStream = toNodeStream(fetchRes.body) || Readable.from(fetchRes.body);

    pipeline(nodeStream, res, err => {
      if (err) {
        console.error("[media] stream pipeline error", err && (err.stack || err.message || err));
      }
    });
  } catch (e) {
    if (e && String(e).includes("ssrf_blocked"))
      return res.status(403).json({ error: "ssrf_blocked" });
    console.error("[media] GET error", e && (e.stack || e.message || e));
    return res.status(500).json({ error: "internal_error" });
  }
});

module.exports = router;
