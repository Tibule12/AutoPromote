"""Real render checks for timeline audio automation and track mute/solo."""
import asyncio
import shutil
import subprocess
import tempfile
from pathlib import Path
from unittest.mock import patch
import numpy as np
import pytest
from python_media_worker import main_media_server as worker
from python_media_worker.studio_audio import audio_track_audible, build_volume_filter, build_audio_bus_mix
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


def test_mixed_rate_music_does_not_reduce_the_effect_bus_bandwidth():
    # A 44.1kHz bed must not make FFmpeg downsample already-native 48kHz SFX.
    graph = build_audio_bus_mix(["[0:a]", "[1:a]"])
    raw = run("-f", "lavfi", "-i", "aevalsrc=0:s=44100:d=0.5",
              "-f", "lavfi", "-i", "aevalsrc=0.2*sin(2*PI*23000*t):s=48000:d=0.5",
              "-filter_complex", graph, "-map", "[a_mix_unpadded]", "-ar", "48000",
              "-f", "f32le", "pipe:1")
    pcm = np.frombuffer(raw, "<f4")
    assert len(pcm) == 24000
    expected = .2 * np.sin(2*np.pi*23000*np.arange(24000)/48000)
    assert np.max(abs(pcm[200:23800]-expected[200:23800])) < 1e-5


def test_retimed_bus_keys_change_real_pcm_at_the_programme_position():
    plan = [{"start_time": 0, "end_time": 1, "rate": 1},
            {"start_time": 1, "end_time": 3, "rate": 2},
            {"start_time": 3, "end_time": 4, "rate": 1}]
    keys = [{"time": 0, "value": 0}, {"time": 4, "value": 100, "easing": "linear"}]
    graph, points = build_volume_filter(keys, 3, speed_plan=plan)
    assert any(p["time"] == 1 and p["value"] == .25 for p in points)
    assert any(p["time"] == 2 and p["value"] == .75 for p in points)
    raw = run("-f", "lavfi", "-i", "aevalsrc=0.5:s=48000:d=3", "-af", graph,
              "-f", "f32le", "pipe:1")
    pcm = np.frombuffer(raw, "<f4")
    # Output 1.5s is programme 2s: half gain. Using output keys yields .375
    # rather than .5, which was the reproduced speed-ramp automation defect.
    assert abs(float(pcm[round(1.5*48000)]) - .25) < .006
    assert abs(float(pcm[round(2.5*48000)]) - .4375) < .006


def test_keys_after_the_shorter_output_end_remain_in_the_programme():
    _, points = build_volume_filter([{"time": 3, "value": 100}, {"time": 4, "value": 0}], 2,
                                    speed_plan=[{"start_time": 0, "end_time": 4, "rate": 2}])
    assert points[0]["time"] == 1.5 and points[-1]["time"] == 2


def test_held_bus_gain_jumps_at_the_key_and_survives_speed_boundaries():
    keys = [{"time": 0, "value": 20}, {"time": 3, "value": 100, "easing": "hold"},
            {"time": 4, "value": 40, "easing": "linear"}]
    plan = [{"start_time": 0, "end_time": 1, "rate": 1},
            {"start_time": 1, "end_time": 4, "rate": 2}]
    graph, points = build_volume_filter(keys, 2.5, speed_plan=plan)
    assert any(p["time"] == 1 and p["value"] == .2 and p["easing"] == "hold" for p in points)
    assert any(p["time"] == 2 and p["value"] == 1 for p in points)
    raw = run("-f", "lavfi", "-i", "aevalsrc=0.5:s=48000:d=2.5", "-af", graph, "-f", "f32le", "pipe:1")
    pcm = np.frombuffer(raw, "<f4")
    assert abs(float(pcm[round(1.95*48000)]) - .1) < .001
    assert float(pcm[round(2.04*48000)]) > .46
    assert abs(float(pcm[round(2.25*48000)]) - .35) < .01


def test_custom_bus_curve_uses_all_handles_in_real_pcm():
    from python_media_worker.studio_motion import easing_value
    outputs = []
    for curve in ([.1, 0, .2, 1], [.8, 0, .9, 1]):
        graph, _ = build_volume_filter([{"time": 0, "value": 0},
            {"time": 2, "value": 100, "easing": "bezier", "curve": curve}], 2)
        raw = run("-f", "lavfi", "-i", "aevalsrc=0.5:s=48000:d=2", "-af", graph, "-f", "f32le", "pipe:1")
        pcm = np.frombuffer(raw, "<f4")
        value = float(pcm[48000])
        assert abs(value - .5*easing_value(.5, "bezier", curve)) < .008
        outputs.append(value)
    assert outputs[0] - outputs[1] > .25


def test_automation_tracks_the_envelope_without_coarse_audio_blocks_or_tail_padding():
    duration = .257  # Deliberately not an exact number of audio blocks.
    graph, _ = build_volume_filter([{"time": 0, "value": 0},
        {"time": duration, "value": 100, "easing": "linear"}], duration)
    raw = run("-f", "lavfi", "-i", f"aevalsrc=0.5:s=48000:d={duration}",
              "-af", graph, "-f", "f32le", "pipe:1")
    pcm = np.frombuffer(raw, "<f4")
    assert len(pcm) == round(duration * 48000), "Automation changed the audio tail"
    expected = .5 * np.arange(len(pcm)) / (duration * 48000)
    assert np.max(np.abs(pcm - expected)) < .003, "Gain steps lag the editable envelope"


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


@pytest.mark.parametrize("mode", ["speech", "constant"])
def test_music_ducks_under_the_audible_voiceover_bus_without_source_audio(tmp_path, mode):
    source, music, voice, delivery = [tmp_path / n for n in ["source.mp4", "music.wav", "voice.wav", "final.mp4"]]
    run("-f", "lavfi", "-i", "color=blue:s=160x120:r=24:d=6", "-c:v", "libx264", "-threads", "1", "-an", "-n", str(source))
    run("-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=6", "-n", str(music))
    run("-f", "lavfi", "-i", "sine=frequency=880:sample_rate=48000:duration=2", "-af", "volume=4", "-n", str(voice))
    request = worker.RenderViralRequest(video_url="source", start_time=0, end_time=6,
        smart_crop=False, auto_captions=False, professional_cleanup=False, brand_watermark=False,
        add_music=True, music_url="https://test.invalid/music.wav", music_volume=.4,
        music_ducking=True, music_ducking_strength=.4, music_ducking_mode=mode,
        music_fade_in=0, music_fade_out=0, sound_effects=[worker.ViralSoundEffect(
            id="voice", kind="voiceover", url="https://test.invalid/voice.wav", startTime=2,
            duration=2, fadeIn=0, fadeOut=0)],
        output_settings={"resolution": "source", "fps": "24"})
    async def materialize(url, destination, **kwargs):
        shutil.copyfile({"source": source, "https://test.invalid/music.wav": music,
                        "https://test.invalid/voice.wav": voice}[url], destination)
        return destination
    def deliver(path):
        shutil.copyfile(path, delivery)
        return str(delivery)
    with patch.object(worker, "materialize_video_input", materialize), \
         patch.object(worker, "materialize_audio_input", materialize), \
         patch.object(worker, "upload_file_to_firebase", deliver):
        result = asyncio.run(worker.render_viral_clip(request))
    assert result["status"] == "completed"
    pcm = np.frombuffer(run("-i", str(delivery), "-vn", "-ac", "1", "-ar", "48000", "-f", "f32le", "pipe:1"), "<f4")
    def amplitude(first, last, hz=440):
        values = pcm[int(first*48000):int(last*48000)]
        window = np.hanning(len(values))
        spectrum = np.abs(np.fft.rfft(values*window))
        frequencies = np.fft.rfftfreq(len(values), 1/48000)
        return spectrum[np.argmin(abs(frequencies-hz))] * 2/window.sum()
    quiet, speaking, recovered = amplitude(.5, 1.5), amplitude(2.5, 3.5), amplitude(5, 5.5)
    if mode == "speech":
        assert speaking < quiet*.75, "The voiceover lane was ignored by speech ducking"
        assert recovered > quiet*.9, "Music did not recover after the take"
    else:
        assert quiet == pytest.approx(.125*.4*.6, rel=.08), "Constant ducking did not apply its authored reduction"
        assert speaking == pytest.approx(quiet, rel=.08)
        assert recovered == pytest.approx(quiet, rel=.08)
    assert amplitude(2.5, 3.5, 880) > .4, "Ducking must not lower the voiceover itself"
