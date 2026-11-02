import numpy as np
import pytest
from audio_signal_measurement import pair_pcm_window


def test_identical_dc_biased_stereo_is_identity_with_no_error():
    samples = np.arange(14400) / 48000
    reference = np.column_stack((.12 + .05*np.sin(2*np.pi*37*samples), -.08+.04*np.cos(2*np.pi*29*samples)))
    measured = pair_pcm_window(np.vstack((np.zeros((37, 2)), reference, np.zeros((19, 2)))), reference)
    assert measured['position'] == 37
    assert measured['correlation'] == pytest.approx(1, abs=1e-10)
    assert measured['relativeRmsError'] == 0
    assert measured['levelRatio'] == 1
    assert measured['dcDifference'] == [0, 0]


def test_correlation_does_not_hide_wrong_gain_or_added_dc():
    reference = np.random.default_rng(42).normal(0, .05, (14400, 2))
    measured = pair_pcm_window(reference*.5 + .02, reference)
    assert measured['correlation'] == pytest.approx(1, abs=1e-10)
    assert measured['dcDifference'][0] > .019
    assert measured['relativeRmsError'] > .5
    assert measured['levelRatio'] < .7


def test_silence_is_not_passing_correlation():
    assert pair_pcm_window(np.zeros((14400, 2)), np.zeros((14400, 2)))['status'] == 'SILENT_REFERENCE'


def test_wrong_signal_fails_without_relaxing_threshold():
    rng = np.random.default_rng(42)
    measured = pair_pcm_window(rng.normal(0, .05, (15000, 2)), rng.normal(0, .05, (14400, 2)))
    assert measured['correlation'] < .05
