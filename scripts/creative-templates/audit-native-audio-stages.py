#!/usr/bin/env python3
"""Isolate render PCM, encoding and native timing on the retained owned edit.

CPU diagnostics only. Generated references are explicitly not Studio exports.
The real export and native capture remain unchanged.
"""
import argparse
import hashlib
import json
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import numpy as np
from audio_signal_measurement import pair_pcm_window

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'python_media_worker'))
from viral_motion_graphics import validate_design, write_sound_mix
from studio_audio import build_volume_filter, build_audio_bus_mix
from viral_render_contract import build_studio_audio_delivery_filter

p = argparse.ArgumentParser()
p.add_argument('output', type=Path)
p.add_argument('capture', type=Path)
p.add_argument('delivery', type=Path)
p.add_argument('materials', type=Path)
p.add_argument('--stem', default='audio-curve')
p.add_argument('--verification', type=Path)
p.add_argument('--voice-recording', type=Path)
p.add_argument('--bridge-mix', action='store_true')
args = p.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
request_file = args.delivery / f'{args.stem}-render-request.private.json'
document_file = args.delivery / f'{args.stem}-document.json'
project = json.loads((args.delivery / f'{args.stem}-project.private.json').read_text())
document = json.loads(document_file.read_text())
request = json.loads(request_file.read_text())['options']['viralData']
receipt = json.loads((args.capture / 'native-preview-mix.json').read_text())
canonical_hash = subprocess.check_output(['node', '-e',
    "const fs=require('node:fs');const {hash}=require('./src/creativeTemplates/contract');"
    "process.stdout.write(hash(JSON.parse(fs.readFileSync(process.argv[1]))));",
    str(document_file)], cwd=ROOT, text=True)
assert canonical_hash == receipt['canonicalHash']
assert request['mute_audio'] and not request['audio_remix']['enabled']
assert not request['music_ducking'] or request['music_ducking_mode'] in ('constant', 'speech')
assert request['background_audio'] is None
_, effects = validate_design(None, request['sound_effects'])
bindings = {e['id']: e for e in project['snapshot']['soundEffects']}
verified = json.loads((args.verification or args.output / 'owned-sfx-verification.json').read_text())
verification = {e['id']: e for e in verified['cues']}
voice_verification = {e['id']: e for e in verified.get('voices', [])}
resolved = {}
source_hashes = {}
for effect in effects:
    if effect.get('builtIn'):
        continue
    if effect.get('kind') == 'voiceover':
        assert args.voice_recording, 'Owned recorded-speech bytes are required'
        checked = voice_verification[effect['id']]
        assert checked['serverOwnerCheck'] == 'PASS' and checked['generation']
        assert args.voice_recording.stat().st_size == checked['bytes']
        binding = next(v for v in project['snapshot']['voiceovers'] if v['id'] == effect['id'])
        digest = hashlib.sha256(args.voice_recording.read_bytes()).hexdigest()
        assert digest == checked['actualStoredHash'] == binding['contentHash'], 'Different recorded-speech bytes'
        resolved[effect['url']] = args.voice_recording
        source_hashes[effect['name']] = digest
        continue
    binding = bindings[effect['id']]
    source = args.materials / (effect['name'] + ('.wav' if effect['name'].endswith('2918') else '.mp3'))
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    checked = verification[effect['id']]
    assert checked['sourcePathHash'] == hashlib.sha256(binding['sourceStoragePath'].encode()).hexdigest()
    assert digest == checked['actualStoredHash'], 'Different imported cue bytes'
    resolved[effect['url']] = source
    source_hashes[effect['name']] = digest
music = args.materials / 'mixkit-music-369.mp3'
assert hashlib.sha256(music.read_bytes()).hexdigest() == document['audioGraph']['music']['contentHash']
duration = document['outputTimeMap'][-1]['outputRange']['endTick'] / 90000
plan = request['speed_segments']

def ffmpeg(*items):
    return subprocess.run(['ffmpeg', '-v', 'error', '-nostdin', '-threads', '2', '-y', *map(str, items)],
                          check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

with tempfile.TemporaryDirectory(prefix='studio-audio-stage-audit-') as temporary:
    # Match materialize_audio_input before mixing. Feeding the original MP3
    # directly bypasses the real worker's stereo 48k s16 ingest and measures
    # a different signal path, especially on bright/noisy cues.
    decoded_music = Path(temporary) / 'ingested-music.wav'
    ffmpeg('-i', music, '-vn', '-ac', '2', '-ar', '48000', '-acodec', 'pcm_s16le', decoded_music)
    cue_file = Path(temporary) / 'worker-cues.wav'
    voices = [effect for effect in effects if effect.get('kind') == 'voiceover']
    if voices:
        ingested_voice = Path(temporary) / 'ingested-voice.wav'
        ffmpeg('-i', args.voice_recording, '-vn', '-ac', '2', '-ar', '48000', '-acodec', 'pcm_s16le', ingested_voice)
        for effect in voices:
            resolved[effect['url']] = ingested_voice
    write_sound_mix(cue_file, [effect for effect in effects if effect.get('kind') != 'voiceover'], duration, plan, resolved, channels=2)
    automation, _ = build_volume_filter(request['audio_automation']['sfx'], duration, speed_plan=plan)
    cue_reference = args.output / 'diagnostic-worker-cues.wav'
    ffmpeg('-i', cue_file, '-af', automation or 'anull', '-c:a', 'pcm_s16le', cue_reference)
    music_volume = request['music_volume']
    if request['music_ducking'] and request['music_ducking_mode'] == 'constant':
        music_volume *= 1 - max(.05, min(.95, request['music_ducking_strength']))
    music_filters = [f'atrim=0:{duration:.3f}', 'asetpts=PTS-STARTPTS', f"volume={music_volume:.3f}",
                     f"afade=t=in:st=0:d={request['music_fade_in']:.3f}",
                     f"afade=t=out:st={duration-request['music_fade_out']:.3f}:d={request['music_fade_out']:.3f}"]
    music_automation, _ = build_volume_filter(request['audio_automation']['music'], duration, speed_plan=plan)
    if music_automation:
        music_filters.insert(3, music_automation)
    labels, extra_inputs, voice_graph = ['[music]', '[sfx]'], [], ''
    voice_automation, voice_file = None, None
    if voices:
        voice_file = Path(temporary) / 'worker-voice.wav'
        write_sound_mix(voice_file, voices, duration, plan, resolved, channels=2)
        voice_automation, _ = build_volume_filter(request['audio_automation']['voiceover'], duration, speed_plan=plan)
        voice_graph = f'[2:a]{voice_automation or "anull"}[voice];'
        labels.append('[voice]')
        extra_inputs = ['-i', voice_file]
    speech_sidechain = bool(request['music_ducking'] and request['music_ducking_mode'] == 'speech'
                            and any(v.get('enabled', True) and v['volume'] > 0 for v in voices))
    compressor = ('sidechaincompress=threshold=0.025:'
                  f"ratio={2 + max(.05, min(.95, request['music_ducking_strength'])) * 14:.2f}:attack=18:release=280")
    music_reference = args.output / 'diagnostic-worker-music.wav'
    music_graph = f'[0:a]{",".join(music_filters)}[music];'
    if speech_sidechain:
        # Match the renderer's post-trim/fade/retime/automation voice sidechain.
        # This fixture mutes source video; effects never enter the sidechain.
        ffmpeg('-i', decoded_music, '-i', voice_file, '-filter_complex_threads', '1', '-filter_complex',
               f'[0:a]{",".join(music_filters)}[music_raw];'
               f'[1:a]{voice_automation or "anull"}[voice_sidechain];'
               f'[music_raw][voice_sidechain]{compressor}[out]',
               '-map', '[out]', '-c:a', 'pcm_s16le', music_reference)
        voice_graph = (f'[2:a]{voice_automation or "anull"},asplit=2[voice][voice_sidechain];')
        music_graph = (f'[0:a]{",".join(music_filters)}[music_raw];'
                       f'[music_raw][voice_sidechain]{compressor}[music];')
    else:
        ffmpeg('-i', decoded_music, '-af', ','.join(music_filters), '-c:a', 'pcm_s16le', music_reference)
    graph = (f'{music_graph}[1:a]{automation or "anull"}[sfx];'
             f'{voice_graph}{build_audio_bus_mix(labels)};[a_mix_unpadded]'
             f'{build_studio_audio_delivery_filter(duration)}[out]')
    raw = args.output / 'diagnostic-worker-before-codec.wav'
    ffmpeg('-i', decoded_music, '-i', cue_file, *extra_inputs, '-filter_complex_threads', '1', '-filter_complex', graph,
           '-map', '[out]', '-c:a', 'pcm_s16le', raw)
    encoded = Path(temporary) / 'diagnostic-aac.m4a'
    ffmpeg('-i', raw, '-c:a', 'aac', '-b:a', '256k', encoded)
    decoded = args.output / 'diagnostic-worker-after-aac.wav'
    ffmpeg('-i', encoded, '-c:a', 'pcm_s16le', decoded)
export_file = args.delivery / args.stem / 'final.mp4'
export_wav = args.output / 'actual-export.wav'
ffmpeg('-i', export_file, '-vn', '-c:a', 'pcm_s16le', export_wav)

def read(path):
    with wave.open(str(path)) as wav:
        assert wav.getframerate() == 48000 and wav.getnchannels() == 2 and wav.getsampwidth() == 2
        return np.frombuffer(wav.readframes(wav.getnframes()), '<i2').reshape(-1, 2) / 32768

native = read(args.capture / ('native-preview-mix.wav' if args.bridge_mix else 'native-context-mix.wav'))
native_music = read(args.capture / 'native-context-music.wav')
native_cues = None if args.bridge_mix or voices else native - native_music
before, after, actual = map(read, [raw, decoded, export_wav])
cues = read(cue_reference)
anchor = next(x for x in receipt['starts'] if x.get('duration', 0) > 20)
origin = anchor['scheduledContextTime'] - receipt['nativeMusicCapture']['firstFrame'] / 48000 - anchor['offset']
mix_origin = (anchor['wallMs'] - receipt['startedAt']) / 1000 - anchor['offset'] if args.bridge_mix else origin

def measure(signal, reference, time, origin=0):
    first = max(0, round((time + origin - .2) * 48000))
    search = signal[first:round((time + origin + .5) * 48000)]
    target = reference[round(time * 48000):round((time + .3) * 48000)].copy()
    measured = pair_pcm_window(search, target)
    index = measured.pop('position', None)
    return {**measured, 'residualMs': ((first+index)/48000-time-origin)*1000 if index is not None else None}

rows = [{'outputSeconds': time,
         'nativeVsWorkerPcm': measure(native, before, time, mix_origin),
         'nativeMusicVsWorkerPcm': measure(native_music, read(music_reference), time, origin),
         **({'nativeCuesVsWorkerPcm': measure(native_cues, cues, time, origin)} if native_cues is not None else {}),
         'nativeVsDiagnosticAac': measure(native, after, time, mix_origin),
         'actualExportVsWorkerPcm': measure(actual, before, time),
         'diagnosticAacVsWorkerPcm': measure(after, before, time)}
        for time in ([.5, 5, 6, 6.7, 7.5, 8.2, 9, 10.2, 11, 12.9, 13.5, 14, 17, 19] if speech_sidechain
                     else [.5, 2.7, 3.5, 5, 6, 8, 11, 12.9, 13.2, 13.5, 14, 17, 19] if voices
                     else [.5, 2.5, 5, 8, 11, 12.9, 13.2, 13.5, 14, 17, 19])]
result = {'canonicalHash': canonical_hash, 'projectId': document['projectId'],
          'requestSha256': hashlib.sha256(request_file.read_bytes()).hexdigest(),
          'actualExportSha256': hashlib.sha256(export_file.read_bytes()).hexdigest(),
          'musicIngest': {'sampleRate': 48000, 'channels': 2, 'format': 'pcm_s16le', 'matchesWorkerMaterialization': True},
          'sourceHashes': source_hashes, 'outputSeconds': duration, 'windows': rows,
          'nativeMixScope': 'Cross-context bridge (includes native voiceover)' if args.bridge_mix else 'Shared music/SFX destination; media-element voice connection verified by native capture',
          'musicDucking': {'enabled': request['music_ducking'], 'mode': request.get('music_ducking_mode'),
                          'baseMusicGain': music_volume, 'speechSidechain': speech_sidechain,
                          'compressor': compressor if speech_sidechain else None},
          'scope': 'CPU diagnostic projection through existing worker cue/mix/automation functions; no Studio render, model, GPU or human sound/creative qualification. Actual native PCM/export unchanged.'}
(args.output / 'audio-stage-audit.json').write_text(json.dumps(result, indent=2)+'\n')
print(json.dumps(rows))
