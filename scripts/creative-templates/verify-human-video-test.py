#!/usr/bin/env python3
"""Inspect existing output only; never submit generation or export jobs."""
import hashlib
import json
from pathlib import Path
import subprocess

import numpy as np


def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def probe(file):
    return json.loads(subprocess.check_output([
        'ffprobe', '-v', 'error', '-show_format', '-show_streams', '-of', 'json', str(file)
    ]))


def sound(file):
    return np.frombuffer(subprocess.check_output([
        'ffmpeg', '-v', 'error', '-i', str(file), '-vn', '-ac', '1', '-ar', '48000',
        '-f', 'f32le', 'pipe:1'
    ]), dtype='<f4').astype(np.float64)


def main():
    directory = Path(__file__).resolve().parents[2] / 'reports/studio-human-demo-20261017'
    proof = directory / 'proof'
    source = proof / 'generated-human.mp4'
    final = proof / 'human-test-clean-dialogue/final.mp4'
    state = json.loads((proof / 'generation-state.private.json').read_text())
    receipt = json.loads((proof / 'human-test-clean-dialogue/render-receipt.json').read_text())
    assert sha(source) == state['videoSha256']
    assert state['generativeSubmissionsAttempted'] == 1
    assert sha(final) == receipt['outputSha256'] == receipt['serverOutputSha256']
    data = probe(final)
    video = next(s for s in data['streams'] if s['codec_type'] == 'video')
    audio = next(s for s in data['streams'] if s['codec_type'] == 'audio')
    assert (video['width'], video['height']) == (1280, 720)
    assert video['r_frame_rate'] == '24/1' and int(video['nb_frames']) == 192
    assert abs(float(data['format']['duration']) - 8) <= 1 / 24
    assert audio['codec_name'] == 'aac' and int(audio['sample_rate']) == 48000
    subprocess.run(['ffmpeg', '-v', 'error', '-i', str(final), '-f', 'null', '-'], check=True)
    a, b = sound(source), sound(final)
    count = min(len(a), len(b))
    a, b = a[:count], b[:count]
    gain = float(np.dot(a, b) / np.dot(a, a))
    correlation = float(np.corrcoef(a, b)[0, 1])
    assert correlation > .99, 'Investigate source/dialogue continuity before delivery'
    assert .8 < gain < 1.2, 'Investigate unexpected source-audio gain'
    # An IDE-compatible listening copy changes audio encoding only. Keep the
    # canonical AAC master and prove that every encoded video packet is exact.
    review = proof / 'human-test-clean-dialogue/AI-human-test-watch.mp4'
    subprocess.run([
        'ffmpeg', '-v', 'error', '-y', '-i', str(final), '-map', '0:v:0', '-map', '0:a:0',
        '-c:v', 'copy', '-c:a', 'libmp3lame', '-b:a', '192k', '-movflags', '+faststart', str(review)
    ], check=True)
    def video_hash(file):
        return subprocess.check_output([
            'ffmpeg', '-v', 'error', '-i', str(file), '-map', '0:v:0', '-c', 'copy',
            '-f', 'hash', '-hash', 'sha256', 'pipe:1'
        ], text=True).strip()
    assert video_hash(review) == video_hash(final)
    subprocess.run(['ffmpeg', '-v', 'error', '-i', str(review), '-f', 'null', '-'], check=True)
    output = {
        'sourceSha256': sha(source), 'nativeOutputSha256': sha(final),
        'reviewCopySha256': sha(review), 'width': 1280, 'height': 720,
        'fps': 24, 'frames': 192, 'seconds': 8, 'fullDecode': True,
        'nativeAudio': {'codec': 'aac', 'sampleRate': 48000,
                        'sourceCorrelation': correlation, 'sourceGain': gain,
                        'comparedMonoSamples': count},
        'reviewCopy': {'audioCodec': 'mp3', 'videoPacketsIdentical': True},
        'providerGenerations': 1, 'estimatedGenerationUsd': .8,
        'actualBilledUsd': None, 'nativeRenderReceiptMatched': True,
        'verifiedLipSync': False, 'professionalHumanListening': False,
        'publicRelease': False, 'scheduled': False,
        'customerGenerationIntegration': False,
    }
    (directory / 'technical-validation.json').write_text(json.dumps(output, indent=2) + '\n')
    print(json.dumps(output, indent=2))


if __name__ == '__main__':
    main()
