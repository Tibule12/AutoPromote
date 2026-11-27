import copy
import datetime
import hashlib
import json
import unittest
from renewable_job_admission import renewable_claim


class RenewableAdmissionTests(unittest.TestCase):
    def fixture(self):
        request = {"sources": [{"url": "owned-a"}, {"url": "owned-b"}]}
        raw = json.dumps(request, sort_keys=True, separators=(",", ":"))
        binding = {"state": "dispatch_claimed", "nativeJobId": "native-job", "userId": "owner", "requestId": "request", "nonce": "b"*48,
                   "requestCanonicalJSON": raw, "requestDigest": hashlib.sha256(raw.encode()).hexdigest(), "qualificationId": "qualification", "profileDigest": "profile"}
        approval = {"approved": True, "profileDigest": "profile", "expiresAt": "2030-01-01T00:00:00Z", "workerContract": "renewable-cam-v1",
                    "sourceAndOutputBoundsVerified": True, "networkAndStorageBoundsVerified": True, "terminationAndHostLossVerified": True}
        records = {("processing_worker_bindings", "a"*64): binding, ("processing_worker_qualifications", "qualification"): approval}
        env = {"PROCESSING_CONTRACT_VERSION": "renewable-cam-v1", "PROCESSING_BINDING_ID": "a"*64, "PROCESSING_DISPATCH_NONCE": "b"*48, "CLOUD_RUN_TASK_ATTEMPT": "0"}
        job = {"userId": "owner", "multicamRequest": request, "creditReceipt": {"processingTokens": True, "requestId": "request"}}
        return records, env, job

    def test_owned_immutable_request_claims_and_legacy_jobs_keep_existing_contract(self):
        records, env, job = self.fixture()
        claim = renewable_claim(lambda c, k: records[(c, k)], env, "native-job", job, "execution")
        self.assertEqual(claim["execution"], "execution")
        self.assertIsNone(renewable_claim(lambda *_: self.fail("Legacy job queried new ledger"), {}, "legacy", {"creditReceipt": {}}, "old-execution"))

    def test_retries_changed_source_nonce_owner_and_competing_execution_refuse(self):
        for change in [lambda r,e,j: e.update(CLOUD_RUN_TASK_ATTEMPT="1"), lambda r,e,j: e.update(PROCESSING_DISPATCH_NONCE="c"*48),
                       lambda r,e,j: j.update(userId="other"), lambda r,e,j: j["multicamRequest"].update(sources=[]),
                       lambda r,e,j: r[("processing_worker_bindings", "a"*64)].update(workerClaim={"execution": "other"}),
                       lambda r,e,j: r[("processing_worker_qualifications", "qualification")].update(networkAndStorageBoundsVerified=False)]:
            records, env, job = copy.deepcopy(self.fixture())
            change(records, env, job)
            with self.assertRaises((RuntimeError, ValueError)):
                renewable_claim(lambda c,k: records[(c,k)], env, "native-job", job, "execution")


if __name__ == "__main__":
    unittest.main()
