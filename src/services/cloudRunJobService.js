const { GoogleAuth } = require("google-auth-library");
const {
  getApplicationContext,
  assertApplicationTransport,
} = require("./unifiedCredits/application");

const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

let authClientPromise = null;
const DEFAULT_GPU_JOB_NAME = "cam-combiner-render-gpu-job";
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
    process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
  return configured || auth.getProjectId();
}

function getMulticamGpuJobName() {
  if (process.env.MULTICAM_GPU_PRIMARY === "false" || getApplicationContext()?.workerVerifier)
    return "";
  return String(
    process.env.MULTICAM_GPU_RENDER_JOB_NAME || (isProductionRuntime() ? DEFAULT_GPU_JOB_NAME : "")
  ).trim();
}

async function resolveJobResourceName(multicamRequest = null, device = "cpu") {
  const configuredName =
    device === "gpu" ? getMulticamGpuJobName() : getMulticamRenderJobName(multicamRequest);
  if (!configuredName) {
    throw new Error("MULTICAM_RENDER_JOB_NAME is not configured");
  }
  if (configuredName.startsWith("projects/")) return configuredName;

  const projectId = await resolveProjectId();
  const region =
    process.env.MULTICAM_RENDER_JOB_REGION || process.env.GOOGLE_CLOUD_REGION || "us-central1";
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

async function cloudRunRequest(config) {
  assertApplicationTransport("https://run.googleapis.com");
  if (!authClientPromise) authClientPromise = auth.getClient();
  const client = await authClientPromise;
  return client.request({ timeout: 30000, ...config });
}

function safeGpuDispatchFallback(error) {
  // These are definitive rejection responses. A lost/ambiguous response is
  // recovered through the existing job identity, never submitted a second time.
  const status = Number(error.response?.status || error.code);
  return (
    [403, 404, 429].includes(status) ||
    (status === 503 &&
      /resource.exhausted|no available|capacity|quota/i.test(
        String(error.response?.data?.error?.message || error.response?.data?.message || "")
      ))
  );
}

async function executeMulticamRenderJob({
  jobId,
  dispatchToken,
  multicamRequest = null,
  preferredDevice,
}) {
  if (!jobId || !dispatchToken)
    throw new Error("A job ID and dispatch token are required for durable rendering");
  const device = preferredDevice === "cpu" || !getMulticamGpuJobName() ? "cpu" : "gpu";
  const run = async targetDevice => {
    const resourceName = await resolveJobResourceName(multicamRequest, targetDevice);
    const data = buildRunJobOverrides(jobId, dispatchToken);
    data.overrides.containerOverrides[0].env.push(
      { name: "MULTICAM_EXECUTION_DEVICE", value: targetDevice },
      {
        name: "MULTICAM_FAST_NO_CAPTIONS",
        value: multicamRequestNeedsCaptions(multicamRequest) === false ? "1" : "0",
      }
    );
    let response;
    try {
      response = await cloudRunRequest({
        url: `https://run.googleapis.com/v2/${resourceName}:run`,
        method: "POST",
        data,
        timeout: 60000,
      });
    } catch (error) {
      error.multicamDispatchDevice = targetDevice;
      throw error;
    }
    return {
      executionName: response.data?.metadata?.name || response.data?.response?.name || null,
      operationName: response.data?.name || null,
      resourceName,
      device: targetDevice,
      routeReason:
        targetDevice === "gpu"
          ? "gpu_primary"
          : device === "gpu"
            ? "gpu_unavailable"
            : "cpu_fallback",
      dispatchMode: "cloud_run_job",
    };
  };
  try {
    return await run(device);
  } catch (error) {
    if (device !== "gpu" || !safeGpuDispatchFallback(error)) throw error;
    return run("cpu");
  }
}

async function inspectMulticamExecution(dispatch) {
  const resource = dispatch.operationName || dispatch.executionName;
  if (!resource || !/^projects\/[^/]+\/locations\/[^/]+\/(operations|jobs)\//.test(resource))
    throw Error("Invalid Cloud Run operation identity");
  const response = await cloudRunRequest({
    url: `https://run.googleapis.com/v2/${resource}`,
    method: "GET",
  });
  const data = response.data || {},
    execution = data.response || data.metadata || data;
  return {
    executionName: execution.name?.includes("/executions/")
      ? execution.name
      : dispatch.executionName,
    terminalFailure:
      Boolean(data.error) ||
      (execution.conditions || []).some(
        condition => condition.type === "Completed" && condition.state === "CONDITION_FAILED"
      ),
    error: data.error?.message || "GPU execution could not start",
  };
}

async function cancelMulticamExecution(executionName) {
  if (
    !executionName ||
    !/^projects\/[^/]+\/locations\/[^/]+\/jobs\/[^/]+\/executions\/[^/]+$/.test(executionName)
  )
    return;
  await cloudRunRequest({
    url: `https://run.googleapis.com/v2/${executionName}:cancel`,
    method: "POST",
    data: {},
    timeout: 5000,
  });
}

module.exports = {
  buildRunJobOverrides,
  getMulticamGpuJobName,
  inspectMulticamExecution,
  cancelMulticamExecution,
  safeGpuDispatchFallback,
  executeMulticamRenderJob,
  getMulticamRenderJobName,
  isDurableMulticamRenderEnabled,
  multicamRequestNeedsCaptions,
  resolveJobResourceName,
};
