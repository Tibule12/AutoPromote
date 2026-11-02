"""Decode the real revision and verify its captured Studio picture/audio clocks."""
import hashlib
import json
from pathlib import Path
import subprocess

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
REPORT = ROOT / "reports/unmuted-cinematic-revision-20261031"
REVIEW = REPORT / "review"
MOVIE = REVIEW / "UNMUTED - Cinematic Set Revision.mp4"


def pcm(file):
    return np.frombuffer(subprocess.check_output(["ffmpeg", "-nostdin", "-v", "error", "-threads", "1",
        "-i", str(file), "-vn", "-ac", "1", "-ar", "16000", "-f", "f32le", "-"]), "<f4").astype(float)


def probe(file):
    return json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-count_frames", "-show_entries",
        "stream=codec_type,codec_name,nb_read_frames,width,height,duration,r_frame_rate,sample_rate,channels:format=duration",
        "-of", "json", str(file)], text=True))


def correlation(reference, audio, maximum_lag):
    size = 1 << (len(reference) + len(audio) - 1).bit_length()
    cross = np.fft.irfft(np.fft.rfft(audio, size) * np.conj(np.fft.rfft(reference, size)), size)
    lag = max(range(-maximum_lag, maximum_lag+1), key=lambda value: cross[value % size])
    first_reference, first_audio = max(0, -lag), max(0, lag)
    count = min(len(reference)-first_reference, len(audio)-first_audio)
    score = float(np.corrcoef(reference[first_reference:first_reference+count], audio[first_audio:first_audio+count])[0, 1])
    return lag, score


data = probe(MOVIE)
video = next(s for s in data["streams"] if s["codec_type"] == "video")
sound = next(s for s in data["streams"] if s["codec_type"] == "audio")
assert int(video["nb_read_frames"]) == 391
assert (video["width"], video["height"], video["r_frame_rate"]) == (1280, 720, "24/1")
assert (sound["sample_rate"], sound["channels"]) == ("48000", 2)
subprocess.run(["ffmpeg", "-v", "error", "-i", str(MOVIE), "-f", "null", "-"], check=True)
audio = pcm(MOVIE)
assert np.sqrt(np.mean(audio*audio)) > .005
source = pcm(REPORT / "private-local/source/selected-original.mp4")
lag, score = correlation(source[:len(audio)], audio, 2400)
result = {"movieSha256": hashlib.sha256(MOVIE.read_bytes()).hexdigest(), "probe": data,
    "fullDecode": True, "sourceSpeechBestLagSamplesAt16kHz": lag,
    "sourceSpeechLagMilliseconds": lag/16, "sourceSpeechAlignedCorrelation": score,
    "note": "Original speech is repaired and mixed with native sound cues. Correlation is timing evidence, not listening approval.",
    "freshHumanListening": False, "creativeApproval": False}

record = json.loads((REVIEW / "studio-sound-capture.json").read_text())
proof = []
for capture in record["captures"]:
    captured = pcm(capture["audioPath"])
    lag, score = correlation(audio, captured, 48000)
    origins = [s["epoch"]-s["mediaTime"] for s in capture["playback"] if .5 < s["mediaTime"] < 15.5]
    video_origin = float(np.median(origins))
    audio_origin = capture["audioStartEpoch"] + lag/16000
    error = audio_origin - video_origin
    assert score > .97, "Captured live monitor audio does not match the actual export"
    assert abs(error) < .1, "Captured monitor sound and picture differ by more than 100ms"
    captured_probe = probe(capture["output"])
    assert any(s["codec_type"] == "audio" for s in captured_probe["streams"])
    subprocess.run(["ffmpeg", "-v", "error", "-i", capture["output"], "-f", "null", "-"], check=True)
    proof.append({"correlation": score, "clockDifferenceMs": error*1000, "fullDecode": True,
        "actualMonitorAudio": True, "soundtrackSubstituted": False, "completePlayback": capture["completePlayback"]})
result["studioRecording"] = proof
(REVIEW / "verification.json").write_text(json.dumps(result, indent=2))
print(json.dumps(result, indent=2))
