#!/usr/bin/env python3
"""Measure retained native music PCM and the actual export, without editing either."""
import argparse
import hashlib
import json
import subprocess
import wave
from pathlib import Path

import numpy as np
from audio_signal_measurement import pair_pcm_window

parser = argparse.ArgumentParser()
parser.add_argument('capture_folder', type=Path)
parser.add_argument('canonical_document', type=Path)
parser.add_argument('owned_music', type=Path)
parser.add_argument('export_wav', type=Path)
parser.add_argument('--output-name', default='music-bus-and-mix-comparison.json')
parser.add_argument('--times', type=float, nargs='+', default=[.5, 2.5, 5, 8, 11, 14, 17, 19])
parser.add_argument('--exclude-direct-music', metavar='REASON',
                    help='Explicitly exclude an invalid independent music tap; whole-mix continuity is still mandatory')
args = parser.parse_args()
folder = args.capture_folder
receipt = json.loads((folder / 'native-preview-mix.json').read_text())
document = json.loads(args.canonical_document.read_text())
assert document['projectId'] == receipt['projectId']
canonical_hash = subprocess.check_output(['node', '-e',
    "const fs=require('node:fs');const {hash}=require('./src/creativeTemplates/contract');"
    "process.stdout.write(hash(JSON.parse(fs.readFileSync(process.argv[1]))));",
    str(args.canonical_document)], text=True)
assert canonical_hash == receipt['canonicalHash'], 'Different canonical revision'
music = document['audioGraph']['music']
assert hashlib.sha256(args.owned_music.read_bytes()).hexdigest() == music['contentHash']
settings = document['audioGraph']['settings']
assert not settings['musicDucking'] and not settings['audioRemix']['enabled']
assert not document.get('linkedTiming', {}).get('keys', {}).get('audioKeyframes.music')
duration = document['outputTimeMap'][-1]['outputRange']['endTick'] / 90000
fade_in, fade_out = music['fadeIn'], music['fadeOut']
# Diagnostic reference only: the exact retained music asset and the existing
# renderer's bounded trim/volume/fades. This file is not a Studio export.
filters = [f'atrim=0:{duration:.3f}', 'asetpts=PTS-STARTPTS', f"volume={music['volume']:.3f}"]
if fade_in > .005:
    filters.append(f'afade=t=in:st=0:d={fade_in:.3f}')
if fade_out > .005:
    filters.append(f'afade=t=out:st={max(0, duration-fade_out):.3f}:d={fade_out:.3f}')
reference_file = folder / 'diagnostic-music-reference.wav'
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(args.owned_music),
                '-af', ','.join(filters), '-ar', '48000', '-ac', '2', str(reference_file)], check=True)

def read(file):
    with wave.open(str(file)) as audio:
        assert audio.getframerate() == 48000 and audio.getnchannels() == 2 and audio.getsampwidth() == 2
        return np.frombuffer(audio.readframes(audio.getnframes()), dtype='<i2').reshape(-1, 2) / 32768

native_music = read(folder / 'native-preview-music.wav')
direct_music = (read(folder / 'native-context-music.wav')
                if not args.exclude_direct_music and (folder / 'native-context-music.wav').exists() else None)
direct_receipt = receipt.get('nativeMusicCapture')
direct_mix = read(folder / 'native-context-mix.wav') if direct_music is not None and (folder / 'native-context-mix.wav').exists() else None
native_mix = read(folder / 'native-preview-mix.wav')
music_reference = read(reference_file)
exported = read(args.export_wav)
assert len(native_music) == len(native_mix)
clocks = receipt['chunkClocks']
assert receipt['captureImplementation'] == 'AudioWorklet'
missing_samples = receipt['lastRecordedFrame'] - receipt['firstRecordedFrame'] - len(native_mix)
frame_gaps = [{'after': a['firstAudioFrame'] + a['sampleCount'], 'next': b['firstAudioFrame']}
              for a, b in zip(clocks, clocks[1:])
              if a['firstAudioFrame'] + a['sampleCount'] != b['firstAudioFrame']]
assert missing_samples == 0 and not frame_gaps, 'Incomplete audio-thread capture; refuse waveform comparison'
if direct_music is not None:
    assert direct_receipt['sampleRate'] == 48000
    assert len(direct_music) == direct_receipt['lastFrame'] - direct_receipt['firstFrame']
    assert all(a['firstAudioFrame']+a['sampleCount'] == b['firstAudioFrame']
               for a, b in zip(direct_receipt['chunks'], direct_receipt['chunks'][1:])), 'Native music PCM gap'
    if direct_mix is not None:
        assert len(direct_mix) == len(direct_music), 'Direct same-context mix PCM gap'
anchors = [x for x in receipt['starts'] if x['type'] == 'buffer' and x.get('duration', 0) > 20]
assert anchors

def compare(live, final, time, expected, length=.3):
    reference = final[round(time*48000):round((time+length)*48000)].copy()
    first = max(0, round((expected-.2)*48000))
    search = live[first:min(len(live), round((expected+length+.2)*48000))]
    if len(search) < len(reference) or not len(reference):
        return {'outputSeconds': time, 'status': 'INSUFFICIENT_CAPTURE'}
    measured = pair_pcm_window(search, reference)
    if measured['status'] != 'MEASURED':
        return {'outputSeconds': time, **measured}
    position = measured['position']
    return {'outputSeconds': time, 'expectedNativeSeconds': expected,
            'nativeSeconds': (first+position)/48000,
            'anchorResidualMs': ((first+position)/48000-expected)*1000,
            'stereoCorrelation': measured['correlation'],
            'levelRatio': measured['levelRatio'],
            'dcDifference': measured['dcDifference'],
            'relativeRmsError': measured['relativeRmsError'],
            'status': 'MEASURED'}

rows = []
for time in args.times:
    previous = [a for a in anchors if a['offset'] <= time]
    anchor = previous[-1] if previous else anchors[0]
    scheduled_context_time = anchor.get('scheduledContextTime', anchor['contextTime']+anchor.get('scheduledDelay', 0))
    expected = (anchor['wallMs']-receipt['startedAt'])/1000 + anchor.get('scheduledDelay', 0) + time-anchor['offset']
    crosses_anchor = any(time < a['offset'] < time+.3 for a in anchors)
    rows.append({'outputSeconds': time, 'crossesObservedMusicRestart': crosses_anchor,
                 'musicBusDiagnostic': compare(native_music, music_reference, time, expected),
                 'directNativeMusicBus': compare(direct_music, music_reference, time,
                    scheduled_context_time - direct_receipt['firstFrame']/48000 + time-anchor['offset'])
                    if direct_music is not None else None,
                 'actualExportWholeMix': compare(native_mix, exported, time, expected)})
    if direct_mix is not None:
        rows[-1]['actualExportDirectContextMix'] = compare(direct_mix, exported, time,
            scheduled_context_time - direct_receipt['firstFrame']/48000 + time-anchor['offset'])
result = {'projectId': receipt['projectId'], 'canonicalHash': receipt['canonicalHash'],
          'exportAudioSha256': hashlib.sha256(args.export_wav.read_bytes()).hexdigest(),
          'ownedMusicSha256': music['contentHash'], 'comparisonSampleRate': 48000,
          'capture': {'implementation': 'AudioWorklet', 'samples': len(native_mix),
                      'missingSamples': missing_samples, 'frameGaps': frame_gaps},
          'windows': rows,
          'scope': 'Independent actual post-gain music bus versus a CPU diagnostic music reference, '
                   'and actual whole native mix versus the fully decoded existing Studio export. '
                   f'{len(rows)} windows only; restarts/pauses and MediaStream bridge latency remain visible. '
                   'No shifted/regenerated Studio output, full-film conformance or listening approval.',
          'wholeFilmSoundParity': 'UNQUALIFIED', 'humanListening': False}
# The current native capture observes the song context and source time in the
# same callback. Retain cut drift separately from waveform correlation; never
# infer a continuous clock merely because short excerpts can be aligned.
occurrences = {x['occurrenceId']: x for x in document['clipOccurrences']}
drift_by_occurrence = {}
unmatched_clock_rows = 0
for row in clocks:
    occurrence = occurrences.get(row['nativeClipId'])
    if occurrence is None or row.get('musicPosition') is None:
        unmatched_clock_rows += 1
        continue
    source_tick = row['sourceTime'] * 90000
    source_range = occurrence['sourceRange']
    if not source_range['startTick'] <= source_tick < source_range['endTick']:
        unmatched_clock_rows += 1
        continue
    # These particular canonical occurrences use the existing 1x source to
    # programme mapping. Refuse to relabel other source maps as measured proof.
    assert occurrence['playback']['rate'] == {'numerator': 1, 'denominator': 1}
    programme_tick = occurrence['programmeRange']['startTick'] + source_tick-source_range['startTick']
    segment = next(s for s in document['outputTimeMap']
                   if s['programmeRange']['startTick'] <= programme_tick < s['programmeRange']['endTick'])
    output_seconds = (segment['outputRange']['startTick'] +
                      (programme_tick-segment['programmeRange']['startTick']) *
                      segment['rateDenominator']/segment['rateNumerator']) / 90000
    drift_by_occurrence.setdefault(occurrence['occurrenceId'], []).append(
        (row['musicPosition']-music.get('trimStart', 0)-output_seconds)*1000)
if drift_by_occurrence:
    result['observedClockDrift'] = {
        'scope': 'Same-callback running song position minus canonical source-mapped output position; '
                 'includes stalls, handoff and final reset observations. Diagnostic, not full A/V qualification.',
        'unmatchedRows': unmatched_clock_rows,
        'occurrences': [{'occurrenceId': key, 'samples': len(values), 'firstMs': values[0],
                         'minimumMs': min(values), 'maximumMs': max(values),
                         'medianMs': float(np.median(values)),
                         'outside80Ms': sum(abs(x) > 80 for x in values)}
                        for key, values in drift_by_occurrence.items()]}
if args.exclude_direct_music:
    result['excludedDirectMusicCapture'] = {'status': 'NOT_QUALIFIED', 'reason': args.exclude_direct_music}
assert Path(args.output_name).name == args.output_name and args.output_name.endswith('.json')
(folder / args.output_name).write_text(json.dumps(result, indent=2)+'\n')
print(json.dumps({'missingSamples': missing_samples, 'windows': len(rows),
                  'musicCorrelations': [x['musicBusDiagnostic'].get('stereoCorrelation') for x in rows],
                  'directMusicCorrelations': [x['directNativeMusicBus'].get('stereoCorrelation')
                    if x['directNativeMusicBus'] else None for x in rows],
                  'mixCorrelations': [x['actualExportWholeMix'].get('stereoCorrelation') for x in rows]}))
if direct_mix is not None:
    print(json.dumps({'directContextMixCorrelations': [x['actualExportDirectContextMix'].get('stereoCorrelation') for x in rows],
                      'scope': direct_receipt['scope']}))
