const { GoogleAuth } = require("google-auth-library");

const auth = new GoogleAuth();
const clientCache = new Map();

function isLocalUrl(value) {
  try {
    const hostname = new URL(value).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";
  } catch (_error) {
    return true;
  }
}

function shouldAuthenticateWorkerUrl(value) {
  if (process.env.WORKER_AUTH_MODE === "none") return false;
  if (isLocalUrl(value)) return false;
  if (process.env.WORKER_AUTH_MODE === "oidc") return true;
  return Boolean(process.env.K_SERVICE || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT);
}

function getAudience(value) {
  const url = new URL(value);
  return `${url.protocol}//${url.host}`;
}

async function getCloudRunIdTokenHeaders(targetUrl) {
  if (!shouldAuthenticateWorkerUrl(targetUrl)) return {};
  const audience = getAudience(targetUrl);
  let client = clientCache.get(audience);
  if (!client) {
    client = await auth.getIdTokenClient(audience);
    clientCache.set(audience, client);
  }
  return client.getRequestHeaders(targetUrl);
}

async function buildWorkerRequestConfig(targetUrl, config = {}) {
  const identityHeaders = await getCloudRunIdTokenHeaders(targetUrl);
  return {
    ...config,
    headers: {
      ...identityHeaders,
      ...(config.headers || {}),
    },
  };
}

module.exports = {
  buildWorkerRequestConfig,
  getCloudRunIdTokenHeaders,
  shouldAuthenticateWorkerUrl,
};
