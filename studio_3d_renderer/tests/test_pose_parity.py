"""Shared numeric pose fixture for the browser model and Blender scene script.

The Blender Python module's pose function is pure. Loading it with a stub bpy
lets this contract run without Blender or a GPU; it does not prove pixel parity.
"""
import json
import math
import sys
import types
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "studio_3d_renderer"))
sys.modules.setdefault("bpy", types.ModuleType("bpy"))
from blender_scene import pose  # noqa: E402


def test_blender_pose_matches_browser_fixture():
    fixture_path = REPO_ROOT / "frontend/src/components/threeD/fixtures/pose-parity-v1.json"
    fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
    scene = fixture["scene"]
    for sample in fixture["samples"]:
        actual = pose(scene, sample["time"] - scene["startTime"])
        expected = sample["pose"]
        measured = dict(zip(("x", "y", "z"), actual["position"]))
        measured.update(dict(zip(("rotationX", "rotationY", "rotationZ"), actual["rotation"])))
        measured.update(scale=actual["scale"], opacity=actual["opacity"])
        for field, value in measured.items():
            assert math.isclose(value, expected[field], rel_tol=0, abs_tol=1e-10), (
                sample["time"], field, value, expected[field]
            )
