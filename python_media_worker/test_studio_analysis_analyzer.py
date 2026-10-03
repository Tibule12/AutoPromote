"""Staging analyzer accepts only signed, bounded Studio sources."""

import os
import unittest
from unittest.mock import patch

from studio_analysis_analyzer import validate_source_url, analyze_source


BUCKET = "autopromote-staging-2026.firebasestorage.app"
SIGNED = (f"https://storage.googleapis.com/{BUCKET}/studio/sources/test/video.mp4"
          "?X-Goog-Credential=studio%40autopromote-staging-2026.iam.gserviceaccount.com"
          "&X-Goog-Signature=test")
SIGNED_V2 = (f"https://storage.googleapis.com/{BUCKET}/studio/sources/test/video.mp4"
             "?GoogleAccessId=studio%40autopromote-staging-2026.iam.gserviceaccount.com"
             "&Expires=9999999999&Signature=test")


class AnalyzerTests(unittest.TestCase):
    def setUp(self):
        self.bucket = patch.dict(os.environ, {"FIREBASE_STORAGE_BUCKET": BUCKET})
        self.bucket.start()
        self.addCleanup(self.bucket.stop)

    def test_restricts_source_to_signed_staging_objects(self):
        self.assertEqual(validate_source_url(SIGNED), SIGNED)
        self.assertEqual(validate_source_url(SIGNED_V2), SIGNED_V2)
        for url in (SIGNED.replace(BUCKET, "autopromote-cc6d3.firebasestorage.app"),
                    SIGNED.replace("storage.googleapis.com", "example.com"),
                    SIGNED.replace("/studio/sources/", "/users/"),
                    SIGNED.split("?")[0],
                    SIGNED.replace("https:", "http:"),
                    SIGNED.replace("/test/video.mp4", "/../secret.mp4"),
                    SIGNED_V2.replace("autopromote-staging-2026.iam", "autopromote-cc6d3.iam")):
            with self.subTest(url=url), self.assertRaises(ValueError):
                validate_source_url(url)

    def test_rejects_wrong_mode_before_fetch(self):
        with patch("studio_analysis_analyzer.requests.get") as fetch:
            with self.assertRaises(ValueError):
                analyze_source({"video_url": SIGNED, "mode": "anchored",
                                "anchors": {"solo": {"x": 50, "y": 50}}})
            fetch.assert_not_called()


if __name__ == "__main__":
    unittest.main()
