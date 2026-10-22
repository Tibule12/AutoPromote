const axios = require("axios");
const http = require("http");
const https = require("https");

// Status and completed-media reads are safe to repeat. Inference submissions
// must keep their existing persisted request identity and are not retried here.
const httpAgent = new http.Agent({ keepAlive: false });
const httpsAgent = new https.Agent({ keepAlive: false });
const transient = new Set(["ECONNRESET", "EPIPE", "ETIMEDOUT", "ECONNABORTED"]);

function workerJobClient(config, jobId) {
  if (typeof jobId !== "string" || !/^[A-Za-z0-9_-]{8,128}$/.test(jobId))
    throw Object.assign(new Error("Invalid render identity."), { statusCode: 400 });
  const origin = new URL(config.url);
  if (
    !["https:", "http:"].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== "/"
  )
    throw new Error("Invalid worker origin configuration.");
  // The origin and credentials come only from the server's worker configuration.
  // Browser/stored job identities can select a relative job path, never a host.
  const client = axios.create({
    baseURL: origin.origin,
    allowAbsoluteUrls: false,
    maxRedirects: 0,
    httpAgent,
    httpsAgent,
    headers: { ...config.headers, Connection: "close" },
  });
  return { client, path: `/jobs/${encodeURIComponent(jobId)}` };
}

async function readStudioWorker(config, jobId, options = {}) {
  const { client, path } = workerJobClient(config, jobId);
  const endpoint = options.media === true ? `${path}/media` : path;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await client.get(endpoint, {
        timeout: options.timeout,
        signal: options.signal,
        responseType: options.responseType,
        maxContentLength: options.maxContentLength,
      });
    } catch (error) {
      if (attempt || !transient.has(error.code) || options.signal?.aborted) throw error;
      await new Promise(resolve => setTimeout(resolve, 150));
    }
  }
}

async function cancelStudioWorkerJob(config, jobId) {
  const { client, path } = workerJobClient(config, jobId);
  return client.delete(path, { timeout: 15000 });
}

module.exports = { readStudioWorker, cancelStudioWorkerJob };
