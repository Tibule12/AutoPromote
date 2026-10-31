"""Real shared repair chain: retain speech timing and the final source samples."""
import subprocess

import numpy as np
import pytest

from python_media_worker.studio_audio import build_dialogue_filter


def process(samples, source_rate, graph):
    result = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-f", "f32le", "-ar", str(source_rate),
        "-ac", "1", "-i", "pipe:0", "-af", graph, "-ar", "48000", "-f", "f32le", "-"],
        input=samples.astype("<f4").tobytes(), capture_output=True, check=True)
    return np.frombuffer(result.stdout, "<f4")


@pytest.mark.parametrize("source_rate", [16000, 44100, 48000])
def test_full_repair_keeps_the_original_sample_clock_and_tail(source_rate):
    source = np.random.default_rng(731).normal(0, .12, source_rate * 2)
    graph, _ = build_dialogue_filter({"enabled": True, "denoise": 22, "deEsser": 18,
        "compressor": 35, "limiter": -1, "loudness": -14})
    # Keep the requested IIR EQ/de-esser in the reference. Their intended
    # phase response is independent of the denoiser's 25 ms buffer latency.
    reference_graph, _ = build_dialogue_filter({"enabled": True, "denoise": 0, "deEsser": 18,
        "compressor": 35, "limiter": -1, "loudness": -14})
    reference = process(source, source_rate, reference_graph)
    repaired = process(source, source_rate, graph)
    assert len(repaired) == len(reference) == 96000
    size = 1 << (len(reference) * 2 - 1).bit_length()
    correlation = np.fft.irfft(np.fft.rfft(repaired, size) * np.conj(np.fft.rfft(reference, size)), size)
    peak = int(np.argmax(correlation))
    lag = peak if peak <= size // 2 else peak - size
    assert lag == 0
    # The old filter discarded the final 25 ms while retaining 25 ms of
    # delayed onset. Check actual final speech energy against its own source.
    assert np.corrcoef(repaired[-1000:], reference[-1000:])[0, 1] > .8


def test_repair_bypass_preserves_the_existing_empty_filter_contract():
    assert build_dialogue_filter({"enabled": False})[0] == ""
