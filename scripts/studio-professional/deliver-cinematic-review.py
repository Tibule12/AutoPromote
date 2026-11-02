"""Package verified native outputs. Only the comparison uses utility assembly."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import time

ROOT = Path(__file__).resolve().parents[2]
REPORT = ROOT / 'reports/studio-cinematic-episode-20261101'
TARGET = Path('/home/tibule12/Videos/AutoPromote Motion and Flow - 2026-11-01/Cinematic Episode')
REVISION = Path('Earlier revisions') / f'Before frame timing repair - {time.time_ns()}'
manifest = []


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def copy(source, destination):
    source, destination = Path(source), TARGET / destination
    assert source.is_file(), source
    destination.parent.mkdir(parents=True, exist_ok=True)
    sha = digest(source)
    if destination.exists() and digest(destination) != sha:
        retained = TARGET / REVISION / destination.relative_to(TARGET)
        retained.parent.mkdir(parents=True, exist_ok=True)
        destination.rename(retained)
        manifest.append({'file': str(retained.relative_to(TARGET)), 'sha256': digest(retained), 'bytes': retained.stat().st_size})
    shutil.copy2(source, destination)
    assert digest(destination) == sha
    manifest.append({'file': str(destination.relative_to(TARGET)), 'sha256': sha, 'bytes': destination.stat().st_size})


def probe(movie, frames):
    result = json.loads(subprocess.check_output([
        'ffprobe', '-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', str(movie)
    ]))
    video = next(s for s in result['streams'] if s['codec_type'] == 'video')
    assert int(video['nb_read_frames']) == frames, video
    assert video['avg_frame_rate'] == '24/1', video
    subprocess.run(['ffmpeg', '-v', 'error', '-i', str(movie), '-f', 'null', '-'], check=True, capture_output=True)
    return {'frames': frames, 'fps': '24/1', 'width': video['width'], 'height': video['height'],
            'seconds': float(result['format']['duration']), 'fullDecode': True}


def native(folder, prefix, frames, raw=False):
    output = folder / ('native-raw-source' if raw else 'native-motion-flow')
    movie = output / 'final.mp4'
    receipt = json.loads((output / 'render-receipt.json').read_text())
    assert digest(movie) == receipt['outputSha256'] == receipt['serverOutputSha256']
    checked = probe(movie, frames)
    copy(movie, prefix + '.mp4')
    # Exclude any temporary access locator or full request from the handoff.
    safe = {k: receipt[k] for k in ['startedAt', 'finishedAt', 'projectId', 'projectHash', 'submittedJobId', 'outputSha256']}
    safe['technical'] = checked
    return safe


def playback(folder, prefix):
    checks = {}
    for kind in ['live', 'finished']:
        evidence = json.loads((folder / f'{kind}-playback.json').read_text())
        assert evidence['complete']
        copy(folder / f'{kind}-playback/editing-in-studio.mp4', prefix + f'/Studio {kind} playback.mp4')
        recording = json.loads((folder / f'{kind}-playback/editing-recording.json').read_text())
        checks[kind] = {'programmeSeconds': evidence['duration'], 'wallSeconds': evidence['elapsedMs'] / 1000,
                        'decoderCallbacks': len(evidence['frames']), 'decoderQuality': evidence.get('quality'),
                        'events': evidence.get('events'), 'capture': recording}
    return checks


def main():
    # Complete all dependencies before writing a partial package.
    assert (REPORT / 'native-motion-flow/final.mp4').is_file()
    assert (REPORT / 'native-raw-source/final.mp4').is_file()
    assert json.loads((REPORT / 'neutral-grade.json').read_text())['disabledStored']
    for variant in ['typography', 'tracked', 'composite']:
        assert (REPORT / 'compositions' / variant / 'native-motion-flow/final.mp4').is_file()
        assert (REPORT / 'compositions' / variant / 'finished-playback.json').is_file()
    receipts = {'episode': native(REPORT, 'Every frame, intentional', 864),
                'raw': native(REPORT, 'Raw assembly', 864, raw=True)}
    receipts['episode']['playback'] = playback(REPORT, 'Episode')
    for name in ['Editable Project', 'Raw Project']:
        copy(REPORT / (name + '.autopromote.json'), name + '.autopromote.json')
    for index, (variant, name) in enumerate([
        ('typography', 'Outside the frame'), ('tracked', 'Life in motion'), ('composite', 'Make something impossible')
    ], 1):
        folder, prefix = REPORT / 'compositions' / variant, f'Compositions/{index} - {name}'
        receipts[variant] = native(folder, prefix + '/Final', 192)
        receipts[variant]['playback'] = playback(folder, prefix)
        copy(folder / 'Editable Project.autopromote.json', prefix + '/Editable Project.autopromote.json')
        copy(folder / 'paired-contact.jpg', prefix + '/Live vs export.jpg')
    provenance = ROOT / 'reports/studio-motion-flow-takeover-20261031/video-texture/open-world-source-manifest.json'
    for row in json.loads(provenance.read_text()):
        source = Path(row['original'])
        assert digest(source) == row['originalSha256']
        copy(source, 'Sources/Original stock/' + row['name'])
    copy(provenance, 'Sources/Source provenance.json')
    for source in (ROOT / 'reports/studio-motion-flow-takeover-20261031/video-texture/open-world-sources').glob('*.mp4'):
        copy(source, 'Sources/' + source.name)
    copy(REPORT / 'Episode original score-master.wav', 'Sources/Original score.wav')
    for still in sorted(REPORT.glob('preview-*.png')):
        copy(still, 'Stills/' + still.name)
    copy(REPORT / 'paired-contact.jpg', 'Episode/Live vs export.jpg')
    copy(REPORT / 'final-preflight.json', 'Technical/Source and build hashes.json')
    copy(REPORT / 'upload-recovery.json', 'Technical/Upload recovery.json')
    comparison = REPORT / 'Raw vs AutoPromote.mp4'
    subprocess.run([
        'ffmpeg', '-v', 'error', '-y', '-i', str(REPORT / 'native-raw-source/final.mp4'),
        '-i', str(REPORT / 'native-motion-flow/final.mp4'), '-filter_complex_threads', '2', '-filter_complex',
        "[0:v]scale=640:360,drawtext=text='RAW SOURCE':x=16:y=16:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.55[l];"
        "[1:v]scale=640:360,drawtext=text='AUTOPROMOTE NATIVE EDIT':x=16:y=16:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.55[r];"
        '[l][r]hstack=inputs=2[v]', '-map', '[v]', '-map', '1:a:0', '-r', '24', '-t', '36',
        '-c:v', 'libx264', '-threads', '2', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', str(comparison)
    ], check=True, capture_output=True)
    receipts['comparison'] = {'technical': probe(comparison, 864),
                              'packaging': 'Utility side-by-side of the two verified native exports; soundtrack from the edit. No evaluated effects are made here.'}
    copy(comparison, 'Raw vs AutoPromote.mp4')
    (TARGET / 'Technical/Native receipts and playback.json').write_text(json.dumps(receipts, indent=2))
    (TARGET / 'SHA256.json').write_text(json.dumps(manifest, indent=2))
    (REPORT / 'delivery.json').write_text(json.dumps({'directory': str(TARGET), 'files': manifest, 'native': receipts}, indent=2))
    print(json.dumps({'directory': str(TARGET), 'files': len(manifest), 'nativeFilms': 5}))


if __name__ == '__main__':
    main()
