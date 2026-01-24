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
    let url = content && (content.url || content.mediaUrl || content.videoUrl);
    if (!url) return res.status(404).send("No media URL");

    // If the stored URL points to our own domain (proxy loop), try to resolve a signed GCS URL
    const myHosts = ["api.autopromote.org", "autopromote.onrender.com"];
    try {
      const parsed = new URL(url);
      if (myHosts.includes(parsed.hostname)) {
        // Try to find storagePath on the content doc
        if (content.storagePath) {
          const { Storage } = require("@google-cloud/storage");
          const storage = new Storage();
          const file = storage
            .bucket(process.env.FIREBASE_STORAGE_BUCKET)
            .file(content.storagePath);
          const [signed] = await file.getSignedUrl({
            version: "v4",
            action: "read",
            expires: Date.now() + 60 * 60 * 1000,
          });
          url = signed;
        } else {
          // Try to infer by listing uploads/videos and matching title or id
          const { Storage } = require("@google-cloud/storage");
          const storage = new Storage();
          const [files] = await storage
            .bucket(process.env.FIREBASE_STORAGE_BUCKET)
            .getFiles({ prefix: "uploads/videos/", maxResults: 200 });
          const match = files.find(
            f => f.name.includes(content.title || id) || f.name.includes(id)
          );
          if (match) {
            const fileRef = storage.bucket(process.env.FIREBASE_STORAGE_BUCKET).file(match.name);
            const [signed] = await fileRef.getSignedUrl({
              version: "v4",
              action: "read",
              expires: Date.now() + 60 * 60 * 1000,
            });
            url = signed;
            // Persist storagePath and mediaUrl back to content doc so subsequent requests don't need to list
            try {
              await db
                .collection("content")
                .doc(id)
                .update({
                  storagePath: match.name,
                  mediaUrl: signed,
                  urlSignedAt: new Date().toISOString(),
                });
            } catch (err) {
              console.error(
                "[media] failed to update content doc with storagePath",
                err && (err.stack || err.message || err)
              );
            }
          }
        }
      }
    } catch (e) {
      // ignore URL parsing or storage errors here — we'll surface later if fetch fails
      console.error("[media] HEAD signed-url fallback error", e && (e.stack || e.message || e));
    }

    const host = new URL(url).host;
    try {
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

      // Record debug info about the origin response
      try {
        const originBody =
          initRes && initRes.text
            ? await Promise.race([initRes.text(), new Promise(r => setTimeout(() => r(""), 500))])
            : "";
        db.collection("debug_media_fetches")
          .add({
            contentId: id,
            originHost: host,
            originStatus: initRes.status,
            originBodySnippet: originBody && originBody.slice ? originBody.slice(0, 2000) : "",
            contentLength:
              (initRes.headers &&
                (initRes.headers.get
                  ? initRes.headers.get("content-length")
                  : initRes.headers && initRes.headers["content-length"])) ||
              null,
            ts: new Date(),
          })
          .catch(err =>
            console.error(
              "[media] failed to write fetch debug",
              err && (err.stack || err.message || err)
            )
          );
      } catch (err) {
        console.error(
          "[media] failed to capture origin body for HEAD",
          err && (err.stack || err.message || err)
        );
      }

      return res.status(initRes.status).end();
    } catch (err) {
      // Record error to debug collection
      try {
        db.collection("debug_media_fetches")
          .add({
            contentId: id,
            originHost: new URL(url).host || null,
            originError: (err && (err.message || String(err))) || "unknown",
            ts: new Date(),
          })
          .catch(e =>
            console.error(
              "[media] failed to write fetch error debug",
              e && (e.stack || e.message || e)
            )
          );
      } catch (e) {
        console.error("[media] error debug write failure", e && (e.stack || e.message || e));
      }
      throw err;
    }
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
    let url = content && (content.url || content.mediaUrl || content.videoUrl);
    if (!url) return res.status(404).send("No media URL");

    // If the stored URL points to our own domain (proxy loop), try to resolve a signed GCS URL
    const myHosts = ["api.autopromote.org", "autopromote.onrender.com"];
    try {
      const parsed = new URL(url);
      if (myHosts.includes(parsed.hostname)) {
        if (content.storagePath) {
          const { Storage } = require("@google-cloud/storage");
          const storage = new Storage();
          const file = storage
            .bucket(process.env.FIREBASE_STORAGE_BUCKET)
            .file(content.storagePath);
          const [signed] = await file.getSignedUrl({
            version: "v4",
            action: "read",
            expires: Date.now() + 60 * 60 * 1000,
          });
          url = signed;
        } else {
          const { Storage } = require("@google-cloud/storage");
          const storage = new Storage();
          const [files] = await storage
            .bucket(process.env.FIREBASE_STORAGE_BUCKET)
            .getFiles({ prefix: "uploads/videos/", maxResults: 200 });
          const match = files.find(
            f => f.name.includes(content.title || id) || f.name.includes(id)
          );
          if (match) {
            const fileRef = storage.bucket(process.env.FIREBASE_STORAGE_BUCKET).file(match.name);
            const [signed] = await fileRef.getSignedUrl({
              version: "v4",
              action: "read",
              expires: Date.now() + 60 * 60 * 1000,
            });
            url = signed;
            try {
              await db
                .collection("content")
                .doc(id)
                .update({
                  storagePath: match.name,
                  mediaUrl: signed,
                  urlSignedAt: new Date().toISOString(),
                });
            } catch (err) {
              console.error(
                "[media] failed to update content doc with storagePath",
                err && (err.stack || err.message || err)
              );
            }
          }
        }
      }
    } catch (e) {
      console.error("[media] GET signed-url fallback error", e && (e.stack || e.message || e));
    }

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

    // Record fetch result and any body snippet for debugging
    try {
      const bodySnippet =
        fetchRes && fetchRes.text
          ? await Promise.race([fetchRes.text(), new Promise(r => setTimeout(() => r(""), 500))])
          : "";
      db.collection("debug_media_fetches")
        .add({
          contentId: id,
          originHost: host,
          originStatus: fetchRes.status,
          originBodySnippet: bodySnippet && bodySnippet.slice ? bodySnippet.slice(0, 2000) : "",
          contentLength: fetchedLength || null,
          ts: new Date(),
        })
        .catch(err =>
          console.error(
            "[media] failed to write fetch debug",
            err && (err.stack || err.message || err)
          )
        );
    } catch (err) {
      console.error(
        "[media] fetch debug body read error",
        err && (err.stack || err.message || err)
      );
    }

    // Temporary: record origin fetch status to Firestore to verify TikTok can reach the signed URL
    try {
      db.collection("debug_media_fetches")
        .add({
          contentId: id,
          originHost: host,
          originStatus: fetchRes.status,
          contentLength: fetchedLength || null,
          ts: new Date(),
        })
        .catch(err =>
          console.error(
            "[media] failed to write fetch debug",
            err && (err.stack || err.message || err)
          )
        );
    } catch (err) {
      console.error("[media] fetch debug write error", err && (err.stack || err.message || err));
    }

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
