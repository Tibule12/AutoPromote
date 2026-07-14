import {
  canDownloadApprovedRender,
  getMulticamRenderButtonLabel,
  getRecoveredPodcastOutputAspectRatio,
  getRenderApprovalCopy,
  getRenderApprovalState,
  isRecoverableMediaUrl,
  needsSourceMediaMetadata,
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

describe("MultiCamCombiner render approval helpers", () => {
  it("accepts cloud media URLs and rejects filesystem paths", () => {
    expect(
      isRecoverableMediaUrl(
        "https://firebasestorage.googleapis.com/v0/b/example/o/camera.mov?alt=media"
      )
    ).toBe(true);
    expect(isRecoverableMediaUrl("/home/user/project/tmp/camera.mov")).toBe(false);
    expect(isRecoverableMediaUrl("file:///home/user/project/tmp/camera.mov")).toBe(false);
    expect(isRecoverableMediaUrl("")).toBe(false);
  });

  it("restores podcast projects as 16:9 even when an old proof was saved vertically", () => {
    expect(getRecoveredPodcastOutputAspectRatio("9:16")).toBe("16:9");
    expect(getRecoveredPodcastOutputAspectRatio("16:9")).toBe("16:9");
  });

  it("labels the paid proof action as a 60-second proof instead of a polished master", () => {
    expect(
      getMulticamRenderButtonLabel({ mode: "proof", isSyncing: false, isPending: false })
    ).toBe("Render 60-second Proof (15 cr)");
    expect(
      getMulticamRenderButtonLabel({ mode: "full", isSyncing: false, isPending: false })
    ).toBe("Render Full Episode MP4");
  });

  it("reloads dimensions for recovered videos even when their duration is already known", () => {
    expect(
      needsSourceMediaMetadata({
        mediaKind: "video",
        url: "https://cdn.example.com/camera.mov",
        duration: 2640,
        videoWidth: 0,
        videoHeight: 0,
      })
    ).toBe(true);
    expect(
      needsSourceMediaMetadata({
        mediaKind: "video",
        url: "https://cdn.example.com/camera.mov",
        duration: 2640,
        videoWidth: 1920,
        videoHeight: 1080,
      })
    ).toBe(false);
  });

  it("blocks downloads for needs_review renders", () => {
    const render = {
      approvalStatus: "needs_review",
      previewUrl: "https://cdn.example.com/held.mp4",
      outputUrl: null,
    };

    expect(getRenderApprovalState(render)).toBe("needs_review");
    expect(getRenderApprovalCopy(render)).toBe("Needs human review");
    expect(canDownloadApprovedRender(render)).toBe(false);
  });

  it("allows downloads only for approved renders with an output URL", () => {
    const render = {
      approvalStatus: "approved",
      outputUrl: "https://cdn.example.com/approved.mp4",
    };

    expect(getRenderApprovalState(render)).toBe("approved");
    expect(getRenderApprovalCopy(render)).toBe("Approved master");
    expect(canDownloadApprovedRender(render)).toBe(true);
  });

  it("keeps rejected renders blocked", () => {
    const render = {
      approvalStatus: "rejected",
      heldOutputUrl: "https://cdn.example.com/rejected.mp4",
    };

    expect(getRenderApprovalState(render)).toBe("rejected");
    expect(getRenderApprovalCopy(render)).toBe("Rejected render");
    expect(canDownloadApprovedRender(render)).toBe(false);
  });
});
