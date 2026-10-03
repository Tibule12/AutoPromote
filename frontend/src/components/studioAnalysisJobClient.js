const parseJson = async response => {
  try {
    return await response.json();
  } catch (_) {
    return {};
  }
};

const request = async (fetchImpl, url, token, options = {}) => {
  let response;
  try {
    response = await fetchImpl(url, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
    });
  } catch (error) {
    const networkError =
      error instanceof Error ? error : new Error("Studio analysis network error.");
    networkError.retryable = true;
    throw networkError;
  }
  const body = await parseJson(response);
  if (!response.ok) {
    const error = new Error(body.error || body.code || "Studio analysis request failed.");
    error.retryable = response.status >= 500;
    throw error;
  }
  return body;
};

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

export const runStudioSourceShotJob = async ({
  apiBaseUrl,
  token,
  formData,
  isCurrent = () => true,
  onStatus = () => {},
  fetchImpl = fetch,
  waitImpl = wait,
  pollIntervalMs = 2500,
  maxWaitMs = 15 * 60 * 1000,
}) => {
  if (!isCurrent()) throw new Error("Studio analysis view closed.");
  const root = `${apiBaseUrl}/api/media/studio-analysis-jobs`;
  const requestWithRetry = async (url, options) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (!isCurrent()) throw new Error("Studio analysis view closed.");
      try {
        return await request(fetchImpl, url, token, options);
      } catch (error) {
        if (!error.retryable || attempt === 2) throw error;
        await waitImpl(750 * 2 ** attempt);
      }
    }
  };
  let job = await requestWithRetry(root, { method: "POST", body: formData });
  const jobId = job.jobId;
  if (!/^[a-f0-9]{64}$/.test(jobId || ""))
    throw new Error("Studio analysis returned an invalid job ID.");
  const deadline = Date.now() + maxWaitMs;
  while (true) {
    if (!isCurrent()) throw new Error("Studio analysis view closed.");
    if (job.status === "completed") {
      if (!job.sourceShotArtifact?.artifactHash || !job.analysisArtifact?.artifactHash)
        throw new Error("Studio analysis completed without evidence receipts.");
      const result = await requestWithRetry(`${root}/${jobId}/result`);
      if (!result || result.mode !== "source_shots" || !result.tracks?.solo)
        throw new Error("Studio analysis returned an incomplete source-shot result.");
      return {
        ...result,
        sourceShotArtifact: job.sourceShotArtifact,
        analysisArtifact: job.analysisArtifact,
      };
    }
    if (job.status === "failed" || job.status === "cancelled")
      throw new Error(job.failureCode || `Studio analysis ${job.status}.`);
    if (!["staging", "queued", "running"].includes(job.status))
      throw new Error("Studio analysis returned an unknown status.");
    if (Date.now() >= deadline)
      throw new Error("Studio analysis is still running. Try again later.");
    onStatus(job.status);
    await waitImpl(pollIntervalMs);
    if (!isCurrent()) throw new Error("Studio analysis view closed.");
    job = await requestWithRetry(`${root}/${jobId}`);
    if (job.jobId !== jobId) throw new Error("Studio analysis job changed unexpectedly.");
  }
};
