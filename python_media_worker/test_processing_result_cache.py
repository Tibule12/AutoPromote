import concurrent.futures
import json
import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

from python_media_worker.processing_result_cache import cached_result


class ProcessingResultCacheTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.source = self.root / "source.wav"
        self.source.write_bytes(b"original speech bytes")
        self.env = patch.dict(os.environ, {"PROCESSING_RESULT_CACHE_DIR": str(self.root / "cache"),
            "PROCESSING_RESULT_CACHE_ENABLED": "true", "PROCESSING_RESULT_CACHE_TTL_SECONDS": "60",
            "PROCESSING_RESULT_CACHE_MAX_BYTES": "1048576"})
        self.env.start()
        self.addCleanup(self.env.stop)

    def call(self, identity=None, compute=None):
        return cached_result(self.source, identity or {"model": "full-quality", "words": True},
                             compute or (lambda: {"segments": [{"text": "original", "start": 1.21}]}))

    def test_exact_bytes_reuse_preserves_word_times_and_cannot_be_mutated_by_caller(self):
        first = self.call()
        first["segments"][0]["text"] = "mutated"
        self.assertEqual(self.call(compute=lambda: self.fail("duplicate inference")),
                         {"segments": [{"text": "original", "start": 1.21}]})

    def test_content_model_language_and_timing_changes_invalidate(self):
        self.call()
        for identity in [{"model": "other"}, {"language": "zu"}, {"words": False}]:
            self.assertEqual(self.call(identity, lambda: {"changed": True}), {"changed": True})
        self.source.write_bytes(b"changed generation with same path")
        self.assertEqual(self.call(compute=lambda: {"changed": True}), {"changed": True})

    def test_concurrent_identical_requests_execute_only_once(self):
        count = []
        def compute():
            count.append(1)
            time.sleep(.03)
            return {"words": [1, 2]}
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            values = list(pool.map(lambda _: self.call(compute=compute), range(4)))
        self.assertEqual(len(count), 1)
        self.assertTrue(all(value == values[0] for value in values))

    def test_expired_or_corrupt_results_are_recomputed(self):
        self.call()
        target = next((self.root / "cache").glob("*.json"))
        os.utime(target, (time.time() - 70,) * 2)
        self.assertEqual(self.call(compute=lambda: {"fresh": 1}), {"fresh": 1})
        target.write_text("not json")
        self.assertEqual(self.call(compute=lambda: {"fresh": 2}), {"fresh": 2})

    def test_failed_inference_never_creates_success_cache(self):
        def failure(): raise RuntimeError("inference failed")
        with self.assertRaisesRegex(RuntimeError, "inference failed"):
            self.call(compute=failure)
        self.assertFalse(list((self.root / "cache").glob("*.json")))

    def test_cache_bytes_stay_bounded_and_does_not_write_oversize(self):
        for i in range(5):
            self.call({"n": i}, lambda: {"text": "x" * 400000})
        self.assertLessEqual(sum(p.stat().st_size for p in (self.root / "cache").glob("*.json")), 1048576)
        self.call({"oversize": 1}, lambda: {"text": "x" * 1100000})
        self.assertLessEqual(sum(p.stat().st_size for p in (self.root / "cache").glob("*.json")), 1048576)

    def test_symlink_target_is_not_read_or_followed(self):
        self.call()
        target = next((self.root / "cache").glob("*.json"))
        outside = self.root / "unrelated.json"
        original = target.read_text()
        outside.write_text(original)
        target.unlink()
        target.symlink_to(outside)
        self.assertEqual(self.call(compute=lambda: {"safe": True}), {"safe": True})
        self.assertEqual(outside.read_text(), original)

    def test_opt_out_keeps_ordinary_inference(self):
        with patch.dict(os.environ, {"PROCESSING_RESULT_CACHE_ENABLED": "false"}):
            self.assertEqual(self.call(compute=lambda: {"uncached": True}), {"uncached": True})
        self.assertFalse((self.root / "cache").exists())


if __name__ == "__main__": unittest.main()
