import {
  estimateMulticamRenderCredits,
  extractFirebaseRenderStoragePath,
  getVideoProxyMimeCandidates,
  getFullTimelineRenderWindow,
  getProductionProofRenderWindow,
  getMulticamRenderBillingUnits,
  getRenderCheckpointSummary,
  getRenderManifestLocation,
  getRenderOutputUrl,
  isFirebaseRenderStoragePath,
  isAsyncRenderDeliveryReady,
  resolveFirebaseRenderUrl,
  resolveRenderDeliveryUrls,
  selectVideoProxyMimeType,
  waitForResumableUploadDownloadUrl,
} from "../MultiCamCombiner";
import { getDownloadURL } from "firebase/storage";

jest.mock("firebase/auth", () => ({
  getAuth: jest.fn(() => ({ currentUser: null })),
}));

jest.mock("firebase/storage", () => ({
  getStorage: jest.fn(),
  ref: jest.fn(),
  uploadBytesResumable: jest.fn(),
  getDownloadURL: jest.fn(),
}));

jest.mock("react-hot-toast", () => ({
  error: jest.fn(),
  success: jest.fn(),
}));

jest.mock("../../hooks/useSubscription", () => ({
  useSubscription: jest.fn(() => ({ canUseFeature: jest.fn(() => true), credits: 999 })),
}));

jest.mock("../../hooks/useCinematicEffects", () => jest.fn(() => ({})));

describe("MultiCamCombiner checkpoint render helpers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("submits a 44-minute project as one full timeline beginning at zero", () => {
    const renderWindow = getFullTimelineRenderWindow(44 * 60);

    expect(renderWindow).toEqual({
      start: 0,
      end: 44 * 60,
      duration: 44 * 60,
      exceedsServerCap: false,
      checkpointSeconds: 300,
      checkpointCount: 9,
    });
  });

  it("treats three hours as the total cap instead of a selectable window", () => {
    expect(getFullTimelineRenderWindow(3 * 60 * 60)).toEqual(
      expect.objectContaining({
        start: 0,
        duration: 3 * 60 * 60,
        exceedsServerCap: false,
        checkpointCount: 36,
      })
    );
    expect(getFullTimelineRenderWindow(3 * 60 * 60 + 1)).toEqual(
      expect.objectContaining({
        start: 0,
        duration: 3 * 60 * 60,
        exceedsServerCap: true,
      })
    );
  });

  it("builds a real 60-second production window without changing the full timeline", () => {
    expect(getProductionProofRenderWindow(44 * 60, 120)).toEqual({
      start: 120,
      end: 180,
      duration: 60,
      exceedsServerCap: false,
      checkpointSeconds: 300,
      checkpointCount: 1,
      renderPurpose: "production_proof",
    });
    expect(getProductionProofRenderWindow(45, 120)).toEqual(
      expect.objectContaining({ start: 0, end: 45, duration: 45 })
    );
  });

  it("charges displayed credits by started 20-minute units", () => {
    expect(getMulticamRenderBillingUnits(44 * 60)).toBe(3);
    expect(estimateMulticamRenderCredits("premium", 44 * 60)).toBe(450);
    expect(estimateMulticamRenderCredits("simple", 20 * 60)).toBe(75);
    expect(estimateMulticamRenderCredits("studio", 20 * 60 + 1)).toBe(600);
  });

  it("reads and labels checkpoint progress from the status payload", () => {
    expect(
      getRenderCheckpointSummary({
        expectedCheckpointCount: 9,
        totalDurationSeconds: 44 * 60,
        renderCheckpoint: {
          stage: "rendering_chunks",
          currentIndex: 4,
          completedCount: 4,
          completedDurationSeconds: 1200,
        },
      })
    ).toEqual({
      stage: "rendering_chunks",
      status: "",
      currentIndex: 4,
      completedCount: 4,
      expectedCount: 9,
      activeCheckpoint: 5,
      completedDurationSeconds: 1200,
      totalDurationSeconds: 44 * 60,
      label: "Checkpoint 5/9",
    });
  });

  it("requires both a master and manifest before a version-2 async delivery is ready", () => {
    const outputOnly = {
      status: "completed",
      renderSpecVersion: 2,
      outputUrl: "https://cdn.example.com/master.mp4",
    };
    const manifestOnly = {
      status: "completed",
      renderSpecVersion: 2,
      manifestStoragePath: "processed/manifests/job.json",
    };
    const complete = {
      ...outputOnly,
      manifestStoragePath: "processed/manifests/job.json",
    };

    expect(isAsyncRenderDeliveryReady(outputOnly)).toBe(false);
    expect(isAsyncRenderDeliveryReady(manifestOnly)).toBe(false);
    expect(isAsyncRenderDeliveryReady(complete)).toBe(true);
    expect(getRenderManifestLocation(complete)).toBe("processed/manifests/job.json");
    expect(
      isAsyncRenderDeliveryReady({
        status: "completed",
        renderSpecVersion: 1,
        outputUrl: "https://cdn.example.com/legacy.mp4",
      })
    ).toBe(true);
  });

  it("recognizes legacy Firebase render paths that must not be loaded as site-relative media", () => {
    expect(isFirebaseRenderStoragePath("processed/multicam_job-123.mp4")).toBe(true);
    expect(isFirebaseRenderStoragePath("processed/thumbnails/multicam_job-123.jpg")).toBe(true);
    expect(isFirebaseRenderStoragePath("processed/manifests/multicam_job-123.json")).toBe(true);
    expect(isFirebaseRenderStoragePath("https://cdn.example.com/multicam_job-123.mp4")).toBe(false);
    expect(isFirebaseRenderStoragePath("/local-output/multicam_job-123.mp4")).toBe(false);
    expect(
      extractFirebaseRenderStoragePath(
        "https://firebasestorage.googleapis.com/v0/b/app/o/processed%2Fmulticam_job-123.mp4?alt=media"
      )
    ).toBe("processed/multicam_job-123.mp4");
    expect(
      extractFirebaseRenderStoragePath(
        "https://storage.googleapis.com/app/processed/multicam_job-123.mp4?X-Goog-Signature=old"
      )
    ).toBe("processed/multicam_job-123.mp4");
  });

  it("uses a video-only codec declaration when the proxy has no audio track", () => {
    expect(getVideoProxyMimeCandidates(false)).toEqual([
      "video/webm;codecs=vp8",
      "video/webm;codecs=vp9",
      "video/webm",
    ]);
    expect(
      selectVideoProxyMimeType(false, type =>
        ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp8"].includes(type)
      )
    ).toBe("video/webm;codecs=vp8");
    expect(getVideoProxyMimeCandidates(false).some(type => type.includes("opus"))).toBe(false);
  });

  it("clears and negative-caches confirmed missing Firebase render objects", async () => {
    const missingPath = "processed/multicam_missing-checkpoint-test.mp4";
    getDownloadURL.mockRejectedValueOnce(
      Object.assign(new Error("missing"), { code: "storage/object-not-found" })
    );

    const resolved = await resolveRenderDeliveryUrls({
      output_url: missingPath,
      approvedOutputUrl: missingPath,
      result: { url: missingPath, output_url: missingPath, outputUrl: missingPath },
    });

    expect(getRenderOutputUrl(resolved)).toBe("");
    expect(resolved.result).toEqual({ url: "", output_url: "", outputUrl: "" });
    await resolveFirebaseRenderUrl(missingPath);
    expect(getDownloadURL).toHaveBeenCalledTimes(1);
  });

  it("recovers when Firebase reports 100 percent but omits the completion callback", async () => {
    const task = {
      on: jest.fn((_event, onProgress) => {
        onProgress({ bytesTransferred: 21.5 * 1024 * 1024, totalBytes: 21.5 * 1024 * 1024 });
      }),
    };
    const resolveDownloadUrl = jest
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("not finalized"), { code: "storage/object-not-found" })
      )
      .mockResolvedValueOnce("https://storage.example.com/proof-camera-2.webm");

    await expect(
      waitForResumableUploadDownloadUrl({
        task,
        storageRef: { fullPath: "temp/multicam/camera-2.webm" },
        resolveDownloadUrl,
        recoveryDelayMs: 0,
        pollIntervalMs: 0,
        maxPollAttempts: 2,
      })
    ).resolves.toBe("https://storage.example.com/proof-camera-2.webm");
    expect(resolveDownloadUrl).toHaveBeenCalledTimes(2);
  });
});
