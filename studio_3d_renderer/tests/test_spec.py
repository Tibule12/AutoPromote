import copy
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from spec import validate_spec


def sample_spec():
    return {
        "version": 1, "ownerUid": "qa_user_123", "mode": "preview", "width": 320,
        "height": 180, "fps": 12, "duration": 1,
        "scene": {
            "version": 1, "id": "studio-3d-demo", "template": "neon_logo", "name": "Logo reveal",
            "text": "AutoPromote", "secondary": "CREATE WHAT MOVES PEOPLE",
            "startTime": 3, "duration": 5, "endTime": 8, "layerOrder": 50,
            "assetUrl": "", "assetStoragePath": "", "assetName": "",
            "fontFamily": "studio", "fontWeight": "bold", "textAlign": "center", "lineSpacing": 1,
            "material": "neon", "primaryColor": "#a855f7", "secondaryColor": "#e8ecff", "glowColor": "#a855f7",
            "extrusionDepth": .28, "bevel": .04, "x": 50, "y": 50, "z": 0, "scale": 1,
            "rotationX": 0, "rotationY": 0, "rotationZ": 0,
            "entrance": "orbit", "hold": "float", "exit": "fade", "easing": "ease_out",
            "intensity": .65, "audioReactiveIntensity": 0, "cameraMotion": .28,
            "focalLength": 50, "lightDirection": 35, "lightColor": "#ffffff", "lightIntensity": 2.2,
            "shadows": True, "reflections": True, "bloom": .7, "background": "transparent", "enabled": True,
            "quality": "preview", "hqPreviewUrl": "", "hqPreviewRevision": "",
        },
    }


def test_accepts_bounded_preview():
    assert validate_spec(sample_spec())["scene"]["template"] == "neon_logo"


@pytest.mark.parametrize("template", ["cinematic_title", "neon_logo", "chrome_lyric", "audio_reactive_text", "floating_callout", "impact_explosion", "speaker_intro", "comparison_card"])
def test_all_templates(template):
    spec = sample_spec()
    spec["scene"]["template"] = template
    assert validate_spec(spec)["scene"]["template"] == template


@pytest.mark.parametrize("field,value", [
    ("template", "../evil.py"), ("text", "bad\ncommand"), ("material", "$(touch /tmp/pwned)"),
    ("assetStoragePath", "../../secret"), ("assetStoragePath", "temp_studio_3d/other_user/12345678-job/asset.png"),
    ("assetStoragePath", "temp_studio_3d/qa_user_123/12345678-job/../secret.png"),
    ("primaryColor", "red; rm -rf /"), ("duration", float("nan")),
    ("endTime", 9), ("shadows", "false"),
])
def test_rejects_malformed_or_unsafe_scene(field, value):
    spec = sample_spec()
    spec["scene"][field] = value
    with pytest.raises(ValueError):
        validate_spec(spec)


def test_rejects_unknown_fields_and_large_work():
    spec = sample_spec()
    spec["scene"]["script"] = "import os"
    with pytest.raises(ValueError):
        validate_spec(spec)
    spec = sample_spec()
    spec["width"] = 4096
    with pytest.raises(ValueError):
        validate_spec(spec)
    spec = sample_spec()
    spec["duration"] = 100
    with pytest.raises(ValueError):
        validate_spec(spec)


def test_owned_image_path_required_for_uploaded_art():
    spec = sample_spec()
    spec["scene"]["assetUrl"] = "blob:local-only"
    with pytest.raises(ValueError):
        validate_spec(spec)
    spec["scene"]["assetStoragePath"] = "temp_studio_3d/qa_user_123/12345678-job/asset.png"
    assert validate_spec(spec) is spec


def test_accepts_bounded_pose_keyframes_and_rejects_injection_fields():
    spec = sample_spec()
    spec["scene"]["keyframes"] = [{
        "id": "pose-1", "time": 4, "easing": "ease_in_out",
        "values": {"x": 60, "y": 42, "z": .2, "scale": 1.1,
                   "rotationX": 0, "rotationY": 18, "rotationZ": -4},
    }]
    assert validate_spec(spec)["scene"]["keyframes"][0]["time"] == 4
    unsafe = copy.deepcopy(spec)
    unsafe["scene"]["keyframes"][0]["command"] = "$(touch /tmp/pwned)"
    with pytest.raises(ValueError):
        validate_spec(unsafe)
