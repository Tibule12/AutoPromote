const { resolve } = require("path");
require("dotenv").config({ path: resolve(__dirname, ".env") });

const { admin, db } = require("../src/firebaseAdmin");

const PAGE_SIZE = 300;
const BATCH_SIZE = 450;

function parseArgs() {
  const rawArgs = process.argv.slice(2);
  const getValue = (name, fallback = null) => {
    const prefixed = `--${name}=`;
    const pairArg = rawArgs.find(arg => arg.startsWith(prefixed));
    if (pairArg) {
      return pairArg.slice(prefixed.length);
    }
    const flagIndex = rawArgs.findIndex(arg => arg === `--${name}`);
    if (flagIndex >= 0 && rawArgs[flagIndex + 1] && !rawArgs[flagIndex + 1].startsWith("--")) {
      return rawArgs[flagIndex + 1];
    }
    return fallback;
  };

  return {
    type: getValue("type", "platform_post"),
    limit: Number(getValue("limit", "0")) || null,
    dryRun: rawArgs.includes("--dry-run"),
    statusOnly: rawArgs.includes("--status-only"),
  };
}

function hasValue(value) {
  return value !== undefined && value !== null && value !== "";
}

function isBooleanLike(value) {
  return value === true || value === false;
}

function hasCompletedSignal(data) {
  const outcome = data.outcome || data.platformOutcome || data.result || null;
  if (isBooleanLike(data.success)) return data.success;
  if (outcome && isBooleanLike(outcome.success)) return outcome.success;

  const completionFields = [
    "externalId",
    "postId",
    "tweetId",
    "mediaId",
    "shareId",
    "videoId",
    "platformPostId",
    "platform_post_id",
    "externalPostId",
    "publishedAt",
    "completedAt",
    "finishedAt",
    "postedAt",
    "success",
  ];
  if (completionFields.some(field => hasValue(data[field]))) return true;

  if (outcome) {
    if (outcome.externalId || outcome.postId || outcome.posted === true || outcome.success === true) return true;
    if (outcome.platformPostId || outcome.platform_post_id || outcome.id) return true;
  }

  return false;
}

function hasFailureSignal(data) {
  const explicitFailure = ["failed", "error", "skipped", "retry"];
  if (explicitFailure.includes(data.state)) return true;

  const failureFields = [
    "error",
    "errors",
    "lastError",
    "errorMessage",
    "failureReason",
    "failedAt",
    "failureCode",
    "rejectReason",
    "skipReason",
    "skippedReason",
    "integrityFailed",
    "retryError",
    "processingError",
    "errorAt",
  ];

  if (failureFields.some(field => hasValue(data[field]) && data[field] !== false)) return true;

  if (data.success === false) return true;

  const outcome = data.outcome || data.platformOutcome || data.result || null;
  if (outcome && isBooleanLike(outcome.success)) return outcome.success === false;
  if (outcome && (outcome.error || outcome.errors || outcome.errorMessage)) return true;

  return false;
}

function inferTaskStatus(data) {
  if (hasCompletedSignal(data)) return "completed";
  if (hasFailureSignal(data)) return "failed";
  return "queued";
}

function formatSummary(summary) {
  return (
    `Scanned: ${summary.scanned}\n` +
    `Missing status: ${summary.missingStatus}\n` +
    `Would set to completed: ${summary.wouldBeCompleted}\n` +
    `Would set to failed: ${summary.wouldBeFailed}\n` +
    `Would set to queued: ${summary.wouldBeQueued}\n` +
    `Updated: ${summary.updated}\n` +
    `Batches committed: ${summary.batches}`
  );
}

async function migrate() {
  const args = parseArgs();
  const targetType = args.type || "platform_post";
  const shouldWrite = !args.dryRun && !args.statusOnly;
  const writeMode = shouldWrite ? "MIGRATE" : args.statusOnly ? "STATUS-ONLY" : "DRY-RUN";

  console.log(`[migrate] type=${targetType} mode=${writeMode} limit=${args.limit || "none"}`);

  const summary = {
    scanned: 0,
    missingStatus: 0,
    wouldBeCompleted: 0,
    wouldBeFailed: 0,
    wouldBeQueued: 0,
    updated: 0,
    batches: 0,
  };

  const limit = args.limit && args.limit > 0 ? args.limit : null;
  let processedLimit = 0;
  let cursor = null;
  let hasMore = true;

  while (hasMore) {
    let query = db
      .collection("promotion_tasks")
      .where("type", "==", targetType)
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(PAGE_SIZE);

    if (cursor) {
      query = query.startAfter(cursor);
    }

    const snapshot = await query.get();
    if (snapshot.empty) {
      break;
    }

    let writeBatch = db.batch();
    let batchOps = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data() || {};
      summary.scanned += 1;

      if (Object.prototype.hasOwnProperty.call(data, "status")) {
        continue;
      }

      const inferredStatus = inferTaskStatus(data);
      summary.missingStatus += 1;
      processedLimit += 1;
      if (inferredStatus === "completed") summary.wouldBeCompleted += 1;
      if (inferredStatus === "failed") summary.wouldBeFailed += 1;
      if (inferredStatus === "queued") summary.wouldBeQueued += 1;

      console.log(`- ${doc.id} => status:${inferredStatus}`);

      if (!shouldWrite) continue;

      writeBatch.update(doc.ref, { status: inferredStatus });
      batchOps += 1;
      summary.updated += 1;

      if (batchOps >= BATCH_SIZE) {
        await writeBatch.commit();
        summary.batches += 1;
        writeBatch = db.batch();
        batchOps = 0;
      }

      if (limit && processedLimit >= limit) {
        break;
      }
    }

    if (batchOps > 0) {
      if (shouldWrite) {
        await writeBatch.commit();
        summary.batches += 1;
      }
    }

    cursor = snapshot.docs[snapshot.docs.length - 1];
    if (limit && processedLimit >= limit) {
      break;
    }

    hasMore = snapshot.size === PAGE_SIZE;
  }

  console.log("\nDone.");
  console.log(formatSummary(summary));
}

migrate().catch(error => {
  console.error("[migrate] failed:", error && error.stack ? error.stack : error);
  process.exit(1);
});
