"""Measure the actual native sixteen-second repeated-source programme."""
import json
from pathlib import Path
import subprocess
import sys

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
REVIEW = ROOT / "reports/cinematic-evidence-20261031/review"
source = Path(sys.argv[1] if len(sys.argv) > 1 else
              "/home/tibule12/Videos/The Video I Never Recorded - Presenter Tests/Original Take 1.mp4")


def decode(file):
    output = subprocess.check_output(["ffmpeg", "-nostdin", "-v", "error", "-threads", "1",
        "-protocol_whitelist", "file,pipe", "-i", str(file), "-vn", "-ac", "1", "-ar", "48000", "-f", "f32le", "-"])
    return np.frombuffer(output, dtype="<f4").astype(float)


original = decode(source)
programme = decode(REVIEW / "cinematic-programme-720p.mp4")
assert len(original) >= 384000 and len(programme) >= 768000
reference = np.tile(original[:384000], 2)
audio = programme[:768000]
size = 1 << (len(audio) * 2 - 1).bit_length()
correlation = np.fft.irfft(np.fft.rfft(audio, size) * np.conj(np.fft.rfft(reference, size)), size)
lag = max(range(-7200, 7201), key=lambda value: correlation[value % size])
result = {"sampleRate": 48000, "samples": len(audio), "decodedSourceSamples": len(original),
          "decodedProgrammeSamples": len(programme), "duration": 16, "programmeSources": 2,
          "sourceRepeatedExplicitly": True, "voiceRepairEnabled": True,
          "bestLagSamples": int(lag), "bestLagMilliseconds": lag / 48,
          "zeroOffsetCorrelation": float(np.corrcoef(audio, reference)[0, 1]),
          "embeddedSceneAudioMixed": False, "freshHumanListening": "UNVERIFIED",
          "note": "Original speech uses shared dialogue repair. Measurement verifies timing, not perceptual or creative approval."}
(REVIEW / "programme-audio-validation.json").write_text(json.dumps(result, indent=2))
print(json.dumps(result))
assert abs(lag) <= 48, "Programme speech differs from the source clock by more than one millisecond"
