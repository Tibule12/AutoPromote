#!/usr/bin/env python3
"""Local source checks and review images; never edits or generates footage."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess

import numpy as np
from faster_whisper import WhisperModel

ROOT = Path(__file__).resolve().parent
PROOF = ROOT.parent / 'proof' / 'recovery-continuity'


def run(arguments):
    return subprocess.check_output(arguments)


def main(take):
    source = PROOF / f'take-{take}.mp4'
    proposal = json.loads((ROOT / 'source-test-proposal.json').read_text())
    expected = proposal['tests'][take - 1]['dialogue']
    probe = json.loads(run(['ffprobe', '-v', 'error', '-show_streams', '-show_format',
                           '-of', 'json', str(source)]))
    video = next(s for s in probe['streams'] if s['codec_type'] == 'video')
    audio = next(s for s in probe['streams'] if s['codec_type'] == 'audio')
    assert (video['width'], video['height'], video['avg_frame_rate'], int(video['nb_frames'])) == (1920, 1080, '24/1', 192)
    assert abs(float(video['duration']) - 8) < .001
    subprocess.run(['ffmpeg', '-v', 'error', '-i', str(source), '-f', 'null', '-'],
                   check=True, capture_output=True)
    for arguments in [
        ['-vf', 'fps=1,scale=480:-2,tile=4x2', '-frames:v', '1', str(PROOF / f'take-{take}-contact.png')],
        ['-ss', '1.5', '-frames:v', '1', str(PROOF / f'take-{take}-reference.png')],
    ]:
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(source), *arguments],
                       check=True, capture_output=True)
    pixels = run(['ffmpeg', '-v', 'error', '-i', str(source), '-an', '-vf', 'scale=160:90',
                  '-f', 'rawvideo', '-pix_fmt', 'gray', '-'])
    frames = np.frombuffer(pixels, dtype=np.uint8).reshape((-1, 90, 160))
    assert len(frames) == 192
    black = np.flatnonzero(np.quantile(frames.reshape(192, -1), .99, axis=1) < 20).tolist()
    assert not black, 'Unexpected black source pictures.'
    delta = np.abs(np.diff(frames.astype(np.float32), axis=0)).mean(axis=(1, 2))
    model = WhisperModel('small', device='cpu', compute_type='int8',
                         cpu_threads=2, local_files_only=True)
    segments, info = model.transcribe(str(source), language='en', beam_size=5,
                                      word_timestamps=True, vad_filter=False)
    rows = [{'start': s.start, 'end': s.end, 'text': s.text,
             'words': [{'text': w.word.strip(), 'start': w.start, 'end': w.end,
                        'probability': w.probability} for w in s.words]} for s in segments]
    transcript = ' '.join(s['text'].strip() for s in rows)
    def normalize(text):
        text = text.lower().replace('8:42', 'eight forty two').replace('8.42', 'eight forty two')
        return re.findall(r"[a-z]+(?:'[a-z]+)?", text.replace('-', ' '))
    asr = {'expected': expected, 'recognized': transcript, 'segments': rows,
           'normalizedExactMatch': normalize(expected) == normalize(transcript),
           'scope': 'Word-content/timing check only, not a lip-sync or voice-identity verdict.'}
    (PROOF / f'take-{take}-asr.json').write_text(json.dumps(asr, indent=2) + '\n')
    validation = {
        'take': take, 'sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'bytes': source.stat().st_size, 'width': video['width'], 'height': video['height'],
        'fps': 24, 'frames': 192, 'pictureSeconds': float(video['duration']),
        'audioSeconds': float(audio['duration']), 'audioSampleRate': int(audio['sample_rate']),
        'fullDecodePassed': True, 'blackFrames': black,
        'meanLowResolutionFrameDifference': float(delta.mean()),
        'asrNormalizedExactMatch': asr['normalizedExactMatch'],
        'visualGazeReview': 'Pending actual image inspection',
        'perceptualLipSync': 'Unqualified; ASR does not establish synchronization',
        'humanListeningApproval': False,
    }
    (PROOF / f'take-{take}-validation.json').write_text(json.dumps(validation, indent=2) + '\n')
    print(json.dumps({'validation': validation, 'recognized': transcript}), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--take', type=int, choices=[1, 2], required=True)
    main(parser.parse_args().take)
