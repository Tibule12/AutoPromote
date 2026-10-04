#!/usr/bin/env node
// Capture independent staging reads after the real browser acceptance run.
const assert = require("assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const admin = require("firebase-admin");
const projectId = "autopromote-staging-2026";
const root = path.resolve(__dirname, "..");
const local = path.join(root, "artifacts/studio-analysis-browser-20261004");
const report = path.join(root, "reports/studio-analysis-browser-20261004");
const receipt = JSON.parse(fs.readFileSync(path.join(local, "browser-receipt.json")));
assert.equal(receipt.projectId, projectId);
assert(receipt.passed);
assert(process.env.GOOGLE_APPLICATION_CREDENTIALS);
for (const key of [
  "FIREBASE_ADMIN_BYPASS",
  "CI_ROUTE_IMPORTS",
  "JEST_WORKER_ID",
  "FIREBASE_AUTH_EMULATOR_HOST",
  "FIRESTORE_EMULATOR_HOST",
  "STORAGE_EMULATOR_HOST",
])
  assert(!process.env[key], `${key} must be unset`);
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId,
  storageBucket: `${projectId}.firebasestorage.app`,
});
const write = (name, data) =>
  fs.writeFileSync(path.join(report, name), JSON.stringify(data, null, 2));
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
async function main() {
  fs.mkdirSync(report, { recursive: true });
  const db = admin.firestore();
  const job = (await db.collection("studio_analysis_jobs").doc(receipt.jobId).get()).data();
  assert.equal(job.status, "completed");
  write("cloud-job.json", job);
  for (const [collection, hash, name] of [
    ["studioAnalysisArtifacts", job.analysisArtifact.artifactHash, "cloud-analysis-artifact.json"],
    [
      "studioSourceShotArtifacts",
      job.sourceShotArtifact.artifactHash,
      "cloud-source-shot-artifact.json",
    ],
  ]) {
    const doc = await db
      .collection("users")
      .doc(job.ownerUid)
      .collection(collection)
      .doc(hash)
      .get();
    assert(doc.exists);
    write(name, doc.data());
  }
  const bucket = admin.storage().bucket(job.sourceBucketName);
  const [sourceMetadata] = await bucket.file(job.sourceObjectPath).getMetadata();
  write("source-metadata.json", sourceMetadata);
  const boot = JSON.parse(fs.readFileSync(path.join(local, "bootstrap.json")));
  const media = JSON.parse(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "stream=codec_type,codec_name,width,height,pix_fmt:format=duration",
        "-of",
        "json",
        boot.sourceUrl,
      ],
      { encoding: "utf8", timeout: 30000 }
    )
  );
  write("source-media.json", media);
  const file = bucket.file(
    `studio/analysis-results/${job.ownerUid}/${job.jobId}/${job.resultSha256}.json`
  );
  const [resultMetadata] = await file.getMetadata();
  const [result] = await file.download();
  assert.equal(sha(result), job.resultSha256);
  fs.writeFileSync(path.join(report, "cloud-result.json"), result);
  write("cloud-result-metadata.json", resultMetadata);
  const execution = JSON.parse(
    execFileSync(
      "gcloud",
      [
        "run",
        "jobs",
        "executions",
        "describe",
        receipt.cloudWorker,
        `--project=${projectId}`,
        "--region=us-central1",
        "--format=json",
      ],
      { encoding: "utf8" }
    )
  );
  for (const key of Object.keys(execution.metadata.annotations || {}))
    if (/creator|lastModifier/i.test(key)) delete execution.metadata.annotations[key];
  write("cloud-execution.json", execution);
  for (const name of [
    "browser-receipt.json",
    "browser-submission.json",
    "browser-result.json",
    "browser-network.json",
    "backend-authorization.json",
    "editor-before.json",
    "editor-after.json",
  ])
    fs.copyFileSync(path.join(local, name), path.join(report, name));
  const visuals = [
    "frontend-before.png",
    "frontend-queued.png",
    "frontend-running.png",
    "frontend-applied.png",
    "frontend-browser.webm",
  ].map(name => {
    const bytes = fs.readFileSync(path.join(local, name));
    return {
      path: `../../artifacts/studio-analysis-browser-20261004/${name}`,
      bytes: bytes.length,
      sha256: sha(bytes),
    };
  });
  write("visuals.json", {
    storage: "Local ignored artifacts; source footage is not pushed",
    files: visuals,
  });
  write("collection.json", {
    collectedAt: new Date().toISOString(),
    projectId,
    source:
      "Independent authenticated staging Firestore, GCS and Cloud Run reads; tokens and signed URLs excluded",
  });
  const files = fs
    .readdirSync(report)
    .filter(name => name.endsWith(".json") && !["files.json", "verification.json"].includes(name))
    .sort()
    .map(name => {
      const bytes = fs.readFileSync(path.join(report, name));
      return { path: name, bytes: bytes.length, sha256: sha(bytes) };
    });
  write("files.json", { files });
  await db.terminate();
  console.log(
    JSON.stringify({
      captured: true,
      jobId: job.jobId,
      files: files.length,
      resultBytes: result.length,
      resultSha256: job.resultSha256,
    })
  );
}
main().catch(error => {
  console.error("Browser proof capture failed:", error.code || error.message);
  process.exitCode = 1;
});
