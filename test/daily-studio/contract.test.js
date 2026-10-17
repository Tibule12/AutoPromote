const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const c = require("../../scripts/daily-studio/contract");
const { hash } = require("../../src/creativeTemplates/contract");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "daily-studio-contract-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (name, bytes) => {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), bytes);
    return name;
  };
  const book = c.prepare(root, "2026-10-17");
  // Historical 17 October fixtures precede the owner's minute-long direction.
  delete book.target.videoSeconds;
  for (let i = 0; i < 4; i++) {
    // These are validation fixtures only: no fabricated evidence is delivered
    // as a native run or used to qualify Studio or creative readiness.
    const movie = Buffer.from(`movie fixture ${i}`),
      recording = Buffer.from(`recording fixture ${i}`),
      doc = { testFixture: i };
    const story = {
      id: `story-number-${i}`,
      audience: "Editors seeking clarity",
      problem: "A clear specific editing problem",
      visualHook: "Visible result in the opening second",
      payoff: "A specific useful editing outcome",
      creativeDifference: `Distinct composition and timing number ${i}`,
      status: "REVIEWED",
      movie: write(`proof/${i}/movie.mp4`, movie),
      movieSha256: c.sha(movie),
      recording: write(`proof/${i}/studio.mp4`, recording),
      recordingSha256: c.sha(recording),
      fullRecording: `proof/${i}/studio.mp4`,
      fullRecordingSha256: c.sha(recording),
      studioPlayback: write(
        `proof/${i}/playback.json`,
        JSON.stringify({
          projectId: `project-${i}`,
          canonicalHash: hash(doc),
          outputSha256: c.sha(movie),
          nativeFinishedOutput: true,
          timelineVisible: true,
          playback: { ended: true, duration: 10 },
          recording: path.join(root, `proof/${i}/studio.mp4`),
        })
      ),
      renderReceipt: write(
        `proof/${i}/receipt.json`,
        JSON.stringify({
          outputSha256: c.sha(movie),
          submittedJobId: `native-job-${i}`,
          projectId: `project-${i}`,
          projectHash: hash(doc),
          technical: { seconds: 10, passed: true, independentFullDecode: true },
        })
      ),
      projectBackup: write(
        `proof/${i}/backup.json`,
        JSON.stringify({ id: `project-${i}`, snapshot: { studioDocument: doc } })
      ),
      nativeControlsOnly: true,
      graphInjection: false,
      unrelatedFootage: false,
      review: {
        accepted: true,
        notes: "Specific reviewed opening, movement and readable payoff.",
        openingResultVisible: true,
        completeVideoAndMatchingTimelineVisible: true,
        frames: Array.from({ length: 4 }, (_, n) =>
          write(`proof/${i}/frame-${n}.jpg`, `frame fixture ${n}`)
        ),
      },
    };
    book.stories.push(story);
    for (const platform of c.policy.platforms)
      book.posts.push({
        storyId: story.id,
        platform,
        audience: story.audience,
        problem: story.problem,
        hook: story.visualHook,
        payoff: story.payoff,
        title: `Useful outcome ${i} for ${platform}`,
        description: `Specific destination caption ${i} for ${platform}`,
        cta: "Which moment would you change?",
        mediaSha256: story.recordingSha256,
        scheduledAt: `2026-10-17T${String(7 + i * 3).padStart(2, "0")}:00:00.000Z`,
        allowCropOfVideoOrTimeline: false,
        nativeUserFlow: true,
        queueVerified: true,
        verifiedMediaSha256: story.recordingSha256,
        schedule: {
          id: `schedule-${i}-${platform}`,
          platform,
          startTime: `2026-10-17T${String(7 + i * 3).padStart(2, "0")}:00:00.000Z`,
          frequency: "once",
          isActive: true,
          status: "pending",
        },
      });
  }
  return { root, book };
}
test("uses the publication day in Johannesburg at the UTC midnight boundary", () => {
  assert.equal(c.localDate(new Date("2026-10-16T22:05:00Z")), "2026-10-17");
  assert.throws(() => c.validDate("../not-a-date"));
  assert.throws(() => c.validDate("2026-02-30"));
});
test("preparation preserves acknowledgements and saved progress", t => {
  const { root, book } = fixture(t);
  book.status = "WAITING_LOGIN";
  book.posts[0].contentId = "existing-ack";
  c.atomic(path.join(c.dayRoot(root, book.date), "day.json"), book);
  assert.equal(c.prepare(root, book.date).posts[0].contentId, "existing-ack");
});
test("validates four distinct reviewed stories and 24 separate schedules", t => {
  const { root, book } = fixture(t);
  assert.equal(c.validateDay(root, book, { requireSchedules: true }).verifiedSchedules, 24);
});
test("new minute-long batches require actual public export duration and a viewer question", t => {
  const { root, book } = fixture(t);
  book.target.videoSeconds = 60;
  assert.throws(() => c.validateDay(root, book), /viewer question/);
  for (const [i, story] of book.stories.entries()) {
    story.engagementQuestion = "Which platform takes the longest to post to, and why?";
    story.review.retentionBeats = ["Result in opening second", "Focused actual timing action", "Specific problem payoff"];
    story.recordingRenderReceipt = `public-${i}.json`;
    fs.writeFileSync(path.join(root, story.recordingRenderReceipt), JSON.stringify({
      outputSha256: story.recordingSha256, actualNativeDownload: true,
      technical: { passed: true, independentFullDecode: true, seconds: 10 },
    }));
  }
  assert.throws(() => c.validateDay(root, book), /one minute/);
  for (const story of book.stories) {
    const file = path.join(root, story.recordingRenderReceipt);
    const receipt = JSON.parse(fs.readFileSync(file)); receipt.technical.seconds = 60;
    fs.writeFileSync(file, JSON.stringify(receipt));
  }
  assert.equal(c.validateDay(root, book).reviewedStories, 4);
});
test("a source change invalidates the review", t => {
  const { root, book } = fixture(t);
  fs.writeFileSync(path.join(root, book.stories[0].movie), "changed");
  assert.throws(() => c.validateDay(root, book), /bytes changed/);
});
test("a different saved project cannot qualify the render", t => {
  const { root, book } = fixture(t);
  const file = path.join(root, book.stories[0].projectBackup),
    saved = JSON.parse(fs.readFileSync(file));
  saved.snapshot.studioDocument.testFixture = 900;
  fs.writeFileSync(file, JSON.stringify(saved));
  assert.throws(() => c.validateDay(root, book), /Backup differs/);
});
test("a timeline recording of another movie or edit cannot qualify", t => {
  const { root, book } = fixture(t),
    file = path.join(root, book.stories[0].studioPlayback),
    original = JSON.parse(fs.readFileSync(file));
  for (const mutate of [
    p => (p.projectId = "another-project"),
    p => (p.outputSha256 = c.sha("another movie")),
    p => (p.canonicalHash = c.sha("another edit")),
    p => (p.playback.ended = false),
  ]) {
    const wrong = structuredClone(original);
    mutate(wrong);
    fs.writeFileSync(file, JSON.stringify(wrong));
    assert.throws(() => c.validateDay(root, book));
  }
});
test("a shortened public recording needs its own native export receipt", t => {
  const { root, book } = fixture(t),
    story = book.stories[0];
  story.recording = "public.mp4";
  fs.writeFileSync(path.join(root, story.recording), "short public recording");
  story.recordingSha256 = c.sha("short public recording");
  assert.throws(() => c.validateStory(root, story));
  story.recordingRenderReceipt = "excerpt.json";
  fs.writeFileSync(
    path.join(root, story.recordingRenderReceipt),
    JSON.stringify({
      outputSha256: story.recordingSha256,
      actualNativeDownload: true,
      technical: { passed: true, independentFullDecode: true },
    })
  );
  assert.doesNotThrow(() => c.validateStory(root, story));
});
test("prior released media cannot be repackaged as a new daily story", t => {
  const { root, book } = fixture(t);
  assert.throws(
    () => c.validateDay(root, book, { priorHashes: [book.stories[0].recordingSha256] }),
    /repeat prior/
  );
});
test("upload acknowledgements cannot count as verified schedules", t => {
  const { root, book } = fixture(t);
  book.posts[0].queueVerified = false;
  assert.throws(() => c.validateDay(root, book, { requireSchedules: true }));
});
test("duplicate destination IDs cannot satisfy the daily total", t => {
  const { root, book } = fixture(t);
  book.posts[1].schedule.id = book.posts[0].schedule.id;
  assert.throws(() => c.validateDay(root, book, { requireSchedules: true }), /duplicate schedule/);
});
test("wrong day, media, platform, crop and recurring-post data are rejected", t => {
  const { root, book } = fixture(t);
  for (const mutate of [
    b => (b.posts[0].scheduledAt = "2026-10-18T10:00:00Z"),
    b => (b.posts[0].verifiedMediaSha256 = "different"),
    b => (b.posts[0].schedule.platform = "reddit"),
    b => (b.posts[0].allowCropOfVideoOrTimeline = true),
    b => (b.posts[0].schedule.frequency = "daily"),
  ]) {
    const changed = structuredClone(book);
    mutate(changed);
    assert.throws(() => c.validateDay(root, changed, { requireSchedules: true }));
  }
});
test("path traversal and evidence symlinks escaping the worktree are refused", t => {
  const { root } = fixture(t);
  const secret = path.join(os.tmpdir(), `outside-daily-${process.pid}.txt`);
  fs.writeFileSync(secret, "outside");
  t.after(() => fs.rmSync(secret, { force: true }));
  fs.symlinkSync(secret, path.join(root, "outside-link"));
  assert.throws(() => c.artifact(root, "outside-link"), /inside this repository/);
  assert.throws(() => c.artifact(root, secret), /repository-relative/);
});
