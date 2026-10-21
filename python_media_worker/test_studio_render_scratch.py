import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from python_media_worker.studio_render_scratch import studio_render_scratch_directory


class StudioRenderScratchTests(unittest.TestCase):
    def test_default_keeps_existing_repository_tmp(self):
        worker = Path(__file__).resolve().parent
        with patch.dict(os.environ, {"MEDIA_WORKER_STUDIO_TMP_DIR": ""}):
            self.assertEqual(studio_render_scratch_directory(worker), str(worker.parent / "tmp"))

    def test_absolute_operator_directory_is_used_without_creating_it(self):
        with tempfile.TemporaryDirectory() as parent:
            target = str(Path(parent) / "private-render-scratch")
            with patch.dict(os.environ, {"MEDIA_WORKER_STUDIO_TMP_DIR": target}):
                self.assertEqual(studio_render_scratch_directory("/worker"), target)
                self.assertFalse(Path(target).exists())

    def test_relative_directory_is_rejected(self):
        with patch.dict(os.environ, {"MEDIA_WORKER_STUDIO_TMP_DIR": "../scratch"}):
            with self.assertRaisesRegex(ValueError, "absolute"):
                studio_render_scratch_directory("/worker")

    def test_filesystem_root_is_rejected(self):
        with patch.dict(os.environ, {"MEDIA_WORKER_STUDIO_TMP_DIR": "/"}):
            with self.assertRaisesRegex(ValueError, "root"):
                studio_render_scratch_directory("/worker")

    def test_existing_file_is_rejected(self):
        with tempfile.NamedTemporaryFile() as existing:
            with patch.dict(os.environ, {"MEDIA_WORKER_STUDIO_TMP_DIR": existing.name}):
                with self.assertRaisesRegex(ValueError, "directory"):
                    studio_render_scratch_directory("/worker")
