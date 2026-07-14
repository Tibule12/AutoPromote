const { GoogleAuth } = require("google-auth-library");

const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

let authClientPromise = null;
const DEFAULT_PRODUCTION_JOB_NAME = "cam-combiner-render-job";
const DEFAULT_PRODUCTION_FAST_JOB_NAME = "cam-combiner-render-fast-job";

function isProductionRuntime() {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.RENDER === "true" ||
    Boolean(process.env.K_SERVICE)
  );
}

function multicamRequestNeedsCaptions(multicamRequest = null) {
  if (!multicamRequest || typeof multicamRequest !== "object") return null;
  return multicamRequest.burnCaptions === true || multicamRequest.burn_captions === true;
}

function getMulticamRenderJobName(multicamRequest = null) {
  const needsCaptions = multicamRequestNeedsCaptions(multicamRequest);
  if (needsCaptions === false) {
    const configuredFast = String(process.env.MULTICAM_FAST_RENDER_JOB_NAME || "").trim();
    return configuredFast || (isProductionRuntime() ? DEFAULT_PRODUCTION_FAST_JOB_NAME : "");
  }
  const configured = String(process.env.MULTICAM_RENDER_JOB_NAME || "").trim();
  return configured || (isProductionRuntime() ? DEFAULT_PRODUCTION_JOB_NAME : "");
}

function isDurableMulticamRenderEnabled() {
  return Boolean(getMulticamRenderJobName());
}

async function resolveProjectId() {
  const configured =
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.GCP_PROJECT;
  return configured || auth.getProjectId();
}

async function resolveJobResourceName(multicamRequest = null) {
  const configuredName = getMulticamRenderJobName(multicamRequest);
  if (!configuredName) {
    throw new Error("MULTICAM_RENDER_JOB_NAME is not configured");
  }
  if (configuredName.startsWith("projects/")) return configuredName;

  const projectId = await resolveProjectId();
  const region =
    process.env.MULTICAM_RENDER_JOB_REGION ||
    process.env.GOOGLE_CLOUD_REGION ||
    "us-central1";
  return `projects/${projectId}/locations/${region}/jobs/${configuredName}`;
}

function buildRunJobOverrides(jobId, dispatchToken) {
  const env = [
    { name: "MULTICAM_JOB_ID", value: String(jobId) },
    { name: "MULTICAM_DISPATCH_TOKEN", value: String(dispatchToken) },
  ];
  return {
    overrides: {
      containerOverrides: [{ env }],
      taskCount: 1,
    },
  };
}

async function executeMulticamRenderJob({ jobId, dispatchToken, multicamRequest = null }) {
  if (!jobId || !dispatchToken) {
    throw new Error("A job ID and dispatch token are required for durable rendering");
  }

  const resourceName = await resolveJobResourceName(multicamRequest);
  if (!authClientPromise) authClientPromise = auth.getClient();
  const client = await authClientPromise;
  const response = await client.request({
    url: `https://run.googleapis.com/v2/${resourceName}:run`,
    method: "POST",
    data: buildRunJobOverrides(jobId, dispatchToken),
    timeout: 60000,
  });

  return {
    executionName: response.data?.name || null,
    operationName: response.data?.name || null,
    resourceName,
    dispatchMode: "cloud_run_job",
  };
}

module.exports = {
  buildRunJobOverrides,
  executeMulticamRenderJob,
  getMulticamRenderJobName,
  isDurableMulticamRenderEnabled,
  multicamRequestNeedsCaptions,
  resolveJobResourceName,
};
