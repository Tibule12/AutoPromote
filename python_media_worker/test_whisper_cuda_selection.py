"""Exercise worker device and load decisions without importing cloud clients."""
import ast
import logging
import os
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import Mock, patch


SOURCE = Path(__file__).with_name("main_media_server.py")
FUNCTIONS = {"env_flag", "get_faster_whisper_device", "get_faster_whisper_compute_type", "get_faster_whisper_model"}


class WhisperCudaSelectionTests(unittest.TestCase):
    def setUp(self):
        tree = ast.parse(SOURCE.read_text())
        module = ast.Module(body=[node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in FUNCTIONS], type_ignores=[])
        self.runtime = {"os": os, "logger": logging.getLogger(__name__), "model_faster_whisper": {}, "FasterWhisperModel": Mock()}
        exec(compile(module, str(SOURCE), "exec"), self.runtime)
        self.env = patch.dict(os.environ, {}, clear=True)
        self.env.start()
        self.addCleanup(self.env.stop)

    def device(self):
        return self.runtime["get_faster_whisper_device"]()

    def test_cuda_without_torch_uses_the_actual_inference_backend(self):
        backend = types.SimpleNamespace(get_cuda_device_count=lambda: 1)
        with patch.dict(sys.modules, {"ctranslate2": backend, "torch": None}):
            self.assertEqual(self.device(), "cuda")

    def test_cpu_host_without_torch_keeps_cpu(self):
        backend = types.SimpleNamespace(get_cuda_device_count=lambda: 0)
        with patch.dict(sys.modules, {"ctranslate2": backend, "torch": None}):
            self.assertEqual(self.device(), "cpu")

    def test_explicit_device_wins_over_detection(self):
        backend = types.SimpleNamespace(get_cuda_device_count=Mock(side_effect=AssertionError("must not probe")))
        with patch.dict(sys.modules, {"ctranslate2": backend}), patch.dict(os.environ, {"FASTER_WHISPER_DEVICE": "cpu", "WHISPER_DEVICE": "cuda"}):
            self.assertEqual(self.device(), "cpu")

    def test_probe_failure_retains_torch_compatibility(self):
        backend = types.SimpleNamespace(get_cuda_device_count=Mock(side_effect=RuntimeError("driver unavailable")))
        torch = types.SimpleNamespace(cuda=types.SimpleNamespace(is_available=lambda: True))
        with patch.dict(sys.modules, {"ctranslate2": backend, "torch": torch}):
            self.assertEqual(self.device(), "cuda")

    def test_strict_gpu_load_error_never_returns_cpu(self):
        self.runtime["FasterWhisperModel"].side_effect = ValueError("unsupported precision")
        with patch.dict(os.environ, {"FASTER_WHISPER_DEVICE": "cuda", "FASTER_WHISPER_COMPUTE_TYPE": "float16", "FASTER_WHISPER_STRICT": "true"}):
            with self.assertRaisesRegex(ValueError, "unsupported precision"):
                self.runtime["get_faster_whisper_model"]("small")
        self.assertEqual(self.runtime["FasterWhisperModel"].call_count, 1)
        self.assertEqual(self.runtime["model_faster_whisper"], {})

    def test_optional_fallback_still_works_and_reuses_cached_model(self):
        cpu_model = object()
        self.runtime["FasterWhisperModel"].side_effect = [ValueError("unsupported precision"), cpu_model, ValueError("unsupported precision")]
        with patch.dict(os.environ, {"FASTER_WHISPER_DEVICE": "cuda", "FASTER_WHISPER_COMPUTE_TYPE": "float16"}):
            self.assertIs(self.runtime["get_faster_whisper_model"]("small"), cpu_model)
            self.assertIs(self.runtime["get_faster_whisper_model"]("small"), cpu_model)
        self.assertEqual(self.runtime["FasterWhisperModel"].call_args_list[1].kwargs, {"device": "cpu", "compute_type": "int8"})

    def test_successful_cuda_model_is_reused_without_reloading(self):
        gpu_model = self.runtime["FasterWhisperModel"].return_value
        with patch.dict(os.environ, {"FASTER_WHISPER_DEVICE": "cuda", "FASTER_WHISPER_COMPUTE_TYPE": "float16", "FASTER_WHISPER_STRICT": "true"}):
            self.assertIs(self.runtime["get_faster_whisper_model"]("small"), gpu_model)
            self.assertIs(self.runtime["get_faster_whisper_model"]("small"), gpu_model)
        self.runtime["FasterWhisperModel"].assert_called_once_with("small", device="cuda", compute_type="float16")


if __name__ == "__main__":
    unittest.main()
