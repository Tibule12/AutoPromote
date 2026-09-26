const express = require("express");
const request = require("supertest");

const mockDocs = new Map();
const mockFiles = new Map();
const mockCopies = jest.fn();
const mockStartProcessingJob = jest.fn();
const mockStartMulticamRenderJob = jest.fn();

const fileKey = (bucket, path) => `${bucket}/${path}`;
const makeFile = (bucket, path) => ({
  name: path,
  bucket: { name: bucket },
  exists: jest.fn(async () => [mockFiles.has(fileKey(bucket, path))]),
  getMetadata: jest.fn(async () => {
    const metadata = mockFiles.get(fileKey(bucket, path));
    if (!metadata) throw Object.assign(new Error("not found"), { code: 404 });
    return [metadata];
  }),
  getSignedUrl: jest.fn(async () => [`https://signed.example/${encodeURIComponent(path)}`]),
  copy: jest.fn(async destination => {
    const metadata = mockFiles.get(fileKey(bucket, path));
    if (!metadata) throw Object.assign(new Error("not found"), { code: 404 });
    mockCopies(path, destination.name);
    mockFiles.set(fileKey(destination.bucket.name, destination.name), {
      ...metadata,
      metadata: { ...(metadata.metadata || {}) },
    });
    return [destination];
  }),
  setMetadata: jest.fn(async update => {
    const metadata = mockFiles.get(fileKey(bucket, path));
    if (!metadata) throw Object.assign(new Error("not found"), { code: 404 });
    mockFiles.set(fileKey(bucket, path), {
      ...metadata,
      ...update,
      metadata: { ...(metadata.metadata || {}), ...(update.metadata || {}) },
    });
    return [mockFiles.get(fileKey(bucket, path))];
  }),
});

jest.mock("firebase-admin", () => ({
  firestore: Object.assign(
    jest.fn(() => ({
      collection: jest.fn(() => ({
        doc: jest.fn(id => ({
          get: jest.fn(async () => ({
            id,
            exists: mockDocs.has(id),
            data: () => mockDocs.get(id),
          })),
        })),
      })),
    })),
    { FieldValue: { serverTimestamp: jest.fn(() => "SERVER_TIMESTAMP") } }
  ),
  storage: jest.fn(() => ({
    bucket: jest.fn(name => ({
      name: name || "test-bucket",
      file: jest.fn(path => makeFile(name || "test-bucket", path)),
    })),
  })),
}));

jest.mock("../authMiddleware", () => (req, _res, next) => {
  req.user = { uid: "owner-1" };
  req.userId = "owner-1";
  next();
});
jest.mock("../creditSystem", () => ({
  deductCredits: jest.fn(),
  refundCredits: jest.fn(),
  getCreditBreakdown: jest.fn(),
}));
jest.mock("../services/videoEditingService", () =>
  jest.fn().mockImplementation(() => ({
    startProcessingJob: mockStartProcessingJob,
    startMulticamRenderJob: mockStartMulticamRenderJob,
  }))
);
jest.mock("../services/cloudRunJobService", () => ({
  isDurableMulticamRenderEnabled: jest.fn(() => true),
}));
jest.mock("../services/multicamCapacityService", () => ({
  reserveMulticamRenderCapacity: jest.fn(async () => ({})),
  releaseMulticamRenderCapacity: jest.fn(async () => ({})),
}));
jest.mock("../services/billingService", () => ({
  getEffectiveTierSnapshot: jest.fn().mockResolvedValue({ tierId: "premium" }),
}));
jest.mock("../services/studio3DService", () => ({
  createStudio3DPreview: jest.fn(),
  getOwnedStudio3DPreview: jest.fn(),
  resolveStudio3DExport: jest.fn(),
}));
jest.mock("../services/clipOutcomeLearningService", () => ({
  getClipLearningProfile: jest.fn().mockResolvedValue(null),
}));

const mediaRoutes = require("../mediaRoutes");
const { deductCredits } = require("../creditSystem");

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/media", mediaRoutes);
  return app;
};

const putVideo = (path, ownerUid = "owner-1", metadata = {}) => {
  mockFiles.set(fileKey("test-bucket", path), {
    size: "4096",
    contentType: "video/mp4",
    generation: "12",
    metadata: {
      ownerUid,
      purpose: path.startsWith("studio/") ? "studio_project" : undefined,
      ...metadata,
    },
  });
};

const clip = (id, storagePath, url = "https://browser.example/untrusted.mp4") => ({
  id,
  sourceStoragePath: storagePath,
  url,
  start_time: 0,
  end_time: 5,
  duration: 5,
});

const renderBody = (segments, extra = {}) => ({
  fileUrl: "https://browser.example/main.mp4",
  sourceStoragePath: "studio/sources/owner-1/scene-a.mp4",
  options: {
    renderViral: true,
    viralData: { timeline_segments: segments, ...extra },
  },
});

describe("owned Studio project sources", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDocs.clear();
    mockFiles.clear();
    process.env.MULTICAM_INGEST_BUCKET = "test-bucket";
    deductCredits.mockResolvedValue({ success: true, deducted: 5, remaining: 95 });
    mockStartProcessingJob.mockResolvedValue({ jobId: "studio-render-1" });
    mockStartMulticamRenderJob.mockResolvedValue({ jobId: "cam-job-1", dispatchMode: "cloud_run_job" });
    putVideo("studio/sources/owner-1/scene-a.mp4");
    putVideo("studio/sources/owner-1/scene-b.mp4");
  });

  it("resolves two owned scenes and a video layer in timeline order before charging", async () => {
    const response = await request(buildApp()).post("/api/media/process").send(
      renderBody([
        clip("scene-a", "studio/sources/owner-1/scene-a.mp4"),
        clip("scene-b", "studio/sources/owner-1/scene-b.mp4"),
        clip("scene-a-again", "studio/sources/owner-1/scene-a.mp4"),
      ], {
        overlays: [
          { type: "video", src: "https://browser.example/layer", sourceStoragePath: "studio/sources/owner-1/scene-b.mp4" },
          { type: "image", src: "https://images.example/logo.png", storagePath: "uploads/images/owner-1/logo.png" },
        ],
      })
    );

    expect(response.statusCode).toBe(200);
    expect(deductCredits).toHaveBeenCalledTimes(1);
    const [mainUrl, options] = mockStartProcessingJob.mock.calls[0];
    expect(mainUrl).toBe("https://signed.example/studio%2Fsources%2Fowner-1%2Fscene-a.mp4");
    expect(options.viralData.timeline_segments.map(segment => segment.url)).toEqual([
      "https://signed.example/studio%2Fsources%2Fowner-1%2Fscene-a.mp4",
      "https://signed.example/studio%2Fsources%2Fowner-1%2Fscene-b.mp4",
      "https://signed.example/studio%2Fsources%2Fowner-1%2Fscene-a.mp4",
    ]);
    expect(options.viralData.overlays[0].src).toBe(
      "https://signed.example/studio%2Fsources%2Fowner-1%2Fscene-b.mp4"
    );
    expect(options.viralData.overlays[1].src).toBe("https://images.example/logo.png");
    expect(JSON.stringify(options.viralData.timeline_segments)).not.toContain("browser.example");
  });

  it.each([
    ["another user's path", "studio/sources/attacker/scene.mp4", 403],
    ["forged owner metadata", "studio/sources/owner-1/forged.mp4", 403],
    ["deleted file", "studio/sources/owner-1/missing.mp4", 404],
  ])("rejects %s before credits are charged", async (_name, path, expectedStatus) => {
    if (path.endsWith("forged.mp4")) putVideo(path, "attacker");
    const response = await request(buildApp()).post("/api/media/process").send(
      renderBody([clip("scene-a", "studio/sources/owner-1/scene-a.mp4"), clip("scene-b", path)])
    );

    expect(response.statusCode).toBe(expectedStatus);
    expect(response.body.message).toMatch(/Clip 2:/);
    expect(deductCredits).not.toHaveBeenCalled();
    expect(mockStartProcessingJob).not.toHaveBeenCalled();
  });

  it("requires an uploaded source path for a secondary clip and project video layer", async () => {
    const secondary = await request(buildApp()).post("/api/media/process").send(
      renderBody([clip("scene-a", "studio/sources/owner-1/scene-a.mp4"), { id: "scene-b", url: "https://browser.example/another.mp4" }])
    );
    expect(secondary.statusCode).toBe(422);
    expect(secondary.body.code).toBe("STUDIO_CLIP_SOURCE_PATH_REQUIRED");

    const layer = await request(buildApp()).post("/api/media/process").send(
      renderBody([clip("scene-a", "studio/sources/owner-1/scene-a.mp4")], {
        overlays: [{ type: "video", sourceMediaId: "unuploaded-project-asset", src: "https://browser.example/another.mp4" }],
      })
    );
    expect(layer.statusCode).toBe(422);
    expect(layer.body.code).toBe("STUDIO_VIDEO_LAYER_SOURCE_PATH_REQUIRED");
    expect(deductCredits).not.toHaveBeenCalled();
  });

  it("preserves the legacy single-source render contract", async () => {
    const response = await request(buildApp()).post("/api/media/process").send({
      fileUrl: "https://legacy.example/main.mp4",
      options: {
        renderViral: true,
        viralData: { timeline_segments: [{ id: "main", url: "https://browser.example/replace.mp4" }] },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(mockStartProcessingJob.mock.calls[0][0]).toBe("https://legacy.example/main.mp4");
    expect(mockStartProcessingJob.mock.calls[0][1].viralData.timeline_segments[0].url)
      .toBe("https://legacy.example/main.mp4");
  });

  it("copies an owned Cam Combiner master once and refreshes its preview URL", async () => {
    mockDocs.set("master-1", {
      userId: "owner-1",
      type: "multicam_render",
      status: "completed",
      outputUrl: "https://browser.example/expired-master.mp4",
      outputStoragePath: "processed/multicam_master-1.mp4",
      duration: 125,
      result: { url: "https://browser.example/expired-master.mp4" },
    });
    putVideo("processed/multicam_master-1.mp4");

    const first = await request(buildApp()).post("/api/media/studio-assets/import-render")
      .send({ renderJobId: "master-1" });
    const second = await request(buildApp()).post("/api/media/studio-assets/import-render")
      .send({ renderJobId: "master-1" });

    expect(first.statusCode).toBe(200);
    expect(first.body.asset).toMatchObject({
      sourceRenderJobId: "master-1",
      duration: 125,
      storagePath: expect.stringMatching(/^studio\/sources\/owner-1\/master_/),
    });
    expect(second.body.asset.storagePath).toBe(first.body.asset.storagePath);
    expect(mockCopies).toHaveBeenCalledTimes(1);
    expect(deductCredits).not.toHaveBeenCalled();

    const refresh = await request(buildApp()).post("/api/media/studio-assets/resolve")
      .send({ storagePath: first.body.asset.storagePath });
    expect(refresh.statusCode).toBe(200);
    expect(refresh.body.url).toContain("https://signed.example/");
    expect(refresh.body.storagePath).toBe(first.body.asset.storagePath);
  });

  it("refreshes a small Firebase Studio upload but rejects a forged owner", async () => {
    putVideo("uploads/videos/owner-1/small-scene.mp4");
    putVideo("uploads/videos/owner-1/forged-scene.mp4", "attacker");

    const valid = await request(buildApp()).post("/api/media/studio-assets/resolve")
      .send({ storagePath: "uploads/videos/owner-1/small-scene.mp4" });
    const forged = await request(buildApp()).post("/api/media/studio-assets/resolve")
      .send({ storagePath: "uploads/videos/owner-1/forged-scene.mp4" });

    expect(valid.statusCode).toBe(200);
    expect(valid.body.url).toContain("small-scene.mp4");
    expect(forged.statusCode).toBe(403);
    expect(forged.body.code).toBe("STUDIO_SOURCE_FORBIDDEN");
    expect(deductCredits).not.toHaveBeenCalled();
  });

  it("does not import another user's Cam Combiner master", async () => {
    mockDocs.set("master-1", {
      userId: "attacker",
      type: "multicam_render",
      status: "completed",
      outputUrl: "https://browser.example/master.mp4",
      outputStoragePath: "processed/multicam_master-1.mp4",
      result: { url: "https://browser.example/master.mp4" },
    });
    putVideo("processed/multicam_master-1.mp4", "attacker");

    const response = await request(buildApp()).post("/api/media/studio-assets/import-render")
      .send({ renderJobId: "master-1" });

    expect(response.statusCode).toBe(403);
    expect(mockCopies).not.toHaveBeenCalled();
    expect(deductCredits).not.toHaveBeenCalled();
  });

  it("finishes a master import after a timed-out copy left an untagged object", async () => {
    mockDocs.set("master-1", {
      userId: "owner-1",
      type: "multicam_render",
      status: "completed",
      outputUrl: "https://browser.example/expired-master.mp4",
      outputStoragePath: "processed/multicam_master-1.mp4",
      result: { url: "https://browser.example/expired-master.mp4" },
    });
    putVideo("processed/multicam_master-1.mp4");
    const digest = require("crypto").createHash("sha256")
      .update("owner-1\0master-1\0processed/multicam_master-1.mp4")
      .digest("hex")
      .slice(0, 32);
    const storagePath = `studio/sources/owner-1/master_${digest}.mp4`;
    mockFiles.set(fileKey("test-bucket", storagePath), {
      size: "4096",
      contentType: "video/mp4",
      metadata: {},
    });

    const response = await request(buildApp()).post("/api/media/studio-assets/import-render")
      .send({ renderJobId: "master-1" });

    expect(response.statusCode).toBe(200);
    expect(response.body.asset.storagePath).toBe(storagePath);
    expect(mockCopies).toHaveBeenCalledTimes(1);
    expect(mockFiles.get(fileKey("test-bucket", storagePath)).metadata).toMatchObject({
      ownerUid: "owner-1",
      purpose: "studio_project",
      sourceRenderJobId: "master-1",
    });
  });

  it("replaces a durable Studio camera URL before dispatching a Cam Combiner render", async () => {
    putVideo("temp/multicam-ingest/owner-1/camera-original.mp4", "owner-1", {
      purpose: "camera_original",
      firebaseStorageDownloadTokens: "camera-token",
      deleteAfter: new Date(Date.now() + 60_000).toISOString(),
    });

    const response = await request(buildApp()).post("/api/media/render-multicam").send({
      sources: [
        {
          id: "studio-camera",
          storagePath: "studio/sources/owner-1/scene-a.mp4",
          url: "https://attacker.example/wrong.mp4",
        },
        {
          id: "original-camera",
          storagePath: "temp/multicam-ingest/owner-1/camera-original.mp4",
          url: "https://firebasestorage.googleapis.com/camera?token=camera-token",
        },
      ],
      overlapDuration: 20,
      totalDurationSeconds: 20,
    });

    expect(response.statusCode).toBe(200);
    const multicamRequest = mockStartMulticamRenderJob.mock.calls[0][0];
    expect(multicamRequest.sources[0].url).toBe(
      "https://signed.example/studio%2Fsources%2Fowner-1%2Fscene-a.mp4"
    );
    expect(multicamRequest.sources[1].url).toContain("token=camera-token");
  });
});
