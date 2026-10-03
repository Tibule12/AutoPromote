#!/usr/bin/env node
// One synthetic source-shot job against the isolated staging Firebase project.
const assert = require("assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const axios = require("axios");

const projectId = "autopromote-staging-2026";
const bucketName = `${projectId}.firebasestorage.app`;
const credentialsPath = process.env.STUDIO_ANALYSIS_SMOKE_CREDENTIALS;
const workerUrl = process.env.STUDIO_ANALYSIS_SMOKE_WORKER_URL;
if (!credentialsPath || !workerUrl)
  throw new Error("Set STUDIO_ANALYSIS_SMOKE_CREDENTIALS and STUDIO_ANALYSIS_SMOKE_WORKER_URL");
const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
assert.equal(credentials.project_id, projectId);
assert.equal(credentials.client_email.endsWith(`@${projectId}.iam.gserviceaccount.com`), true);
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify(credentials);
process.env.FIREBASE_STORAGE_BUCKET = bucketName;
process.env.FIREBASE_PROJECT_ID = projectId;
process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath;

const { db } = require("../src/firebaseAdmin");
const admin = require("firebase-admin");
const {
  createStudioAnalysisJobFromOwnedSource,
  getOwnedStudioAnalysisJob,
  getOwnedStudioAnalysisResult,
  processStudioAnalysisJob,
} = require("../src/services/studioAnalysisJobService");

const main = async () => {
  assert.equal(admin.app().options.projectId, projectId);
  const bucket = admin.storage().bucket(bucketName);
  const verifyJobId = process.env.STUDIO_ANALYSIS_SMOKE_VERIFY_JOB_ID;
  if (verifyJobId) {
    assert.match(verifyJobId, /^[a-f0-9]{64}$/);
    try {
      const receipt = await getOwnedStudioAnalysisJob({
        uid: "staging-smoke",
        jobId: verifyJobId,
        firestore: db,
      });
      assert.equal(receipt.status, "completed", JSON.stringify(receipt));
      const result = await getOwnedStudioAnalysisResult({
        uid: "staging-smoke",
        jobId: verifyJobId,
        firestore: db,
        storage: bucket,
      });
      assert.equal(result.engine, "opencv-yunet-source-shot-follow");
      console.log(
        JSON.stringify(
          {
            projectId,
            jobId: verifyJobId,
            status: receipt.status,
            resultSha256: receipt.resultSha256,
            sourceShotArtifactHash: receipt.sourceShotArtifact.artifactHash,
            analysisArtifactHash: receipt.analysisArtifact.artifactHash,
            sceneCuts: result.sceneCuts.length,
            coverage: result.tracks.solo.coverage,
          },
          null,
          2
        )
      );
    } finally {
      await db.terminate();
    }
    return;
  }
  const runId = crypto.randomUUID();
  const uid = "staging-smoke";
  const sourcePath = `studio/sources/${uid}/${runId}.mp4`;
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "studio-analysis-smoke-"));
  const videoPath = path.join(folder, "synthetic.mp4");
  try {
    const ffmpeg = spawnSync(
      "ffmpeg",
      [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=size=320x180:rate=12",
        "-t",
        "3",
        "-pix_fmt",
        "yuv420p",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-y",
        videoPath,
      ],
      { encoding: "utf8", timeout: 30000 }
    );
    if (ffmpeg.status !== 0) throw new Error(`Synthetic video generation failed: ${ffmpeg.stderr}`);
    const sourceSha256 = crypto
      .createHash("sha256")
      .update(fs.readFileSync(videoPath))
      .digest("hex");
    await bucket.upload(videoPath, {
      destination: sourcePath,
      resumable: false,
      preconditionOpts: { ifGenerationMatch: 0 },
      metadata: {
        contentType: "video/mp4",
        metadata: {
          ownerUid: uid,
          purpose: "studio_source",
        },
      },
    });
    const request = {
      uid,
      requestId: `staging-${runId}`,
      projectId: `staging-${runId}`,
      sourceAssetId: `source:sha256:${sourceSha256}`,
      storagePath: sourcePath,
      mode: "source_shots",
      start: 0,
      end: 2,
      anchors: { solo: { x: 50, y: 50 } },
    };
    const queued = await createStudioAnalysisJobFromOwnedSource(request, {
      firestore: db,
      sourceStorage: bucket,
    });
    assert.equal(queued.status, "queued");
    if (process.env.STUDIO_ANALYSIS_SMOKE_QUEUE_ONLY === "true") {
      console.log(
        JSON.stringify(
          {
            projectId,
            bucketName,
            jobId: queued.jobId,
            sourcePath,
            sourceSha256,
            status: queued.status,
          },
          null,
          2
        )
      );
      return;
    }
    await processStudioAnalysisJob({
      jobId: queued.jobId,
      workerId: `smoke-${runId}`,
      firestore: db,
      storage: bucket,
      runWorker: async (job, signedUrl) => {
        const response = await axios.post(
          `${workerUrl.replace(/\/$/, "")}/track-studio-faces`,
          {
            video_url: signedUrl,
            mode: job.mode,
            start: job.start,
            end: job.end,
            anchors: job.anchors,
          },
          { timeout: 180000 }
        );
        return response.data;
      },
    });
    const receipt = await getOwnedStudioAnalysisJob({ uid, jobId: queued.jobId, firestore: db });
    assert.equal(receipt.status, "completed", JSON.stringify(receipt));
    assert.equal(receipt.sourceSha256, sourceSha256);
    const result = await getOwnedStudioAnalysisResult({
      uid,
      jobId: queued.jobId,
      firestore: db,
      storage: bucket,
    });
    assert.equal(result.mode, "source_shots");
    assert.equal(result.engine, "opencv-yunet-source-shot-follow");
    assert.equal((await bucket.file(sourcePath).exists())[0], true);
    console.log(
      JSON.stringify(
        {
          projectId,
          bucketName,
          jobId: queued.jobId,
          sourcePath,
          sourceSha256,
          status: receipt.status,
          resultSha256: receipt.resultSha256,
          sourceShotArtifactHash: receipt.sourceShotArtifact.artifactHash,
          analysisArtifactHash: receipt.analysisArtifact.artifactHash,
          sceneCuts: result.sceneCuts.length,
          coverage: result.tracks.solo.coverage,
        },
        null,
        2
      )
    );
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
    await db.terminate();
  }
};

main().catch(error => {
  console.error("Staging analysis smoke failed:", error?.code || error?.message);
  process.exitCode = 1;
});
