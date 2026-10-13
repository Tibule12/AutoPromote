"""Reject unsupported worker inputs at request parsing, before media ingestion."""
import pytest
from pydantic import ValidationError
from python_media_worker.main_media_server import RenderViralRequest

@pytest.mark.parametrize("mode", ["hue", "unknown"])
def test_unsupported_blend_cannot_become_a_worker_request(mode):
    with pytest.raises(ValidationError, match="blendMode"):
        RenderViralRequest(video_url="not-ingested", start_time=0, end_time=1,
                           overlays=[{"id":"title", "type":"text", "text":"MOVE", "x":50, "y":50, "blendMode":mode}])

@pytest.mark.parametrize("mode", ["normal", "multiply", "screen", "difference", "overlay", "soft-light", "hard-light", "color-dodge", "luminosity", None])
def test_supported_or_default_blend_preserves_the_worker_contract(mode):
    request = RenderViralRequest(video_url="not-ingested", start_time=0, end_time=1,
                                overlays=[{"id":"title", "type":"text", "text":"MOVE", "x":50, "y":50, "blendMode":mode}])
    assert request.overlays[0].blendMode == mode
