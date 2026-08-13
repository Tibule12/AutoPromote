import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / ".github" / "workflows" / "deploy-cam-combiner.yml"


class CamCombinerReleaseContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workflow = WORKFLOW.read_text(encoding="utf-8")

    def test_release_covers_service_and_both_jobs(self):
        for component in (
            "cam-combiner-worker",
            "cam-combiner-render-fast-job",
            "cam-combiner-render-job",
        ):
            self.assertIn(component, self.workflow)

    def test_images_are_immutable_and_both_variants_are_built(self):
        self.assertIn("cam-combiner-worker-fast:${GITHUB_SHA}", self.workflow)
        self.assertIn("cam-combiner-worker:${GITHUB_SHA}", self.workflow)
        self.assertIn("Dockerfile.cam-combiner-fast", self.workflow)
        self.assertIn("Dockerfile.cam-combiner", self.workflow)

    def test_private_candidate_is_verified_before_promotion(self):
        self.assertIn("--no-allow-unauthenticated", self.workflow)
        self.assertIn("--no-traffic", self.workflow)
        health_index = self.workflow.index("Verify authenticated candidate health")
        jobs_index = self.workflow.index("Update job definitions without executing renders")
        promotion_index = self.workflow.index("Promote verified service revision")
        self.assertLess(health_index, jobs_index)
        self.assertLess(jobs_index, promotion_index)

    def test_deployment_never_executes_a_render_job(self):
        forbidden = "gcloud run jobs " + "execute"
        self.assertNotIn(forbidden, self.workflow)
        self.assertIn("--max-retries 0", self.workflow)

    def test_failed_release_restores_service_and_job_images(self):
        rollback_index = self.workflow.index(
            "Roll back all Cam Combiner components after failure"
        )
        rollback = self.workflow[rollback_index:]
        self.assertIn("PREVIOUS_REVISION", rollback)
        self.assertIn("PREVIOUS_FAST_IMAGE", rollback)
        self.assertIn("PREVIOUS_CAPTION_IMAGE", rollback)
        self.assertIn("gcloud run jobs update", rollback)
        self.assertIn("gcloud run services update-traffic", rollback)


if __name__ == "__main__":
    unittest.main()
