#!/usr/bin/env python3
"""Compare actual movie bytes/decoded frames/PCM after an audio-only Studio edit."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

import numpy as np

parser = argparse.ArgumentParser()
parser.add_argument('before', type=Path)
parser.add_argument('after', type=Path)
parser.add_argument('receipt', type=Path)
args = parser.parse_args()


def frames(file):
    result = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(file), '-map', '0:v:0',
                             '-f', 'framemd5', '-'], check=True, capture_output=True)
    return [line.strip() for line in result.stdout.decode().splitlines()
            if line and not line.startswith('#')]


def pcm(file):
    result = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(file), '-map', '0:a:0',
                             '-ac', '2', '-ar', '48000', '-f', 's16le', '-'],
                            check=True, capture_output=True)
    return np.frombuffer(result.stdout, dtype='<i2').reshape(-1, 2).astype(np.float64) / 32768


before_frames, after_frames = frames(args.before), frames(args.after)
before_audio, after_audio = pcm(args.before), pcm(args.after)
count = min(len(before_audio), len(after_audio))
windows = []
for start, end in [(0, 2), (3, 5), (8, 10), (12.875, 13.625), (13.625, 14), (15, 17), (18, 19)]:
    first, last = round(start * 48000), min(count, round(end * 48000))
    left, right = before_audio[first:last], after_audio[first:last]
    delta = right - left
    windows.append({'startSeconds': start, 'endSeconds': last / 48000,
                    'beforeRms': float(np.sqrt(np.mean(left ** 2))),
                    'afterRms': float(np.sqrt(np.mean(right ** 2))),
                    'differenceRms': float(np.sqrt(np.mean(delta ** 2))),
                    'changedPcmSamples': int(np.count_nonzero(delta))})

receipt = {
    'beforeSha256': hashlib.sha256(args.before.read_bytes()).hexdigest(),
    'afterSha256': hashlib.sha256(args.after.read_bytes()).hexdigest(),
    'beforeFrames': len(before_frames), 'afterFrames': len(after_frames),
    'allDecodedPictureFramesEqual': before_frames == after_frames,
    'audioSamplesPerChannel': [len(before_audio), len(after_audio)],
    'changedPcmSamples': int(np.count_nonzero(before_audio[:count] - after_audio[:count])),
    'windows': windows,
    'scope': 'Real downloaded before/after exports: complete decoded picture identity and observed PCM changes. '
             'Not live preview PCM parity, a perceptual sound-quality score or human creative approval.',
}
args.receipt.parent.mkdir(parents=True, exist_ok=True)
args.receipt.write_text(json.dumps(receipt, indent=2) + '\n')
assert receipt['allDecodedPictureFramesEqual'], 'Audio-only edit changed decoded picture; inspect retained receipt'
assert receipt['changedPcmSamples'] > 0, 'Audio curve edit produced no sound change'
print(json.dumps({key: receipt[key] for key in ['beforeFrames', 'afterFrames',
                 'allDecodedPictureFramesEqual', 'changedPcmSamples']}))
