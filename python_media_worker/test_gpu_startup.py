"""GPU candidates must execute inference and encoding before becoming ready."""
import ast
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock


class GpuStartupTests(unittest.TestCase):
    def setUp(self):
        source = Path(__file__).with_name("main_media_server.py")
        tree = ast.parse(source.read_text())
        function = next(n for n in tree.body if isinstance(n, ast.FunctionDef)
                        and n.name == "verify_required_gpu_runtime")
        function.decorator_list = []
        self.model = Mock()
        self.model.transcribe.return_value = (iter([]), None)
        self.runtime = {
            "env_flag": Mock(return_value=True),
            "get_faster_whisper_device": Mock(return_value="cuda"),
            "GPU_VIDEO_ENCODER": "h264_nvenc",
            "get_faster_whisper_model": Mock(return_value=self.model),
            "os": SimpleNamespace(getenv=lambda _: None),
            "np": SimpleNamespace(zeros=lambda *a, **k: "one-second-audio", float32="float32"),
            "logger": Mock(),
        }
        exec(compile(ast.Module(body=[function], type_ignores=[]), str(source), "exec"), self.runtime)

    def check(self):
        self.runtime["verify_required_gpu_runtime"]()

    def test_cpu_revisions_do_not_load_models_at_startup(self):
        self.runtime["env_flag"].return_value = False
        self.check()
        self.runtime["get_faster_whisper_model"].assert_not_called()

    def test_gpu_candidate_rejects_cpu_or_missing_nvenc(self):
        for device, encoder in [("cpu", "h264_nvenc"), ("cuda", "libx264")]:
            self.runtime["get_faster_whisper_device"].return_value = device
            self.runtime["GPU_VIDEO_ENCODER"] = encoder
            with self.assertRaisesRegex(RuntimeError, "requires CUDA"):
                self.check()

    def test_cuda_inference_is_consumed_before_readiness(self):
        def unsupported_kernel():
            raise RuntimeError("unsupported CUDA kernel")
            yield
        self.model.transcribe.return_value = (unsupported_kernel(), None)
        with self.assertRaisesRegex(RuntimeError, "unsupported CUDA kernel"):
            self.check()
        self.model.transcribe.assert_called_once_with(
            "one-second-audio", language="en", beam_size=1, vad_filter=False)

    def test_working_gpu_passes_inference_and_reuses_the_general_model(self):
        self.check()
        self.runtime["get_faster_whisper_model"].assert_called_once_with(
            "deepdml/faster-whisper-large-v3-turbo-ct2")
        self.runtime["logger"].warning.assert_called_once()
