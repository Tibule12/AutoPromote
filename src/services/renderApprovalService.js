const OUTPUT_URL_KEYS = ["url", "output_url", "firebase_output_url", "downloadUrl", "download_url"];

const APPROVAL_STATUSES = Object.freeze({
  NEEDS_REVIEW: "needs_review",
  APPROVED: "approved",
  REJECTED: "rejected",
});

const DELIVERY_STATUSES = Object.freeze({
  HELD_FOR_REVIEW: "held_for_review",
  AVAILABLE: "available",
  BLOCKED: "blocked",
});

const isMulticamRenderJob = data => {
  const type = String(data?.type || data?.feature || "").toLowerCase();
  return type === "multicam_render" || type === "multicam-render";
};

const pickFirst = (...values) => values.find(value => typeof value === "string" && value.trim());

const extractResult = data => (data && typeof data.result === "object" && data.result ? data.result : {});

const extractWorkerOutputUrl = data => {
  const result = extractResult(data);
  return pickFirst(
    data?.heldOutputUrl,
    data?.outputUrl,
    data?.output_url,
    result.url,
    result.output_url,
    result.firebase_output_url,
    result.downloadUrl,
    result.download_url
  ) || null;
};

const extractApprovedOutputUrl = data => {
  const result = extractResult(data);
  return pickFirst(data?.approvedOutputUrl, result.approvedOutputUrl) || null;
};

const extractThumbnailUrl = data => {
  const result = extractResult(data);
  return pickFirst(data?.thumbnailUrl, data?.thumbnail_url, result.thumbnailUrl, result.thumbnail_url) || null;
};

const sanitizeQaWarnings = warnings => {
  if (!Array.isArray(warnings)) return [];
  return warnings.map(warning => String(warning || "").trim()).filter(Boolean).slice(0, 20);
};

const normalizeQaReport = data => {
  const report = data?.qaReport && typeof data.qaReport === "object" ? data.qaReport : {};
  return {
    status: report.status || data?.qaStatus || null,
    source: report.source || data?.qaSource || null,
    reportPath: report.reportPath || data?.qaReportPath || null,
    checkedAt: report.checkedAt || data?.qaCheckedAt || null,
  };
};

const normalizeApprovalRecord = data => {
  const approval = data?.approval && typeof data.approval === "object" ? data.approval : {};
  return {
    approvedBy: approval.approvedBy || data?.approvedBy || null,
    approvedAt: approval.approvedAt || data?.approvedAt || null,
    rejectedBy: approval.rejectedBy || data?.rejectedBy || null,
    rejectedAt: approval.rejectedAt || data?.rejectedAt || null,
    notes: approval.notes || data?.approvalNotes || null,
  };
};

const deriveApprovalStatus = data => {
  if (isMulticamRenderJob(data)) {
    const status = String(data?.status || "").toLowerCase();
    const hasWorkerOutput = Boolean(extractWorkerOutputUrl(data));
    if (
      hasWorkerOutput &&
      ["completed", "needs_review", "approved", "rejected"].includes(status)
    ) {
      // A paid Cam Combiner render is the delivered master. Users should not
      // be pushed through an approve/reject loop that encourages rerenders.
      return APPROVAL_STATUSES.APPROVED;
    }
  }

  const explicit = String(data?.approvalStatus || "").toLowerCase();
  if (Object.values(APPROVAL_STATUSES).includes(explicit)) return explicit;

  const approvedOutputUrl = extractApprovedOutputUrl(data);
  if (approvedOutputUrl) return APPROVAL_STATUSES.APPROVED;

  if (!isMulticamRenderJob(data)) return null;

  const status = String(data?.status || "").toLowerCase();
  const hasWorkerOutput = Boolean(extractWorkerOutputUrl(data));
  if (status === "rejected") return APPROVAL_STATUSES.REJECTED;
  if (status === "completed" && hasWorkerOutput) return APPROVAL_STATUSES.NEEDS_REVIEW;
  return null;
};

const normalizeRenderApproval = (jobId, data = {}) => {
  const result = extractResult(data);
  const approvalStatus = deriveApprovalStatus(data);
  const approvedOutputUrl = extractApprovedOutputUrl(data);
  const heldOutputUrl = extractWorkerOutputUrl(data);
  const reviewRequired = false;
  const isApproved = approvalStatus === APPROVAL_STATUSES.APPROVED;
  const outputUrl = isApproved ? approvedOutputUrl || heldOutputUrl : null;
  const previewUrl = approvalStatus ? heldOutputUrl || approvedOutputUrl : null;
  const deliveryStatus =
    approvalStatus === APPROVAL_STATUSES.APPROVED
      ? DELIVERY_STATUSES.AVAILABLE
      : approvalStatus === APPROVAL_STATUSES.REJECTED
        ? DELIVERY_STATUSES.BLOCKED
        : approvalStatus === APPROVAL_STATUSES.NEEDS_REVIEW
          ? DELIVERY_STATUSES.HELD_FOR_REVIEW
          : data.deliveryStatus || null;

  return {
    jobId,
    approvalStatus,
    deliveryStatus,
    reviewRequired,
    canDownload: Boolean(outputUrl),
    outputUrl,
    output_url: outputUrl,
    previewUrl,
    heldOutputUrl: heldOutputUrl || null,
    approvedOutputUrl: approvedOutputUrl || null,
    thumbnailUrl: extractThumbnailUrl(data),
    qaWarnings: sanitizeQaWarnings(data.qaWarnings || result.qaWarnings || result.qa_warnings),
    qaReport: normalizeQaReport(data),
    approval: normalizeApprovalRecord(data),
  };
};

const sanitizeResultForApproval = (result = {}, approvalView = {}) => {
  if (!result || typeof result !== "object") return result;
  const sanitized = { ...result };

  if (approvalView.canDownload) {
    sanitized.url = approvalView.outputUrl;
    sanitized.output_url = approvalView.outputUrl;
    return sanitized;
  }

  OUTPUT_URL_KEYS.forEach(key => {
    delete sanitized[key];
  });
  return sanitized;
};

const buildApprovalUpdate = ({ data = {}, approvedBy, notes = null, timestamp }) => {
  const approvalView = normalizeRenderApproval(data.jobId || null, data);
  const approvedOutputUrl = approvalView.heldOutputUrl || approvalView.approvedOutputUrl;
  if (!approvedOutputUrl) {
    throw new Error("Cannot approve render without a held output URL");
  }

  return {
    approvalStatus: APPROVAL_STATUSES.APPROVED,
    deliveryStatus: DELIVERY_STATUSES.AVAILABLE,
    reviewRequired: true,
    approvedOutputUrl,
    heldOutputUrl: approvalView.heldOutputUrl || approvedOutputUrl,
    approval: {
      ...approvalView.approval,
      approvedBy: approvedBy || null,
      approvedAt: timestamp,
      rejectedBy: null,
      rejectedAt: null,
      notes: notes || null,
    },
    updatedAt: timestamp,
  };
};

const buildRejectionUpdate = ({ data = {}, rejectedBy, notes = null, timestamp }) => {
  const approvalView = normalizeRenderApproval(data.jobId || null, data);
  return {
    approvalStatus: APPROVAL_STATUSES.REJECTED,
    deliveryStatus: DELIVERY_STATUSES.BLOCKED,
    reviewRequired: true,
    heldOutputUrl: approvalView.heldOutputUrl || null,
    approvedOutputUrl: null,
    approval: {
      ...approvalView.approval,
      approvedBy: null,
      approvedAt: null,
      rejectedBy: rejectedBy || null,
      rejectedAt: timestamp,
      notes: notes || null,
    },
    updatedAt: timestamp,
  };
};

module.exports = {
  APPROVAL_STATUSES,
  DELIVERY_STATUSES,
  buildApprovalUpdate,
  buildRejectionUpdate,
  deriveApprovalStatus,
  extractWorkerOutputUrl,
  isMulticamRenderJob,
  normalizeRenderApproval,
  sanitizeResultForApproval,
};
