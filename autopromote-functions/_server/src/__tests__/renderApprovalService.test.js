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

  it("holds completed multicam output for review and blocks download URLs", () => {
    const approval = normalizeRenderApproval("job-1", completedRender);

    expect(approval.approvalStatus).toBe("needs_review");
    expect(approval.deliveryStatus).toBe("held_for_review");
    expect(approval.canDownload).toBe(false);
    expect(approval.outputUrl).toBeNull();
    expect(approval.previewUrl).toBe("https://cdn.example.com/held.mp4");

    expect(sanitizeResultForApproval(completedRender.result, approval)).toEqual({
      duration: 120,
    });
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

  it("keeps rejected renders blocked", () => {
    const timestamp = "SERVER_TIMESTAMP";
    const update = buildRejectionUpdate({
      data: completedRender,
      rejectedBy: "user-1",
      notes: "bad sync",
      timestamp,
    });
    const rejected = normalizeRenderApproval("job-1", { ...completedRender, ...update });

    expect(rejected.approvalStatus).toBe("rejected");
    expect(rejected.deliveryStatus).toBe("blocked");
    expect(rejected.canDownload).toBe(false);
    expect(rejected.outputUrl).toBeNull();
  });
});
