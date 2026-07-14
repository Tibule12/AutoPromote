"""Durable one-shot Cam Combiner renderer for Cloud Run Jobs."""

import asyncio
import copy
import datetime
import hashlib
import hmac
import json
import os
import re
import sys
import threading
import time

_RUNNER_PROCESS_STARTED_PERF = time.perf_counter()
_RUNNER_PROCESS_STARTED_AT = datetime.datetime.now(datetime.timezone.utc)

import requests

import main_media_server as worker


def _error_text(error):
    detail = getattr(error, "detail", None)
    value = detail if detail is not None else str(error)
    if isinstance(value, str):
        return value[:8000]
    return json.dumps(value, default=str)[:8000]


def _execution_identity():
    return str(
        os.getenv("CLOUD_RUN_EXECUTION")
        or os.getenv("CLOUD_RUN_TASK_INDEX")
        or "unknown-execution"
    )


def _task_retry_context():
    """Return the zero-based Cloud Run attempt and configured retry budget."""
    try:
        attempt = max(0, int(os.getenv("CLOUD_RUN_TASK_ATTEMPT") or "0"))
    except (TypeError, ValueError):
        attempt = 0
    try:
        max_retries = max(0, int(os.getenv("MULTICAM_JOB_MAX_RETRIES") or "1"))
    except (TypeError, ValueError):
        max_retries = 1
    return attempt, max_retries


def _read_cloud_run_resource_allocation():
    """Read the actual task cgroup limits for durable cost telemetry."""
    allocated_vcpu = float(os.cpu_count() or 1)
    memory_limit_bytes = None
    try:
        with open("/sys/fs/cgroup/cpu.max", "r", encoding="utf-8") as cpu_file:
            quota_text, period_text = cpu_file.read().strip().split()[:2]
        if quota_text != "max":
            allocated_vcpu = max(0.001, float(quota_text) / max(1.0, float(period_text)))
    except Exception:
        pass
    try:
        with open("/sys/fs/cgroup/memory.max", "r", encoding="utf-8") as memory_file:
            memory_text = memory_file.read().strip()
        if memory_text != "max":
            memory_limit_bytes = max(0, int(memory_text))
    except Exception:
        pass
    return round(allocated_vcpu, 3), memory_limit_bytes


def _datetime_value(value):
    if isinstance(value, datetime.datetime):
        return value if value.tzinfo else value.replace(tzinfo=datetime.timezone.utc)
    if isinstance(value, str) and value.strip():
        try:
            return datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def _is_nonretryable_render_error(error):
    """Return True for deterministic request/proof failures.

    Cloud Run task retries are useful for interrupted infrastructure and
    checkpointable FFmpeg work. They are wasteful for a 4xx proof rejection:
    identical inputs will produce the identical rejection on every attempt.
    """
    raw_status = getattr(error, "status_code", None)
    if raw_status is None:
        raw_status = getattr(error, "status", None)
    try:
        status_code = int(raw_status)
    except (TypeError, ValueError):
        status_code = 0
    if 400 <= status_code < 500 and status_code not in {408, 429}:
        return True

    normalized = _error_text(error).lower()
    deterministic_markers = (
        "unproven_channel_mapping",
        "could not prove which clean-audio channel",
        "trusted multicam sync contract is invalid",
        "trusted director channel map is invalid",
        "unsafe active-speaker",
        "could not be sync-proved before render",
    )
    return any(marker in normalized for marker in deterministic_markers)


def _compact_check(value):
    if not isinstance(value, dict):
        return None
    return {
        key: value.get(key)
        for key in ("status", "reason", "issue_count", "trusted", "confidence")
        if value.get(key) is not None
    }


def _notify_failure_callback(job_id, reason, dispatch_token=None):
    callback_url = str(os.getenv("MULTICAM_JOB_CALLBACK_URL") or "").strip()
    callback_secret = str(os.getenv("MULTICAM_JOB_CALLBACK_SECRET") or "")
    if not callback_url or (not callback_secret and not dispatch_token):
        worker.logger.error("Multicam failure callback is not configured for job %s", job_id)
        return False
    try:
        headers = {"Content-Type": "application/json"}
        if callback_secret:
            headers["X-Multicam-Job-Secret"] = callback_secret
        if dispatch_token:
            headers["X-Multicam-Dispatch-Token"] = str(dispatch_token)
        response = requests.post(
            callback_url,
            headers=headers,
            json={"jobId": job_id, "reason": str(reason)[:1000]},
            timeout=30,
        )
        if response.status_code >= 300:
            worker.logger.error(
                "Multicam failure callback rejected for %s: HTTP %s",
                job_id,
                response.status_code,
            )
            return False
        return True
    except Exception as callback_error:
        worker.logger.error("Multicam failure callback failed for %s: %s", job_id, callback_error)
        return False


def _release_capacity(job_id, reason):
    """Release the API-side global render semaphore after a terminal outcome."""
    db = worker.firestore.client()
    capacity_ref = db.collection("system_runtime").document("multicam_render_capacity")
    transaction = db.transaction()

    @worker.firestore.transactional
    def release(transaction):
        snapshot = capacity_ref.get(transaction=transaction)
        if not snapshot.exists:
            return False
        data = snapshot.to_dict() or {}
        active_jobs = data.get("activeJobs") or {}
        if not isinstance(active_jobs, dict):
            active_jobs = {}
        existed = job_id in active_jobs
        active_jobs.pop(job_id, None)
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        transaction.set(
            capacity_ref,
            {
                "activeJobs": active_jobs,
                "activeCount": len(active_jobs),
                "lastRelease": {
                    "jobId": job_id,
                    "reason": str(reason or "terminal")[:200],
                    "releasedAt": now,
                },
                "updatedAt": now,
            },
            merge=True,
        )
        return existed

    try:
        return release(transaction)
    except Exception as release_error:
        worker.logger.error(
            "Could not release multicam capacity for %s: %s", job_id, release_error
        )
        return False


def _claim_job(doc_ref, dispatch_token, execution_id):
    transaction = worker.firestore.client().transaction()

    @worker.firestore.transactional
    def claim(transaction):
        snapshot = doc_ref.get(transaction=transaction)
        if not snapshot.exists:
            raise RuntimeError(f"video_edits/{doc_ref.id} does not exist")
        data = snapshot.to_dict() or {}

        expected_hash = str(data.get("dispatchTokenHash") or "")
        provided_hash = hashlib.sha256(dispatch_token.encode("utf-8")).hexdigest()
        if not expected_hash or not hmac.compare_digest(expected_hash, provided_hash):
            raise RuntimeError("Cloud Run Job dispatch token does not match")

        if data.get("creditsRefunded") or str(data.get("status") or "") == "dispatch_failed":
            return "refunded", data
        if (
            data.get("status") == "completed"
            and (data.get("outputUrl") or data.get("output_url"))
            and (data.get("outputStoragePath") or data.get("output_storage_path"))
        ):
            return "completed", data

        lease = data.get("renderLease") or {}
        lease_execution = str(lease.get("execution") or "")
        lease_expires_at = str(lease.get("expiresAt") or "")
        lease_active = False
        if lease_expires_at:
            try:
                lease_active = datetime.datetime.fromisoformat(
                    lease_expires_at.replace("Z", "+00:00")
                ) > datetime.datetime.now(datetime.timezone.utc)
            except ValueError:
                lease_active = False
        if lease_active and lease_execution and lease_execution != execution_id:
            return "duplicate", data

        now = datetime.datetime.now(datetime.timezone.utc)
        transaction.set(
            doc_ref,
            {
                "status": "proofing",
                "stage": "durable_server_proof",
                "progress": 8,
                "detail": "Durable render Job is proving the edit before rendering",
                "renderLease": {
                    "execution": execution_id,
                    "taskAttempt": os.getenv("CLOUD_RUN_TASK_ATTEMPT"),
                    "claimedAt": now.isoformat(),
                    "expiresAt": (now + datetime.timedelta(hours=6)).isoformat(),
                },
                "updatedAt": now.isoformat(),
            },
            merge=True,
        )
        return "claimed", data

    return claim(transaction)


def run():
    # Start before importing the large media stack above. Cloud Run allocates
    # CPU/memory during container import too, so omitting import time would
    # understate the units used by every job.
    runner_started_perf = _RUNNER_PROCESS_STARTED_PERF
    runner_started_at = _RUNNER_PROCESS_STARTED_AT
    job_id = str(os.getenv("MULTICAM_JOB_ID") or "").strip()
    dispatch_token = str(os.getenv("MULTICAM_DISPATCH_TOKEN") or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]{8,160}", job_id):
        print("MULTICAM_JOB_ID is missing or invalid", file=sys.stderr)
        return 2
    if len(dispatch_token) < 16:
        print("MULTICAM_DISPATCH_TOKEN is missing or invalid", file=sys.stderr)
        return 2
    if not worker.FIREBASE_STATUS_UPDATES_ENABLED:
        print("Firebase status delivery is unavailable", file=sys.stderr)
        return 2

    db = worker.firestore.client()
    doc_ref = db.collection("video_edits").document(job_id)
    execution_id = _execution_identity()
    job = None

    try:
        claim_status, job = _claim_job(doc_ref, dispatch_token, execution_id)
        if claim_status in {"completed", "refunded"}:
            _release_capacity(job_id, claim_status)
            print(f"Multicam job {job_id} skipped: {claim_status}")
            return 0
        if claim_status == "duplicate":
            print(f"Multicam job {job_id} skipped: {claim_status}")
            return 0

        raw_request = job.get("multicamRequest")
        if not isinstance(raw_request, dict):
            raise RuntimeError("Job has no canonical multicamRequest")
        if not job.get("creditReceipt"):
            raise RuntimeError("Render credit reservation is missing")

        full_payload = copy.deepcopy(raw_request)
        full_payload.update(
            {
                "job_id": job_id,
                "async_mode": True,
                "plan_only": False,
                "planOnly": False,
            }
        )

        require_server_proof = bool(job.get("requireServerProof", True))
        embedded_server_proof = require_server_proof and str(
            os.getenv("MULTICAM_EMBEDDED_SERVER_PROOF", "1") or "1"
        ).strip().lower() not in {"0", "false", "no", "off"}
        if embedded_server_proof:
            worker.update_firestore_job(
                job_id,
                {
                    "status": "proofing",
                    "stage": "embedded_server_proof",
                    "progress": 8,
                    "detail": "Preparing sources and proving sync/director once before encoding",
                },
            )

        if require_server_proof and not embedded_server_proof:
            proof_payload = copy.deepcopy(full_payload)
            proof_payload.update(
                {
                    "job_id": f"{job_id}-proof",
                    "async_mode": False,
                    "plan_only": True,
                    "planOnly": True,
                    "burn_captions": False,
                    "burnCaptions": False,
                    "brand_watermark": False,
                    "brandWatermark": False,
                    "generate_thumbnail": False,
                    "generateThumbnail": False,
                }
            )
            proof_request = worker.RenderMultiCamRequest(**proof_payload)
            proof_heartbeat_stop = threading.Event()
            proof_started_at = time.monotonic()

            def report_proof_heartbeat():
                while not proof_heartbeat_stop.wait(20):
                    elapsed_seconds = max(0, int(time.monotonic() - proof_started_at))
                    minutes, seconds = divmod(elapsed_seconds, 60)
                    worker.update_firestore_job(
                        job_id,
                        {
                            "status": "proofing",
                            "stage": "durable_server_proof_audio_first",
                            "progress": 8,
                            "detail": (
                                "Audio-first server proof is active "
                                f"({minutes}m {seconds:02d}s elapsed)"
                            ),
                            "proofHeartbeatAt": datetime.datetime.now(
                                datetime.timezone.utc
                            ).isoformat(),
                        },
                    )

            proof_heartbeat_thread = threading.Thread(
                target=report_proof_heartbeat,
                name=f"multicam-proof-heartbeat-{job_id[:12]}",
                daemon=True,
            )
            proof_heartbeat_thread.start()
            try:
                proof_result = asyncio.run(
                    worker.render_multicam_impl(
                        proof_request,
                        provided_job_id=f"{job_id}-proof",
                        propagate_errors=True,
                    )
                )
            finally:
                proof_heartbeat_stop.set()
                proof_heartbeat_thread.join(timeout=2)
            if not isinstance(proof_result, dict) or proof_result.get("status") != "planned":
                raise RuntimeError("Durable server proof did not return a safe plan")

            qa_receipt = proof_result.get("qa_proof_receipt")
            qa_receipt_id = proof_result.get("qa_proof_receipt_id")
            full_request_for_proof = worker.RenderMultiCamRequest(**full_payload)
            requested_duration = float(
                full_request_for_proof.overlap_duration
                or full_request_for_proof.overlapDuration
                or proof_result.get("duration_seconds")
                or 0.0
            )
            receipt_passed, receipt_reason = worker.multicam_qa_proof_receipt_passes(
                qa_receipt,
                full_request_for_proof,
                requested_duration,
            )
            if not qa_receipt_id or not receipt_passed:
                raise RuntimeError(f"Durable server proof receipt failed: {receipt_reason}")

            full_payload.update(
                {
                    "qa_proof_status": "passed",
                    "qaProofStatus": "passed",
                    "qa_proof_receipt_id": qa_receipt_id,
                    "qaProofReceiptId": qa_receipt_id,
                    "qa_proof_receipt": qa_receipt,
                    "qaProofReceipt": qa_receipt,
                }
            )
            worker.update_firestore_job(
                job_id,
                {
                    "status": "proof_passed",
                    "stage": "durable_server_proof_passed",
                    "progress": 22,
                    "detail": "Server proof passed; durable full render is starting",
                    "multicamRequest": full_payload,
                    "serverProof": {
                        "status": "passed",
                        "qaProofReceiptId": qa_receipt_id,
                        "qaProofReceipt": qa_receipt,
                        "syncPreflight": _compact_check(proof_result.get("sync_preflight")),
                        "continuousSyncAnchors": _compact_check(
                            proof_result.get("continuous_sync_anchors")
                        ),
                        "layoutContractAudit": _compact_check(
                            proof_result.get("layout_contract_audit")
                        ),
                        "directorTruthAudit": _compact_check(
                            proof_result.get("director_truth_audit")
                        ),
                        "directorLatencyAudit": _compact_check(
                            proof_result.get("director_latency_audit")
                        ),
                    },
                },
                critical=True,
                max_attempts=5,
            )

        render_request = worker.RenderMultiCamRequest(**full_payload)
        result = asyncio.run(
            worker.render_multicam_impl(
                render_request,
                provided_job_id=job_id,
                propagate_errors=True,
                allow_embedded_server_proof=embedded_server_proof,
            )
        )
        if not isinstance(result, dict) or result.get("status") != "completed":
            raise RuntimeError("Durable renderer returned no completed result")
        if not result.get("output_storage_path"):
            raise RuntimeError("Durable renderer completed without a cloud storage path")

        # Persist a compact unit ledger for pricing and capacity decisions. It
        # records measured time/bytes and allocated compute units; dollar cost
        # can then be calculated against the current Cloud Run rate card without
        # guessing later from logs.
        runner_completed_at = datetime.datetime.now(datetime.timezone.utc)
        runner_elapsed_seconds = max(0.0, time.perf_counter() - runner_started_perf)
        performance_timing = result.get("performance_timing") or {}
        worker_elapsed_seconds = max(
            0.0,
            float(performance_timing.get("elapsed_seconds") or 0.0),
        )
        output_size_bytes = next(
            (
                int(stage.get("output_size_bytes"))
                for stage in (performance_timing.get("stages") or [])
                if stage.get("stage") == "publish_outputs" and stage.get("output_size_bytes") is not None
            ),
            None,
        )
        allocated_vcpu, memory_limit_bytes = _read_cloud_run_resource_allocation()
        memory_limit_gib = (
            float(memory_limit_bytes) / float(1024 ** 3)
            if memory_limit_bytes is not None
            else None
        )
        created_at = _datetime_value((job or {}).get("createdAt"))
        execution_telemetry = {
            "version": 1,
            "execution": execution_id,
            "taskAttempt": os.getenv("CLOUD_RUN_TASK_ATTEMPT") or "0",
            "runnerStartedAt": runner_started_at.isoformat(),
            "runnerCompletedAt": runner_completed_at.isoformat(),
            "runnerElapsedSeconds": round(runner_elapsed_seconds, 3),
            "workerElapsedSeconds": round(worker_elapsed_seconds, 3),
            "startupAndPublishOverheadSeconds": round(
                max(0.0, runner_elapsed_seconds - worker_elapsed_seconds),
                3,
            ),
            "renderedDurationSeconds": round(float(result.get("duration") or 0.0), 3),
            "workerRealtimeFactor": (
                round(worker_elapsed_seconds / max(float(result.get("duration") or 0.0), 0.001), 4)
                if float(result.get("duration") or 0.0) > 0.0
                else None
            ),
            "outputSizeBytes": output_size_bytes,
            "outputBytesPerRenderedSecond": (
                round(output_size_bytes / max(float(result.get("duration") or 0.0), 0.001), 3)
                if output_size_bytes is not None and float(result.get("duration") or 0.0) > 0.0
                else None
            ),
            "allocatedVcpu": allocated_vcpu,
            "memoryLimitBytes": memory_limit_bytes,
            "memoryLimitGiB": round(memory_limit_gib, 3) if memory_limit_gib is not None else None,
            "workerVcpuSeconds": round(worker_elapsed_seconds * allocated_vcpu, 3),
            "runnerVcpuSeconds": round(runner_elapsed_seconds * allocated_vcpu, 3),
            "workerGiBSeconds": (
                round(worker_elapsed_seconds * memory_limit_gib, 3)
                if memory_limit_gib is not None
                else None
            ),
            "runnerGiBSeconds": (
                round(runner_elapsed_seconds * memory_limit_gib, 3)
                if memory_limit_gib is not None
                else None
            ),
            "endToEndSeconds": (
                round(max(0.0, (runner_completed_at - created_at).total_seconds()), 3)
                if created_at is not None
                else None
            ),
            "dispatchToRunnerSeconds": (
                round(max(0.0, (runner_started_at - created_at).total_seconds()), 3)
                if created_at is not None
                else None
            ),
        }
        try:
            worker.update_firestore_job(
                job_id,
                {"executionTelemetry": execution_telemetry},
            )
        except Exception as telemetry_error:
            worker.logger.error(
                "Could not persist execution telemetry for %s: %s",
                job_id,
                telemetry_error,
            )

        _release_capacity(job_id, "completed")
        print(f"Multicam job {job_id} completed: {result.get('output_storage_path')}")
        return 0
    except Exception as error:
        message = _error_text(error)
        print(f"Multicam job {job_id} failed: {message}", file=sys.stderr)
        refundable = bool(job and job.get("creditReceipt") and not job.get("creditReceipt", {}).get("skipped"))
        attempt, max_retries = _task_retry_context()
        nonretryable = _is_nonretryable_render_error(error)
        terminal_attempt = nonretryable or attempt >= max_retries
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        retry_state = {
            "attempt": attempt,
            "maxRetries": max_retries,
            "terminal": terminal_attempt,
            "retryable": not nonretryable,
            "lastError": message,
            "updatedAt": now,
        }
        if not terminal_attempt:
            retry_state["nextAttempt"] = attempt + 1

        failure_update = {
            "status": "failed" if terminal_attempt else "retrying",
            "stage": (
                "durable_render_rejected"
                if nonretryable
                else "durable_render_failed"
                if terminal_attempt
                else "durable_render_retry_scheduled"
            ),
            "error": message,
            "refundRequired": refundable if terminal_attempt else False,
            "retryState": retry_state,
            "renderLease": {
                "execution": execution_id,
                "taskAttempt": str(attempt),
                ("failedAt" if terminal_attempt else "retryScheduledAt"): now,
            },
        }
        if terminal_attempt:
            failure_update["progress"] = 0
        else:
            failure_update["detail"] = (
                f"Render attempt {attempt + 1} failed; durable retry {attempt + 2} is scheduled"
            )
        try:
            worker.update_firestore_job(
                job_id,
                failure_update,
                critical=True,
                max_attempts=5,
            )
        except Exception as status_error:
            print(f"Critical failure status delivery also failed: {status_error}", file=sys.stderr)

        # Cloud Run will retry a nonterminal task attempt. Keep the job's
        # checkpoint objects, capacity reservation, and credit receipt intact so
        # that retry can resume instead of charging/refunding or competing for a
        # new slot. The API callback owns the idempotent refund, so it must only
        # run after the retry budget is exhausted.
        if terminal_attempt:
            if refundable:
                _notify_failure_callback(job_id, message, dispatch_token=dispatch_token)
            _release_capacity(job_id, "failed")
        return 1


if __name__ == "__main__":
    raise SystemExit(run())
