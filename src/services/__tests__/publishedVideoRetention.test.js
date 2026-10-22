const { publicationDeadline, cleanupPublishedVideos } = require("../publishedVideoRetention");
const { writeMediaDependency } = require("../contentMediaDependency");
const now = Date.parse("2026-10-17T12:00:00Z");
const published = new Date(now - 25 * 3600000).toISOString();
const video = {
  user_id: "owner",
  type: "video",
  target_platforms: ["youtube", "reddit"],
  url: "https://owned.test/uploads/videos/movie.mp4",
};
const evidence = () => ({
  posts: ["youtube", "reddit"].map(platform => ({
    platform,
    success: true,
    externalId: platform + "-real-id",
    updatedAt: published,
  })),
  tasks: [
    { type: "platform_post", platform: "youtube", status: "completed" },
    { type: "platform_post", platform: "reddit", status: "completed" },
  ],
  schedules: [
    { platform: "youtube", frequency: "once", status: "executed" },
    { platform: "reddit", frequency: "once", status: "executed" },
  ],
  transforms: [],
});
test("24 hours starts at the last confirmed destination, not the upload or first destination", () => {
  const values = evidence();
  values.posts[1].updatedAt = new Date(now - 23 * 3600000).toISOString();
  expect(publicationDeadline(video, values, now)).toMatchObject({
    eligible: false,
    reason: "within_24_hours",
  });
  expect(publicationDeadline(video, values, now + 3600000)).toMatchObject({ eligible: true });
});
test.each(["queued", "processing", "failed", "publication_pending"])(
  "%s work keeps the file",
  status => {
    const values = evidence();
    values.tasks[1].status = status;
    expect(publicationDeadline(video, values, now).eligible).toBe(false);
  }
);
test("paused and recurring schedules, transforms, simulated and pending publications hold the file", () => {
  for (const mutate of [
    v => (v.schedules[0].status = "paused"),
    v => (v.schedules[0].frequency = "daily"),
    v => v.transforms.push({ status: "failed" }),
    v => (v.posts[0].simulated = true),
    v => (v.posts[0].publicationPending = true),
    v => (v.posts[0].rawOutcome = { status: "submitted" }),
    v => (v.posts[0].externalId = null),
    v => (v.posts[0].updatedAt = null),
  ]) {
    const values = evidence();
    mutate(values);
    expect(publicationDeadline(video, values, now).eligible).toBe(false);
  }
});

function fixture({ ownerUid = "owner", shared = false, changedDependencies = false } = {}) {
  const values = evidence(),
    tables = {
      user_billing: { owner: { storageRetention: { publishedVideoHours: 24 } } },
      content: { movie: { ...video } },
      platform_posts: Object.fromEntries(
        values.posts.map((row, i) => [i, { ...row, contentId: "movie" }])
      ),
      promotion_tasks: Object.fromEntries(
        values.tasks.map((row, i) => [i, { ...row, contentId: "movie" }])
      ),
      promotion_schedules: Object.fromEntries(
        values.schedules.map((row, i) => [i, { ...row, contentId: "movie" }])
      ),
      media_transform_tasks: {},
    };
  if (shared) tables.content.other = { ...video };
  const getField = (row, field) => field.split(".").reduce((value, key) => value?.[key], row);
  const ref = (name, id) => ({
    id,
    get: async () => ({ exists: !!tables[name]?.[id], data: () => tables[name]?.[id] }),
    set: async (data, options) => {
      tables[name] ||= {};
      tables[name][id] = options?.merge ? { ...tables[name][id], ...data } : data;
    },
  });
  const query = (name, filters = [], limit = 200) => ({
    where: (field, op, value) => query(name, [...filters, [field, value]], limit),
    limit: count => query(name, filters, count),
    orderBy: () => query(name, filters, limit),
    startAfter: () => query(name, filters, limit),
    doc: id => ref(name, id),
    get: async () => ({
      docs: Object.entries(tables[name] || {})
        .filter(([, data]) => filters.every(([field, value]) => getField(data, field) === value))
        .slice(0, limit)
        .map(([id, data]) => ({ id, data: () => data, ref: ref(name, id) })),
    }),
  });
  const db = {
    collection: name => query(name),
    runTransaction: async run => {
      if (changedDependencies)
        tables.promotion_tasks.new = {
          contentId: "movie",
          type: "platform_post",
          status: "queued",
        };
      return run({
        get: item => item.get(),
        set: (item, data, options) => item.set(data, options),
      });
    },
  };
  const remove = jest.fn().mockResolvedValue();
  return {
    db,
    tables,
    remove,
    storage: {
      bucket: () => ({
        file: () => ({
          getMetadata: async () => [
            { generation: "42", contentType: "video/mp4", metadata: { ownerUid } },
          ],
          delete: remove,
        }),
      }),
    },
    extractPath: url => new URL(url).pathname.slice(1),
    now,
  };
}
test("dry run inspects exact owned candidates without deleting or changing a content record", async () => {
  const f = fixture(),
    results = await cleanupPublishedVideos({ ...f, dryRun: true });
  expect(results[0].wouldDelete).toEqual(["uploads/videos/movie.mp4"]);
  expect(f.remove).not.toHaveBeenCalled();
  expect(f.tables.content.movie.storageRetentionStatus).toBeUndefined();
});
test("expired copies delete only their observed generation and keep the content/post history", async () => {
  const f = fixture();
  await cleanupPublishedVideos(f);
  expect(f.remove).toHaveBeenCalledWith({ ifGenerationMatch: "42" });
  expect(f.tables.content.movie.storageRetentionStatus).toBe("deleted_after_publication");
  expect(Object.keys(f.tables.platform_posts)).toHaveLength(2);
});
test.each([{ ownerUid: "someone-else" }, { shared: true }, { changedDependencies: true }])(
  "holds changed dependencies, shared copies and unverified ownership: %j",
  async options => {
    const f = fixture(options);
    await cleanupPublishedVideos(f);
    expect(f.remove).not.toHaveBeenCalled();
  }
);
test("a deletion claim blocks any later scheduling or transform dependency", async () => {
  const f = fixture();
  f.tables.content.movie.storageRetentionStatus = "deleting_after_publication";
  const target = { set: jest.fn() };
  await expect(writeMediaDependency(f.db, "movie", target, {})).rejects.toMatchObject({
    code: "PUBLISHED_MEDIA_EXPIRED",
  });
  expect(target.set).not.toHaveBeenCalled();
});
