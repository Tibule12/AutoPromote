#!/usr/bin/env node
// Offline cross-check of browser, editor and independent cloud receipts.
const assert = require("assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const folder = path.resolve(
  process.argv[2] || path.join(__dirname, "../reports/studio-analysis-browser-20261004")
);
const read = name => JSON.parse(fs.readFileSync(path.join(folder, name), "utf8"));
const stable = value =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map(key => [key, item[key]])
        )
      : item
  );
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const checks = [];
const check = (name, condition) => {
  assert(condition, name);
  checks.push(name);
};
const browser = read("browser-receipt.json");
const submission = read("browser-submission.json");
const result = read("browser-result.json");
const job = read("cloud-job.json");
const after = read("editor-after.json");
const snapshot = after.find(project => project.snapshot.reframeKeyframes.length > 1000).snapshot;
const network = read("browser-network.json");
const raw = fs.readFileSync(path.join(folder, "cloud-result.json"));
const artifact = read("cloud-analysis-artifact.json");
const sourceShot = read("cloud-source-shot-artifact.json");
const source = read("source-metadata.json");
const media = read("source-media.json");
const execution = read("cloud-execution.json");
const authorization = read("backend-authorization.json");
check("browser acceptance passed", browser.passed === true);
check("real Firebase auth with no bypass", browser.realFirebaseAuth && !browser.authBypass);
check("requests are not mocked", browser.mockedRequests === 0);
check("isolated staging project", browser.projectId === "autopromote-staging-2026");
check(
  "all three durable states were observed",
  ["queued", "running", "completed"].every(state => browser.states.includes(state))
);
check("no browser JavaScript errors", browser.pageErrors.length === 0);
check(
  "four monitored playback checks",
  browser.playbackChecks.length === 4 &&
    browser.playbackChecks.every(
      state =>
        !state.paused &&
        !state.muted &&
        state.volume > 0.05 &&
        state.currentTime > state.beforeTime + 0.2
    )
);
check("framing retained while queued", browser.previousFramingPreservedWhileQueued === true);
check(
  "real queue HTTP 202",
  network.some(
    row => row.method === "POST" && row.path.endsWith("/from-source") && row.status === 202
  )
);
check(
  "real running and completed polls",
  ["running", "completed"].every(state =>
    network.some(row => row.jobStatus === state && row.status === 200)
  )
);
check(
  "real result HTTP 200",
  network.some(row => row.path.endsWith("/result") && row.status === 200)
);
check(
  "ten-minute browser request",
  submission.request.start === 0 && submission.request.end === 600
);
check(
  "browser and cloud job agree",
  submission.receipt.jobId === job.jobId && browser.jobId === job.jobId
);
check("cloud job completed once", job.status === "completed" && job.attempts === 1);
check(
  "request project and asset bindings",
  submission.request.projectId === job.projectId &&
    submission.request.sourceAssetId === job.sourceAssetId
);
check(
  "source was submitted by path",
  submission.request.storagePath === job.sourceObjectPath && job.sourceOwned
);
check(
  "source generation pinned",
  source.generation === job.sourceGeneration && Number(source.size) === job.sourceSizeBytes
);
check(
  "source owner retained",
  source.metadata.ownerUid === job.ownerUid && job.ownerUid === "staging-smoke"
);
check(
  "exact previously verified source bytes",
  job.sourceSha256 === "4a6efc07f90860a22d4fcbebd0ff77ae6bc72907491631e3e217099a2bddeb8c"
);
check("cloud raw result hash", sha(raw) === job.resultSha256);
check("browser result equals stored cloud result", stable(result) === stable(JSON.parse(raw)));
check(
  "browser result hash",
  sha(stable(result)) === browser.resultSha256 && browser.resultSha256 === job.resultSha256
);
check("analysis content hash", artifact.contentHash === job.resultSha256);
check("analysis artifact identity", artifact.artifactHash === job.analysisArtifact.artifactHash);
check(
  "source-shot artifact identity",
  sourceShot.artifactHash === job.sourceShotArtifact.artifactHash
);
check(
  "artifact dependency chain",
  artifact.dependencyHashes.length === 1 && artifact.dependencyHashes[0] === sourceShot.artifactHash
);
check(
  "source and artifact project identity",
  artifact.projectId === job.projectId && sourceShot.projectId === job.projectId
);
check("143 camera cuts", result.sceneCuts.length === 143 && browser.sceneCuts === 143);
check("sampled coverage above 99 percent", result.tracks.solo.coverage > 0.99);
check(
  "every framing point retained",
  snapshot.reframeKeyframes.length === result.tracks.solo.keyframes.length
);
check(
  "every framing point time retained",
  snapshot.reframeKeyframes.every(
    (mark, index) => mark.time === result.tracks.solo.keyframes[index].time
  )
);
const video = media.streams.find(stream => stream.codec_type === "video");
const [aspectWidth, aspectHeight] = snapshot.reframeAspect.split(":").map(Number);
const widthFraction =
  Math.min(1, aspectWidth / aspectHeight / (video.width / video.height)) /
  snapshot.speakerTrackZoom;
check(
  "every detected point converted to the portrait crop",
  snapshot.reframeKeyframes.every((mark, index) => {
    const sourcePoint = result.tracks.solo.keyframes[index];
    const x = Math.max(
      0,
      Math.min(100, (sourcePoint.x - widthFraction * 50) / (1 - widthFraction))
    );
    return (
      Math.abs(mark.x - x) < 1e-9 &&
      mark.y === 50 &&
      mark.origin === sourcePoint.origin &&
      mark.cut === sourcePoint.cut &&
      mark.reviewRequired === sourcePoint.reviewRequired
    );
  })
);
check(
  "every planned cut retained",
  snapshot.reframeModeCuts.length === result.editPlan.timelineCuts.length &&
    snapshot.reframeModeCuts.every(
      (cut, index) =>
        cut.time === result.editPlan.timelineCuts[index].time &&
        cut.mode === result.editPlan.timelineCuts[index].mode &&
        (cut.zoom || 1) ===
          Math.max(1, Math.min(1.5, result.editPlan.timelineCuts[index].zoom || 1))
    )
);
check(
  "editor saved same project",
  snapshot.studioDocument.projectId === job.projectId && browser.localCheckpointSaved
);
check(
  "editor saved same asset",
  snapshot.studioDocument.clipOccurrences.some(clip => clip.assetId === job.sourceAssetId)
);
check(
  "editor retained ten-minute programme",
  snapshot.studioDocument.clipOccurrences[0].programmeRange.endTick === 600 * 90000
);
check(
  "owner allowed",
  browser.authorization.some(row => row.label === "owner" && row.status === 200)
);
check(
  "other owner hidden",
  browser.authorization.some(row => row.label === "other owner" && row.status === 404)
);
check(
  "missing auth rejected",
  browser.authorization.some(row => row.label === "unauthenticated" && row.status === 401)
);
check(
  "test token rejected",
  browser.authorization.some(
    row => row.label === "test-token bypass rejected" && row.status === 401
  )
);
check(
  "both real Firebase users checked",
  authorization.passed && authorization.realFirebaseUsers === 2 && authorization.jobId === job.jobId
);
check(
  "other owner result hidden",
  authorization.checks.some(row => row.name === "other owner result" && row.status === 404)
);
check(
  "E2E bypass header rejected",
  authorization.checks.some(row => row.name === "E2E header" && row.status === 401)
);
check(
  "other owner source submission rejected",
  authorization.checks.some(
    row => row.name === "other owner source submission" && row.status === 403
  )
);
check(
  "Cloud Run execution succeeded",
  execution.status.succeededCount === 1 &&
    execution.status.conditions.some(row => row.type === "Completed" && row.status === "True")
);
check("matching execution identity", execution.metadata.name === browser.cloudWorker);
check(
  "pinned existing worker image",
  execution.spec.template.spec.containers[0].image.endsWith(
    "@sha256:d0bde70ef153b0684dd405de6ce48cad129cd73947261dd0909706bdecd8de61"
  )
);
const manifest = read("files.json");
check(
  "captured file hashes",
  manifest.files.every(row => sha(fs.readFileSync(path.join(folder, row.path))) === row.sha256)
);
const receipt = {
  passed: true,
  checkedAt: new Date().toISOString(),
  checkCount: checks.length,
  checks,
};
fs.writeFileSync(path.join(folder, "verification.json"), JSON.stringify(receipt, null, 2));
console.log(JSON.stringify(receipt, null, 2));
