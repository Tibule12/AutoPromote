import {
  estimateMulticamRenderCredits,
  getFullTimelineRenderWindow,
  getMulticamRenderBillingUnits,
  getRenderCheckpointSummary,
  getRenderManifestLocation,
  isAsyncRenderDeliveryReady,
} from "../MultiCamCombiner";

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
});
