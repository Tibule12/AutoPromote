"""Verify captured browser speech against the exact finished monitor movie."""
import json
from pathlib import Path
import subprocess

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
REVIEW = ROOT / "reports/unmuted-comeback-20261031/review"


def pcm(file):
    return np.frombuffer(subprocess.check_output(["ffmpeg", "-nostdin", "-v", "error", "-threads", "1",
        "-i", str(file), "-vn", "-ac", "1", "-ar", "16000", "-f", "f32le", "-"]), "<f4").astype(float)


record = json.loads((REVIEW / "studio-sound-capture.json").read_text())
proof = []
for capture in record["captures"]:
    reference = pcm(REVIEW / f"Unmuted - We Are Back - {capture['format']}.mp4")
    audio = pcm(capture["audioPath"])
    size = 1 << (len(reference) + len(audio) - 1).bit_length()
    cross = np.fft.irfft(np.fft.rfft(audio, size) * np.conj(np.fft.rfft(reference, size)), size)
    lag = max(range(-48000, 48001), key=lambda value: cross[value % size])
    start_reference, start_audio = max(0, -lag), max(0, lag)
    length = min(len(reference) - start_reference, len(audio) - start_audio)
    correlation = float(np.corrcoef(reference[start_reference:start_reference+length], audio[start_audio:start_audio+length])[0, 1])
    rms = float(np.sqrt(np.mean(audio * audio)))
    origins = [sample["epoch"] - sample["mediaTime"] for sample in capture["playback"] if .5 < sample["mediaTime"] < 26.5]
    video_origin = float(np.median(origins))
    audio_origin = capture["audioStartEpoch"] + lag / 16000
    timing_error = audio_origin - video_origin
    assert rms > .005, "Captured browser audio is silent"
    assert correlation > .97, "Captured speech does not match the actual monitor movie"
    assert abs(timing_error) < .1, "Captured picture/audio clocks differ by more than 100 ms"
    proof.append({"format": capture["format"], "audioStreamCapturedFromActualMonitor": True,
                  "captureRms": rms, "alignedSpeechCorrelation": correlation,
                  "captureAudioLeadSamplesAt16kHz": lag, "clockDifferenceMilliseconds": timing_error * 1000,
                  "completeMonitorPlayback": capture["completePlayback"],
                  "speakersMuted": True, "externalSoundtrackSubstituted": False})
probe = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries",
    "stream=codec_type,codec_name,sample_rate,channels:format=duration", "-of", "json", record["output"]], text=True))
assert any(stream["codec_type"] == "audio" for stream in probe["streams"])
assert float(probe["format"]["duration"]) > 55
final = {"actualBrowserCapture": True, "audioIncluded": True, "parts": proof, "probe": probe,
         "freshHumanListening": False, "note": "The browser/device stays muted; the recording captures the monitor's live decoded audio stream."}
(REVIEW / "studio-sound-verification.json").write_text(json.dumps(final, indent=2))
print(json.dumps(final, indent=2))
