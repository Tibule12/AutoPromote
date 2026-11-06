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
from studio_audio import build_volume_filter, build_dialogue_filter
from studio_sequence_audio import sequence_audio_window, sequence_audio_slice_command, sequence_audio_mix_filter
from viral_render_contract import build_studio_audio_delivery_filter


def project_source_dialogue(request, output, duration):
    """Project the original bus through the actual sequence's AAC boundaries.

    The renderer's ingest/slices/mix precede nonlinear denoise/loudness. Mixing
    untouched PCM instead is audibly different, even with identical settings.
    Source paths here are fixed files verified by the authenticated API.
    """
    def run(args):
        return subprocess.run(args, check=True, capture_output=True, timeout=15)

    inputs, windows, present, ingested = [], [], [], {}
    for index, take in enumerate(request['voices']):
        source = output / f'source-{index}'
        key = (take['storagePath'], take['sourceContentHash'])
        if key not in ingested:
            metadata = json.loads(run(['ffprobe', '-v', 'error',
                                       '-protocol_whitelist','file,pipe','-format_whitelist','mov,matroska,avi,mpeg,mpegts',
                                       '-show_streams', '-show_format',
                                       '-of', 'json', str(source)]).stdout)
            audible = any(s.get('codec_type') == 'audio' for s in metadata['streams'])
            source_duration = float(metadata['format']['duration'])
            audio = output / f'original-{index}.m4a'
            if audible:
                run(['ffmpeg', '-v', 'error', '-nostdin', '-threads', '2',
                     '-protocol_whitelist', 'file,pipe', '-format_whitelist', 'mov,matroska,avi,mpeg,mpegts',
                     '-i', str(source), '-t', '60', '-vn', '-c:a', 'aac', '-movflags', '+faststart', '-y', str(audio)])
            ingested[key] = (audio, audible, source_duration)
        audio, audible, source_duration = ingested[key]
        window = sequence_audio_window({'start_time': take['trimStart'],
            'end_time': take['trimStart'] + take['duration']}, take['startTime'], duration, source_duration)
        windows.append(window)
        present.append(audible and window['duration'] > .00001)
        if present[-1]:
            clip = output / f'original-slice-{index}.m4a'
            run(sequence_audio_slice_command(audio, clip, window))
            inputs += ['-i', str(clip)]
    raw = output / 'voice-raw.m4a'
    graph = sequence_audio_mix_filter(windows, present, duration, input_offset=0)
    if graph:
        run(['ffmpeg', '-v', 'error', '-nostdin', *inputs, '-filter_complex_threads', '1',
             '-filter_complex', graph, '-map', '[a_out]', '-c:a', 'aac', '-y', str(raw)])
    else:
        run(['ffmpeg', '-v', 'error', '-nostdin', '-f', 'lavfi', '-i',
             f'anullsrc=r=48000:cl=stereo:d={duration}', '-c:a', 'aac', '-y', str(raw)])
    restoration = build_dialogue_filter(request['restoration'])[0]
    automation = build_volume_filter(request['automation'], duration, speed_plan=request['speedPlan'])[0]
    filters = ','.join(part for part in [restoration, automation, build_studio_audio_delivery_filter(duration)] if part)
    run(['ffmpeg', '-v', 'error', '-nostdin', '-i', str(raw), '-af', filters,
         '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s16le', '-y', str(output / 'voice.wav')])
    np.ones(math.ceil(duration*48000), dtype='<f4').tofile(output / 'duck.f32')


def project_voice_bus(request_file, folder):
    started = time.monotonic()
    if hasattr(os, 'sched_getaffinity'):
        os.sched_setaffinity(0, sorted(os.sched_getaffinity(0))[:2])
    request = json.loads(Path(request_file).read_text())
    output = Path(folder)
    duration = sum((p['end_time']-p['start_time'])/p['rate'] for p in request['speedPlan'])
    if not 0 < duration <= 90 or not 0 < len(request['voices']) <= 8:
        raise ValueError('Preview exceeds bounded voice bus scope')
    if request['version'] == 2:
        project_source_dialogue(request, output, duration)
        return {'version': 2, 'sampleRate': 48000, 'sampleCount': math.ceil(duration*48000), 'duration': duration,
                'runtimeSeconds': time.monotonic()-started, 'device': 'cpu',
                'implementation': 'studio-final-source-dialogue-v1'}
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
    restoration = build_dialogue_filter(request['restoration'])[0] if request.get('version') == 2 else ''
    filters = ','.join(part for part in (restoration, automation) if part) or 'anull'
    if request.get('version') == 2:
        filters += f',apad=whole_dur={duration:.9f},atrim=duration={duration:.9f}'
    subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-threads', '2', '-y', '-i', str(raw),
                    '-af', filters, '-c:a', 'pcm_s16le',
                    str(voice)],
                   check=True, capture_output=True, timeout=15)
    count = math.ceil(duration * 48000)
    gains = np.ones(count, dtype='<f4')
    if request['ducking']['enabled']:
        strength = request['ducking']['strength']
        measured = output / 'duck-raw.f32'
        # A unity carrier exposes the exact renderer compressor's gain. This
        # uses the post-trim/fade/retime/automation bus; SFX never drive it.
        # FFmpeg7 can end a two-input filter as soon as one demuxer reports
        # EOF, before draining the other input's queued samples. Supply a
        # bounded silent tail, then take the exact authored sample interval.
        # The compressor is causal: future silence cannot change that interval.
        subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-threads', '2', '-y',
                        '-f', 'lavfi', '-i', f'aevalsrc=1|1:s=48000:d={duration+1}', '-i', str(voice),
                        '-filter_complex_threads', '1', '-filter_complex',
                        '[1:a]apad=pad_dur=1[sidechain];'
                        '[0:a][sidechain]sidechaincompress=threshold=0.025:'
                        f'ratio={2+strength*14:.2f}:attack=18:release=280[duck];'
                        f'[duck]atrim=end_sample={count},pan=mono|c0=0.5*c0+0.5*c1[out]',
                        '-map', '[out]',
                        '-ar', '48000', '-f', 'f32le', str(measured)],
                       check=True, capture_output=True, timeout=15)
        samples = np.fromfile(measured, dtype='<f4')
        if len(samples) != count or not np.all(np.isfinite(samples)):
            raise ValueError('Incomplete compressor preview')
        gains[:min(count, len(samples))] = samples[:count]
    gains.tofile(output / 'duck.f32')
    return {'version': request['version'], 'sampleRate': 48000, 'sampleCount': count, 'duration': duration,
            'runtimeSeconds': time.monotonic()-started, 'device': 'cpu',
            'implementation': 'studio-final-source-dialogue-v1' if request['version'] == 2 else 'studio-final-voice-mixer-v1'}


if __name__ == '__main__':
    print(json.dumps(project_voice_bus(sys.argv[1], sys.argv[2])))
