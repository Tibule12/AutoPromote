import base64
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import pytest

sys.path.insert(0, str(Path(__file__).parent))
from local_3d_transport import install_overlay_transport


def boundary(monkeypatch):
    monkeypatch.setenv("UNIFIED_CREDITS_PROJECT_ID", "demo-autopromote-credits")
    spec = importlib.util.spec_from_file_location("isolated_overlay", Path(__file__).parents[2] / "python_media_worker/studio_3d_overlay.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    install_overlay_transport(module, {"apiOrigin": "http://127.0.0.1:12345"})
    data = {"userId": "owner", "storagePath": "temp_studio_3d/owner/accepted-job/overlay.mov",
            "gatewayPath": "/api/credit-pilot/object/" + "a" * 64,
            "contentHash": hashlib.sha256(b"x" * 2000).hexdigest(), "size": 2000}
    return module, data


def item(data):
    payload = base64.urlsafe_b64encode(json.dumps(data).encode()).decode().rstrip("=")
    return {"id": "scene", "jobId": "accepted-job", "ownerUid": "owner", "startTime": 0,
            "duration": 2, "layerOrder": 50,
            "overlayUrl": "http://127.0.0.1:12345" + data["gatewayPath"] + "?cap=" + payload + "." + "b" * 43}


def test_preserves_canonical_timing_and_identity_guards(monkeypatch):
    module, data = boundary(monkeypatch)
    assert module.validate_resolved_overlays([item(data)]) == [item(data)]
    with pytest.raises(ValueError):
        module.validate_resolved_overlays([{**item(data), "duration": 20}])
    with pytest.raises(ValueError):
        module.validate_resolved_overlays([{**item(data), "script": "import os"}])


@pytest.mark.parametrize("field,value", [("userId", "other"), ("storagePath", "uploads/owner/source.mp4"), ("contentHash", "bad"), ("size", 300 * 1024**2)])
def test_rejects_unowned_or_unbounded_local_descriptors(monkeypatch, field, value):
    module, data = boundary(monkeypatch)
    data[field] = value
    with pytest.raises(ValueError):
        module.validate_resolved_overlays([item(data)])


def test_rejects_network_escape_and_nondemo_runtime(monkeypatch):
    module, data = boundary(monkeypatch)
    with pytest.raises(ValueError):
        module.validate_resolved_overlays([{**item(data), "overlayUrl": item(data)["overlayUrl"].replace("127.0.0.1", "example.com")}])
    monkeypatch.setenv("UNIFIED_CREDITS_PROJECT_ID", "production")
    with pytest.raises(ValueError):
        install_overlay_transport(module, {"apiOrigin": "http://127.0.0.1:12345"})
