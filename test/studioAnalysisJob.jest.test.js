const crypto = require("crypto");
const { Readable } = require("stream");

jest.mock("../src/services/studioDirectorProjectBinding", () => ({
  getOwnedStudioSourceBinding: jest.fn().mockResolvedValue(null),
  assertOwnedStudioSourceBinding: jest.fn().mockResolvedValue({}),
}));
jest.mock("../src/services/studioSourceShotArtifactService", () => ({
  projectSourceShotAnalysis: jest.fn(),
  persistSourceShotArtifact: jest.fn().mockResolvedValue({ artifactHash: "a".repeat(64) }),
}));
jest.mock("../src/services/studioAnalysisArtifactService", () => ({
  persistSourceShotAnalysisArtifact: jest.fn(),
}));

const {
  createStudioAnalysisJob,
  createStudioAnalysisJobFromOwnedSource,
  getOwnedStudioAnalysisJob,
  cancelStudioAnalysisJob,
  getOwnedStudioAnalysisResult,
  claimJob,
  renewLease,
  processStudioAnalysisJob,
  processNextStudioAnalysisJob,
  cleanupStudioAnalysisJobObjects,
} = require("../src/services/studioAnalysisJobService");
const {
  assertOwnedStudioSourceBinding,
  getOwnedStudioSourceBinding,
} = require("../src/services/studioDirectorProjectBinding");
const {
  projectSourceShotAnalysis,
  persistSourceShotArtifact,
} = require("../src/services/studioSourceShotArtifactService");
const {
  persistSourceShotAnalysisArtifact,
} = require("../src/services/studioAnalysisArtifactService");

const fakeFirestore = () => {
  const docs = new Map();
  let lock = Promise.resolve();
  const ref = path => ({
    path,
    id: path.split("/").pop(),
    get: async () => ({ exists: docs.has(path), data: () => structuredClone(docs.get(path)) }),
    create: async value => {
      if (docs.has(path)) throw Object.assign(new Error("exists"), { code: 6 });
      docs.set(path, structuredClone(value));
    },
  });
  const firestore = {
    docs,
    collection: name => ({
      doc: id => ref(`${name}/${id}`),
      where: (field, op, value) => ({
        where: (dueField, dueOp, dueValue) => ({
          limit: count => ({
            get: async () => ({
              docs: [...docs.entries()]
                .filter(
                  ([path, record]) =>
                    path.startsWith(`${name}/`) &&
                    (op !== "==" || record[field] === value) &&
                    (dueOp !== "<=" || record[dueField] <= dueValue)
                )
                .slice(0, count)
                .map(([path, record]) => ({
                  id: path.split("/").pop(),
                  data: () => structuredClone(record),
                  ref: ref(path),
                })),
            }),
          }),
        }),
      }),
    }),
    runTransaction: work => {
      const result = lock.then(() =>
        work({
          get: reference => reference.get(),
          update: (reference, patch) =>
            docs.set(reference.path, { ...docs.get(reference.path), ...structuredClone(patch) }),
        })
      );
      lock = result.catch(() => {});
      return result;
    },
  };
  return firestore;
};

const fakeStorage = () => {
  const objects = new Map();
  let saves = 0;
  let deletes = 0;
  return {
    name: "test-bucket",
    objects,
    get saves() {
      return saves;
    },
    get deletes() {
      return deletes;
    },
    getFiles: async ({ prefix }) => [[...objects.keys()]
      .filter(path => path.startsWith(prefix))
      .map(path => ({ name: path, delete: async () => { deletes++; objects.delete(path); } }))],
    file: (path, options = {}) => ({
      save: async (buffer, options) => {
        if (objects.has(path)) throw Object.assign(new Error("exists"), { code: 412 });
        saves++;
        objects.set(path, {
          buffer: Buffer.from(buffer),
          metadata: {
            size: String(buffer.length),
            metadata: options.metadata.metadata,
          },
        });
      },
      getMetadata: async () => {
        if (!objects.has(path))
          throw Object.assign(new Error("missing source"), { code: 404 });
        if (options.generation &&
            String(objects.get(path).metadata.generation) !== String(options.generation))
          throw Object.assign(new Error("source generation changed"), { code: 404 });
        return [objects.get(path).metadata];
      },
      createReadStream: () => {
        if (options.generation &&
            String(objects.get(path)?.metadata.generation) !== String(options.generation))
          throw new Error("source generation changed");
        return Readable.from([Buffer.from(objects.get(path).buffer)]);
      },
      getSignedUrl: async () => ["https://storage.example.test/source"],
      download: async () => [Buffer.from(objects.get(path).buffer)],
      delete: async () => {
        deletes++;
        objects.delete(path);
      },
    }),
  };
};

const source = Buffer.from("bounded-test-source");
const ownedPath = "studio/sources/owner-1/recording.mp4";
const addOwnedSource = (storage, overrides = {}) => storage.objects.set(ownedPath, {
  buffer: Buffer.from(source),
  metadata: {
    size: String(source.length), generation: "123", contentType: "video/mp4",
    metadata: { ownerUid: "owner-1", purpose: "studio_source" },
    ...overrides,
  },
});
const input = overrides => ({
  uid: "owner-1",
  requestId: "request-0001",
  projectId: "project-1",
  sourceAssetId: "asset-1",
  sourceSha256: crypto.createHash("sha256").update(source).digest("hex"),
  buffer: source,
  mode: "source_shots",
  start: 0,
  end: 60,
  anchors: { solo: { x: 40, y: 50 } },
  ...overrides,
});

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
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
beforeEach(() => {
  jest.clearAllMocks();
  projectSourceShotAnalysis.mockImplementation(({ analysis }) => ({
    workerResultSha256: hash(stable(analysis)),
  }));
  persistSourceShotAnalysisArtifact.mockImplementation(async ({ analysis }) => ({
    artifactHash: "b".repeat(64),
    contentHash: hash(stable(analysis)),
  }));
});

test("idempotent upload queues once and rejects a reused key with changed source or settings", async () => {
  const firestore = fakeFirestore(),
    storage = fakeStorage();
  const first = await createStudioAnalysisJob(input(), { firestore, storage });
  const repeated = await createStudioAnalysisJob(input(), { firestore, storage });
  expect(first).toMatchObject({ status: "queued", attempts: 0 });
  expect(repeated).toEqual(first);
  expect(storage.saves).toBe(1);
  await expect(
    createStudioAnalysisJob(input({ end: 50 }), { firestore, storage })
  ).rejects.toMatchObject({ code: "STUDIO_ANALYSIS_IDEMPOTENCY_CONFLICT" });
  await expect(
    createStudioAnalysisJob(input({ sourceSha256: "a".repeat(64) }), { firestore, storage })
  ).rejects.toMatchObject({ code: "STUDIO_ANALYSIS_JOB_INVALID" });
  expect(
    await getOwnedStudioAnalysisJob({ uid: "stranger", jobId: first.jobId, firestore })
  ).toBeNull();
});

test("one worker wins the claim; cancellation fences the worker result", async () => {
  const firestore = fakeFirestore(),
    storage = fakeStorage();
  const queued = await createStudioAnalysisJob(input(), { firestore, storage });
  const [one, two] = await Promise.all([
    claimJob({ jobId: queued.jobId, workerId: "worker-1", firestore }),
    claimJob({ jobId: queued.jobId, workerId: "worker-2", firestore }),
  ]);
  expect([one, two].filter(Boolean)).toHaveLength(1);
  const winner = one || two;
  expect(await renewLease({ jobId: queued.jobId, token: winner.leaseToken, firestore })).toBe(true);
  await expect(
    cancelStudioAnalysisJob({ uid: "stranger", jobId: queued.jobId, firestore, storage })
  ).resolves.toBeNull();
  const cancelled = await cancelStudioAnalysisJob({
    uid: "owner-1",
    jobId: queued.jobId,
    firestore,
    storage,
  });
  expect(cancelled.status).toBe("cancelled");
  expect(await renewLease({ jobId: queued.jobId, token: winner.leaseToken, firestore })).toBe(
    false
  );
  expect(await claimJob({ jobId: queued.jobId, workerId: "worker-3", firestore })).toBeNull();
});

test.each(["at-expiry", "after-expiry", "invalid-expiry"])(
  "%s lease cannot be renewed by its previous worker",
  async mode => {
    const firestore = fakeFirestore(),
      storage = fakeStorage();
    const queued = await createStudioAnalysisJob(input(), {
      firestore,
      storage,
    });
    let time = Date.now() + 1000;
    const clock = () => time;
    const claimed = await claimJob({
      jobId: queued.jobId,
      workerId: "worker-1",
      firestore,
      clock,
    });
    time = Date.parse(claimed.leaseUntil) + (mode === "after-expiry" ? 1 : 0);
    const path = `studio_analysis_jobs/${queued.jobId}`;
    if (mode === "invalid-expiry") firestore.docs.get(path).leaseUntil = "invalid";
    const before = structuredClone(firestore.docs.get(path));
    expect(
      await renewLease({
        jobId: queued.jobId,
        token: claimed.leaseToken,
        firestore,
        clock,
      })
    ).toBe(false);
    expect(firestore.docs.get(path)).toEqual(before);
  }
);

test("expired inference cannot publish evidence and a new worker recovers the job", async () => {
  const firestore = fakeFirestore(),
    storage = fakeStorage();
  const queued = await createStudioAnalysisJob(input(), { firestore, storage });
  let time = Date.now() + 1000;
  const clock = () => time;
  await processStudioAnalysisJob({
    jobId: queued.jobId,
    workerId: "expired-worker",
    firestore,
    storage,
    clock,
    runWorker: async job => {
      time = Date.parse(job.leaseUntil);
      return { engine: "opencv-yunet-source-shot-follow" };
    },
  });
  expect(persistSourceShotArtifact).not.toHaveBeenCalled();
  expect(persistSourceShotAnalysisArtifact).not.toHaveBeenCalled();
  expect(firestore.docs.get(`studio_analysis_jobs/${queued.jobId}`)).toMatchObject({
    status: "running",
    attempts: 1,
  });
  expect(storage.objects.size).toBe(1);
  await processStudioAnalysisJob({
    jobId: queued.jobId,
    workerId: "recovery-worker",
    firestore,
    storage,
    clock,
    runWorker: async () => ({ engine: "opencv-yunet-source-shot-follow" }),
  });
  expect(
    await getOwnedStudioAnalysisJob({
      uid: "owner-1",
      jobId: queued.jobId,
      firestore,
    })
  ).toMatchObject({ status: "completed", attempts: 2 });
});

test("lease expiry during source hashing cannot bind or analyze the owned source", async () => {
  const firestore = fakeFirestore(),
    storage = fakeStorage();
  addOwnedSource(storage);
  const queued = await createStudioAnalysisJobFromOwnedSource(
    {
      uid: "owner-1",
      requestId: "owned-expiry-1",
      projectId: "project-1",
      sourceAssetId: "asset-1",
      storagePath: ownedPath,
      mode: "source_shots",
      start: 0,
      end: 60,
      anchors: { solo: { x: 40, y: 50 } },
    },
    { firestore, sourceStorage: storage }
  );
  let time = Date.now() + 1000;
  const clock = () => time,
    originalFile = storage.file;
  storage.file = (path, options) => {
    const file = originalFile(path, options);
    if (path === ownedPath)
      file.createReadStream = () =>
        Readable.from(
          (async function* () {
            time += 15 * 60 * 1000;
            yield source;
          })()
        );
    return file;
  };
  const runWorker = jest.fn();
  await processStudioAnalysisJob({
    jobId: queued.jobId,
    workerId: "expired-worker",
    firestore,
    storage,
    clock,
    runWorker,
  });
  expect(runWorker).not.toHaveBeenCalled();
  expect(firestore.docs.get(`studio_analysis_jobs/${queued.jobId}`)).toMatchObject({
    status: "running",
    sourceSha256: null,
  });
  expect(assertOwnedStudioSourceBinding).not.toHaveBeenCalled();
  expect(storage.objects.has(ownedPath)).toBe(true);
});

test("lease expiry during artifact writing cannot upload or complete a result", async () => {
  const firestore = fakeFirestore(),
    storage = fakeStorage();
  const queued = await createStudioAnalysisJob(input(), { firestore, storage });
  let time = Date.now() + 1000;
  const clock = () => time;
  persistSourceShotAnalysisArtifact.mockImplementationOnce(async ({ analysis }) => {
    time += 15 * 60 * 1000;
    return {
      artifactHash: "b".repeat(64),
      contentHash: hash(stable(analysis)),
    };
  });
  await processStudioAnalysisJob({
    jobId: queued.jobId,
    workerId: "expired-worker",
    firestore,
    storage,
    clock,
    runWorker: async () => ({ engine: "opencv-yunet-source-shot-follow" }),
  });
  expect(firestore.docs.get(`studio_analysis_jobs/${queued.jobId}`)).toMatchObject({
    status: "running",
    attempts: 1,
  });
  expect(storage.objects.size).toBe(1);
});

test("lease expiry during result upload cannot complete or delete the retry source", async () => {
  const firestore = fakeFirestore(),
    storage = fakeStorage();
  const queued = await createStudioAnalysisJob(input(), { firestore, storage });
  let time = Date.now() + 1000;
  const clock = () => time,
    originalFile = storage.file;
  storage.file = (path, options) => {
    const file = originalFile(path, options),
      save = file.save;
    if (path.endsWith(".json"))
      file.save = async (...args) => {
        await save(...args);
        time += 15 * 60 * 1000;
      };
    return file;
  };
  await processStudioAnalysisJob({
    jobId: queued.jobId,
    workerId: "expired-worker",
    firestore,
    storage,
    clock,
    runWorker: async () => ({ engine: "opencv-yunet-source-shot-follow" }),
  });
  expect(firestore.docs.get(`studio_analysis_jobs/${queued.jobId}`)).toMatchObject({
    status: "running",
    attempts: 1,
  });
  expect(storage.objects.has(`temp/studio-analysis/owner-1/${queued.jobId}.mp4`)).toBe(true);
  storage.file = originalFile;
  await processStudioAnalysisJob({
    jobId: queued.jobId,
    workerId: "recovery-worker",
    firestore,
    storage,
    clock,
    runWorker: async () => ({ engine: "opencv-yunet-source-shot-follow" }),
  });
  expect(
    await getOwnedStudioAnalysisJob({
      uid: "owner-1",
      jobId: queued.jobId,
      firestore,
    })
  ).toMatchObject({ status: "completed", attempts: 2 });
  expect(storage.objects.size).toBe(1);
});

test("expired worker failure cannot queue a retry or replace the lease owner", async () => {
  const firestore = fakeFirestore(),
    storage = fakeStorage();
  const queued = await createStudioAnalysisJob(input(), { firestore, storage });
  let time = Date.now() + 1000;
  const clock = () => time;
  await processStudioAnalysisJob({
    jobId: queued.jobId,
    workerId: "expired-worker",
    firestore,
    storage,
    clock,
    runWorker: async job => {
      time = Date.parse(job.leaseUntil);
      throw new Error("late network failure");
    },
  });
  expect(firestore.docs.get(`studio_analysis_jobs/${queued.jobId}`)).toMatchObject({
    status: "running",
    workerId: "expired-worker",
    failureCode: null,
  });
});

test("an active heartbeat extends authority beyond the originally claimed deadline", async () => {
  const firestore = fakeFirestore(),
    storage = fakeStorage();
  const queued = await createStudioAnalysisJob(input(), { firestore, storage });
  let time = Date.now() + 1000;
  const clock = () => time;
  await processStudioAnalysisJob({
    jobId: queued.jobId,
    workerId: "worker-1",
    firestore,
    storage,
    clock,
    runWorker: async job => {
      time += 13 * 60 * 1000;
      expect(
        await renewLease({
          jobId: job.jobId,
          token: job.leaseToken,
          firestore,
          clock,
        })
      ).toBe(true);
      time += 3 * 60 * 1000;
      expect(time).toBeGreaterThan(Date.parse(job.leaseUntil));
      return { engine: "opencv-yunet-source-shot-follow" };
    },
  });
  expect(
    await getOwnedStudioAnalysisJob({
      uid: "owner-1",
      jobId: queued.jobId,
      firestore,
    })
  ).toMatchObject({ status: "completed", attempts: 1 });
});

test.each([false, true])(
  "reclaimed lease survives the old worker's return (failure=%s)",
  async failure => {
    const firestore = fakeFirestore(),
      storage = fakeStorage();
    const queued = await createStudioAnalysisJob(input(), {
      firestore,
      storage,
    });
    let time = Date.now() + 1000,
      successor;
    const clock = () => time;
    await processStudioAnalysisJob({
      jobId: queued.jobId,
      workerId: "old-worker",
      firestore,
      storage,
      clock,
      runWorker: async job => {
        time = Date.parse(job.leaseUntil);
        successor = await claimJob({
          jobId: job.jobId,
          workerId: "new-worker",
          firestore,
          clock,
        });
        if (failure) throw new Error("old worker failed");
        return { engine: "opencv-yunet-source-shot-follow" };
      },
    });
    expect(firestore.docs.get(`studio_analysis_jobs/${queued.jobId}`)).toMatchObject({
      status: "running",
      attempts: 2,
      workerId: "new-worker",
      leaseToken: successor.leaseToken,
      failureCode: null,
    });
    expect(storage.objects.size).toBe(1);
    expect(persistSourceShotArtifact).not.toHaveBeenCalled();
  }
);

test.each([false, true])(
  "existing result bytes must match their immutable hash (corrupt=%s)",
  async corrupt => {
    const firestore = fakeFirestore(),
      storage = fakeStorage();
    const queued = await createStudioAnalysisJob(input(), {
      firestore,
      storage,
    });
    const analysis = { engine: "opencv-yunet-source-shot-follow" },
      bytes = Buffer.from(stable(analysis));
    const resultSha256 = hash(bytes),
      path = `studio/analysis-results/owner-1/${queued.jobId}/${resultSha256}.json`;
    storage.objects.set(path, {
      buffer: corrupt ? Buffer.alloc(bytes.length, 32) : bytes,
      metadata: {
        size: String(bytes.length),
        contentType: "application/json",
        metadata: {
          ownerUid: "owner-1",
          jobId: queued.jobId,
          resultSha256,
          purpose: "studio-analysis-result",
        },
      },
    });
    await processStudioAnalysisJob({
      jobId: queued.jobId,
      workerId: "worker-1",
      firestore,
      storage,
      runWorker: async () => analysis,
    });
    expect(
      await getOwnedStudioAnalysisJob({
        uid: "owner-1",
        jobId: queued.jobId,
        firestore,
      })
    ).toMatchObject(
      corrupt
        ? {
            status: "failed",
            failureCode: "STUDIO_ANALYSIS_RESULT_INVALID",
            attempts: 1,
          }
        : { status: "completed", resultSha256 }
    );
  }
);

test.each(["not-a-number", "1.5"])("result read refuses invalid stored size %s", async size => {
  const firestore = fakeFirestore(),
    storage = fakeStorage();
  const queued = await createStudioAnalysisJob(input(), {
    firestore,
    storage,
  });
  await processStudioAnalysisJob({
    jobId: queued.jobId,
    workerId: "worker-1",
    firestore,
    storage,
    runWorker: async () => ({ engine: "opencv-yunet-source-shot-follow" }),
  });
  const path = [...storage.objects.keys()].find(path => path.endsWith(".json"));
  storage.objects.get(path).metadata.size = size;
  await expect(
    getOwnedStudioAnalysisResult({
      uid: "owner-1",
      jobId: queued.jobId,
      firestore,
      storage,
    })
  ).rejects.toMatchObject({ code: "STUDIO_ANALYSIS_JOB_UNAVAILABLE" });
});

test("result read stops an oversized stream even when metadata claims a bounded size", async () => {
  const firestore = fakeFirestore(),
    storage = fakeStorage();
  const queued = await createStudioAnalysisJob(input(), { firestore, storage });
  await processStudioAnalysisJob({
    jobId: queued.jobId,
    workerId: "worker-1",
    firestore,
    storage,
    runWorker: async () => ({ engine: "opencv-yunet-source-shot-follow" }),
  });
  const originalFile = storage.file;
  let stopped = false,
    stream;
  storage.file = (path, options) => {
    const file = originalFile(path, options);
    if (path.endsWith(".json"))
      file.createReadStream = () => {
        stream = Readable.from(
          (async function* () {
            try {
              yield Buffer.alloc(21 * 1024 * 1024);
              yield Buffer.alloc(1024);
            } finally {
              stopped = true;
            }
          })(),
          { highWaterMark: 1 }
        );
        return stream;
      };
    return file;
  };
  await expect(
    getOwnedStudioAnalysisResult({
      uid: "owner-1",
      jobId: queued.jobId,
      firestore,
      storage,
    })
  ).rejects.toMatchObject({ code: "STUDIO_ANALYSIS_JOB_UNAVAILABLE" });
  expect(stopped).toBe(true);
  expect(stream.destroyed).toBe(true);
});

test("transient failure retries once, then stores immutable receipts and deletes staged source", async () => {
  const firestore = fakeFirestore(),
    storage = fakeStorage();
  const queued = await createStudioAnalysisJob(input(), { firestore, storage });
  let time = Date.now() + 1000;
  const clock = () => time;
  const failed = await processStudioAnalysisJob({
    jobId: queued.jobId,
    workerId: "worker-1",
    firestore,
    storage,
    clock,
    runWorker: async () => {
      throw new Error("offline");
    },
  });
  expect(failed).toBeNull();
  let state = await getOwnedStudioAnalysisJob({ uid: "owner-1", jobId: queued.jobId, firestore });
  expect(state).toMatchObject({
    status: "queued",
    attempts: 1,
    failureCode: "STUDIO_ANALYSIS_WORKER_FAILED",
  });
  expect(
    await processNextStudioAnalysisJob({
      workerId: "worker-2",
      firestore,
      storage,
      clock,
      runWorker: async () => ({}),
    })
  ).toBe(false);
  time += 61000;
  const succeeded = await processNextStudioAnalysisJob({
    workerId: "worker-2",
    firestore,
    storage,
    clock,
    runWorker: async () => ({ engine: "opencv-yunet-source-shot-follow" }),
  });
  expect(succeeded).toBe(true);
  state = await getOwnedStudioAnalysisJob({ uid: "owner-1", jobId: queued.jobId, firestore });
  expect(state).toMatchObject({
    status: "completed",
    attempts: 2,
    sourceShotArtifact: { artifactHash: "a".repeat(64) },
    analysisArtifact: { artifactHash: "b".repeat(64) },
  });
  expect(assertOwnedStudioSourceBinding).toHaveBeenCalledTimes(1);
  expect(persistSourceShotArtifact).toHaveBeenCalledTimes(1);
  expect(persistSourceShotAnalysisArtifact).toHaveBeenCalledTimes(1);
  expect(storage.objects.size).toBe(1);
  expect(
    await getOwnedStudioAnalysisResult({ uid: "owner-1", jobId: queued.jobId, firestore, storage })
  ).toEqual({ engine: "opencv-yunet-source-shot-follow" });
  expect(
    await getOwnedStudioAnalysisResult({ uid: "stranger", jobId: queued.jobId, firestore, storage })
  ).toBeNull();
  const resultKey = [...storage.objects.keys()].find(path => path.endsWith(".json"));
  storage.objects.get(resultKey).buffer = Buffer.from('{"tampered":true}');
  await expect(
    getOwnedStudioAnalysisResult({ uid: "owner-1", jobId: queued.jobId, firestore, storage })
  ).rejects.toMatchObject({ code: "STUDIO_ANALYSIS_JOB_UNAVAILABLE" });
});

test("terminal worker rejection never publishes artifacts or retries", async () => {
  const firestore = fakeFirestore(),
    storage = fakeStorage();
  const queued = await createStudioAnalysisJob(input(), { firestore, storage });
  await processStudioAnalysisJob({
    jobId: queued.jobId,
    workerId: "worker-1",
    firestore,
    storage,
    runWorker: async () => {
      throw { response: { status: 422 } };
    },
  });
  expect(
    await getOwnedStudioAnalysisJob({ uid: "owner-1", jobId: queued.jobId, firestore })
  ).toMatchObject({ status: "failed", attempts: 1 });
  expect(persistSourceShotArtifact).not.toHaveBeenCalled();
  expect(storage.objects.size).toBe(0);
});

test("cancelling an active worker fences publication and cleans its staged source", async () => {
  const firestore = fakeFirestore(),
    storage = fakeStorage();
  const queued = await createStudioAnalysisJob(input(), { firestore, storage });
  let release;
  const waiting = new Promise(resolve => {
    release = resolve;
  });
  const processing = processStudioAnalysisJob({
    jobId: queued.jobId,
    workerId: "worker-1",
    firestore,
    storage,
    runWorker: () => waiting,
  });
  // Wait until the transaction has claimed the job and the worker is waiting.
  for (let attempt = 0; attempt < 20; attempt++) {
    const state = await getOwnedStudioAnalysisJob({
      uid: "owner-1",
      jobId: queued.jobId,
      firestore,
    });
    if (state.status === "running") break;
    await new Promise(resolve => setImmediate(resolve));
  }
  await cancelStudioAnalysisJob({ uid: "owner-1", jobId: queued.jobId, firestore, storage });
  release({ engine: "opencv-yunet-source-shot-follow" });
  await processing;
  expect(persistSourceShotArtifact).not.toHaveBeenCalled();
  expect(storage.objects.size).toBe(0);
  expect(
    await getOwnedStudioAnalysisJob({ uid: "owner-1", jobId: queued.jobId, firestore })
  ).toMatchObject({ status: "cancelled" });
});

test("two crashed leases exhaust retries and clean the source", async () => {
  const firestore = fakeFirestore(),
    storage = fakeStorage();
  const queued = await createStudioAnalysisJob(input(), { firestore, storage });
  let time = Date.now() + 1000;
  const clock = () => time;
  expect(
    await claimJob({ jobId: queued.jobId, workerId: "worker-1", firestore, clock })
  ).toMatchObject({ attempts: 1 });
  time += 16 * 60 * 1000;
  expect(
    await claimJob({ jobId: queued.jobId, workerId: "worker-2", firestore, clock })
  ).toMatchObject({ attempts: 2 });
  time += 16 * 60 * 1000;
  expect(
    await processNextStudioAnalysisJob({
      workerId: "worker-3",
      firestore,
      storage,
      clock,
      runWorker: async () => ({}),
    })
  ).toBe(true);
  expect(
    await getOwnedStudioAnalysisJob({ uid: "owner-1", jobId: queued.jobId, firestore })
  ).toMatchObject({ status: "failed", failureCode: "STUDIO_ANALYSIS_LEASE_EXPIRED" });
  expect(storage.objects.size).toBe(0);
});

test("abandoned staging expires and deletes its source", async () => {
  const firestore = fakeFirestore(),
    storage = fakeStorage();
  const queued = await createStudioAnalysisJob(input(), { firestore, storage });
  const path = `studio_analysis_jobs/${queued.jobId}`;
  firestore.docs.set(path, {
    ...firestore.docs.get(path),
    status: "staging",
    updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  });
  expect(
    await processNextStudioAnalysisJob({
      workerId: "worker-1",
      firestore,
      storage,
      runWorker: async () => ({}),
    })
  ).toBe(true);
  expect(
    await getOwnedStudioAnalysisJob({ uid: "owner-1", jobId: queued.jobId, firestore })
  ).toMatchObject({ status: "failed", failureCode: "STUDIO_ANALYSIS_STAGING_EXPIRED" });
  expect(storage.objects.size).toBe(0);
});

test("owned durable source is hashed by the worker and retained after completion", async () => {
  const firestore = fakeFirestore(), storage = fakeStorage();
  addOwnedSource(storage);
  const args = { uid: "owner-1", requestId: "owned-request-1",
    projectId: "project-1", sourceAssetId: "asset-1", storagePath: ownedPath,
    mode: "source_shots", start: 0, end: 60,
    anchors: { solo: { x: 40, y: 50 } } };
  const queued = await createStudioAnalysisJobFromOwnedSource(args,
    { firestore, sourceStorage: storage });
  expect(await createStudioAnalysisJobFromOwnedSource(args,
    { firestore, sourceStorage: storage })).toEqual(queued);
  expect(queued).toMatchObject({ status: "queued", sourceSha256: null });
  await processStudioAnalysisJob({ jobId: queued.jobId, workerId: "worker-1",
    firestore, storage, runWorker: async () => ({ engine: "opencv-yunet-source-shot-follow" }) });
  const state = await getOwnedStudioAnalysisJob({ uid: "owner-1", jobId: queued.jobId, firestore });
  expect(state).toMatchObject({ status: "completed", sourceSha256: hash(source) });
  expect(await createStudioAnalysisJobFromOwnedSource(args,
    { firestore, sourceStorage: storage })).toMatchObject({
    jobId: queued.jobId, status: "completed", sourceSha256: hash(source),
  });
  expect(assertOwnedStudioSourceBinding).toHaveBeenCalledWith(expect.objectContaining({
    sourceSha256: hash(source),
  }));
  expect(storage.objects.has(ownedPath)).toBe(true);
  expect(storage.objects.size).toBe(2);
  expect(await getOwnedStudioAnalysisResult({ uid: "owner-1", jobId: queued.jobId,
    firestore, storage })).toMatchObject({ engine: "opencv-yunet-source-shot-follow" });
  storage.objects.get(ownedPath).metadata.generation = "124";
  await expect(getOwnedStudioAnalysisResult({ uid: "owner-1", jobId: queued.jobId,
    firestore, storage })).rejects.toMatchObject({ code: "STUDIO_ANALYSIS_SOURCE_CHANGED" });
});

test("owned source rejects wrong owner, changed generation and a conflicting binding", async () => {
  const firestore = fakeFirestore(), storage = fakeStorage();
  const args = { uid: "owner-1", requestId: "owned-request-2",
    projectId: "project-1", sourceAssetId: "asset-1", storagePath: ownedPath,
    mode: "source_shots", start: 0, end: 60,
    anchors: { solo: { x: 40, y: 50 } } };
  await expect(createStudioAnalysisJobFromOwnedSource(args,
    { firestore, sourceStorage: storage })).rejects.toMatchObject({
    code: "STUDIO_ANALYSIS_SOURCE_MISSING",
  });
  addOwnedSource(storage, { metadata: { ownerUid: "stranger", purpose: "studio_source" } });
  await expect(createStudioAnalysisJobFromOwnedSource(args,
    { firestore, sourceStorage: storage })).rejects.toMatchObject({
    code: "STUDIO_ANALYSIS_SOURCE_FORBIDDEN",
  });
  addOwnedSource(storage);
  const queued = await createStudioAnalysisJobFromOwnedSource(args,
    { firestore, sourceStorage: storage });
  storage.objects.get(ownedPath).metadata.generation = "124";
  await processStudioAnalysisJob({ jobId: queued.jobId, workerId: "worker-1",
    firestore, storage, runWorker: async () => ({}) });
  expect(await getOwnedStudioAnalysisJob({ uid: "owner-1", jobId: queued.jobId, firestore }))
    .toMatchObject({ status: "failed", failureCode: "STUDIO_ANALYSIS_SOURCE_UNVERIFIED" });
  expect(storage.objects.has(ownedPath)).toBe(true);
  addOwnedSource(storage);
  getOwnedStudioSourceBinding.mockResolvedValueOnce({ sourceSha256: "f".repeat(64) });
  const other = await createStudioAnalysisJobFromOwnedSource({ ...args, requestId: "owned-request-3" },
    { firestore, sourceStorage: storage });
  await processStudioAnalysisJob({ jobId: other.jobId, workerId: "worker-2",
    firestore, storage, runWorker: async () => ({}) });
  expect(await getOwnedStudioAnalysisJob({ uid: "owner-1", jobId: other.jobId, firestore }))
    .toMatchObject({ status: "failed", failureCode: "PROJECT_SOURCE_CONFLICT" });
});

test("owned source refuses a false byte count or hash-qualified asset", async () => {
  const firestore = fakeFirestore(), storage = fakeStorage();
  addOwnedSource(storage);
  const args = { uid: "owner-1", requestId: "owned-request-5",
    projectId: "project-1", sourceAssetId: "asset-1", storagePath: ownedPath,
    mode: "source_shots", start: 0, end: 60,
    anchors: { solo: { x: 40, y: 50 } } };
  storage.objects.get(ownedPath).metadata.size = String(source.length + 1);
  const wrongSize = await createStudioAnalysisJobFromOwnedSource(args,
    { firestore, sourceStorage: storage });
  await processStudioAnalysisJob({ jobId: wrongSize.jobId, workerId: "worker-1",
    firestore, storage, runWorker: async () => ({}) });
  expect(await getOwnedStudioAnalysisJob({ uid: "owner-1", jobId: wrongSize.jobId, firestore }))
    .toMatchObject({ status: "failed", failureCode: "STUDIO_ANALYSIS_SOURCE_UNVERIFIED" });
  expect(persistSourceShotArtifact).not.toHaveBeenCalled();

  addOwnedSource(storage);
  const wrongHash = await createStudioAnalysisJobFromOwnedSource({ ...args,
    requestId: "owned-request-6", sourceAssetId: `asset-1:sha256:${"f".repeat(64)}` },
  { firestore, sourceStorage: storage });
  await processStudioAnalysisJob({ jobId: wrongHash.jobId, workerId: "worker-2",
    firestore, storage, runWorker: async () => ({}) });
  expect(await getOwnedStudioAnalysisJob({ uid: "owner-1", jobId: wrongHash.jobId, firestore }))
    .toMatchObject({ status: "failed", failureCode: "SOURCE_SHOT_ASSET_HASH_MISMATCH" });
  expect(persistSourceShotArtifact).not.toHaveBeenCalled();
});

test("janitor removes orphan results and keeps the completed receipt object", async () => {
  const firestore = fakeFirestore(), storage = fakeStorage();
  const queued = await createStudioAnalysisJob(input(), { firestore, storage });
  await processStudioAnalysisJob({ jobId: queued.jobId, workerId: "worker-1",
    firestore, storage, runWorker: async () => ({ engine: "opencv-yunet-source-shot-follow" }) });
  const path = `studio_analysis_jobs/${queued.jobId}`;
  const record = firestore.docs.get(path);
  firestore.docs.set(path, { ...record, cleanupAfter: new Date(0).toISOString() });
  const orphanPath = `studio/analysis-results/owner-1/${queued.jobId}/${"f".repeat(64)}.json`;
  storage.objects.set(orphanPath, { buffer: Buffer.from("orphan"), metadata: {} });
  expect(await processNextStudioAnalysisJob({ workerId: "janitor-1", firestore, storage,
    runWorker: async () => { throw new Error("cleanup must not run inference"); } }))
    .toBe(true);
  expect(storage.objects.has(orphanPath)).toBe(false);
  expect(storage.objects.size).toBe(1);
  expect(firestore.docs.get(path)).toMatchObject({ cleanupPending: false });
});

test("cancelled owned job keeps its source and retries an interrupted orphan cleanup", async () => {
  const firestore = fakeFirestore(), storage = fakeStorage();
  addOwnedSource(storage);
  const queued = await createStudioAnalysisJobFromOwnedSource({
    uid: "owner-1", requestId: "owned-request-4", projectId: "project-1",
    sourceAssetId: "asset-1", storagePath: ownedPath, mode: "source_shots",
    start: 0, end: 60, anchors: { solo: { x: 40, y: 50 } },
  }, { firestore, sourceStorage: storage });
  await cancelStudioAnalysisJob({ uid: "owner-1", jobId: queued.jobId, firestore, storage });
  const path = `studio_analysis_jobs/${queued.jobId}`;
  firestore.docs.set(path, { ...firestore.docs.get(path),
    cleanupAfter: new Date(0).toISOString() });
  const orphanPath = `studio/analysis-results/owner-1/${queued.jobId}/${"f".repeat(64)}.json`;
  storage.objects.set(orphanPath, { buffer: Buffer.from("orphan"), metadata: {} });
  const originalGetFiles = storage.getFiles;
  storage.getFiles = async () => [[{ name: orphanPath, delete: async () => {
    throw new Error("storage temporarily unavailable");
  } }]];
  await expect(cleanupStudioAnalysisJobObjects({ jobId: queued.jobId, firestore, storage }))
    .rejects.toThrow("temporarily unavailable");
  expect(firestore.docs.get(path).cleanupPending).toBe(true);
  storage.getFiles = originalGetFiles;
  expect(await cleanupStudioAnalysisJobObjects({ jobId: queued.jobId, firestore, storage }))
    .toBe(true);
  expect(storage.objects.has(orphanPath)).toBe(false);
  expect(storage.objects.has(ownedPath)).toBe(true);
});

test("a cleanup outage does not stall queued analysis", async () => {
  const firestore = fakeFirestore(), storage = fakeStorage();
  const finished = await createStudioAnalysisJob(input(), { firestore, storage });
  await processStudioAnalysisJob({ jobId: finished.jobId, workerId: "worker-1",
    firestore, storage, runWorker: async () => ({ engine: "opencv-yunet-source-shot-follow" }) });
  const finishedPath = `studio_analysis_jobs/${finished.jobId}`;
  firestore.docs.set(finishedPath, { ...firestore.docs.get(finishedPath),
    cleanupAfter: new Date(0).toISOString() });
  const next = await createStudioAnalysisJob(input({ requestId: "request-0002" }),
    { firestore, storage });
  storage.getFiles = async () => { throw new Error("list unavailable"); };
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect(await processNextStudioAnalysisJob({ workerId: "worker-2", firestore, storage,
      runWorker: async () => ({ engine: "opencv-yunet-source-shot-follow" }) })).toBe(true);
  } finally { log.mockRestore(); }
  expect(await getOwnedStudioAnalysisJob({ uid: "owner-1", jobId: next.jobId, firestore }))
    .toMatchObject({ status: "completed" });
  expect(firestore.docs.get(finishedPath).cleanupPending).toBe(true);
});
