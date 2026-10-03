import { runStudioSourceShotJob } from "../studioAnalysisJobClient";

const jobId = "a".repeat(64);
const receipt = {
  jobId,
  status: "completed",
  sourceShotArtifact: { artifactHash: "b".repeat(64) },
  analysisArtifact: { artifactHash: "c".repeat(64) },
};
const response = body => ({ ok: true, json: async () => body });
const base = {
  apiBaseUrl: "https://api.example.test",
  token: "owner-token",
  formData: new FormData(),
  waitImpl: async () => {},
};

test("queued analysis polls to completion and joins owner-scoped receipts to raw result", async () => {
  const fetchImpl = jest
    .fn()
    .mockResolvedValueOnce(response({ jobId, status: "queued" }))
    .mockResolvedValueOnce(response({ jobId, status: "running" }))
    .mockResolvedValueOnce(response(receipt))
    .mockResolvedValueOnce(response({ mode: "source_shots", tracks: { solo: {} } }));
  const onStatus = jest.fn();
  const result = await runStudioSourceShotJob({ ...base, fetchImpl, onStatus });
  expect(result.sourceShotArtifact).toEqual(receipt.sourceShotArtifact);
  expect(result.analysisArtifact).toEqual(receipt.analysisArtifact);
  expect(onStatus.mock.calls.map(call => call[0])).toEqual(["queued", "running"]);
  expect(fetchImpl.mock.calls.map(call => call[0])).toEqual([
    "https://api.example.test/api/media/studio-analysis-jobs",
    `https://api.example.test/api/media/studio-analysis-jobs/${jobId}`,
    `https://api.example.test/api/media/studio-analysis-jobs/${jobId}`,
    `https://api.example.test/api/media/studio-analysis-jobs/${jobId}/result`,
  ]);
  expect(
    fetchImpl.mock.calls.every(
      ([, options]) => options.headers.Authorization === "Bearer owner-token"
    )
  ).toBe(true);
});

test("terminal failure stops polling before reading a result", async () => {
  const fetchImpl = jest
    .fn()
    .mockResolvedValueOnce(response({ jobId, status: "queued" }))
    .mockResolvedValueOnce(
      response({ jobId, status: "failed", failureCode: "STUDIO_ANALYSIS_WORKER_FAILED" })
    );
  await expect(runStudioSourceShotJob({ ...base, fetchImpl })).rejects.toThrow(
    "STUDIO_ANALYSIS_WORKER_FAILED"
  );
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

test("leaving the editor stops further polling and never applies a stale result", async () => {
  let current = true;
  const fetchImpl = jest.fn().mockResolvedValue(response({ jobId, status: "queued" }));
  await expect(
    runStudioSourceShotJob({
      ...base,
      fetchImpl,
      isCurrent: () => current,
      waitImpl: async () => {
        current = false;
      },
    })
  ).rejects.toThrow("view closed");
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test("completed job requires both immutable receipts", async () => {
  const fetchImpl = jest.fn().mockResolvedValue(response({ jobId, status: "completed" }));
  await expect(runStudioSourceShotJob({ ...base, fetchImpl })).rejects.toThrow(
    "without evidence receipts"
  );
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test("a lost upload response retries the same request body and receives its existing job", async () => {
  const fetchImpl = jest
    .fn()
    .mockRejectedValueOnce(new Error("connection lost"))
    .mockResolvedValueOnce(response(receipt))
    .mockResolvedValueOnce(response({ mode: "source_shots", tracks: { solo: {} } }));
  await expect(runStudioSourceShotJob({ ...base, fetchImpl })).resolves.toMatchObject({
    sourceShotArtifact: receipt.sourceShotArtifact,
  });
  expect(fetchImpl.mock.calls[0][1].body).toBe(base.formData);
  expect(fetchImpl.mock.calls[1][1].body).toBe(base.formData);
});
