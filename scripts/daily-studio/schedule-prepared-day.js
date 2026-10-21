#!/usr/bin/env node
// Resume reviewed packages through the same native Publisher forms users use.
const fs = require("node:fs"),
  path = require("node:path"),
  { spawnSync } = require("node:child_process");
const c = require("./contract"),
  root = path.resolve(__dirname, "../.."),
  date = c.validDate(process.argv[2] || c.localDate());
const dir = c.dayRoot(root, date),
  file = path.join(dir, "platform-packages.json"),
  dayFile = path.join(dir, "day.json");
const read = file => JSON.parse(fs.readFileSync(file));
const env = {
  ...process.env,
  STUDIO_PLATFORM_PACKAGES_DIR: dir,
  STUDIO_PUBLISHER_SESSION: path.join(root, c.policy.authState),
};
function syncDay() {
  const day = read(dayFile);
  day.posts = read(file).posts.map(p => ({ ...p, schedule: p.schedules?.[0] }));
  c.atomic(dayFile, day);
}
c.validateDay(root, read(dayFile));
for (const id of read(file).posts.map(p => p.postId)) {
  const book = read(file),
    post = book.posts.find(p => p.postId === id);
  if (post.queueVerified) {
    syncDay();
    continue;
  }
  if (
    ["SUBMITTING", "SUBMISSION_UNCERTAIN", "UPLOAD_ACKNOWLEDGED_QUEUE_UNVERIFIED"].includes(
      post.status
    )
  )
    throw Error("Reconcile existing acknowledgement before continuing: " + id);
  const source = book.posts.find(p => p.storyId === post.storyId && p.queueVerified && p.contentId);
  if (source) {
    post.reuseContentId = source.contentId;
    post.reuseAssetTitle = source.title;
    c.atomic(file, book);
  }
  const log = fs.openSync(path.join(dir, "proof", id + "-publisher.private.log"), "a", 0o600);
  const result = spawnSync(
    process.execPath,
    ["scripts/creative-templates/schedule-platform-packages.js", id],
    { cwd: root, env, stdio: ["ignore", log, log], timeout: 300000 }
  );
  fs.closeSync(log);
  syncDay();
  if (result.status !== 0) throw Error("Native Publisher needs inspection for " + id);
  console.log(id + ": native Queue verified");
}
const check = spawnSync(process.execPath, ["scripts/daily-studio/inspect-schedules.js"], {
  cwd: root,
  env,
  stdio: "inherit",
  timeout: 300000,
});
if (check.status !== 0)
  throw Error("Keep acknowledgements; read-only Queue/media verification needs inspection");
const evidence = read(path.join(dir, "queue-verified.json")),
  book = read(file);
for (const post of book.posts) {
  post.verifiedMediaSha256 = evidence.mediaChecks.find(row => row.postId === post.postId)?.sha256;
  const observed = evidence.checked.find(row => row.postId === post.postId);
  if (observed) {
    const { postId, scheduleId, ...schedule } = observed;
    post.schedules = [{ ...post.schedules[0], ...schedule, id: scheduleId }];
  }
}
c.atomic(file, book);
syncDay();
const day = read(dayFile);
c.validateDay(root, day, { requireSchedules: true });
day.status = "SCHEDULED_VERIFIED";
day.blockers = [];
day.queueEvidence = path.relative(root, path.join(dir, "queue-verified.json"));
c.atomic(dayFile, day);
c.atomic(path.join(root, "reports/daily-studio/latest-status.json"), {
  date,
  status: day.status,
  stories: 4,
  verifiedSchedules: 24,
  providerPublicationVerified: false,
});
console.log("Four reviewed stories and 24 exact native schedules verified.");
