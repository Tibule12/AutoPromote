const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const policy = require("../../config/daily-studio.json");
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

function localDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: policy.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
function validDate(date) {
  assert(
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
      new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date,
    "Use a real YYYY-MM-DD date"
  );
  return date;
}
function dayRoot(root, date) {
  return path.join(root, "reports/daily-studio", validDate(date));
}
function atomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
  fs.renameSync(temporary, file);
}
function prepare(root, date) {
  const directory = dayRoot(root, date),
    file = path.join(directory, "day.json");
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file));
  const book = {
    version: 1,
    date,
    timezone: policy.timezone,
    status: "PREPARED",
    createdAt: new Date().toISOString(),
    target: { stories: 4, destinations: 24 },
    stories: [],
    posts: [],
    attempts: [],
    blockers: [],
  };
  atomic(file, book);
  return book;
}
function artifact(root, relative, expectedHash) {
  assert(
    typeof relative === "string" && !path.isAbsolute(relative),
    "Store repository-relative evidence paths"
  );
  const absolute = fs.realpathSync(path.resolve(root, relative));
  assert(
    absolute.startsWith(fs.realpathSync(root) + path.sep),
    "Evidence must remain inside this repository"
  );
  assert(fs.statSync(absolute).isFile(), "Evidence must be a file");
  const bytes = fs.readFileSync(absolute);
  if (expectedHash) assert.equal(sha(bytes), expectedHash, "Reviewed evidence bytes changed");
  return { path: relative, bytes, sha256: sha(bytes) };
}
function validateStory(root, story) {
  for (const field of ["id", "audience", "problem", "visualHook", "payoff", "creativeDifference"])
    assert(
      typeof story[field] === "string" && story[field].trim().length > 8,
      `Missing story ${field}`
    );
  assert.equal(story.status, "REVIEWED");
  assert(
    story.review?.accepted && story.review.notes?.length > 30,
    "Record a specific creative review"
  );
  assert(
    story.review.openingResultVisible && story.review.completeVideoAndMatchingTimelineVisible,
    "Review result and real timeline visibility"
  );
  const movie = artifact(root, story.movie, story.movieSha256),
    recording = artifact(root, story.recording, story.recordingSha256);
  assert.notEqual(
    movie.sha256,
    recording.sha256,
    "Keep the final movie separate from its Studio recording"
  );
  const receipt = JSON.parse(artifact(root, story.renderReceipt).bytes);
  assert.equal(receipt.outputSha256, movie.sha256);
  assert.equal(receipt.technical?.passed, true);
  assert.equal(receipt.technical?.independentFullDecode, true);
  assert(
    receipt.submittedJobId && receipt.projectHash && receipt.projectId,
    "Bind the actual accepted native job"
  );
  const backup = JSON.parse(artifact(root, story.projectBackup).bytes);
  const { hash } = require("../../src/creativeTemplates/contract");
  assert.equal(backup.id, receipt.projectId);
  assert.equal(
    hash(backup.snapshot.studioDocument),
    receipt.projectHash,
    "Backup differs from the actual movie project"
  );
  assert(
    /^[a-f0-9]{64}$/.test(story.fullRecordingSha256 || ""),
    "Hash the complete native Studio recording"
  );
  const fullRecording = artifact(root, story.fullRecording, story.fullRecordingSha256);
  const playback = JSON.parse(artifact(root, story.studioPlayback).bytes);
  assert.equal(
    playback.projectId,
    receipt.projectId,
    "Timeline playback belongs to a different project"
  );
  assert.equal(
    playback.canonicalHash,
    receipt.projectHash,
    "Timeline playback uses a different edit"
  );
  assert.equal(playback.outputSha256, movie.sha256, "Timeline playback uses a different movie");
  assert(
    playback.nativeFinishedOutput && playback.timelineVisible && playback.playback?.ended,
    "Retain complete native finished-movie playback beside its timeline"
  );
  assert.equal(
    path.resolve(playback.recording),
    path.resolve(root, fullRecording.path),
    "Complete playback recording differs"
  );
  assert(
    Math.abs(playback.playback.duration - receipt.technical.seconds) <= 1 / 24,
    "Complete playback duration differs"
  );
  if (recording.sha256 !== fullRecording.sha256) {
    const excerpt = JSON.parse(artifact(root, story.recordingRenderReceipt).bytes);
    assert.equal(
      excerpt.outputSha256,
      recording.sha256,
      "Public recording differs from its native excerpt export"
    );
    assert(
      excerpt.actualNativeDownload &&
        excerpt.technical?.passed &&
        excerpt.technical?.independentFullDecode,
      "Public excerpts require their actual native export/decode receipt"
    );
  }
  assert(story.review.frames?.length >= 4, "Inspect opening, action and payoff frames");
  for (const frame of story.review.frames) artifact(root, frame);
  assert(
    story.nativeControlsOnly && !story.graphInjection && !story.unrelatedFootage,
    "Use ordinary editable Studio controls"
  );
  return {
    id: story.id,
    movieSha256: movie.sha256,
    recordingSha256: recording.sha256,
    projectHash: receipt.projectHash,
  };
}
function validateDay(root, book, { requireSchedules = false, priorHashes = [] } = {}) {
  validDate(book.date);
  assert.equal(book.timezone, policy.timezone);
  assert.equal(
    book.stories.length,
    policy.storiesPerDay,
    "Need four reviewed stories, not filler slots"
  );
  const stories = book.stories.map(s => validateStory(root, s));
  assert.equal(new Set(stories.map(s => s.id)).size, 4);
  assert.equal(
    new Set(stories.map(s => s.movieSha256)).size,
    4,
    "Each story needs a distinct result"
  );
  assert.equal(new Set(stories.map(s => s.recordingSha256)).size, 4);
  assert(
    !stories.some(
      s => priorHashes.includes(s.movieSha256) || priorHashes.includes(s.recordingSha256)
    ),
    "Do not repeat prior published media"
  );
  assert.equal(book.posts.length, 24);
  const ids = new Set();
  for (const platform of policy.platforms) {
    const posts = book.posts.filter(p => p.platform === platform);
    assert.equal(posts.length, 4);
    assert.equal(new Set(posts.map(p => p.storyId)).size, 4);
    assert.equal(new Set(posts.map(p => p.scheduledAt)).size, 4);
    for (const p of posts) {
      const story = stories.find(s => s.id === p.storyId);
      assert(story);
      for (const f of ["audience", "problem", "hook", "payoff", "title", "description", "cta"])
        assert(p[f]?.length > 8, `Missing platform ${f}`);
      assert(!/^(AutoPromote|Made in AutoPromote|Timeline)\b/i.test(p.title));
      assert.equal(p.mediaSha256, story.recordingSha256);
      assert.equal(localDate(new Date(p.scheduledAt)), book.date);
      assert(p.allowCropOfVideoOrTimeline === false);
      if (requireSchedules) {
        assert(p.queueVerified && p.nativeUserFlow && p.verifiedMediaSha256 === p.mediaSha256);
        assert(p.schedule?.id && !ids.has(p.schedule.id), "Never count duplicate schedule IDs");
        ids.add(p.schedule.id);
        assert.equal(p.schedule.platform, p.platform);
        assert.equal(Date.parse(p.schedule.startTime), Date.parse(p.scheduledAt));
        assert.equal(p.schedule.frequency, "once");
        assert(p.schedule.isActive || p.schedule.status === "completed");
      }
    }
  }
  return {
    date: book.date,
    reviewedStories: 4,
    destinationPackages: 24,
    verifiedSchedules: requireSchedules ? ids.size : 0,
    stories,
  };
}
module.exports = {
  policy,
  sha,
  localDate,
  validDate,
  dayRoot,
  atomic,
  prepare,
  artifact,
  validateStory,
  validateDay,
};
