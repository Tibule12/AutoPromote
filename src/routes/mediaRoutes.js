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

// Verification file under /media/ for TikTok prefix verification
router.head("/media/tiktok-developers-site-verification.txt", async (req, res) => {
  try {
    const token = process.env.TIKTOK_DEVELOPERS_SITE_VERIFICATION;
    if (!token) return res.status(404).send("Not found");
    res.setHeader("content-type", "text/plain; charset=utf-8");
    return res.status(200).end();
  } catch (e) {
    console.error("[media] verification HEAD error", e && (e.stack || e.message || e));
    return res.status(500).json({ error: "internal_error" });
  }
});

const fs = require("fs");
const path = require("path");

router.get("/media/tiktok-developers-site-verification.txt", async (req, res) => {
  try {
    let token;

    // Prefer the committed static file if present (so deployments that update the file are effective immediately)
    try {
      const filePath = path.resolve(
        __dirname,
        "..",
        "..",
        "public",
        "tiktok-developers-site-verification.txt"
      );
      const content = fs.readFileSync(filePath, "utf8");
      const match = content.match(/tiktok-developers-site-verification=(\S+)/);
      if (match) token = match[1];
    } catch (err) {
      // ignore file read errors
    }

    // Fallback: environment variable
    if (!token) token = process.env.TIKTOK_DEVELOPERS_SITE_VERIFICATION;

    if (!token) return res.status(404).send("Not found");
    res.setHeader("content-type", "text/plain; charset=utf-8");
    return res.status(200).send(`tiktok-developers-site-verification=${token}`);
  } catch (e) {
    console.error("[media] verification GET error", e && (e.stack || e.message || e));
    return res.status(500).json({ error: "internal_error" });
  }
});

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
    const remoteAddr = req.headers["x-forwarded-for"] || (req.socket && req.socket.remoteAddress);
    console.log(`[media] GET request id=${id} remote=${remoteAddr} ua=${req.get("user-agent")}`);
    // Temporary: record incoming request to Firestore for debugging TikTok download attempts
    try {
      db.collection("debug_media_requests")
        .add({
          contentId: id,
          path: req.originalUrl,
          remoteAddr,
          userAgent: req.get("user-agent"),
          ts: new Date(),
        })
        .catch(err =>
          console.error(
            "[media] failed to write debug log",
            err && (err.stack || err.message || err)
          )
        );
    } catch (err) {
      console.error("[media] debug log write error", err && (err.stack || err.message || err));
    }
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

    // Log origin fetch result so we can debug TikTok download issues
    const fetchedLength = fetchRes.headers.get
      ? fetchRes.headers.get("content-length")
      : fetchRes.headers && fetchRes.headers["content-length"];
    console.log(
      `[media] fetched host=${host} status=${fetchRes.status} content-length=${fetchedLength}`
    );

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
    if (!fetchRes.body) {
      console.log("[media] origin had no body");
      return res.end();
    }

    const nodeStream = toNodeStream(fetchRes.body) || Readable.from(fetchRes.body);

    pipeline(nodeStream, res, err => {
      if (err) {
        console.error("[media] stream pipeline error", err && (err.stack || err.message || err));
      } else {
        console.log(`[media] stream pipeline completed id=${id}`);
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
