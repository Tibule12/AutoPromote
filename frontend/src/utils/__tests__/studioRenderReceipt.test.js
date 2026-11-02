import { webcrypto } from "crypto";
import { readStudioRenderReceipt, studioDocumentHash, validateRecoveredStudioRender } from "../studioRenderReceipt";

const document = { projectId: "viral-project-recovery", nested: { b: 2, a: 1 } };
const sha = "a".repeat(64);
const jobId = `viral_${"b".repeat(64)}`;
const file = data => ({ size: 1000, text: async () => JSON.stringify(data) });
beforeAll(() => Object.defineProperty(global, "crypto", { value: webcrypto, configurable: true }));

test("receipt is bound to the exact current canonical edit and ignores file-supplied URLs", async () => {
  const projectHash = await studioDocumentHash(document);
  const receipt = await readStudioRenderReceipt(file({ projectId: document.projectId, projectHash,
    outputSha256: sha, submittedJobId: jobId, outputUrl: "https://untrusted.example/ignored.mp4" }), document);
  expect(receipt).toEqual({ projectId: document.projectId, projectHash, outputSha256: sha, submittedJobId: jobId });
  await expect(readStudioRenderReceipt(file(receipt), { ...document, nested: { a: 3, b: 2 } })).rejects.toThrow("has changed");
  await expect(readStudioRenderReceipt(file(receipt), { ...document, projectId: "other-project" })).rejects.toThrow("different");
});

test("rejects oversized and malformed receipts before backend access", async () => {
  await expect(readStudioRenderReceipt({ size: 1024 * 1024 }, document)).rejects.toThrow("512 KB");
  await expect(readStudioRenderReceipt(file({ projectId: document.projectId }), document)).rejects.toThrow("unsupported");
});

test("requires the exact completed backend job, output bytes and clean Studio mode", () => {
  const receipt = { submittedJobId: jobId, outputSha256: sha };
  const job = { jobId, status: "completed", renderRequestId: "real-request-123",
    brandWatermark: false, result: { outputSha256: sha, url: "https://owned.example/final.mp4" } };
  expect(validateRecoveredStudioRender(receipt, job)).toBe(job.result.url);
  for (const bad of [ { ...job, status: "processing" }, { ...job, jobId: `viral_${"c".repeat(64)}` },
    { ...job, brandWatermark: true }, { ...job, renderRequestId: undefined },
    { ...job, result: { ...job.result, outputSha256: "d".repeat(64) } } ]) {
    expect(() => validateRecoveredStudioRender(receipt, bad)).toThrow("does not match");
  }
});
