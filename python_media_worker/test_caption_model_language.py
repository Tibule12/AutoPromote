"""Offline model-card metadata boundary; real inference is tested separately."""
import ast
import os
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch


SOURCE = Path(__file__).with_name("main_media_server.py")


class CaptionModelLanguageTests(unittest.TestCase):
    def setUp(self):
        names = {"transcription_model_has_unmapped_languages", "transcribe_with_hints"}
        tree = ast.parse(SOURCE.read_text())
        module = ast.Module(body=[n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in names], type_ignores=[])
        self.runtime = {"os": os}
        exec(compile(module, str(SOURCE), "exec"), self.runtime)

    def test_local_pinned_model_card_has_no_reliable_decoder_language(self):
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, "README.md").write_text("Swivuriso: faster-whisper's language set does not include these seven languages")
            self.assertTrue(self.runtime["transcription_model_has_unmapped_languages"](directory))

    def test_standard_whisper_models_keep_language_detection(self):
        self.assertFalse(self.runtime["transcription_model_has_unmapped_languages"]("large-v3-turbo"))

    def test_decoder_token_cannot_become_a_spoken_language_label(self):
        for model_name, expected in [("digiphyte/swivuriso-turbo", None), ("large-v3-turbo", "en")]:
            with self.subTest(model=model_name):
                info = types.SimpleNamespace(language="en", language_probability=.99, duration=2)
                model = types.SimpleNamespace(transcribe=lambda *a, **kw: ([], info))
                self.runtime.update({
                    "normalize_transcription_language": lambda v: None,
                    "get_transcription_engine": lambda: "faster",
                    "build_transcription_prompt": lambda v: v,
                    "get_faster_whisper_model": lambda **kw: model,
                    "env_flag": lambda *a, **kw: False,
                    "whisper": None,
                })
                result = self.runtime["transcribe_with_hints"]("test.wav", model_name=model_name)
                self.assertEqual(result["language"], expected)
                self.assertEqual(result["decoder_language"], "en")
                self.assertEqual(result["language_probability"], .99)


if __name__ == "__main__":
    unittest.main()
