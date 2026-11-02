"""Real final audio must retain the source/master semantics used by preview."""
import asyncio
import shutil
from unittest.mock import patch

import numpy as np
import pytest

from python_media_worker import main_media_server as worker
from python_media_worker.test_studio_overlay_zero import run


def key(value):
    return [{"property": "volume", "time": 0, "value": value}]


@pytest.mark.parametrize("automation,expected", [
    ({"masterPodcast": key(200)}, 2),
    ({"originalAudio": key(150), "masterPodcast": key(200)}, 1.5),
    ({"originalAudio": [], "masterPodcast": key(40)}, .4),
])
def test_source_gain_and_master_fallback_survive_actual_encoding(tmp_path, automation, expected):
    source, delivery = tmp_path / "source.mp4", tmp_path / "final.mp4"
    run("-f", "lavfi", "-i", "color=blue:s=160x120:r=24:d=2",
        "-f", "lavfi", "-i", "sine=frequency=880:sample_rate=48000:duration=2",
        "-c:v", "libx264", "-threads", "1", "-c:a", "aac", "-b:a", "192k", "-n", str(source))

    async def materialize(_url, destination, **_kwargs):
        shutil.copyfile(source, destination)
        return destination

    def deliver(filename):
        shutil.copyfile(filename, delivery)
        return str(delivery)

    request = worker.RenderViralRequest(video_url="owned-source", start_time=0, end_time=2,
        smart_crop=False, auto_captions=False, professional_cleanup=False, brand_watermark=False,
        audio_restoration={"enabled": False}, audio_automation=automation,
        output_settings={"resolution": "source", "fps": "24"})
    with patch.object(worker, "materialize_video_input", materialize), \
            patch.object(worker, "upload_file_to_firebase", deliver):
        result = asyncio.run(worker.render_viral_clip(request))
    assert result["status"] == "completed"

    def rms(filename):
        raw = run("-i", str(filename), "-vn", "-ac", "1", "-ar", "48000", "-f", "f32le", "pipe:1")
        pcm = np.frombuffer(raw, "<f4")
        assert len(pcm) >= 96000
        return float(np.sqrt(np.mean(pcm[24000:72000] ** 2)))

    # The delivery is AAC, so use a declared 3% RMS allowance, never an exact
    # sample claim. This catches lost boosts and the wrong source/master bus.
    assert rms(delivery) / rms(source) == pytest.approx(expected, rel=.03)
