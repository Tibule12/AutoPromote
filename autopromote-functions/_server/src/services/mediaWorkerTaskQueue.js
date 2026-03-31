const axios = require("axios");
const admin = require("firebase-admin");
const { CloudTasksClient } = require("@google-cloud/tasks");

const MEDIA_WORKER_URL =
  process.env.MEDIA_WORKER_URL || "https://media-worker-v1-jddzncgt2a-uc.a.run.app";
const MEDIA_WORKER_TASK_URL =
  process.env.MEDIA_WORKER_TASK_URL || `${MEDIA_WORKER_URL}/extract-audio-task`;
const MEDIA_WORKER_TASK_QUEUE =
  process.env.MEDIA_WORKER_TASK_QUEUE || "media-worker-audio-extraction";
const MEDIA_WORKER_TASK_LOCATION =
  process.env.MEDIA_WORKER_TASK_LOCATION || process.env.GOOGLE_CLOUD_REGION || "us-central1";
const MEDIA_WORKER_TASK_SECRET = process.env.MEDIA_WORKER_TASK_SECRET || "";

let cloudTasksClient = null;

function getCloudTasksClient() {
  if (!cloudTasksClient) {
    cloudTasksClient = new CloudTasksClient();
  }
  return cloudTasksClient;
}

function resolveProjectId() {
  if (process.env.GOOGLE_CLOUD_PROJECT) return process.env.GOOGLE_CLOUD_PROJECT;
  if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
  if (process.env.GCP_PROJECT) return process.env.GCP_PROJECT;

  try {
    return admin.app().options.projectId || "";
  } catch (_) {
    return "";
  }
}

function buildTaskHeaders() {
  return {
    "Content-Type": "application/json",
    ...(MEDIA_WORKER_TASK_SECRET
      ? { "X-Worker-Task-Secret": MEDIA_WORKER_TASK_SECRET }
      : {}),
  };
}

async function queueAudioExtractionTask({ jobId, videoUrl, outputFormat = "mp3" }) {
  const payload = {
    video_url: videoUrl,
    output_format: outputFormat,
    job_id: jobId,
    async_mode: false,
  };

  if (!MEDIA_WORKER_TASK_QUEUE) {
    const response = await axios.post(
      `${MEDIA_WORKER_URL}/extract-audio`,
      { ...payload, async_mode: true },
      {
        timeout: 60000,
        headers: buildTaskHeaders(),
      }
    );

    return {
      dispatchMode: "worker-background-fallback",
      workerJobId: response.data?.job_id || jobId,
      taskTargetUrl: `${MEDIA_WORKER_URL}/extract-audio`,
    };
  }

  const projectId = resolveProjectId();
  if (!projectId) {
    throw new Error("Cloud Tasks project ID is not configured");
  }

  const client = getCloudTasksClient();
  const parent = client.queuePath(projectId, MEDIA_WORKER_TASK_LOCATION, MEDIA_WORKER_TASK_QUEUE);
  const [task] = await client.createTask({
    parent,
    task: {
      httpRequest: {
        httpMethod: "POST",
        url: MEDIA_WORKER_TASK_URL,
        headers: buildTaskHeaders(),
        body: Buffer.from(JSON.stringify(payload)).toString("base64"),
      },
    },
  });

  return {
    dispatchMode: "cloud_tasks",
    taskName: task.name,
    workerJobId: jobId,
    taskTargetUrl: MEDIA_WORKER_TASK_URL,
  };
}

module.exports = {
  queueAudioExtractionTask,
};