"""Dialogue restoration validation and actual production-render spectral proof."""
import asyncio
import shutil
import tempfile
from pathlib import Path
from unittest.mock import patch
import numpy as np
from python_media_worker import main_media_server as worker
from python_media_worker.studio_audio import build_dialogue_filter
from python_media_worker.test_studio_overlay_zero import run


def spectrum(path):
    pcm = np.frombuffer(run("-i", str(path), "-vn", "-ac", "1", "-ar", "48000", "-f", "f32le", "pipe:1"), "<f4")
    middle = pcm[24000:120000] * np.hanning(96000)
    values = np.abs(np.fft.rfft(middle))
    frequencies = np.fft.rfftfreq(len(middle), 1/48000)
    return lambda hz: values[np.argmin(abs(frequencies-hz))]


def test_restoration_filter_is_bounded_and_contains_every_requested_stage():
    graph, receipt = build_dialogue_filter({"preset": "invalid", "voiceIsolation": True,
        "denoise": 400, "deEsser": 35, "humFrequency": 60, "compressor": 55,
        "limiter": -20, "loudness": 0, "eq": {"low": -30, "mid": 3, "high": 99}})
    assert receipt == {"enabled": True, "preset": "natural", "voice_isolation": True,
        "denoise": 100, "de_esser": 35, "hum_frequency": 60, "compressor": 55,
        "limiter": -6, "loudness": -9, "eq": {"low": -12, "mid": 3, "high": 12}}
    for stage in ("highpass", "lowpass", "afftdn", "bandreject", "deesser", "equalizer", "acompressor", "loudnorm", "alimiter"):
        assert stage in graph
    assert build_dialogue_filter({"enabled": False})[0] == ""


def test_production_render_applies_hum_removal_and_returns_receipt():
    with tempfile.TemporaryDirectory(prefix="studio-dialogue-repair-") as temp:
        source, delivery = [Path(temp)/name for name in ("source.mp4", "delivery.mp4")]
        run("-f", "lavfi", "-i", "color=blue:s=160x120:r=10:d=3",
            "-f", "lavfi", "-i", "aevalsrc=0.28*sin(2*PI*50*t)+0.08*sin(2*PI*1000*t):s=48000:d=3",
            "-c:v", "libx264", "-threads", "1", "-c:a", "aac", "-b:a", "256k", "-n", str(source))
        settings = {"preset": "podcast", "voiceIsolation": False, "denoise": 0, "deEsser": 0,
            "humFrequency": 50, "compressor": 0, "limiter": -.5, "loudness": -14,
            "eq": {"low": 0, "mid": 0, "high": 0}}
        request = worker.RenderViralRequest(video_url="test-source", start_time=0, end_time=3,
            smart_crop=False, auto_captions=False, professional_cleanup=False, brand_watermark=False,
            audio_restoration=settings, output_settings={"resolution": "source", "fps": "30"})
        async def ingest(url, destination, **kwargs):
            shutil.copyfile(source, destination); return destination
        def deliver(path):
            shutil.copyfile(path, delivery); return str(delivery)
        with patch.object(worker, "materialize_video_input", ingest), patch.object(worker, "upload_file_to_firebase", deliver):
            result = asyncio.run(worker.render_viral_clip(request))
        before, after = spectrum(source), spectrum(delivery)
        assert after(50)/after(1000) < (before(50)/before(1000)) * .35
        assert result["audio_restoration"]["preset"] == "podcast"
        assert result["audio_restoration"]["limiter"] == -.5
