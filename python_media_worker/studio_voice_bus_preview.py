"""Bounded CPU projection of the ordinary Studio voice bus, using final helpers.

Transient private preview media; this does not render a movie or run a model.
The authenticated API materializes and hash-checks every owned input first.
"""
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import time

import numpy as np
from viral_motion_graphics import validate_design, write_sound_mix
from studio_audio import build_volume_filter


def project_voice_bus(request_file, folder):
    started = time.monotonic()
    if hasattr(os, 'sched_getaffinity'):
        os.sched_setaffinity(0, sorted(os.sched_getaffinity(0))[:2])
    request = json.loads(Path(request_file).read_text())
    output = Path(folder)
    duration = sum((p['end_time']-p['start_time'])/p['rate'] for p in request['speedPlan'])
    if not 0 < duration <= 90 or not 0 < len(request['voices']) <= 8:
        raise ValueError('Preview exceeds bounded voice bus scope')
    effects, sources = [], {}
    for index, take in enumerate(request['voices']):
        name = str(index)
        ingested = output / f'ingested-{index}.wav'
        subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-threads', '2', '-y',
                        '-protocol_whitelist', 'file,pipe',
                        '-format_whitelist', 'wav,mp3,mov,flac,ogg,matroska,aac',
                        '-i', str(output / f'source-{index}'), '-t', '60', '-vn', '-ac', '2', '-ar', '48000',
                        '-c:a', 'pcm_s16le', str(ingested)], check=True, capture_output=True, timeout=15)
        effects.append({k: v for k, v in take.items() if k not in ('storagePath', 'sourceContentHash')})
        effects[-1].update(kind='voiceover', builtIn=False, enabled=True, url=name)
        sources[name] = ingested
    _, effects = validate_design(None, effects)
    raw = output / 'voice-raw.wav'
    write_sound_mix(raw, effects, duration, request['speedPlan'], sources, channels=2)
    automation, _ = build_volume_filter(request['automation'], duration, speed_plan=request['speedPlan'])
    voice = output / 'voice.wav'
    subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-threads', '2', '-y', '-i', str(raw),
                    '-af', automation or 'anull', '-c:a', 'pcm_s16le', str(voice)],
                   check=True, capture_output=True, timeout=15)
    count = math.ceil(duration * 48000)
    gains = np.ones(count, dtype='<f4')
    if request['ducking']['enabled']:
        strength = request['ducking']['strength']
        measured = output / 'duck-raw.f32'
        # A unity carrier exposes the exact renderer compressor's gain. This
        # uses the post-trim/fade/retime/automation bus; SFX never drive it.
        subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-threads', '2', '-y',
                        '-f', 'lavfi', '-i', f'aevalsrc=1|1:s=48000:d={duration}', '-i', str(voice),
                        '-filter_complex_threads', '1', '-filter_complex',
                        '[0:a][1:a]sidechaincompress=threshold=0.025:'
                        f'ratio={2+strength*14:.2f}:attack=18:release=280[duck];'
                        '[duck]pan=mono|c0=0.5*c0+0.5*c1[out]',
                        '-map', '[out]',
                        '-ar', '48000', '-f', 'f32le', str(measured)],
                       check=True, capture_output=True, timeout=15)
        samples = np.fromfile(measured, dtype='<f4')
        if len(samples) < count-128 or not np.all(np.isfinite(samples)):
            raise ValueError('Incomplete compressor preview')
        gains[:min(count, len(samples))] = samples[:count]
    gains.tofile(output / 'duck.f32')
    return {'version': 1, 'sampleRate': 48000, 'sampleCount': count, 'duration': duration,
            'runtimeSeconds': time.monotonic()-started, 'device': 'cpu',
            'implementation': 'studio-final-voice-mixer-v1'}


if __name__ == '__main__':
    print(json.dumps(project_voice_bus(sys.argv[1], sys.argv[2])))
