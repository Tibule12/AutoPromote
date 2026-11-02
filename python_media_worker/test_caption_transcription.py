import os
import unittest
from unittest.mock import patch
from python_media_worker.caption_transcription import caption_transcription_options


class CaptionTranscriptionTests(unittest.TestCase):
    @patch.dict(os.environ, {}, clear=True)
    def test_standard_speech_does_not_use_south_african_only_model(self):
        for language in ("auto", "en", "af"):
            with self.subTest(language=language):
                selected = caption_transcription_options(language)
                self.assertNotIn("swivuriso", selected["model_name"])
                self.assertEqual(selected["language"], None if language == "auto" else language)

    @patch.dict(os.environ, {}, clear=True)
    def test_south_african_languages_never_become_unsupported_decoder_tokens(self):
        for language in ("xh", "zu", "st", "tn", "ts", "nr", "ve", "za-mixed"):
            with self.subTest(language=language):
                self.assertEqual(caption_transcription_options(language),
                    {"model_name":"digiphyte/swivuriso-turbo", "language":None})

    @patch.dict(os.environ, {}, clear=True)
    def test_translation_uses_a_translation_capable_checkpoint(self):
        self.assertEqual(caption_transcription_options("en", translate_to_english=True),
                         {"model_name":"small", "language":"en"})

    @patch.dict(os.environ, {"VIRAL_CAPTION_WHISPER_MODEL":"/Pinned/CaptionModel"}, clear=True)
    def test_operator_pinned_checkpoint_retains_case(self):
        self.assertEqual(caption_transcription_options("auto")["model_name"], "/Pinned/CaptionModel")

    def test_unsupported_translation_is_not_mislabeled_as_english(self):
        with self.assertRaisesRegex(ValueError, "translation is unavailable"):
            caption_transcription_options("xh", translate_to_english=True)

    def test_unknown_selection_is_rejected_instead_of_silently_mislabelling_speech(self):
        with self.assertRaises(ValueError):
            caption_transcription_options("unsupported")
