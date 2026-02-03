const express = require("express");
const { db } = require("../firebaseAdmin");
const { safeFetch } = require("../utils/ssrfGuard");
const { Readable, pipeline } = require("stream");
const rateLimit = require("express-rate-limit");
const router = express.Router();

const mediaRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100, // Higher limit for media/verification checks
  standardHeaders: true,
  legacyHeaders: false,
});

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
router.head("/media/tiktok-developers-site-verification.txt", mediaRateLimiter, async (req, res) => {
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

// Serve verification file and also support the prefix root (/media/) so verifiers that request the prefix still find the token
router.get(
  ["/media/tiktok-developers-site-verification.txt", "/media", "/media/"],
  mediaRateLimiter,
  async (req, res) => {
    try {
      // Behavior:
      // - If request is for the explicit filename, prefer the committed static file (so verification by filename is exact)
      // - If request is for the prefix (/media or /media/), prefer the environment variable (tests and dynamic overrides typically set this)
      let token;
      const isExplicitFile =
        req.path && req.path.endsWith("tiktok-developers-site-verification.txt");

      if (isExplicitFile) {
        // Try file first, then env var
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
        if (!token) token = process.env.TIKTOK_DEVELOPERS_SITE_VERIFICATION;
      } else {
        // Prefix request (/media) - prefer env then file
        token = process.env.TIKTOK_DEVELOPERS_SITE_VERIFICATION;
        if (!token) {
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
        }
      }

      if (!token) return res.status(404).send("Not found");
      res.setHeader("content-type", "text/plain; charset=utf-8");
      // Return plain token line so verifiers can find it either by requesting /media/ or the explicit filename
      return res.status(200).send(`tiktok-developers-site-verification=${token}`);
    } catch (e) {
      console.error("[media] verification GET error", e && (e.stack || e.message || e));
      return res.status(500).json({ error: "internal_error" });
    }
  }
);

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
              await db.collection("content").doc(id).update({
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
      // Record error to debug collection with stack for better debugging
      try {
        db.collection("debug_media_fetches")
          .add({
            contentId: id,
            originHost: new URL(url).host || null,
            originError: (err && (err.message || String(err))) || "unknown",
            originStack: (err && err.stack) || null,
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
              await db.collection("content").doc(id).update({
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
    let fetchRes;
    try {
      fetchRes = await safeFetch(url, global.fetch || require("node-fetch"), {
        fetchOptions: { method: "GET" },
        allowHosts: [host],
        requireHttps: true,
      });
    } catch (err) {
      console.error("[media] error fetching origin URL", err && (err.stack || err.message || err));
      try {
        db.collection("debug_media_fetches")
          .add({
            contentId: id,
            originHost: host,
            originError: (err && (err.message || String(err))) || "unknown",
            originStack: (err && err.stack) || null,
            ts: new Date(),
          })
          .catch(e =>
            console.error(
              "[media] failed to write fetch error debug",
              e && (e.stack || e.message || e)
            )
          );
      } catch (e) {
        console.error("[media] fetch error debug write failure", e && (e.stack || e.message || e));
      }
      // Return 502 to indicate upstream fetch failed
      return res.status(502).json({ error: "origin_fetch_failed" });
    }

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
        // Persist pipeline error to debug collection for correlation with TikTok failure
        try {
          db.collection("debug_media_fetches")
            .add({
              contentId: id,
              pipelineError: (err && (err.message || String(err))) || "unknown",
              pipelineStack: (err && err.stack) || null,
              ts: new Date(),
            })
            .catch(e =>
              console.error(
                "[media] failed to write pipeline error debug",
                e && (e.stack || e.message || e)
              )
            );
        } catch (e) {
          console.error("[media] pipeline debug write failed", e && (e.stack || e.message || e));
        }
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
