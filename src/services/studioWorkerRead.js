const axios = require("axios");
const http = require("http");
const https = require("https");

const httpAgent = new http.Agent({ keepAlive: false });
const httpsAgent = new https.Agent({ keepAlive: false });
const transient = new Set(["ECONNRESET", "EPIPE", "ETIMEDOUT", "ECONNABORTED"]);
const unavailable = message => Object.assign(new Error(message), { statusCode: 503 });

function workerConfig(kind) {
  if (kind !== undefined && kind !== "model_artifact_cpu")
    throw unavailable("Invalid subject worker kind.");
  const cpu = kind === "model_artifact_cpu";
  const raw = process.env[cpu ? "STUDIO_MODEL_VFX_URL" : "STUDIO_NVIDIA_VFX_URL"];
  const secret = process.env[cpu ? "STUDIO_MODEL_VFX_SECRET" : "STUDIO_NVIDIA_VFX_SECRET"];
  if (!raw || !secret || secret.length < 32)
    throw unavailable("Subject rendering is offline. Your edit is saved.");
  let url;
  try { url = new URL(raw); } catch (_) { throw unavailable("Invalid subject worker configuration."); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash)
    throw unavailable("Invalid subject worker configuration.");
  return { url: url.href.replace(/\/+$/, ""), headers: { Authorization: `Bearer ${secret}` } };
}

function workerPath(jobId, media) {
  if (typeof jobId !== "string" || !/^[A-Za-z0-9_-]{8,128}$/.test(jobId))
    throw Object.assign(new Error("Invalid render identity."), { statusCode: 400 });
  return `jobs/${encodeURIComponent(jobId)}${media ? "/media" : ""}`;
}

function requestOptions(config, options) {
  return {
    timeout: options.timeout || 15000,
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.responseType === "arraybuffer" ? { responseType: "arraybuffer" } : {}),
    ...(options.maxContentLength ? { maxContentLength: options.maxContentLength } : {}),
    // Origin, authentication and redirect policy come only from this server.
    baseURL: `${config.url}/`,
    allowAbsoluteUrls: false,
    maxRedirects: 0,
    proxy: false,
    httpAgent,
    httpsAgent,
    headers: { ...config.headers, Connection: "close" },
  };
}

// Only repeatable authenticated reads retry. Submissions/cancellations never do.
async function readStudioWorker(jobId, options = {}) {
  const path = workerPath(jobId, options.resource === "media");
  const config = workerConfig(options.executionKind);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try { return await axios.get(path, requestOptions(config, options)); }
    catch (error) {
      if (attempt || !transient.has(error.code) || options.signal?.aborted) throw error;
      await new Promise(resolve => setTimeout(resolve, 150));
    }
  }
}

async function cancelStudioWorker(jobId, options = {}) {
  const path = workerPath(jobId, false);
  return axios.delete(path, requestOptions(workerConfig(options.executionKind), options));
}

module.exports = { readStudioWorker, cancelStudioWorker, workerConfig };
