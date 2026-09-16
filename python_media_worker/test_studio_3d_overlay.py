import pytest

from studio_3d_overlay import validate_resolved_overlays


def item():
    return {
        "id": "studio-3d-1", "jobId": "12345678-job", "ownerUid": "owner_123",
        "startTime": 3, "duration": 5, "layerOrder": 50,
        "overlayUrl": "https://storage.googleapis.com/autopromote-bucket/temp_studio_3d/owner_123/12345678-job/overlay.mov?X-Goog-Signature=abc",
    }


def test_accepts_owned_signed_overlay():
    assert validate_resolved_overlays([item()])[0]["startTime"] == 3


@pytest.mark.parametrize("url", [
    "http://storage.googleapis.com/bucket/temp_studio_3d/owner_123/12345678-job/overlay.mov?x=1",
    "https://127.0.0.1/bucket/temp_studio_3d/owner_123/12345678-job/overlay.mov?x=1",
    "https://storage.googleapis.com/bucket/temp_studio_3d/other/12345678-job/overlay.mov?x=1",
    "https://storage.googleapis.com/bucket/temp_studio_3d/owner_123/12345678-job/../../secret.mov?x=1",
    "https://storage.googleapis.com/bucket/temp_studio_3d/owner_123/12345678-job/overlay.mov",
])
def test_rejects_untrusted_url(url):
    with pytest.raises(ValueError):
        validate_resolved_overlays([{**item(), "overlayUrl": url}])


def test_rejects_oversized_timing_and_command_fields():
    with pytest.raises(ValueError):
        validate_resolved_overlays([{**item(), "duration": float("nan")}])
    with pytest.raises(ValueError):
        validate_resolved_overlays([{**item(), "command": "rm -rf /"}])
