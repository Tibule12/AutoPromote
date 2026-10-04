const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.resolve(__dirname, "../reports/studio-analysis-ten-minute-20261004");
const cloudOnly = process.argv.includes("--cloud-only");
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const stable = value => JSON.stringify(value, (_key, item) =>
  item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]))
    : item);
const equal = (left, right) => stable(left) === stable(right);
const checks = [];
const check = (name, passed) => checks.push({ name, passed: Boolean(passed) });
const expectedSource = "4a6efc07f90860a22d4fcbebd0ff77ae6bc72907491631e3e217099a2bddeb8c";
const source = read("source-object.json");
check("Pinned source generation, size and owner", source.generation === "1791107066573616" &&
  Number(source.size) === 726725520 && source.metadata.ownerUid === "staging-smoke" &&
  source.metadata.purpose === "studio_source");

const runs = {};
for (const [label, expectedHash] of [
  ["first-run", "25c20ddd7df8eacf78d393f7e354f60410055318b2d2e2ad43f30de335347f5a"],
  ["repaired", "e8c725943577c7bbc9b275443efa9e2a074a7abd814e391d4dc9ab06c33ae98c"],
]) {
  const job = read(`${label}-job.json`);
  const bytes = fs.readFileSync(path.join(root, `${label}-analysis-result.json`));
  const result = JSON.parse(bytes);
  const shot = read(`${label}-source-shot-artifact.json`);
  const artifact = read(`${label}-analysis-artifact.json`);
  const object = read(`${label}-result-object.json`);
  check(`${label}: completed in one attempt`, job.status === "completed" && job.attempts === 1);
  check(`${label}: exact stored JSON hash`, sha(bytes) === expectedHash && job.resultSha256 === expectedHash);
  check(`${label}: canonical result hash`, sha(stable(result)) === expectedHash);
  check(`${label}: source identity`, job.sourceSha256 === expectedSource &&
    job.sourceGeneration === source.generation && job.sourceObjectPath === source.name);
  check(`${label}: object receipt`, Number(object.size) === bytes.length &&
    object.metadata.ownerUid === job.ownerUid && object.metadata.jobId === job.jobId &&
    object.metadata.resultSha256 === expectedHash && object.metadata.purpose === "studio-analysis-result");
  for (const [name, record, receipt] of [
    ["source-shot", shot, job.sourceShotArtifact], ["analysis", artifact, job.analysisArtifact],
  ]) {
    const { artifactHash, createdAt, ...core } = record;
    check(`${label}: ${name} content-addressed record`, sha(stable(core)) === artifactHash &&
      artifactHash === receipt.artifactHash && Boolean(createdAt));
    check(`${label}: ${name} scope`, record.ownerUid === job.ownerUid &&
      record.projectId === job.projectId && record.sourceAssetId === job.sourceAssetId &&
      record.sourceSha256 === expectedSource);
  }
  const cutTicks = result.sceneCuts.map(time => Math.round(time * 90000));
  check(`${label}: artifact content and dependency`, shot.workerResultSha256 === expectedHash &&
    artifact.contentHash === expectedHash && equal(artifact.dependencyHashes, [shot.artifactHash]));
  check(`${label}: projected cut timestamps`, equal(shot.sceneCutTicks, cutTicks) &&
    equal(artifact.projection.sceneCutTicks, cutTicks));
  check(`${label}: analysis range`, result.start === 0 && result.end === 600 &&
    equal(artifact.analysisRange, { space: "source", startTick: 0, endTick: 54000000 }));
  const track = result.tracks.solo;
  check(`${label}: sampled coverage recalculation`, track.coverage ===
    track.keyframes.length / (track.keyframes.length + track.missing.length) &&
    artifact.sampleCoverage === Number(track.coverage.toFixed(6)));
  runs[label] = { job, result, hash: expectedHash, bytes: bytes.length };
}

const repaired = runs.repaired.result;
check("Repaired 143 cuts, 1277 keyframes, 3 missing samples", repaired.sceneCuts.length === 143 &&
  repaired.tracks.solo.keyframes.length === 1277 && repaired.tracks.solo.missing.length === 3);
check("Confirmed 53.5-second cut restored", !runs["first-run"].result.sceneCuts.includes(53.5) &&
  repaired.sceneCuts.includes(53.5));
check("Repaired edit-plan preflight", repaired.editPlan.preflight.passed === true &&
  repaired.editPlan.timelineCuts.length === 144);
const execution = read("repaired-execution.json");
check("Successful Cloud Run execution", execution.metadata.name === "studio-analysis-once-nsnlf" &&
  execution.status.succeededCount === 1 && execution.status.conditions.some(
    item => item.type === "Completed" && item.status === "True"));
const revision = read("repaired-analyzer-revision.json");
const imageHash = "sha256:7e5246ca5fbfdcb6280e52ed89f011dee03a90229c8aae500fe293ca5b4d50f3";
check("Pinned analyzer revision and resources", revision.metadata.name === "studio-face-analyzer-00005-67p" &&
  revision.spec.containers[0].image.endsWith(imageHash) &&
  revision.spec.containers[0].resources.limits.cpu === "4" &&
  revision.spec.containers[0].resources.limits.memory === "4Gi" && revision.spec.containerConcurrency === 1);
const build = read("analyzer-build.json");
check("Successful image build with matching digest", build.status === "SUCCESS" &&
  build.results.images.some(item => item.digest === imageHash));
const request = read("analyzer-request-logs.json").find(item =>
  item.resource.labels.revision_name === revision.metadata.name);
const latency = Number(request?.httpRequest?.latency?.replace(/s$/, ""));
check("Analyzer returned HTTP 200 below worker limit", request?.httpRequest?.status === 200 &&
  latency > 0 && latency < 720);
const invokers = read("analyzer-iam.json").bindings.filter(item => item.role === "roles/run.invoker")
  .flatMap(item => item.members);
check("Private analyzer invocation scope", equal(invokers,
  ["serviceAccount:studio-analysis-smoke@autopromote-staging-2026.iam.gserviceaccount.com"]));

let frontend = null;
if (!cloudOnly) {
  const local = read("local-analysis-result.json");
  const localRun = read("local-analysis-run.json");
  check("Fresh local baseline used identical source bytes", localRun.sourceSha256 === expectedSource &&
    localRun.sourceBytes === Number(source.size));
  check("Full local/cloud JSON equality", equal(local, repaired));
  const tests = read("frontend-tests.json");
  const retry = read("frontend-retry-tests.json");
  const failed = tests.testResults.flatMap(suite => suite.assertionResults)
    .filter(test => test.status === "failed");
  const retried = retry.testResults.flatMap(suite => suite.assertionResults)
    .filter(test => test.status === "passed");
  check("90 frontend tests passed; the one timed-out test passed in a captured isolated retry",
    tests.numTotalTests === 91 && tests.numPassedTests === 90 && tests.numFailedTests === 1 &&
    failed.length === 1 && failed[0].failureMessages.some(message => /Exceeded timeout/.test(message)) &&
    retry.success && retry.numPassedTests === 1 && retry.numFailedTests === 0 &&
    retried.length === 1 && retried[0].fullName === failed[0].fullName &&
    read("frontend-test-run.json").exitCode === 1 && read("frontend-retry-run.json").exitCode === 0);
  frontend = {
    fullRunPassed: tests.success, fullRunPassedTests: tests.numPassedTests,
    fullRunFailedTests: tests.numFailedTests, isolatedRetryPassed: retry.success,
    isolatedRetryPassedTests: retry.numPassedTests, timedOutTest: failed[0]?.fullName,
  };
}

const receipt = {
  verifiedAt: new Date().toISOString(), scope: cloudOnly ? "cloud snapshots" : "cloud, local baseline and frontend tests",
  passed: checks.every(item => item.passed), passedChecks: checks.filter(item => item.passed).length,
  totalChecks: checks.length, analyzerSeconds: latency, sourceSha256: expectedSource,
  resultSha256: runs.repaired.hash, sceneCuts: repaired.sceneCuts.length,
  keyframes: repaired.tracks.solo.keyframes.length, missingSamples: repaired.tracks.solo.missing.length,
  sampledFaceCoverage: repaired.tracks.solo.coverage, frontend, checks,
};
fs.writeFileSync(path.join(root, cloudOnly ? "cloud-verification.json" : "verification.json"),
  JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify(receipt));
process.exitCode = receipt.passed ? 0 : 1;
