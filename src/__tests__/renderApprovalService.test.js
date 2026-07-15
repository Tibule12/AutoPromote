const {
  buildApprovalUpdate,
  buildRejectionUpdate,
  normalizeRenderApproval,
  sanitizeResultForApproval,
} = require("../services/renderApprovalService");

describe("renderApprovalService", () => {
  const completedRender = {
    jobId: "job-1",
    type: "multicam_render",
    status: "completed",
    output_url: "https://cdn.example.com/held.mp4",
    result: {
      url: "https://cdn.example.com/held.mp4",
      duration: 120,
    },
  };

  it("delivers a completed paid multicam render without a review gate", () => {
    const approval = normalizeRenderApproval("job-1", completedRender);

    expect(approval.approvalStatus).toBe("approved");
    expect(approval.deliveryStatus).toBe("available");
    expect(approval.reviewRequired).toBe(false);
    expect(approval.canDownload).toBe(true);
    expect(approval.outputUrl).toBe("https://cdn.example.com/held.mp4");
    expect(approval.previewUrl).toBe("https://cdn.example.com/held.mp4");

    expect(sanitizeResultForApproval(completedRender.result, approval)).toEqual(
      expect.objectContaining({ url: "https://cdn.example.com/held.mp4", duration: 120 })
    );
  });

  it("exposes only the approved output after approval", () => {
    const timestamp = "SERVER_TIMESTAMP";
    const update = buildApprovalUpdate({
      data: completedRender,
      approvedBy: "user-1",
      notes: "looks good",
      timestamp,
    });
    const approved = normalizeRenderApproval("job-1", { ...completedRender, ...update });

    expect(update.approvalStatus).toBe("approved");
    expect(update.deliveryStatus).toBe("available");
    expect(update.approvedOutputUrl).toBe("https://cdn.example.com/held.mp4");
    expect(approved.canDownload).toBe(true);
    expect(approved.outputUrl).toBe("https://cdn.example.com/held.mp4");
  });

  it("does not reintroduce a rejection gate for a completed paid render", () => {
    const timestamp = "SERVER_TIMESTAMP";
    const update = buildRejectionUpdate({
      data: completedRender,
      rejectedBy: "user-1",
      notes: "bad sync",
      timestamp,
    });
    const rejected = normalizeRenderApproval("job-1", { ...completedRender, ...update });

    expect(rejected.approvalStatus).toBe("approved");
    expect(rejected.deliveryStatus).toBe("available");
    expect(rejected.canDownload).toBe(true);
    expect(rejected.outputUrl).toBe("https://cdn.example.com/held.mp4");
  });
});
