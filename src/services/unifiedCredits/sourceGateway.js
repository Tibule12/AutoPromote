const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { assertSandbox } = require("./runtime");
const { fail } = require("./policy");
const { digest, canonical } = require("./workerVerification");
const execute = promisify(execFile);

// Actual emulator objects, owner checks and byte hashes. No production bucket
// or arbitrary caller URL is accepted. Read capabilities are not worker proofs.
function createSourceGateway({
  db,
  bucket,
  origin,
  storageOrigin,
  secret,
  cohort,
  admission,
  service,
  limits = {},
}) {
  assertSandbox(process.env, db);
  if (bucket.name !== "demo-autopromote-credits" || !/^http:\/\/127\.0\.0\.1:[0-9]+$/.test(origin))
    fail("DEMO_STORAGE_REQUIRED");
  const maxSourceSeconds = Number(limits.maxSourceSeconds ?? 30);
  const maxExecutionSeconds = Number(limits.maxExecutionSeconds ?? 120);
  if (!Number.isInteger(maxSourceSeconds) || maxSourceSeconds < 1 || maxSourceSeconds > 120 ||
      !Number.isInteger(maxExecutionSeconds) || maxExecutionSeconds < 1 || maxExecutionSeconds > 900)
    fail("INVALID_LOCAL_DEMO_LIMITS");
  const mac = value => crypto.createHmac("sha256", secret).update(value).digest("base64url");
  const owner = (name, meta) =>
    meta.metadata?.ownerUid ||
    meta.metadata?.userId ||
    cohort.find(uid => name.split("/").includes(uid));
  function decode(url, uid) {
    const parsed = new URL(url);
    if (parsed.origin === origin && parsed.pathname.startsWith("/api/credit-pilot/object/")) {
      const [payload, signature] = (parsed.searchParams.get("cap") || "").split(".");
      const expected = mac(payload || "");
      if (
        !signature ||
        signature.length !== expected.length ||
        !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
      )
        fail("SOURCE_FORBIDDEN", 403);
      const data = JSON.parse(Buffer.from(payload, "base64url"));
      if (uid && data.userId !== uid) fail("SOURCE_FORBIDDEN", 403);
      return data;
    }
    if (parsed.origin === storageOrigin) {
      const match = /^\/v0\/b\/([^/]+)\/o\/(.+)$/.exec(parsed.pathname);
      if (match && decodeURIComponent(match[1]) === bucket.name)
        return { storagePath: decodeURIComponent(match[2]) };
    }
    fail("UNOWNED_SOURCE_URL", 403);
  }
  async function describe(uid, storagePath) {
    assertSandbox(process.env, db);
    if (
      !cohort.includes(uid) ||
      typeof storagePath !== "string" ||
      storagePath.includes("..") ||
      storagePath.startsWith("/")
    )
      fail("SOURCE_FORBIDDEN", 403);
    const file = bucket.file(storagePath);
    const [metadata] = await file.getMetadata();
    if (owner(storagePath, metadata) !== uid || Number(metadata.size) > 50 * 1024 * 1024)
      fail("SOURCE_FORBIDDEN", 403);
    const [bytes] = await file.download();
    // Use the standard SHA-256 of the actual bytes, independent of metadata claims.
    const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    const generation = String(metadata.generation);
    const key = digest([uid, storagePath, generation, sha256]);
    return {
      userId: uid,
      storagePath,
      objectGeneration: generation,
      contentHash: sha256,
      size: bytes.length,
      gatewayPath: `/api/credit-pilot/object/${key}`,
      contentType: metadata.contentType || "application/octet-stream",
    };
  }
  function capability(source) {
    const payload = Buffer.from(
      canonical({ ...source, expiresAt: Date.now() + 30 * 60000 })
    ).toString("base64url");
    return `${origin}${source.gatewayPath}?cap=${payload}.${mac(payload)}`;
  }
  async function ownedUrl(uid, url) {
    return describe(uid, decode(url, uid).storagePath);
  }
  async function sourceFor(uid, requestBody, route) {
    if (requestBody.sourceStoragePath) return describe(uid, requestBody.sourceStoragePath);
    let url = requestBody.fileUrl || requestBody.videoUrl || requestBody.url;
    if (requestBody.analysisId) {
      const analysis = await db.collection("clip_analyses").doc(requestBody.analysisId).get();
      if (!analysis.exists || analysis.data().userId !== uid) fail("SOURCE_FORBIDDEN", 403);
      url = analysis.data().videoUrl;
    }
    const contentId =
      requestBody.contentId || /^\/api\/content\/([^/]+)\/promotion-schedules$/.exec(route)?.[1];
    if (!url && contentId) {
      const content = await db.collection("content").doc(contentId).get();
      if (!content.exists || (content.data().user_id || content.data().userId) !== uid)
        fail("SOURCE_FORBIDDEN", 403);
      url = content.data().url;
    }
    if (!url && requestBody.renderJobId) {
      const job = await db.collection("video_edits").doc(requestBody.renderJobId).get();
      if (!job.exists || job.data().userId !== uid) fail("SOURCE_FORBIDDEN", 403);
      if (job.data().outputStoragePath) return describe(uid, job.data().outputStoragePath);
      url = job.data().outputUrl;
    }
    return ownedUrl(uid, url);
  }
  const api = {
    async describeOwnedUrl(uid, url) { return ownedUrl(uid, url); },
    async signedUrl(uid, name) {
      return capability(await describe(uid, name));
    },
    async prepare(uid, { operation, route, requestBody }) {
      assertSandbox(process.env, db);
      const expected =
        route === "/api/media/process"
          ? "studio.render"
          : ["/api/media/analyze", "/api/clips/analyze"].includes(route)
            ? "clips.analyze"
            : ["/api/media/render-clip", "/api/clips/generate"].includes(route)
              ? "clips.render"
              : route === "/api/content/upload"
                ? "publisher.publish"
                : /^\/api\/content\/(?:promotion-schedules\/[^/]+\/(?:resume|reschedule)|[^/]+\/promotion-schedules)$/.test(
                      route
                    ) || route === "/api/promotion-tasks/platform/enqueue"
                  ? "queue.dispatch"
                  : null;
      if (!expected || expected !== operation) fail("OUTSIDE_PILOT_SCOPE", 403);
      const scheduleId =
        /^\/api\/content\/promotion-schedules\/([^/]+)\/(?:resume|reschedule)$/.exec(route)?.[1];
      let schedule;
      if (scheduleId) {
        const snap = await db.collection("promotion_schedules").doc(scheduleId).get();
        if (!snap.exists || (snap.data().user_id || snap.data().userId) !== uid)
          fail("SOURCE_FORBIDDEN", 403);
        schedule = snap.data();
        if (schedule.creditOperationId) return { reuseOperationId: schedule.creditOperationId };
      }
      const lookupBody = schedule
        ? { contentId: schedule.content_id || schedule.contentId }
        : requestBody;
      const primary = await sourceFor(uid, lookupBody, route);
      const sources = [primary];
      for (const segment of requestBody.options?.viralData?.timeline_segments || []) {
        if (segment.sourceStoragePath && segment.sourceStoragePath !== primary.storagePath)
          sources.push(await describe(uid, segment.sourceStoragePath));
      }
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "credit-source-probe-"));
      let duration;
      try {
        const [bytes] = await bucket.file(primary.storagePath).download();
        await fs.writeFile(path.join(dir, "source"), bytes);
        const result = await execute(
          "ffprobe",
          [
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
            path.join(dir, "source"),
          ],
          { timeout: 5000, maxBuffer: 65536 }
        );
        duration = Number(JSON.parse(result.stdout).format.duration);
        if (!Number.isFinite(duration) || duration <= 0 || duration > maxSourceSeconds)
          fail("PILOT_MEDIA_LIMIT", 413);
      } finally {
        await fs.rm(dir, { recursive: true, force: true });
      }
      const destinations =
        operation === "publisher.publish"
          ? requestBody.target_platforms
          : operation === "queue.dispatch"
            ? requestBody.platforms || [requestBody.platform || schedule?.platform].filter(Boolean)
            : [];
      if (
        destinations?.some(
          platform =>
            !["facebook", "youtube", "instagram", "tiktok", "linkedin", "reddit"].includes(platform)
        )
      )
        fail("INVALID_DESTINATIONS");
      const sourceId = `app-${digest([uid, route, requestBody])}`;
      const record = {
        userId: uid,
        resourceClass: "media-cpu",
        gpu: false,
        contentHash: primary.contentHash,
        objectGeneration: primary.objectGeneration,
        enforcedMaxSeconds: maxExecutionSeconds,
        allowedDestinations: destinations || [],
        workflowInput: {
          requestBody,
          route,
          sources,
          duration,
          expectedExecutions:
            operation === "publisher.publish" || operation === "queue.dispatch"
              ? destinations.length
              : 1,
          ...(scheduleId ? { scheduleId } : {}),
        },
      };
      await db
        .collection("credits_v2_inputs")
        .doc(digest([uid, sourceId]))
        .set(record);
      const quote = await admission.quote(uid, {
        sourceId,
        operation,
        destinations: destinations || [],
      });
      const wallet = await service.getAccount(uid);
      return { ...quote, balance: wallet.balance, canAfford: wallet.balance >= quote.credits };
    },
    async stream(req, res) {
      const data = decode(`${origin}${req.originalUrl}`);
      if (data.expiresAt < Date.now()) return res.sendStatus(403);
      const actual = await describe(data.userId, data.storagePath);
      if (
        actual.objectGeneration !== data.objectGeneration ||
        actual.contentHash !== data.contentHash ||
        actual.gatewayPath !== req.path
      )
        return res.sendStatus(409);
      const [bytes] = await bucket.file(data.storagePath).download();
      res.set({
        "Content-Type": actual.contentType,
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, no-store",
      });
      const range = /^bytes=([0-9]+)-([0-9]*)$/.exec(req.get("Range") || "");
      if (range) {
        const start = Number(range[1]),
          end = Math.min(range[2] ? Number(range[2]) : bytes.length - 1, bytes.length - 1);
        if (start > end) return res.sendStatus(416);
        res.status(206).set("Content-Range", `bytes ${start}-${end}/${bytes.length}`);
        return res.send(bytes.subarray(start, end + 1));
      }
      return res.send(bytes);
    },
  };
  return api;
}
module.exports = { createSourceGateway };
