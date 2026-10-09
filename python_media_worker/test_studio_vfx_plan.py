"""Real pixel, identity and clock checks for cached subject-aware compositing."""
import copy
import json
from pathlib import Path
import subprocess

import numpy as np
from PIL import Image
import pytest

from python_media_worker.studio_subject_matte import CachedSubjectMatte, canonical_hash, sha256, mask_geometry
from python_media_worker.studio_vfx_plan import VfxFrameRenderer, render_vfx, validate_plan


@pytest.fixture
def source_cache(tmp_path):
    source = tmp_path / "source.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=navy:s=128x72:r=2:d=1",
                    "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-c:v", "libx264", "-c:a", "aac", "-t", "1", str(source)], check=True)
    directory = tmp_path / "matte"
    directory.mkdir()
    alpha = np.zeros((72, 128), dtype=np.uint8)
    alpha[:, 64:] = 255
    prompt = {"version": 1, "source_sha256": sha256(source), "points": [[90, 35]], "labels": [1]}
    rows = []
    for index in range(2):
        name = f"matte_{index:04d}.png"
        Image.fromarray(alpha).save(directory / name)
        rows.append({"index": index, "time": index / 2, "file": name, "sha256": sha256(directory / name), **mask_geometry(alpha)})
    manifest = {"version": 1, "kind": "source_bound_subject_matte", "source_sha256": sha256(source), "width": 128, "height": 72,
                "fps": 2, "fps_fraction": "2/1", "frame_count": 2, "prompt": prompt, "prompt_sha256": canonical_hash(prompt),
                "frames": rows, "shot_cuts": [], "quality_warnings": [], "quality": "Internal pixel regression fixture"}
    (directory / "manifest.json").write_text(json.dumps(manifest))
    return source, directory, CachedSubjectMatte(directory, source)


def plan(cache):
    return {"version": 1, "source_sha256": cache.manifest["source_sha256"], "matte_sha256": cache.artifact_sha256,
            "effects": [{"id": "text", "type": "text_behind", "start": 0, "end": 1, "text": "STORIES", "x": 50, "y": 50, "font_size": 30, "color": "#ffffff"}]}


def test_text_changes_background_while_subject_pixels_remain_exact(source_cache):
    _, _, cache = source_cache
    frame = Image.new("RGB", (128, 72), "navy")
    original = np.array(frame)
    output = np.array(VfxFrameRenderer(plan(cache), cache).render(frame, 1))
    assert np.array_equal(output[:, 64:], original[:, 64:])
    assert np.count_nonzero(output[:, :64] != original[:, :64]) > 100


def test_graded_kinetic_type_preserves_subject_and_renders_deterministically(source_cache):
    _, _, cache = source_cache
    command = plan(cache)
    command["effects"] = [
        {"id": "grade", "type": "background_grade", "start": 0, "end": 1, "exposure": -1, "saturation": .4, "contrast": 1.1},
        {"id": "title", "type": "kinetic_type", "start": 0, "end": 1, "text": "VOICE", "x": 5, "y": 50,
         "font_size": 24, "color": "#eeeeee", "tracking": 1, "travel": 20, "align": "left"}]
    frame = Image.new("RGB", (128, 72), "navy")
    renderer = VfxFrameRenderer(command, cache)
    first, second = np.array(renderer.render(frame, 1)), np.array(renderer.render(frame, 1))
    assert np.array_equal(first, second)
    assert np.array_equal(first[:, 64:], np.array(frame)[:, 64:])
    assert np.count_nonzero(first[:, :64] != np.array(frame)[:, :64]) > 100


def test_preview_and_final_reuse_identical_pixels_clock_and_audio(source_cache, tmp_path):
    source, matte, cache = source_cache
    first = render_vfx(source, matte, plan(cache), tmp_path / "preview.mp4", encoder="cpu")
    second = render_vfx(source, matte, plan(cache), tmp_path / "final.mp4", encoder="cpu")
    assert first["pixel_sha256"] == second["pixel_sha256"]
    assert first["matte_sha256"] == second["matte_sha256"]
    assert first["frames"] == second["frames"] == 2
    assert first["encoder"] == second["encoder"] == "libx264"
    assert any(stream["codec_type"] == "audio" for stream in first["probe"]["streams"])


def test_changed_source_and_changed_mask_are_rejected(source_cache, tmp_path):
    source, matte, cache = source_cache
    other = tmp_path / "other.mp4"
    other.write_bytes(source.read_bytes() + b"different-source")
    with pytest.raises(ValueError, match="different source"):
        CachedSubjectMatte(matte, other)
    Image.new("L", (128, 72), 0).save(matte / "matte_0001.png")
    with pytest.raises(ValueError, match="hash"):
        cache.frame(1)


def test_incomplete_clock_and_path_traversal_are_rejected(source_cache):
    source, matte, cache = source_cache
    changed = copy.deepcopy(cache.manifest)
    changed["frames"][0]["file"] = "../matte_0000.png"
    (matte / "manifest.json").write_text(json.dumps(changed))
    with pytest.raises(ValueError, match="path"):
        CachedSubjectMatte(matte, source)
    changed = copy.deepcopy(cache.manifest)
    changed["frames"][1]["time"] = .4
    (matte / "manifest.json").write_text(json.dumps(changed))
    with pytest.raises(ValueError, match="timestamp"):
        CachedSubjectMatte(matte, source)


@pytest.mark.parametrize("change", [
    {"type": "run_user_code"}, {"font_size": float("nan")}, {"end": 3},
    {"shell": "not allowed"}, {"text": "bad\ncommand"},
])
def test_unbounded_or_unknown_commands_are_rejected(source_cache, change):
    _, _, cache = source_cache
    command = plan(cache)
    command["effects"][0].update(change)
    with pytest.raises(ValueError):
        validate_plan(command, cache)


def test_screen_assets_require_an_approved_resolver(source_cache):
    _, _, cache = source_cache
    command = plan(cache)
    command["effects"] = [{"id": "screen", "type": "screen_replace", "start": 0, "end": 1, "asset_id": "owned-asset",
                           "asset_sha256": "0" * 64, "corners": [[1, 1], [60, 1], [60, 60], [1, 60]]}]
    with pytest.raises(ValueError, match="approved asset resolver"):
        VfxFrameRenderer(command, cache)


def test_reviewed_moving_background_replaces_only_background_pixels(source_cache, tmp_path):
    _, _, cache = source_cache
    asset = tmp_path / "background.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=purple:s=128x72:r=2:d=1", "-c:v", "libx264", str(asset)], check=True)
    command = plan(cache)
    command["effects"] = [{"id": "stage", "type": "background_replace", "start": 0, "end": 1, "asset_id": "reviewed-stage",
                           "asset_sha256": sha256(asset), "blur": 2, "exposure": -.5, "saturation": .7}]
    renderer = VfxFrameRenderer(command, cache, lambda asset_id: asset if asset_id == "reviewed-stage" else None)
    original = Image.new("RGB", (128, 72), "navy")
    first = np.array(renderer.render(original, 1))
    assert np.array_equal(first[:, 64:], np.array(original)[:, 64:])
    assert np.count_nonzero(first[:, :64] != np.array(original)[:, :64]) > 100
    assert np.array_equal(first, np.array(renderer.render(original, 1)))
    asset.write_bytes(asset.read_bytes() + b"changed")
    with pytest.raises(ValueError, match="hash"):
        VfxFrameRenderer(command, cache, lambda _asset_id: asset)
