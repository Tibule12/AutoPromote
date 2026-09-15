"""Real render checks for timeline audio automation and track mute/solo."""
import asyncio
import shutil
import subprocess
import tempfile
from pathlib import Path
from unittest.mock import patch
import numpy as np
from python_media_worker import main_media_server as worker
from python_media_worker.studio_audio import audio_track_audible, build_volume_filter
from python_media_worker.test_studio_overlay_zero import run


def test_track_solo_and_envelope_contract():
    states = {"music": {"solo": True}, "sfx": {"solo": True}, "voiceover": {"muted": True}}
    assert audio_track_audible(states, "music")
    assert audio_track_audible(states, "sfx")
    assert not audio_track_audible(states, "voiceover")
    assert not audio_track_audible(states, "originalAudio")
    graph, points = build_volume_filter([
        {"property": "volume", "time": 0, "value": 0, "easing": "linear"},
        {"property": "volume", "time": 1, "value": 100, "easing": "linear"},
        {"property": "volume", "time": 2, "value": 0, "easing": "linear"},
    ], 3)
    assert "eval=frame" in graph and len(points) == 17


def test_main_audio_automation_changes_real_output_and_muted_track_exports_silence():
    with tempfile.TemporaryDirectory(prefix="studio-audio-envelope-") as temp:
        source = Path(temp)/"source.mp4"
        run("-f", "lavfi", "-i", "color=blue:s=160x120:r=10:d=3", "-f", "lavfi", "-i",
            "sine=frequency=880:sample_rate=48000:duration=3", "-c:v", "libx264", "-threads", "1",
            "-c:a", "aac", "-b:a", "192k", "-n", str(source))

        async def ingest(url, destination, **kwargs):
            shutil.copyfile(source, destination); return destination

        def render(name, states):
            delivery = Path(temp)/name
            request = worker.RenderViralRequest(video_url="test-source", start_time=0, end_time=3,
                smart_crop=False, auto_captions=False, professional_cleanup=False, brand_watermark=False,
                audio_track_states=states, audio_automation={"originalAudio": [
                    {"property": "volume", "time": 0, "value": 0, "easing": "linear"},
                    {"property": "volume", "time": 1.5, "value": 100, "easing": "linear"},
                    {"property": "volume", "time": 3, "value": 0, "easing": "linear"}]},
                output_settings={"resolution": "source", "fps": "30"})
            def deliver(path): shutil.copyfile(path, delivery); return str(delivery)
            with patch.object(worker, "materialize_video_input", ingest), patch.object(worker, "upload_file_to_firebase", deliver):
                result = asyncio.run(worker.render_viral_clip(request))
            return delivery, result

        automated, receipt = render("automated.mp4", {})
        pcm = np.frombuffer(run("-i", str(automated), "-vn", "-ac", "1", "-ar", "48000", "-f", "f32le", "pipe:1"), "<f4")
        rms = lambda first, last: np.sqrt(np.mean(pcm[int(first*48000):int(last*48000)]**2))
        assert rms(1.25, 1.75) > rms(.05, .25) * 3
        assert rms(1.25, 1.75) > rms(2.75, 2.95) * 3
        assert "originalAudio" in receipt["audio_automation"]

        muted, receipt = render("muted.mp4", {"originalAudio": {"muted": True}})
        result = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index",
            "-of", "csv=p=0", str(muted)], capture_output=True, text=True, check=True)
        assert not result.stdout.strip()
        assert receipt["audio_proof"]["expected"] is False


def test_voiceover_solo_removes_source_and_sfx_from_the_native_mix():
    with tempfile.TemporaryDirectory(prefix="studio-audio-solo-") as temp:
        directory = Path(temp)
        source, sfx, voice, delivery = [directory/name for name in
            ("source.mp4", "sfx.wav", "voice.wav", "delivery.mp4")]
        run("-f", "lavfi", "-i", "color=blue:s=160x120:r=10:d=2", "-f", "lavfi", "-i",
            "sine=frequency=220:sample_rate=48000:duration=2", "-c:v", "libx264", "-threads", "1",
            "-c:a", "aac", "-n", str(source))
        run("-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=2", "-n", str(sfx))
        run("-f", "lavfi", "-i", "sine=frequency=880:sample_rate=48000:duration=2", "-n", str(voice))
        request = worker.RenderViralRequest(video_url="source", start_time=0, end_time=2,
            smart_crop=False, auto_captions=False, professional_cleanup=False, brand_watermark=False,
            audio_track_states={"voiceover": {"solo": True}},
            audio_automation={"voiceover": [{"property": "volume", "time": 0, "value": 25}]},
            sound_effects=[
                worker.ViralSoundEffect(id="sfx", url="sfx", duration=2, fadeIn=0, fadeOut=0),
                worker.ViralSoundEffect(id="voice", kind="voiceover", url="voice", duration=2, fadeIn=0, fadeOut=0)],
            output_settings={"resolution": "source", "fps": "30"})
        async def materialize(url, destination, **kwargs):
            shutil.copyfile({"source": source, "sfx": sfx, "voice": voice}[url], destination)
            return destination
        def deliver(path): shutil.copyfile(path, delivery); return str(delivery)
        with patch.object(worker, "materialize_video_input", materialize), \
             patch.object(worker, "materialize_audio_input", materialize), \
             patch.object(worker, "upload_file_to_firebase", deliver):
            result = asyncio.run(worker.render_viral_clip(request))
        pcm = np.frombuffer(run("-i", str(delivery), "-vn", "-ac", "1", "-ar", "48000",
            "-f", "f32le", "pipe:1"), "<f4")
        window = pcm[12000:84000] * np.hanning(72000)
        spectrum = np.abs(np.fft.rfft(window)); frequencies = np.fft.rfftfreq(len(window), 1/48000)
        energy = lambda hz: spectrum[np.argmin(abs(frequencies-hz))]
        assert energy(880) > energy(440) * 50
        assert energy(880) > energy(220) * 50
        assert result["audio_automation"]["voiceover"][0]["value"] == .25
