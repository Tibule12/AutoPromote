// videoEditingService.js
// Service for Single Video Editing (Smart Crop, Silence Removal)
// Bridges Node.js backend with Python Media Worker

const axios = require("axios");
const admin = require("firebase-admin");
const crypto = require("crypto");
const db = admin.firestore();
const fs = require("fs");
const { queueAudioExtractionTask } = require("./mediaWorkerTaskQueue");
const { deductCredits, refundCredits } = require("../creditSystem");
const { buildWorkerRequestConfig } = require("../utils/cloudRunAuth");
const {
  executeMulticamRenderJob,
  isDurableMulticamRenderEnabled,
} = require("./cloudRunJobService");
const {
  releaseMulticamRenderCapacity,
  reserveMulticamRenderCapacity,
} = require("./multicamCapacityService");

// Point to the Python service (default to Cloud Run in production, localhost in dev)
// Use the deployed URL for stability if env var is missing
const MEDIA_WORKER_URL =
  process.env.MEDIA_WORKER_URL || "https://media-worker-v1-341498038874.us-central1.run.app";
const DEFAULT_CAM_COMBINER_WORKER_URL =
  "https://cam-combiner-worker-341498038874.us-central1.run.app";
const LOCAL_MEDIA_WORKER_URL = process.env.LOCAL_MEDIA_WORKER_URL || "http://127.0.0.1:8000";
const CAM_COMBINER_WORKER_URL =
  process.env.CAM_COMBINER_WORKER_URL ||
  process.env.MULTICAM_WORKER_URL ||
  DEFAULT_CAM_COMBINER_WORKER_URL;
const LOCAL_CAM_COMBINER_WORKER_URL =
  process.env.LOCAL_CAM_COMBINER_WORKER_URL || LOCAL_MEDIA_WORKER_URL;
const IS_PRODUCTION_RUNTIME =
  process.env.NODE_ENV === "production" || !!process.env.RENDER || !!process.env.K_SERVICE;
const ALLOW_LOCAL_WORKER_FALLBACK =
  process.env.ALLOW_LOCAL_WORKER_FALLBACK === "true" ||
  (!IS_PRODUCTION_RUNTIME && process.env.ALLOW_LOCAL_WORKER_FALLBACK !== "false");
const MULTICAM_MASTER_RETENTION_DAYS = Math.max(
  1,
  parseInt(process.env.MULTICAM_MASTER_RETENTION_DAYS || "7", 10) || 7
);

function getWorkerErrorDetail(error) {
  const status = error.response?.status;
  const data = error.response?.data;
  if (!data) return error.message;
  const workerMessage =
    data.detail ||
    data.details ||
    data.message ||
    data.error ||
    (typeof data === "string" ? data : JSON.stringify(data));
  return status ? `Worker ${status}: ${workerMessage}` : workerMessage;
}

function shouldTryLocalWorker(error) {
  if (!ALLOW_LOCAL_WORKER_FALLBACK) return false;
  if (!LOCAL_MEDIA_WORKER_URL || LOCAL_MEDIA_WORKER_URL === MEDIA_WORKER_URL) return false;
  const status = error.response?.status;
  return (
    status === 404 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    error.code === "ECONNREFUSED" ||
    error.code === "ENOTFOUND" ||
    error.code === "ETIMEDOUT" ||
    error.code === "ECONNABORTED"
  );
}

function shouldTryLocalCamCombinerWorker(error) {
  if (!ALLOW_LOCAL_WORKER_FALLBACK) return false;
  if (!LOCAL_CAM_COMBINER_WORKER_URL || LOCAL_CAM_COMBINER_WORKER_URL === CAM_COMBINER_WORKER_URL) {
    return false;
  }
  const status = error.response?.status;
  return (
    status === 404 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    error.code === "ECONNREFUSED" ||
    error.code === "ENOTFOUND" ||
    error.code === "ETIMEDOUT" ||
    error.code === "ECONNABORTED"
  );
}

function getMulticamExpiryIso(fromMs = Date.now()) {
  return new Date(fromMs + MULTICAM_MASTER_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

const { v4: uuidv4 } = require("uuid");

class VideoEditingService {
  async startAudioExtractionJob(videoUrl, userId, options = {}) {
    const jobId = uuidv4();
    console.log(`[VideoEditing] Starting audio extraction job ${jobId} for User ${userId}`);

    try {
      await db
        .collection("video_edits")
        .doc(jobId)
        .set({
          jobId,
          type: "audio_extraction",
          userId,
          videoUrl,
          sourceLabel: options.sourceLabel || "",
          source: {
            kind: "audio_donor_video",
            url: videoUrl,
            label: options.sourceLabel || "",
          },
          status: "queued",
          stage: "queued_for_dispatch",
          progress: 0,
          result: null,
          expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
          createdAt: new Date().toISOString(),
        });

      const workerResult = await queueAudioExtractionTask({
        jobId,
        videoUrl,
        outputFormat: "mp3",
      });
      await db
        .collection("video_edits")
        .doc(jobId)
        .set(
          {
            status: "queued",
            stage: "queued_for_worker",
            progress: 5,
            dispatchMode: workerResult.dispatchMode,
            taskName: workerResult.taskName || null,
            taskTargetUrl: workerResult.taskTargetUrl,
            workerJobId: workerResult.workerJobId || jobId,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );

      return { jobId };
    } catch (error) {
      console.error(`[VideoEditing] Failed to start audio extraction job ${jobId}:`, error.message);

      await db.collection("video_edits").doc(jobId).set(
        {
          status: "failed",
          error: error.message,
          progress: 0,
          failedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      throw new Error("Failed to queue audio extraction job");
    }
  }

  /**
   * Start an async video processing job
   * Returns a jobId immediately for polling.
   */
  async startProcessingJob(videoUrl, options, userId) {
    const jobId = uuidv4();
    console.log(`[VideoEditing] Starting Async Job ${jobId} for User ${userId}`);

    try {
      await db.collection("video_edits").doc(jobId).set({
        jobId,
        userId,
        videoUrl,
        options,
        status: "queued",
        progress: 0,
        createdAt: new Date().toISOString(),
      });

      // Start background processing without awaiting
      this.processJobBackground(jobId, videoUrl, options, userId).catch(err => {
        console.error(`[VideoEditing] Background Job ${jobId} Failed (uncaught):`, err);
      });

      return { jobId };
    } catch (error) {
      console.error("Failed to start job:", error);
      throw new Error("Failed to queue video processing job");
    }
  }

  async startMulticamRenderJob(multicamRequest, userId, options = {}) {
    const jobId = options.jobId || uuidv4();
    const durableRender = isDurableMulticamRenderEnabled();
    let capacityReserved = options.capacityReserved === true;
    const dispatchToken = durableRender ? uuidv4() : null;
    const dispatchTokenHash = dispatchToken
      ? crypto.createHash("sha256").update(dispatchToken).digest("hex")
      : null;
    const persistedRequest = durableRender
      ? this.buildMulticamWorkerPayload(multicamRequest, jobId)
      : multicamRequest;
    if (durableRender) {
      persistedRequest.async_mode = true;
      persistedRequest.job_id = jobId;
      persistedRequest.plan_only = false;
      persistedRequest.planOnly = false;
    }
    console.log(`[VideoEditing] Starting multicam render job ${jobId} for User ${userId}`);

    try {
      if (durableRender && !capacityReserved) {
        await reserveMulticamRenderCapacity({ jobId, userId });
        capacityReserved = true;
      }

      await db.collection("video_edits").doc(jobId).set({
        jobId,
        userId,
        type: "multicam_render",
        multicamRequest: persistedRequest,
        creditReceipt: multicamRequest?.creditReceipt || null,
        pendingCreditCost: Number(multicamRequest?.pendingCreditCost || 0),
        requireServerProof: multicamRequest?.requireServerProof === true,
        retentionDays: MULTICAM_MASTER_RETENTION_DAYS,
        status: "queued",
        stage: durableRender ? "queued_for_cloud_run_job" : "queued",
        dispatchMode: durableRender ? "cloud_run_job" : "process_background",
        dispatchTokenHash,
        progress: 0,
        createdAt: new Date().toISOString(),
      });

      if (durableRender) {
        const dispatch = await executeMulticamRenderJob({ jobId, dispatchToken });
        await db.collection("video_edits").doc(jobId).set(
          {
            status: "queued",
            stage: "cloud_run_job_accepted",
            detail: "Durable render worker accepted the job",
            cloudRunExecution: dispatch.executionName,
            dispatchedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } else {
        this.processMulticamJobBackground(jobId, multicamRequest, userId).catch(err => {
          console.error(`[VideoEditing] Multicam Job ${jobId} Failed (uncaught):`, err);
        });
      }

      return { jobId, dispatchMode: durableRender ? "cloud_run_job" : "process_background" };
    } catch (error) {
      console.error("Failed to start multicam render job:", error);
      const creditReceipt = multicamRequest?.creditReceipt;
      let creditRefund = null;
      if (creditReceipt && !creditReceipt.skipped) {
        creditRefund = await refundCredits(userId, creditReceipt, "render-multicam-refund", {
          jobId,
          reason: `dispatch_failed:${error.message}`,
          idempotencyKey: `render-multicam-refund:${jobId}`,
        }).catch(refundError => ({ success: false, message: refundError.message }));
      }
      await db.collection("video_edits").doc(jobId).set(
        {
          status: "dispatch_failed",
          stage: "dispatch_failed",
          error: error.message,
          refundRequired: Boolean(creditReceipt && !creditReceipt.skipped && !creditRefund?.success),
          creditRefund,
          failedAt: new Date().toISOString(),
        },
        { merge: true }
      ).catch(() => null);
      if (capacityReserved) {
        await releaseMulticamRenderCapacity(jobId, "dispatch_failed").catch(releaseError => {
          console.error(
            `[VideoEditing] Could not release multicam capacity for ${jobId}:`,
            releaseError.message
          );
        });
      }
      throw new Error("Failed to queue multi-camera render job");
    }
  }

  /**
   * Background processor that wraps processVideo
   */
  async processJobBackground(jobId, videoUrl, options, userId) {
    const docRef = db.collection("video_edits").doc(jobId);

    try {
      await docRef.update({
        status: "processing",
        progress: 10,
        updatedAt: new Date().toISOString(),
      });

      // Call the existing synchronous logic
      // Note: processVideo handles the Python communication, storage upload, etc.
      // We pass jobId to enable async handoff
      const result = await this.processVideo(videoUrl, options, userId, jobId);

      // If async mode was triggered, the python worker took over responsibilities.
      // We don't mark as completed here. Python will do it.
      if (result.status === "processing" && result.mode === "async") {
        console.log(`[VideoEditing] Job ${jobId} handed off to Async Worker.`);
        // Optionally update status to indicate remote processing
        await docRef.update({
          status: "processing_remote",
          updatedAt: new Date().toISOString(),
        });
        return;
      }

      await docRef.update({
        status: "completed",
        progress: 100,
        result: result, // { success: true, url: ..., remainingCredits: ... }
        outputUrl: result.url,
        completedAt: new Date().toISOString(),
      });

      console.log(`[VideoEditing] Job ${jobId} Completed Successfully.`);
    } catch (error) {
      console.error(`[VideoEditing] Job ${jobId} Failed:`, error.message);
      await docRef.update({
        status: "failed",
        error: error.message,
        progress: 0,
        failedAt: new Date().toISOString(),
      });
    }
  }

  async processMulticamJobBackground(jobId, multicamRequest, userId) {
    const docRef = db.collection("video_edits").doc(jobId);

    try {
      await docRef.update({
        status: "processing",
        progress: 10,
        updatedAt: new Date().toISOString(),
      });

      if (multicamRequest?.requireServerProof) {
        await docRef.update({
          status: "proofing",
          stage: "server_proof",
          progress: 12,
          detail: "Running server proof before paid render",
          updatedAt: new Date().toISOString(),
        });
        const proofResult = await this.proveMulticamRender(multicamRequest, userId, jobId);
        Object.assign(multicamRequest, {
          qaProofStatus: proofResult.qaProofStatus,
          qa_proof_status: proofResult.qaProofStatus,
          qaProofReceiptId: proofResult.qaProofReceiptId,
          qa_proof_receipt_id: proofResult.qaProofReceiptId,
          qaProofReceipt: proofResult.qaProofReceipt,
          qa_proof_receipt: proofResult.qaProofReceipt,
        });
        await docRef.update({
          status: "proof_passed",
          stage: "server_proof_passed",
          progress: 22,
          detail: "Server proof passed; charging render credits",
          serverProof: proofResult,
          updatedAt: new Date().toISOString(),
        });

        const pendingCreditCost = Number(multicamRequest.pendingCreditCost || 0);
        if (pendingCreditCost > 0 && !multicamRequest.creditReceipt) {
          const creditReceipt = await deductCredits(userId, pendingCreditCost, "render-multicam");
          if (!creditReceipt.success) {
            throw new Error(
              `Multicam rendering costs ${pendingCreditCost} credits. You have ${creditReceipt.remaining || 0} credits available.`
            );
          }
          multicamRequest.creditReceipt = creditReceipt;
          await docRef.update({
            creditReceipt,
            creditsCharged: pendingCreditCost,
            chargedAfterServerProof: true,
            status: "processing",
            stage: "rendering",
            progress: 28,
            detail: "Render credits charged after proof; starting full render",
            updatedAt: new Date().toISOString(),
          });
        }
      }

      const result = await this.renderMulticam(multicamRequest, userId, jobId);
      if (result.status === "processing" && result.mode === "async") {
        await docRef.update({
          status: "processing_remote",
          updatedAt: new Date().toISOString(),
        });
        return;
      }

      await docRef.update({
        status: "completed",
        progress: 100,
        result,
        outputUrl: result.url,
        thumbnailUrl: result.thumbnailUrl || null,
        storagePath: result.outputStoragePath || result.output_storage_path || null,
        outputStoragePath: result.outputStoragePath || result.output_storage_path || null,
        thumbnailStoragePath: result.thumbnailStoragePath || result.thumbnail_storage_path || null,
        expiresAt: result.expiresAt || result.expires_at || getMulticamExpiryIso(),
        retentionDays: MULTICAM_MASTER_RETENTION_DAYS,
        completedAt: new Date().toISOString(),
      });
    } catch (error) {
      const workerDetail = getWorkerErrorDetail(error);
      const errorMessage = workerDetail || error.message;
      console.error(`[VideoEditing] Multicam Job ${jobId} Failed:`, errorMessage);
      let creditRefund = null;
      let refundableReceipt = multicamRequest?.creditReceipt || null;
      if (!refundableReceipt) {
        try {
          const latestJob = await docRef.get();
          refundableReceipt = latestJob.exists ? latestJob.data()?.creditReceipt || null : null;
        } catch (receiptError) {
          console.error(
            `[VideoEditing] Multicam Job ${jobId} could not reload credit receipt for refund:`,
            receiptError.message
          );
        }
      }
      if (refundableReceipt && !refundableReceipt.skipped) {
        try {
          creditRefund = await refundCredits(userId, refundableReceipt, "render-multicam-refund", {
            jobId,
            reason: errorMessage,
            renderTier: multicamRequest.renderTier || multicamRequest.render_tier || "premium",
          });
        } catch (refundError) {
          creditRefund = { success: false, message: refundError.message };
          console.error(`[VideoEditing] Multicam Job ${jobId} refund failed:`, refundError.message);
        }
      }
      await docRef.update({
        status: error.serverProof ? "proof_failed" : "failed",
        stage: error.serverProof ? "server_proof_failed" : "failed",
        error: errorMessage,
        workerError: workerDetail || null,
        workerStatus: error.statusCode || error.response?.status || null,
        serverProof: error.serverProof || null,
        creditRefund,
        progress: 0,
        failedAt: new Date().toISOString(),
      });
    }
  }

  buildMulticamWorkerPayload(multicamRequest, jobId = null) {
    return {
      sources: Array.isArray(multicamRequest?.sources)
        ? multicamRequest.sources.map(source => ({
            id: source.id,
            label: source.label || "",
            url: source.url,
            storage_path: source.storagePath || source.storage_path || null,
            storagePath: source.storagePath || source.storage_path || null,
            offset_seconds: Number(source.offsetSeconds ?? source.offset_seconds ?? 0),
            sync_rate: Number(source.syncRate ?? source.sync_rate ?? 1),
            syncRate: Number(source.syncRate ?? source.sync_rate ?? 1),
            reaction_side: source.reactionSide || source.reaction_side || null,
            reactionSide: source.reactionSide || source.reaction_side || null,
            rotation_degrees: Number(source.rotationDegrees ?? source.rotation_degrees ?? 0),
            rotationDegrees: Number(source.rotationDegrees ?? source.rotation_degrees ?? 0),
            cache_key: source.cacheKey || source.cache_key || null,
          }))
        : [],
      segments: Array.isArray(multicamRequest?.segments)
        ? multicamRequest.segments.map(segment => ({
            camera_id: segment.cameraId || segment.camera_id,
            timeline_start: Number(segment.timelineStart ?? segment.timeline_start ?? 0),
            timeline_end: Number(segment.timelineEnd ?? segment.timeline_end ?? 0),
            source_start: Number(segment.sourceStart ?? segment.source_start ?? 0),
            source_end: Number(segment.sourceEnd ?? segment.source_end ?? 0),
            layout_mode: segment.layoutMode || segment.layout_mode || "cut",
          }))
        : [],
      switches: Array.isArray(multicamRequest?.switches)
        ? multicamRequest.switches.map(item => ({
            camera_id: item.cameraId || item.camera_id,
            start_time: Number(item.startTime ?? item.start_time ?? 0),
            layout_mode: item.layoutMode || item.layout_mode || "cut",
          }))
        : [],
      auto_switch: multicamRequest?.autoSwitch === true || multicamRequest?.auto_switch === true,
      audio_based_auto_switch:
        multicamRequest?.audioBasedAutoSwitch !== false &&
        multicamRequest?.audio_based_auto_switch !== false,
      auto_switch_interval: Number(
        multicamRequest?.autoSwitchInterval ?? multicamRequest?.auto_switch_interval ?? 2
      ),
      auto_switch_aggressiveness:
        multicamRequest?.autoSwitchAggressiveness ||
        multicamRequest?.auto_switch_aggressiveness ||
        "balanced",
      render_tier: multicamRequest?.renderTier || multicamRequest?.render_tier || "premium",
      renderTier: multicamRequest?.renderTier || multicamRequest?.render_tier || "premium",
      primary_audio_camera_id:
        multicamRequest?.primaryAudioCameraId || multicamRequest?.primary_audio_camera_id || null,
      director_channel_camera_ids: Array.isArray(multicamRequest?.directorChannelCameraIds)
        ? multicamRequest.directorChannelCameraIds
        : Array.isArray(multicamRequest?.director_channel_camera_ids)
          ? multicamRequest.director_channel_camera_ids
          : null,
      directorChannelCameraIds: Array.isArray(multicamRequest?.directorChannelCameraIds)
        ? multicamRequest.directorChannelCameraIds
        : Array.isArray(multicamRequest?.director_channel_camera_ids)
          ? multicamRequest.director_channel_camera_ids
          : null,
      trusted_sync_contract:
        multicamRequest?.trustedSyncContract || multicamRequest?.trusted_sync_contract || null,
      trustedSyncContract:
        multicamRequest?.trustedSyncContract || multicamRequest?.trusted_sync_contract || null,
      trusted_director_channel_map:
        multicamRequest?.trustedDirectorChannelMap ||
        multicamRequest?.trusted_director_channel_map ||
        null,
      trustedDirectorChannelMap:
        multicamRequest?.trustedDirectorChannelMap ||
        multicamRequest?.trusted_director_channel_map ||
        null,
      overlap_start: Number(multicamRequest?.overlapStart ?? multicamRequest?.overlap_start ?? 0),
      overlapStart: Number(multicamRequest?.overlapStart ?? multicamRequest?.overlap_start ?? 0),
      overlap_duration: Number(
        multicamRequest?.overlapDuration ?? multicamRequest?.overlap_duration ?? 0
      ),
      overlapDuration: Number(
        multicamRequest?.overlapDuration ?? multicamRequest?.overlap_duration ?? 0
      ),
      timeline_start: Number(
        multicamRequest?.timelineStart ??
          multicamRequest?.timeline_start ??
          multicamRequest?.overlapStart ??
          multicamRequest?.overlap_start ??
          0
      ),
      timelineStart: Number(
        multicamRequest?.timelineStart ??
          multicamRequest?.timeline_start ??
          multicamRequest?.overlapStart ??
          multicamRequest?.overlap_start ??
          0
      ),
      output_aspect_ratio:
        multicamRequest?.outputAspectRatio || multicamRequest?.output_aspect_ratio || "9:16",
      outputAspectRatio:
        multicamRequest?.outputAspectRatio || multicamRequest?.output_aspect_ratio || "9:16",
      reaction_overlays:
        multicamRequest?.reactionOverlays === true || multicamRequest?.reaction_overlays === true,
      reactionOverlays:
        multicamRequest?.reactionOverlays === true || multicamRequest?.reaction_overlays === true,
      pre_sync_clap_alignment:
        multicamRequest?.preSyncClapAlignment === true ||
        multicamRequest?.pre_sync_clap_alignment === true,
      preSyncClapAlignment:
        multicamRequest?.preSyncClapAlignment === true ||
        multicamRequest?.pre_sync_clap_alignment === true,
      external_audio_url: multicamRequest?.externalAudio?.url || null,
      external_audio_storage_path:
        multicamRequest?.externalAudio?.storagePath ||
        multicamRequest?.externalAudio?.storage_path ||
        null,
      external_audio_offset_seconds: Number(multicamRequest?.externalAudio?.offset_seconds ?? 0),
      external_audio_mix_mode: multicamRequest?.externalAudio?.mix_mode || "external_only",
      external_audio_cache_key: multicamRequest?.externalAudio?.cache_key || null,
      externalAudio: multicamRequest?.externalAudio || null,
      brand_watermark: multicamRequest?.brandWatermark === true || multicamRequest?.brand_watermark === true,
      brandWatermark: multicamRequest?.brandWatermark === true || multicamRequest?.brand_watermark === true,
      burn_captions: multicamRequest?.burnCaptions === true || multicamRequest?.burn_captions === true,
      burnCaptions: multicamRequest?.burnCaptions === true || multicamRequest?.burn_captions === true,
      caption_style: multicamRequest?.captionStyle || multicamRequest?.caption_style || "podcast_clean",
      captionStyle: multicamRequest?.captionStyle || multicamRequest?.caption_style || "podcast_clean",
      watermark_text: multicamRequest?.watermarkText || "AutoPromote Cam Combiner",
      watermarkText: multicamRequest?.watermarkText || "AutoPromote Cam Combiner",
      generate_thumbnail: multicamRequest?.generateThumbnail === true || multicamRequest?.generate_thumbnail === true,
      generateThumbnail: multicamRequest?.generateThumbnail === true || multicamRequest?.generate_thumbnail === true,
      plan_only: multicamRequest?.planOnly === true || multicamRequest?.plan_only === true,
      planOnly: multicamRequest?.planOnly === true || multicamRequest?.plan_only === true,
      qa_proof_status: multicamRequest?.qaProofStatus || multicamRequest?.qa_proof_status || null,
      qaProofStatus: multicamRequest?.qaProofStatus || multicamRequest?.qa_proof_status || null,
      qa_proof_receipt_id:
        multicamRequest?.qaProofReceiptId || multicamRequest?.qa_proof_receipt_id || null,
      qaProofReceiptId:
        multicamRequest?.qaProofReceiptId || multicamRequest?.qa_proof_receipt_id || null,
      qa_proof_receipt:
        multicamRequest?.qaProofReceipt || multicamRequest?.qa_proof_receipt || null,
      qaProofReceipt:
        multicamRequest?.qaProofReceipt || multicamRequest?.qa_proof_receipt || null,
      job_id: jobId,
      async_mode: !!jobId,
    };
  }

  async postCamCombinerWorker(endpoint, payload, timeout) {
    const primaryUrl = `${CAM_COMBINER_WORKER_URL}${endpoint}`;
    try {
      const requestConfig = await buildWorkerRequestConfig(primaryUrl, { timeout });
      return await axios.post(primaryUrl, payload, requestConfig);
    } catch (error) {
      const workerDetail = getWorkerErrorDetail(error);
      if (!shouldTryLocalCamCombinerWorker(error)) {
        error.workerDetail = workerDetail;
        if (workerDetail && workerDetail !== error.message) {
          error.message = `${error.message}: ${workerDetail}`;
        }
        throw error;
      }
      console.warn(
        `[VideoEditing] Falling back to local Cam Combiner worker. Primary worker: ${CAM_COMBINER_WORKER_URL}`
      );
      try {
        return await axios.post(`${LOCAL_CAM_COMBINER_WORKER_URL}${endpoint}`, payload, { timeout });
      } catch (fallbackError) {
        const fallbackDetail = getWorkerErrorDetail(fallbackError);
        fallbackError.workerDetail = fallbackDetail;
        if (fallbackDetail && fallbackDetail !== fallbackError.message) {
          fallbackError.message = `${fallbackError.message}: ${fallbackDetail}`;
        }
        throw fallbackError;
      }
    }
  }

  validateMulticamServerProof(proof, multicamRequest) {
    const failures = [];
    const statusOf = value => String(value?.status || "").toLowerCase();
    const isPassed = value => ["passed", "good", "planned", "active"].includes(statusOf(value));
    const requirePassed = (name, value) => {
      if (!isPassed(value)) {
        failures.push({
          gate: name,
          status: value?.status || "missing",
          issueCount: value?.issue_count ?? value?.issueCount ?? null,
        });
      }
    };

    if (!proof || statusOf(proof) !== "planned") {
      failures.push({ gate: "worker_plan", status: proof?.status || "missing" });
    }

    if (multicamRequest?.externalAudio?.url) {
      requirePassed("sync_preflight", proof?.sync_preflight);
      requirePassed("continuous_sync_anchors", proof?.continuous_sync_anchors);
    }
    requirePassed("layout_contract_audit", proof?.layout_contract_audit);
    requirePassed("director_truth_audit", proof?.director_truth_audit);
    requirePassed("director_latency_audit", proof?.director_latency_audit);

    const qaProofReceipt = proof?.qa_proof_receipt || proof?.qaProofReceipt || null;
    const qaProofReceiptId =
      proof?.qa_proof_receipt_id || proof?.qaProofReceiptId || qaProofReceipt?.qa_proof_receipt_id;
    if (!qaProofReceipt || !qaProofReceiptId) {
      failures.push({ gate: "signed_server_plan_receipt", status: "missing" });
    }

    const receipt = {
      status: failures.length ? "failed" : "passed",
      checkedAt: new Date().toISOString(),
      failures,
      workerStatus: proof?.status || null,
      duration: proof?.duration_seconds || proof?.duration || null,
      renderTier: proof?.render_tier || proof?.renderTier || null,
      layoutSummary: proof?.layout_summary || null,
      syncPreflight: proof?.sync_preflight || null,
      continuousSyncAnchors: proof?.continuous_sync_anchors || null,
      layoutContractAudit: proof?.layout_contract_audit || null,
      directorTruthAudit: proof?.director_truth_audit || null,
      directorLatencyAudit: proof?.director_latency_audit || null,
      directorAudio: proof?.director_audio || null,
      renderSegmentMerge: proof?.render_segment_merge || null,
      qaProofStatus: proof?.qa_proof_status || proof?.qaProofStatus || null,
      qaProofReceiptId,
      qaProofReceipt,
    };

    if (failures.length) {
      const error = new Error(`Server proof failed before paid render: ${failures.map(item => `${item.gate}=${item.status}`).join(", ")}`);
      error.serverProof = receipt;
      throw error;
    }

    return receipt;
  }

  async proveMulticamRender(multicamRequest, userId, jobId) {
    const requestedTier = multicamRequest?.renderTier || multicamRequest?.render_tier || "premium";
    const proofRequest = {
      ...multicamRequest,
      renderTier: requestedTier,
      render_tier: requestedTier,
      burnCaptions: false,
      burn_captions: false,
      brandWatermark: false,
      brand_watermark: false,
      generateThumbnail: false,
      generate_thumbnail: false,
      planOnly: true,
      plan_only: true,
    };
    const payload = this.buildMulticamWorkerPayload(proofRequest, `${jobId}-proof`);
    payload.async_mode = false;
    payload.job_id = `${jobId}-proof`;

    console.log("[VideoEditing] Running server multicam proof", {
      userId,
      jobId,
      sourceCount: payload.sources.length,
      duration: payload.overlap_duration,
      renderTier: payload.renderTier || payload.render_tier,
    });

    const response = await this.postCamCombinerWorker("/render-multicam", payload, 3550000);
    return this.validateMulticamServerProof(response.data, multicamRequest);
  }

  /**
   * Process a video with AI options (Smart Crop, Silence Removal)
   * @param {string} videoUrl - Source video URL
   * @param {Object} options - { smartCrop: boolean, silenceRemoval: boolean }
   * @param {string} userId - User ID requesting the edit
   * @param {string} jobId - (Optional) Job ID for async tracking
   * @returns {Promise<Object>} { success: true, url: string, ... }
   */
  async processVideo(videoUrl, options, userId, jobId = null) {
    // Safe logging - pass user input as data arg, not template string
    console.log("[VideoEditing] Processing video request", { userId, options, jobId });
    console.log("[VideoEditing] Options detail:", JSON.stringify(options, null, 2));

    // Track the resulting file path from Python
    let resultPath = null;
    try {
      // 1. Determine which operation to run
      // NEW: Use the Pipeline Endpoint for everything except Analysis/Render
      // This supports Multi-AI features (Crop + Music + Captions) in one pass!
      let endpoint = "/process-video";
      let operation = "ai_process";
      let isPipeline = true;

      // Special cases that use dedicated endpoints (Phase 2 analysis)
      if (options.analyzeClips) {
        endpoint = "/analyze-clips"; // Note: Endpoint names must match exactly
        operation = "analyze_clips";
        isPipeline = false;
      } else if (options.renderViral) {
        endpoint = "/render-viral-clip";
        operation = "render_viral_clip";
        isPipeline = false;
      }

      // If none of the pipeline flags are set, maybe we shouldn't act?
      // But the frontend usually sends at least one.

      /* --- MOCK REMOVED FOR PRODUCTION ---
      // --- MOCK RESPONSE FOR CLIP ANALYSIS (Allows UI Testing without Python Worker) ---
      if (options.analyzeClips) {
          console.log("[VideoEditing] Mocking Viral Clip Analysis...");
          // Simulate processing delay
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          return {
              success: true,
              clipSuggestions: [
                  { id: 1, start: 0, end: 5, duration: 5, reason: "High energy intro detected! 🚀" },
                  { id: 2, start: 10, end: 18, duration: 8, reason: "Laughter and engagement spike 😂" },
                  { id: 3, start: 45, end: 55, duration: 10, reason: "Strong visual movement 🎥" }
              ],
              message: "Analysis completed (Mock)"
          };
      }
      */
      // --- END MOCK ---

      // 2. Call Python Worker
      // Pass cropStyle if available (defaults to 'blur' if undefined but beneficial to pass explicitly)
      let cropStyle = "blur";
      // FORCE CHECK: Ensure cropStyle is correctly extracted from options
      if (options.cropStyle && String(options.cropStyle).toLowerCase().includes("zoom")) {
        cropStyle = "zoom";
      }

      console.log(`[VideoEditing] Sending processing request. Pipeline Mode: ${isPipeline}`);

      // Build Payload (Unified)
      let payload = {
        video_url: videoUrl, // The URL (or local path if running locally)
        target_aspect_ratio: "9:16",

        // Context
        job_id: jobId,
        async_mode: !!jobId, // Enable async if JobId provided

        // Pipeline Flags
        smart_crop: options.smartCrop || false,
        quality_enhancement: options.enhanceQuality || false,
        quality_enhancement_profile: options.qualityEnhancementProfile || "safe_clean",
        crop_style: cropStyle,
        silence_removal: options.silenceRemoval || false,
        silence_threshold_db: Number(options.silenceThreshold ?? -35),
        min_silence_duration: Number(options.minSilenceDuration ?? 0.75),
        captions: options.captions || false,
        remove_watermark: options.removeWatermark || false,
        watermark_mode: options.watermarkMode || "adaptive",
        watermark_regions: Array.isArray(options.manualWatermarkRegions)
          ? options.manualWatermarkRegions
          : [],
        add_music: options.addMusic || false,
        music_file: options.musicFile || "upbeat.mp3", // Changed default to upbeat.mp3
        mute_audio: options.muteAudio || false,
        music_ducking: options.musicDucking !== undefined ? options.musicDucking : true,
        music_ducking_strength: Number(options.musicDuckingStrength ?? 0.35),
        volume: Number(options.musicVolume ?? 0.15),
        is_search: options.isSearch || false,
        safe_search: options.safeSearch !== undefined ? options.safeSearch : true,

        // Viral Hook Feature
        add_hook: options.addHook || false,
        hook_text: options.hookText || "WAIT TILL THE END 🚨",
        hook_intro_seconds: Number(options.hookIntroSeconds || 3.4),
        hook_template: options.hookTemplate || "blur_reveal",
        hook_start_time: Number(options.hookStartTime || 0),
        hook_blur_background:
          options.hookBlurBackground !== undefined ? !!options.hookBlurBackground : true,
        hook_dark_overlay: options.hookDarkOverlay !== undefined ? !!options.hookDarkOverlay : true,
        hook_freeze_frame: !!options.hookFreezeFrame,
        hook_zoom_scale: Number(options.hookZoomScale || 1.08),
        hook_text_animation: options.hookTextAnimation || "slide_up",
        transcription_language: options.transcriptionLanguage || "auto",
        transcription_hint:
          options.transcriptionHint ||
          "South African English accent possible. Preserve local names, slang, and code-switching.",
      };

      // If rendering a Viral Clip, attach specific data
      if (options.renderViral && options.viralData) {
        const viralData = options.viralData;
        const timelineSegments = Array.isArray(viralData.timeline_segments)
          ? viralData.timeline_segments
          : [];
        const timelineDuration = timelineSegments.reduce(
          (sum, segment) => sum + Math.max(0, Number(segment.duration || 0)),
          0
        );
        const startTime = Number(viralData.start_time ?? viralData.clipTime?.start ?? 0);
        const endTime = Number(
          viralData.end_time ??
            viralData.clipTime?.end ??
            (timelineDuration > 0 ? timelineDuration : startTime)
        );
        endpoint = "/render-viral-clip";
        payload = {
          ...payload,
          start_time: startTime,
          end_time: endTime,
          auto_captions:
            viralData.auto_captions !== undefined ? !!viralData.auto_captions : options.captions,
          caption_style:
            viralData.caption_style ||
            viralData.captionStyle ||
            viralData.renderDefaults?.caption_style ||
            payload.caption_style,
          smart_crop:
            viralData.smart_crop !== undefined
              ? !!viralData.smart_crop
              : viralData.smartCrop !== undefined
                ? !!viralData.smartCrop
                : viralData.renderDefaults?.smart_crop !== undefined
                  ? !!viralData.renderDefaults.smart_crop
                  : payload.smart_crop,
          smart_crop_mode:
            viralData.smart_crop_mode ||
            viralData.smartCropMode ||
            viralData.renderDefaults?.smart_crop_mode ||
            payload.smart_crop_mode,
          visual_enhance:
            viralData.visual_enhance !== undefined
              ? !!viralData.visual_enhance
              : viralData.visualEnhance !== undefined
                ? !!viralData.visualEnhance
                : viralData.renderDefaults?.visual_enhance !== undefined
                  ? !!viralData.renderDefaults.visual_enhance
                  : payload.visual_enhance,
          add_hook:
            viralData.add_hook !== undefined
              ? !!viralData.add_hook
              : viralData.addHook !== undefined
                ? !!viralData.addHook
                : viralData.renderDefaults?.add_hook !== undefined
                  ? !!viralData.renderDefaults.add_hook
                  : !!(viralData.hook_text || viralData.hookText || viralData.titleSuggestion),
          hook_text:
            viralData.hook_text ||
            viralData.hookText ||
            viralData.renderDefaults?.hook_text ||
            viralData.titleSuggestion ||
            viralData.captionSuggestion ||
            payload.hook_text,
          hook_intro_seconds: Number(
            viralData.hook_intro_seconds ??
              viralData.hookIntroSeconds ??
              viralData.renderDefaults?.hook_intro_seconds ??
              payload.hook_intro_seconds
          ),
          hook_template:
            viralData.hook_template ||
            viralData.hookTemplate ||
            viralData.hookTreatment?.hook_template ||
            viralData.renderDefaults?.hook_template ||
            payload.hook_template,
          hook_text_animation:
            viralData.hook_text_animation ||
            viralData.hookTextAnimation ||
            viralData.hookTreatment?.hook_text_animation ||
            viralData.renderDefaults?.hook_text_animation ||
            payload.hook_text_animation,
          hook_zoom_scale: Number(
            viralData.hook_zoom_scale ??
              viralData.hookZoomScale ??
              viralData.hookTreatment?.hook_zoom_scale ??
              viralData.renderDefaults?.hook_zoom_scale ??
              payload.hook_zoom_scale
          ),
          hook_blur_background:
            viralData.hook_blur_background !== undefined
              ? !!viralData.hook_blur_background
              : viralData.hookBlurBackground !== undefined
                ? !!viralData.hookBlurBackground
                : viralData.renderDefaults?.hook_blur_background !== undefined
                  ? !!viralData.renderDefaults.hook_blur_background
                  : payload.hook_blur_background,
          hook_dark_overlay:
            viralData.hook_dark_overlay !== undefined
              ? !!viralData.hook_dark_overlay
              : viralData.hookDarkOverlay !== undefined
                ? !!viralData.hookDarkOverlay
                : viralData.renderDefaults?.hook_dark_overlay !== undefined
                  ? !!viralData.renderDefaults.hook_dark_overlay
                  : payload.hook_dark_overlay,
          template: viralData.template || viralData.renderDefaults?.template || payload.template,
          timeline_segments: timelineSegments,
          background_audio: viralData.background_audio || null,
          hook_focus_point: viralData.hook_focus_point || null,
          cover_frame: viralData.cover_frame || null,
          thumbnail_frame: viralData.thumbnail_frame || viralData.cover_frame || null,
          brand_watermark: viralData.brand_watermark !== false && viralData.brandWatermark !== false,
          brandWatermark: viralData.brand_watermark !== false && viralData.brandWatermark !== false,
          watermark_text: viralData.watermark_text || viralData.watermarkText || "AUTOPROMOTE",
          watermarkText: viralData.watermark_text || viralData.watermarkText || "AUTOPROMOTE",
          overlays: (viralData.overlays || []).map(o => ({
            ...o,
            start_time:
              o.start_time !== undefined && o.start_time !== null ? o.start_time : o.startTime,
            duration:
              o.duration !== undefined && o.duration !== null ? Number(o.duration) : o.duration,
            width: o.width !== undefined && o.width !== null ? Number(o.width) : o.width,
            height: o.height !== undefined && o.height !== null ? Number(o.height) : o.height,
          })),
        };
      }

      console.log("[VideoEditing] Payload to worker:", JSON.stringify(payload));

      // Increase timeout significantly for AI model downloading (30 mins)
      const response = await axios.post(`${MEDIA_WORKER_URL}${endpoint}`, payload, {
        timeout: 1800000, // 30 minutes (increased from 10m for model downloads)
      });

      const result = response.data;

      // CHECK FOR ASYNC MODE RESPONSE
      if (result.status === "processing" && result.mode === "async") {
        return { status: "processing", mode: "async", jobId: result.job_id };
      }

      // Special handling for Analyze Clips (No output file, just JSON)
      if (operation === "analyze_clips") {
        return {
          success: true,
          clipSuggestions: result.clipSuggestions || result.scenes,
          message: "Analysis completed",
        };
      }

      // Check if the worker already uploaded the file (Distributed Worker Support)
      if (result.output_url && result.output_url.startsWith("http")) {
        console.log(`[VideoEditing] Worker returned remote URL: ${result.output_url}`);
        return {
          success: true,
          url: result.output_url,
          thumbnailUrl: result.thumbnail_url || result.thumbnailUrl || null,
          coverFrame: result.cover_frame || result.coverFrame || null,
          thumbnailFrame: result.thumbnail_frame || result.thumbnailFrame || null,
          duration: result.duration || 0,
          message: "Processing completed (Remote Worker)",
        };
      }

      resultPath = result.output_path; // Local path from shared volume

      if (!resultPath || !fs.existsSync(resultPath)) {
        throw new Error("Worker failed to return a valid file path or URL");
      }

      // 3. Upload to Firebase Storage (Local Worker Case)
      const bucketName =
        process.env.FIREBASE_STORAGE_BUCKET ||
        (process.env.FIREBASE_PROJECT_ID
          ? `${process.env.FIREBASE_PROJECT_ID}.appspot.com`
          : undefined);
      if (!bucketName) {
        throw new Error(
          "Bucket name not specified or invalid. Check FIREBASE_STORAGE_BUCKET or FIREBASE_PROJECT_ID env vars."
        );
      }

      const bucket = admin.storage().bucket(bucketName);
      const filename = `${operation}_${Date.now()}.mp4`;
      const destination = `edited_videos/${userId}/${filename}`;

      await bucket.upload(resultPath, {
        destination: destination,
        metadata: {
          contentType: "video/mp4",
          metadata: {
            originalUrl: videoUrl,
            operation: operation,
          },
        },
      });

      // 4. Get Public URL
      const fileRef = bucket.file(destination);
      await fileRef.makePublic();
      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${destination}`;

      // 5. Cleanup Local File
      try {
        fs.unlinkSync(resultPath);
      } catch (e) {
        console.warn("[VideoEditing] Failed to delete temp file:", e.message);
      }

      // 6. Cleanup Source File (If it was a temporary upload)
      // We check if the videoUrl is a storage location we own (e.g., contains 'temp_uploads')
      if (videoUrl.includes("temp_uploads") || videoUrl.includes("firebase")) {
        try {
          // Extract path from URL or pass as metadata.
          // For safety in Phase 1, we won't auto-delete to avoid deleting user library items accidentally.
          // But we will Log it for a Lifecycle Policy to handle.
          // BETTER APPROACH: Return the 'temp' flag to the controller/frontend to trigger deletion?
          // OR: Just rely on Lifecycle Rules (Safest).
          console.log("[VideoEditing] Note: Source file may need cleanup:", videoUrl);
        } catch (e) {
          console.warn("Cleanup source failed", e);
        }
      }

      // 7. Log to Firestore (Optional, but good for history)
      await db.collection("edit_history").add({
        userId,
        originalUrl: videoUrl,
        processedUrl: publicUrl,
        options,
        createdAt: new Date().toISOString(),
      });

      return {
        success: true,
        url: publicUrl,
        message: "Video processed successfully",
      };
    } catch (error) {
      console.error("[VideoEditing] Error:", error.message);
      let errorDetail = error.message;
      if (error.response && error.response.data) {
        console.error("Worker Error:", error.response.data);
        // If the worker returned a 'detail' field (FastAPI default), include it.
        if (error.response.data.detail) {
          errorDetail += ` - Worker says: ${error.response.data.detail}`;
        } else {
          errorDetail += ` - Worker says: ${JSON.stringify(error.response.data)}`;
        }
      }
      throw new Error(`Video processing failed: ${errorDetail}`);
    }
  }

  /**
   * Analyze a video to find potential viral clips (Phase 2)
   * @param {string} videoUrl
   * @param {string} userId
   * @returns {Promise<Array>} List of scene objects {start, end, viralScore}
   */
  async analyzeVideo(videoUrl, userId, options = {}) {
    console.log(
      `[VideoAnalysis] Analyzing for User: ${userId}, forceFresh=${Boolean(options.forceFresh)}`
    );
    const payload = {
      video_url: videoUrl,
      target_aspect_ratio: "9:16",
      force_fresh: Boolean(options.forceFresh),
      scan_nonce: typeof options.scanNonce === "string" ? options.scanNonce : "",
      local_path: options.localPath || null,
    };
    try {
      let response;
      try {
        response = await axios.post(`${MEDIA_WORKER_URL}/analyze-clips`, payload, {
          timeout: 600000,
        });
      } catch (error) {
        if (!shouldTryLocalWorker(error)) throw error;
        console.warn(
          `[VideoAnalysis] Primary worker failed (${getWorkerErrorDetail(error)}). Retrying local worker.`
        );
        response = await axios.post(`${LOCAL_MEDIA_WORKER_URL}/analyze-clips`, payload, {
          timeout: 600000,
        });
      }

      // Returns { status, job_id, scenes: [...] }
      return response.data.scenes || [];
    } catch (error) {
      const detail = getWorkerErrorDetail(error);
      console.error("[VideoAnalysis] Error:", detail);
      throw new Error(`Video analysis failed: ${detail}`);
    }
  }

  /**
   * Render a specific clip from a larger video
   */
  async renderClip(videoUrl, startTime, endTime, userId) {
    console.log(`[VideoRender] Rendering clip for User: ${userId} (${startTime}-${endTime}s)`);
    try {
      const response = await axios.post(
        `${MEDIA_WORKER_URL}/render-clip`,
        {
          video_url: videoUrl,
          start_time: startTime,
          end_time: endTime,
          target_aspect_ratio: "9:16",
        },
        { timeout: 300000 }
      );

      const resultPath = response.data.output_path;

      // Upload to Firebase
      const bucket = admin.storage().bucket();
      const filename = `clip_${Date.now()}.mp4`;
      const destination = `viral_clips/${userId}/${filename}`;

      await bucket.upload(resultPath, {
        destination: destination,
        metadata: { contentType: "video/mp4" },
      });

      const fileRef = bucket.file(destination);
      await fileRef.makePublic();
      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${destination}`;

      // Cleanup local
      try {
        fs.unlinkSync(resultPath);
      } catch (e) {}

      return { url: publicUrl };
    } catch (error) {
      console.error("[VideoRender] Error:", error.message);
      throw new Error("Clip rendering failed");
    }
  }

  /**
   * Transcribe video audio to text using Whisper (via Python Worker)
   * @param {string} videoUrl
   * @returns {Promise<Array>} List of segments {start, end, text}
   */
  /**
   * Start an async transcription job
   */
  async startTranscriptionJob(videoUrl, userId) {
    const jobId = uuidv4();
    try {
      // Store initial job state
      await db.collection("video_edits").doc(jobId).set({
        jobId,
        type: "transcription",
        userId,
        videoUrl,
        status: "queued",
        progress: 0,
        createdAt: new Date().toISOString(),
      });

      // Start background task
      this.processTranscriptionBackground(jobId, videoUrl).catch(err => {
        console.error(`[VideoTranscribe] Background Job ${jobId} Failed:`, err);
      });

      return { jobId };
    } catch (e) {
      throw new Error("Failed to start transcription job");
    }
  }

  /**
   * Background processor for transcription
   */
  async processTranscriptionBackground(jobId, videoUrl) {
    const docRef = db.collection("video_edits").doc(jobId);
    try {
      await docRef.update({ status: "processing", progress: 10 });

      console.log(`[VideoTranscribe] Calling worker for job ${jobId}`);

      // Call Python Worker
      const response = await axios.post(
        `${MEDIA_WORKER_URL}/transcribe`,
        {
          video_url: videoUrl,
          language: "auto",
          hint: "South African English accent possible. Preserve local names, slang, and code-switching.",
        },
        {
          timeout: 600000, // 10 minutes
        }
      );

      // Worker returns { segments: [...] }
      const result = response.data;

      await docRef.update({
        status: "completed",
        result: { segments: result.segments },
        progress: 100,
        completedAt: new Date().toISOString(),
      });

      console.log(`[VideoTranscribe] Job ${jobId} Completed.`);
    } catch (error) {
      console.error(`[VideoTranscribe] Job ${jobId} Failed:`, error.message);
      await docRef.update({
        status: "failed",
        error: error.message,
        progress: 0,
        failedAt: new Date().toISOString(),
      });
    }
  }

  /**
   * Transcribe audio from video (Sync - Deprecated for large files)
   * @param {string} videoUrl
   * @returns {Promise<Array>} segments
   */
  async transcribeVideo(videoUrl) {
    console.log(`[VideoTranscription] Requesting transcription for: ${videoUrl}`);
    try {
      const response = await axios.post(
        `${MEDIA_WORKER_URL}/transcribe`,
        {
          video_url: videoUrl,
        },
        { timeout: 600000 }
      ); // 10 mins

      // Returns { status, segments: [...] }
      return response.data.segments || [];
    } catch (error) {
      console.error("[VideoTranscription] Error:", error.message);
      // Fallback or rethrow
      throw new Error("Transcription failed");
    }
  }
  async preflightMulticamSync({
    sources,
    external_audio_url,
    externalAudio = null,
    external_audio_offset_seconds = 0,
    external_audio_sync_trim_start = 0,
    external_audio_sync_trim_duration = 0,
    timeline_start = 0,
    overlap_duration = 0,
  }) {
    console.log("[VideoEditing] Running multicam preflight sync", {
      sourceCount: sources.length,
      hasExternalAudio: !!external_audio_url,
    });

    const payload = {
      sources: sources.map((s, index) => ({
        id: s.id || `camera_${index + 1}`,
        label: s.label || "",
        url: s.url,
        offset_seconds: Number(s.offset_seconds || 0),
        sync_rate: Number(s.sync_rate ?? s.syncRate ?? 1),
        syncRate: Number(s.syncRate ?? s.sync_rate ?? 1),
        sync_trim_start: Number(s.sync_trim_start ?? s.upload_trim_start ?? 0) || 0,
        sync_trim_duration: Number(s.sync_trim_duration ?? s.upload_trim_duration ?? 0) || 0,
      })),
      external_audio_url,
      external_audio_offset_seconds: Number(external_audio_offset_seconds || 0),
      externalAudio: {
        ...(externalAudio && typeof externalAudio === "object" ? externalAudio : {}),
        url: external_audio_url,
        offset_seconds: Number(external_audio_offset_seconds || 0),
        sync_trim_start: Number(
          externalAudio?.sync_trim_start ??
            externalAudio?.upload_trim_start ??
            external_audio_sync_trim_start ??
            0
        ) || 0,
        sync_trim_duration: Number(
          externalAudio?.sync_trim_duration ??
            externalAudio?.upload_trim_duration ??
            external_audio_sync_trim_duration ??
            0
        ) || 0,
      },
      timeline_start: Number(timeline_start || 0),
      timelineStart: Number(timeline_start || 0),
      overlap_start: Number(timeline_start || 0),
      overlapStart: Number(timeline_start || 0),
      overlap_duration: Number(overlap_duration || 0),
      overlapDuration: Number(overlap_duration || 0),
    };

    let response;
    try {
      response = await this.postCamCombinerWorker(
        "/multicam/preflight-sync",
        payload,
        120000
      );
    } catch (error) {
      const workerDetail = error.response?.data?.detail || error.response?.data?.message || error.message;
      const message = typeof workerDetail === "string"
        ? workerDetail
        : JSON.stringify(workerDetail);
      const wrappedError = new Error(message || "Multicam preflight worker failed");
      wrappedError.statusCode = error.response?.status;
      wrappedError.workerDetail = workerDetail;
      throw wrappedError;
    }

    return response.data;
  }

  async renderMulticam(multicamRequest, userId, jobId = null) {
    console.log("[VideoEditing] Rendering multicam request", {
      userId,
      jobId,
      sourceCount: Array.isArray(multicamRequest?.sources) ? multicamRequest.sources.length : 0,
    });

    const payload = this.buildMulticamWorkerPayload(multicamRequest, jobId);

    let response;
    response = await this.postCamCombinerWorker("/render-multicam", payload, 3550000);

    const result = response.data;
    if (result.status === "processing" && result.mode === "async") {
      return { status: "processing", mode: "async", jobId: result.job_id };
    }

    if (result.output_url && result.output_url.startsWith("http")) {
      return {
        success: true,
        url: result.output_url,
        duration: result.duration || 0,
        thumbnailUrl: result.thumbnail_url || result.thumbnailUrl || null,
        localThumbnailUrl: result.local_thumbnail_url || result.localThumbnailUrl || null,
        firebaseThumbnailUrl: result.firebase_thumbnail_url || result.firebaseThumbnailUrl || null,
        outputStoragePath: result.output_storage_path || result.outputStoragePath || null,
        thumbnailStoragePath: result.thumbnail_storage_path || result.thumbnailStoragePath || null,
        expiresAt: result.expires_at || result.expiresAt || getMulticamExpiryIso(),
        renderTier: result.render_tier || multicamRequest?.renderTier || multicamRequest?.render_tier || "premium",
        renderReceipt: result.render_receipt || null,
        syncPreflight: result.sync_preflight || null,
        brandWatermark: result.brand_watermark || result.brandWatermark || result.render_receipt?.brand_watermark || null,
        thumbnail: result.thumbnail || result.render_receipt?.thumbnail || null,
        message: "Multi-camera render completed",
      };
    }

    throw new Error("Worker failed to return a multi-camera output URL");
  }
}

// Export the class AND a default instance
module.exports = VideoEditingService;
