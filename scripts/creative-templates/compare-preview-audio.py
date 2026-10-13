#!/usr/bin/env python3
"""Compare actual captured/decoded stereo audio; no soundtrack regeneration."""
import argparse, json, wave
from pathlib import Path
import numpy as np
from scipy.signal import correlate

parser = argparse.ArgumentParser()
parser.add_argument('capture_folder')
parser.add_argument('export_wav')
args = parser.parse_args()
folder = Path(args.capture_folder)

def read(file):
    with wave.open(str(file)) as audio:
        assert audio.getnchannels() == 2 and audio.getsampwidth() == 2
        rate = audio.getframerate()
        samples = np.frombuffer(audio.readframes(audio.getnframes()), dtype='<i2').reshape(-1, 2) / 32768
        return rate, samples

rate, captured = read(folder / 'native-preview-mix.wav')
export_rate, exported = read(args.export_wav)
assert rate == export_rate == 48000
# Centred synthesized effects cancel here. This measures the stereo bed's
# coherence/level/clock only; it cannot prove all SFX or speech/lip synchronization.
# Compare at the retained PCM clock. Unfiltered decimation aliases transient
# energy and can turn a fraction-of-a-millisecond phase offset into a false
# signal mismatch. Keep the historical captures/receipts, rather than relaxing
# correlation thresholds to compensate for a lossy measurement.
stride = 1
frequency = rate / stride
live = (captured[:, 0] - captured[:, 1])[::stride]
final = (exported[:, 0] - exported[:, 1])[::stride]
results = []
def window_energy(signal, size):
    cumulative = np.concatenate(([0.0], np.cumsum(signal ** 2)))
    return cumulative[size:] - cumulative[:-size]
for time in [.5, 2.5, 5, 8, 11, 14, 17, 19]:
    reference = final[round(time * frequency):round((time + .3) * frequency)]
    first = max(0, round((time - .2) * frequency))
    search = live[first:min(len(live), round((time + 2.3) * frequency))]
    reference = reference - reference.mean()
    correlations = correlate(search, reference, mode='valid', method='fft')
    energies = window_energy(search, len(reference))
    norms = np.sqrt(energies * np.sum(reference ** 2))
    normalized = correlations / np.maximum(norms, 1e-12)
    position = int(np.argmax(normalized))
    excerpt = search[position:position + len(reference)]
    results.append({'exportSeconds': time, 'nativeSeconds': (first + position) / frequency,
                    'wallClockOffsetMs': ((first + position) / frequency - time) * 1000,
                    'stereoDifferenceCorrelation': float(normalized[position]),
                    'levelRatio': float(np.linalg.norm(excerpt) / max(np.linalg.norm(reference), 1e-12))})
receipt = json.loads((folder / 'native-preview-mix.json').read_text())
# Keep the original wall-clock comparison above. Native source buffering can
# pause programme audio for longer than its search window. Pair a second set
# with the actual recorded song-start anchors, rather than widening that search
# until an unrelated excerpt happens to correlate.
music_starts = [x for x in receipt.get('starts', [])
                if x.get('type') == 'buffer' and x.get('duration', 0) > 20]
observed_clock_results = []
if music_starts:
    for time in [.5, 2.5, 5, 8, 11, 14, 17, 19]:
        anchors = [x for x in music_starts if x['offset'] <= time]
        anchor = anchors[-1] if anchors else None
        expected = ((anchor['wallMs'] - receipt['startedAt']) / 1000 +
                    (time - anchor['offset']) / anchor.get('playbackRate', 1)) if anchor else time
        reference = final[round(time * frequency):round((time + .3) * frequency)]
        reference = reference - reference.mean()
        first = max(0, round((expected - .2) * frequency))
        search = live[first:min(len(live), round((expected + .5) * frequency))]
        correlations = correlate(search, reference, mode='valid', method='fft')
        energies = window_energy(search, len(reference))
        normalized = correlations / np.maximum(np.sqrt(energies * np.sum(reference ** 2)), 1e-12)
        position = int(np.argmax(normalized))
        excerpt = search[position:position + len(reference)]
        observed_clock_results.append({'exportSeconds': time, 'anchorExpectedNativeSeconds': expected,
            'anchorProgrammeSeconds': anchor['offset'] if anchor else 0,
            'nativeSeconds': (first + position) / frequency,
            'anchorResidualMs': ((first + position) / frequency - expected) * 1000,
            'stereoDifferenceCorrelation': float(normalized[position]),
            'levelRatio': float(np.linalg.norm(excerpt) / max(np.linalg.norm(reference), 1e-12))})
music_levels = [(x['wallMs'] - receipt['startedAt'], a['volume'])
                for x in receipt.get('levels', []) for a in x['audio']
                if a.get('identity') == 'background-sound-preview' or (a.get('duration') or 0) > 90]
music_levels += [(x['wallMs'] - receipt['startedAt'], a['gain'])
                 for x in receipt.get('levels', []) for a in x.get('decodedMusic', [])]
music_levels.sort()
base_gain = next((time for time, gain in music_levels if gain >= (receipt.get('configuredMusicVolume') or .34) - .001), None)
result = {'scope': 'Measured actual stereo-difference signal coherence and relative level/clock at the original PCM sample rate. Centred synthesized effects cancel; imported stereo SFX remain and prevent interpreting this as an isolated music bus. Capture includes source-switch pauses and MediaStream bridge latency. Not whole-mix parity, SFX raster/phase equivalence or human listening approval.',
          'comparisonSampleRate': frequency,
          'capturedSeconds': len(captured) / rate, 'exportSeconds': len(exported) / rate,
          'capturedPeak': float(np.abs(captured).max()),
          'capturedRms': np.sqrt((captured ** 2).mean(axis=0)).tolist(),
          'trimEnd': receipt.get('trimEnd'), 'musicReachedConfiguredGainMs': base_gain,
          'captureErrors': [x for x in receipt['starts'] if x['type'] == 'capture-error'],
          'windows': results, 'observedMusicClockWindows': observed_clock_results,
          'observedClockScope': 'Second pairing uses actual decoded-music start offsets/rates/wall times with an unchanged +/-200ms residual search. The original wall-clock search and its failures remain above. Music bed only; buffer classification covers this known 97.8s song.',
          'wholeMixParity': 'UNQUALIFIED', 'humanListening': False}
(folder / 'audio-comparison.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'capturedSeconds': result['capturedSeconds'],
                  'minimumBedCorrelation': min(x['stereoDifferenceCorrelation'] for x in results),
                  'musicReachedConfiguredGainMs': base_gain, 'captureErrors': len(result['captureErrors'])}))
