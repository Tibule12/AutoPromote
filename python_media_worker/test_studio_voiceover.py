"""Actual rendered speech-lane timing, trim, pitch, long takes and zero gain."""
import asyncio
import shutil
import tempfile
from pathlib import Path
from unittest.mock import patch
import numpy as np
import pytest
from python_media_worker import main_media_server as worker
from python_media_worker.test_studio_overlay_zero import run
from python_media_worker.viral_motion_graphics import validate_design


@pytest.mark.parametrize("speed,volume", [(1, .6), (2, .6), ("ramp", .6), (1, 0)])
def test_voiceover_survives_production_render_with_pitch_and_full_length(speed, volume):
    with tempfile.TemporaryDirectory(prefix="studio-voiceover-") as temp:
        source, take, delivery = [Path(temp)/name for name in ["source.mp4", "take.wav", "delivery.mp4"]]
        run("-f", "lavfi", "-i", "color=blue:s=160x120:r=10:d=24", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
            "-t", "24", "-c:v", "libx264", "-threads", "1", "-c:a", "aac", "-n", str(source))
        run("-f", "lavfi", "-i", "aevalsrc=0.12*sin(2*PI*if(lt(t\\,1)\\,440\\,880)*t):s=48000:d=21", "-n", str(take))
        request = worker.RenderViralRequest(video_url="test-source", start_time=0, end_time=24,
            smart_crop=False, auto_captions=False, professional_cleanup=False, brand_watermark=False,
            preview_speed=1 if speed == "ramp" else speed,
            speed_segments=[{"start_time": 0, "end_time": 12, "rate": 1}, {"start_time": 12, "end_time": 24, "rate": 2}] if speed == "ramp" else [],
            output_settings={"resolution": "source", "fps": "30"},
            sound_effects=[worker.ViralSoundEffect(id="voice", kind="voiceover", url="test-take", startTime=2,
                duration=20, trimStart=1, volume=volume, fadeIn=0, fadeOut=0)])
        async def ingest(url, destination, **kwargs):
            assert url in {"test-source", "test-take"}
            shutil.copyfile(source if url == "test-source" else take, destination)
            return destination
        def deliver(path):
            shutil.copyfile(path, delivery)
            return str(delivery)
        with patch.object(worker, "materialize_video_input", ingest), patch.object(worker, "materialize_audio_input", ingest), \
             patch.object(worker, "upload_file_to_firebase", deliver):
            result = asyncio.run(worker.render_viral_clip(request))
        def clock(t):
            return (t if t <= 12 else 12+(t-12)/2) if speed == "ramp" else t/speed
        assert result["status"] == "completed"
        assert abs(result["duration"]-clock(24)) < .1
        pcm = np.frombuffer(run("-i", str(delivery), "-vn", "-ac", "1", "-ar", "48000", "-f", "f32le", "pipe:1"), "<f4")
        for first, last, audible in [(.2, 1.5, False), (3, 4, True), (19, 20, True), (22.5, 23.5, False)]:
            window = pcm[int(clock(first)*48000):int(clock(last)*48000)]
            rms = np.sqrt(np.mean(window**2))
            assert rms > .025 if audible and volume else rms < .001, (speed, volume, first, rms)
            if audible and volume:
                spectrum = np.abs(np.fft.rfft(window * np.hanning(len(window))))
                peak = np.fft.rfftfreq(len(window), 1/48000)[np.argmax(spectrum)]
                assert abs(peak-880) < 5, (speed, first, peak)


def test_only_recorded_voiceover_can_exceed_the_sfx_duration_limit():
    _, effects = validate_design(None, [{"kind": "voiceover", "url": "test", "duration": 60}, {"url": "test", "duration": 60}])
    assert [e["duration"] for e in effects] == [60, 15]
    with pytest.raises(ValueError, match="recorded audio"):
        validate_design(None, [{"kind": "voiceover", "builtIn": True, "tone": "pop"}])
