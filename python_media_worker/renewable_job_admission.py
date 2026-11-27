"""Admission for the existing durable Cam runner; no new rendering engine.

Ledger records are written only by the trusted API. This claim does not replace
cloud IAM, byte/egress bounds or an image-specific production qualification.
"""
import datetime
import hashlib
import hmac
import json
import re


def renewable_claim(read, env, job_id, job, execution_id, now=None):
    receipt = job.get("creditReceipt") or {}
    if receipt.get("processingTokens") is not True:
        if env.get("PROCESSING_CONTRACT_VERSION"):
            raise RuntimeError("Renewable worker requires a renewable reservation")
        return None  # Existing legitimate legacy jobs retain their contract.
    if env.get("PROCESSING_CONTRACT_VERSION") != "renewable-cam-v1":
        raise RuntimeError("Renewable worker contract required")
    binding_id = env.get("PROCESSING_BINDING_ID", "")
    nonce = env.get("PROCESSING_DISPATCH_NONCE", "")
    if not re.fullmatch(r"[a-f0-9]{64}", binding_id) or not re.fullmatch(r"[a-f0-9]{48}", nonce):
        raise RuntimeError("Invalid renewable binding")
    if env.get("CLOUD_RUN_TASK_ATTEMPT") != "0" or not execution_id or execution_id == "unknown-execution":
        raise RuntimeError("Renewable task retries are prohibited")
    binding = read("processing_worker_bindings", binding_id)
    if (not binding or binding.get("state") != "dispatch_claimed" or
            binding.get("nativeJobId") != job_id or
            binding.get("userId") != job.get("userId") or
            binding.get("requestId") != receipt.get("requestId") or
            not hmac.compare_digest(str(binding.get("nonce", "")), nonce)):
        raise RuntimeError("Renewable reservation binding conflict")
    raw = binding.get("requestCanonicalJSON", "")
    if (hashlib.sha256(raw.encode()).hexdigest() != binding.get("requestDigest") or
            json.loads(raw) != job.get("multicamRequest")):
        raise RuntimeError("Renewable source/request changed after reservation")
    approved = read("processing_worker_qualifications", binding["qualificationId"])
    expiry = datetime.datetime.fromisoformat(str((approved or {}).get("expiresAt", "")).replace("Z", "+00:00"))
    now = now or datetime.datetime.now(datetime.timezone.utc)
    if (not approved.get("approved") or approved.get("profileDigest") != binding.get("profileDigest") or
            expiry.tzinfo is None or expiry <= now or approved.get("workerContract") != "renewable-cam-v1" or
            any(approved.get(key) is not True for key in ["sourceAndOutputBoundsVerified", "networkAndStorageBoundsVerified", "terminationAndHostLossVerified"])):
        raise RuntimeError("Production qualification missing or expired")
    claim = binding.get("workerClaim") or {}
    if claim and claim.get("execution") != execution_id:
        raise RuntimeError("Another execution already claimed this reservation")
    return {"bindingId": binding_id, "execution": execution_id, "taskAttempt": 0,
            "claimedAt": now.isoformat()}
