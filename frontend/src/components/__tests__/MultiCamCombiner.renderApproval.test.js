import {
  canDownloadApprovedRender,
  getRenderApprovalCopy,
  getRenderApprovalState,
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
