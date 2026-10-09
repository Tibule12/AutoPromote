"""CPU contract guards; these are distinct from the actual rendered proof."""
import hashlib
import json
from pathlib import Path
import sys

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import render


def test_packaged_logo_is_the_exact_existing_editable_geometry():
    root = Path(__file__).resolve().parents[2]
    original = root / 'assets/brand/autopromote-original-v1/logo-geometry.json'
    packaged = root / 'studio_3d_renderer/assets/autopromote-vector-logo.json'
    assert hashlib.sha256(original.read_bytes()).digest() == hashlib.sha256(packaged.read_bytes()).digest()
    geometry = json.loads(packaged.read_text())
    assert geometry['uniformScalingOnly'] is True
    assert geometry['wordmark']['text'] == 'AutoPromote'


def test_blender_script_failure_is_terminal_before_encoding(tmp_path, monkeypatch):
    calls = []
    def fail(command, **kwargs):
        calls.append(command)
        raise RuntimeError('Blender import failure')
    monkeypatch.setattr(render, 'run', fail)
    with pytest.raises(RuntimeError, match='Blender import failure'):
        render.render_files({'width': 320, 'height': 180, 'duration': 1, 'fps': 24}, tmp_path)
    assert len(calls) == 1
    index = calls[0].index('--python-exit-code')
    assert calls[0][index + 1] == '1'


def test_missing_picture_frames_are_terminal_before_encoding(tmp_path, monkeypatch):
    calls = []
    def incomplete(command, **kwargs):
        calls.append(command)
        # A zero process exit with an incomplete sequence used to reach FFmpeg.
        (tmp_path / 'frames/frame_0000.png').write_bytes(b'incomplete picture')
        return ''
    monkeypatch.setattr(render, 'run', incomplete)
    with pytest.raises(RuntimeError, match='complete requested frame sequence'):
        render.render_files({'width': 320, 'height': 180, 'duration': 1, 'fps': 24}, tmp_path)
    assert len(calls) == 1
