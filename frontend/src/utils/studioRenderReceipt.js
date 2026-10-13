const SHA256 = /^[a-f0-9]{64}$/;
const stableJson = value => JSON.stringify(value, (_key, item) =>
  item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);

export const studioDocumentHash = async document => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(stableJson(document)));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
};

// A receipt supplies identity only. Playable access, ownership and completed
// output bytes must be resolved again by the existing authenticated backend.
export const readStudioRenderReceipt = async (file, document) => {
  if (!file || file.size > 512 * 1024) throw new Error("Choose a Studio export receipt smaller than 512 KB.");
  const receipt = JSON.parse(await file.text());
  if (!document?.projectId || receipt.projectId !== document.projectId ||
      !SHA256.test(receipt.projectHash || "") || !SHA256.test(receipt.outputSha256 || "") ||
      !/^viral_[a-f0-9]{64}$/.test(receipt.submittedJobId || "")) {
    throw new Error("This export receipt belongs to a different or unsupported Studio project.");
  }
  if (await studioDocumentHash(document) !== receipt.projectHash) {
    throw new Error("This project has changed since that export. Restore its matching project backup first.");
  }
  return { projectId: receipt.projectId, projectHash: receipt.projectHash,
    outputSha256: receipt.outputSha256, submittedJobId: receipt.submittedJobId };
};

export const validateRecoveredStudioRender = (receipt, job) => {
  const outputSha256 = job?.result?.outputSha256 || job?.outputSha256;
  if (job?.status !== "completed" || job.jobId !== receipt.submittedJobId ||
      outputSha256 !== receipt.outputSha256 ||
      !/^[A-Za-z0-9_-]{8,128}$/.test(job.renderRequestId || "") ||
      job.brandWatermark !== false) {
    throw new Error("The saved receipt does not match a completed clean Studio export.");
  }
  return job.outputUrl || job.output_url || job.result?.url || job.result?.output_url;
};
