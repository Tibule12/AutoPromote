"""Copy exact reviewed native outputs and their editable source packages."""
import hashlib
import json
import os
import shutil
from pathlib import Path

ROOT = Path('/dev/shm/autopromote-three-films')
OUT = Path('/home/tibule12/Videos/AutoPromote-Real-Motion-2026-10-29')
NAMES = [('aperture', '01-APERTURE'), ('city', '02-BLOCK-LIGHT'), ('chrono', '03-CHRONO')]


def sha(p):
    return hashlib.file_digest(p.open('rb'), 'sha256').hexdigest()


def main():
    OUT.mkdir(mode=0o700, exist_ok=True)
    records = []
    files = []

    def copy(source, relative):
        target = OUT / relative
        target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        digest = sha(source)
        if target.exists():
            assert sha(target) == digest, f'Preserve the existing different file: {target}'
        else:
            shutil.copy2(source, target)
        os.chmod(target, 0o600)
        assert sha(target) == digest
        files.append(dict(file=str(relative), bytes=target.stat().st_size, sha256=digest))

    for identity, name in NAMES:
        source = ROOT / identity
        episode = source / 'episode'
        validation = json.loads((episode / 'final/independent-validation.json').read_text())
        restored = json.loads((episode / 'independent-restore.json').read_text())
        playback = json.loads((episode / 'final/studio-playback.json').read_text())
        assert validation['sha256'] == restored['outputSha256']
        assert restored['noResubmission'] and playback['playback']['ended']
        copy(episode / 'final/final.mp4', name + '.mp4')
        copy(episode / 'thumbnail.png', Path('Thumbnails') / (name + '.png'))
        copy(source / 'native-core-final.mp4', Path('Results') / (name + '-motion.mp4'))
        copy(source / 'authoring-editing-in-studio.mp4', Path('Studio-recordings') / (name + '-authoring.mp4'))
        copy(source / 'teaching-in-studio.mp4', Path('Studio-recordings') / (name + '-controls.mp4'))
        copy(episode / 'final/edited-in-studio.mp4', Path('Studio-recordings') / (name + '-complete-final-playback.mp4'))
        for original, label in [
            (source / 'CORE.autopromote.json', 'editable-3D-scene.autopromote.json'),
            (source / 'core-export/DELIVERY.autopromote.json', 'result-delivery.autopromote.json'),
            (episode / 'EPISODE.autopromote.json', 'full-film.autopromote.json'),
            (source / 'core-export/final/render-receipt.json', 'result-render-receipt.json'),
            (episode / 'final/render-receipt.json', 'film-render-receipt.json'),
            (source / 'native-authored-render-spec.json', 'canonical-Blender-scene.json'),
            (episode / 'narration.mp3', 'synthetic-narration.mp3'),
            (episode / 'original-score.mp3', 'original-score.mp3'),
        ]:
            copy(original, Path('Editable-projects') / name / label)
        copy(episode / 'final/independent-validation.json', Path('Verification') / (name + '.json'))
        copy(episode / 'final/contact-sheet.png', Path('Verification') / (name + '-contact-sheet.png'))
        records.append(dict(identity=identity, file=name + '.mp4', durationSeconds=validation['durationSeconds'],
                            sha256=validation['sha256'], thumbnailSha256=validation['thumbnail']['sha256'],
                            nativeProjectHash=validation['nativeProjectHash'], completeMatchingPlayback=True,
                            independentExactRestore=True, ownerApproved=False, scheduled=False))

    copy(ROOT / 'source.mp4', Path('Editable-projects') / 'blank-scene-source.mp4')
    manifest = dict(date='2026-10-29', films=records, files=files, ownerApproved=False, scheduled=False,
                    source='Actual saved Studio object decisions, canonical local CUDA Blender render, normal Studio import and final native edit/export.',
                    limits='Generated 3D studies, not real camera footage. The two failed initial App preview jobs remain failed; direct canonical rendering does not prove their recovery. Browser capture cadence is separate from 24 fps final movies.')
    (OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    (OUT / 'README.txt').write_text(
        'APERTURE / BLOCK LIGHT / CHRONO\n\n'
        'The three top-level movies contain the finished motion and narrated whole-Studio walkthroughs (about 1 minute 50 seconds each).\n'
        'Results contains the separate eight-second motion films. Studio-recordings contains actual authoring, controls and complete matching finished playback.\n'
        'Editable-projects contains native 3D, result and full-film backups, render receipts, exact Blender scene inputs, narration, score and a blank scene source.\n'
        'Use Restore project backup in Studio. Source projects reference the private local demo; its retained emulator/media evidence and runtime configuration are in the private engineering proof. Saved 3D decisions and source bytes are retained even after that temporary server stops. No .blend animation is claimed.\n\n'
        'These are original generated 3D studies. Narration uses the local synthetic Kokoro bm_george preset. The score and effects are original synthesized sound, not location recordings.\n'
        'No movie has been scheduled or published. Exact movie and thumbnail approval remains yours.\n'
    )
    for p in [OUT / 'manifest.json', OUT / 'README.txt']:
        os.chmod(p, 0o600)
    print(json.dumps(dict(folder=str(OUT), films=records, exactCopies=len(files)), indent=2))


if __name__ == '__main__':
    main()
