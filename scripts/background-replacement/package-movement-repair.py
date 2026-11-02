"""Package actual native evidence without changing or overwriting earlier deliveries."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[2]
PRIVATE = ROOT / 'reports/background-replacement-20261101/private/opaque-repair-r3'
DEMO = Path('/tmp/autopromote-application-demo-UByimw')
PARENT = Path('/home/tibule12/Videos/AutoPromote Background Replacement - 2026-11-01')
DEST = PARENT / 'Movement and equipment repair'
MODEL = DEMO / 'model-jobs/729d6556c9546cc43de7d2c000252422eacbebaf31f06ad00e2f1485815a88df/40254b94-af0e-4c69-9c76-d8f7139627c6/outputs'
DEST.mkdir(parents=True, exist_ok=True)


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def copy(source, name):
    target = DEST / name
    if target.exists():
        if digest(source) != digest(target):
            raise ValueError(f'Refusing to overwrite different delivery: {name}')
    else:
        shutil.copy2(source, target)


def movie(args, name):
    target = DEST / name
    if not target.exists():
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-n', *args, str(target)], check=True)


for source, name in [
    (DEMO / 'background-native-export.mp4', 'Background replacement - movement repair.mp4'),
    (DEMO / 'replacement-preview.mp4', 'Native replacement preview.mp4'),
    (DEMO / 'background-final-project.autopromote.json', 'Editable Studio project.autopromote.json'),
    (PRIVATE / 'final-native-recording/Studio - complete final playback.mp4', 'Studio - complete final playback.mp4'),
    (PRIVATE / 'final-native-recording/editable-timeline.png', 'Editable timeline.png'),
    (PRIVATE / 'final-native-recording/studio-playback.json', 'studio-playback.json'),
    (PRIVATE / 'native-persistence.json', 'native-persistence.json'),
    (PRIVATE / 'media-verification.json', 'media-verification.json'),
    (ROOT / 'reports/background-replacement-20261101/private/source-3s.mp4', 'Source - Studio crop - 3 seconds.mp4'),
    (PARENT / 'Motion stability revision/Revised background replacement.mp4', 'Before - previous movement revision.mp4'),
    (PARENT / 'Separate object masks.tar.gz', 'Separate object masks.tar.gz'),
    (PARENT / 'Subject masks - source bound.tar.gz', 'Subject masks - source bound.tar.gz'),
    (PARENT / 'object-mask-manifest.json', 'object-mask-manifest.json'),
    (PARENT / 'subject-mask-manifest.json', 'subject-mask-manifest.json'),
    (PARENT / 'Replacement plate.png', 'Replacement plate.png'),
    (MODEL / 'subject_masks.tar.gz', 'Model alpha - source bound.tar.gz'),
    (MODEL / 'subject_masks_manifest.json', 'model-alpha-manifest.json'),
    (MODEL / 'temporal_diagnostics.json', 'temporal-diagnostics.json'),
    (PRIVATE / 'effective-final/Effective alpha matte.mp4', 'Effective alpha matte.mp4'),
    (PRIVATE / 'effective-final/effective-alpha.json', 'effective-alpha.json'),
    (ROOT / 'reports/background-replacement-20261101/licenses.md', 'licenses.md'),
]:
    copy(source, name)

archive = DEST / 'Effective compositor alpha - PNG frames.tar.gz'
if not archive.exists():
    with tarfile.open(archive, 'w:gz') as output:
        output.add(PRIVATE / 'effective-final/effective-alpha', arcname='effective-alpha')
        output.add(PRIVATE / 'effective-final/effective-alpha.json', arcname='effective-alpha.json')

review = DEST / 'Actual frame review'
review.mkdir(exist_ok=True)
for path in (PRIVATE / 'final-export-review').iterdir():
    target = review / path.name
    if not target.exists():
        shutil.copy2(path, target)

movie(['-framerate', '24', '-i', str(MODEL / 'subject_masks/matte_%04d.png'),
       '-frames:v', '72', '-c:v', 'libx264', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'],
      'Model alpha matte - visualisation.mp4')

before = DEST / 'Before - previous movement revision.mp4'
after = DEST / 'Background replacement - movement repair.mp4'
base = ['-i', str(before), '-i', str(after)]
movie([*base, '-filter_complex',
       '[0:v]scale=960:540,drawtext=text=Before:x=18:y=18:fontsize=26:fontcolor=white:box=1:boxcolor=black@0.8[a];'
       '[1:v]scale=960:540,drawtext=text=After:x=18:y=18:fontsize=26:fontcolor=white:box=1:boxcolor=black@0.8[b];'
       '[a][b]hstack=inputs=2[v]', '-map', '[v]', '-map', '1:a',
       '-c:v', 'libx264', '-crf', '16', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart'],
      'Before and after - moving comparison.mp4')

for name, roi in [('Couch and hand', '440:480:0:520'), ('Microphone supports', '690:340:740:480')]:
    movie([*base, '-filter_complex',
           f'[0:v]crop=1544:1080:188:0,scale=1430:1000,crop={roi}[a];'
           f'[1:v]crop=1544:1080:188:0,scale=1430:1000,crop={roi}[b];'
           '[a][b]hstack=inputs=2[v]', '-map', '[v]', '-map', '1:a', '-c:v', 'libx264',
           '-crf', '15', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart'],
          f'{name} - moving comparison.mp4')

(DEST / 'README.md').write_text('''# Movement and equipment repair — actual three-second shot

Open **review.html** for the moving before/after, original source, native preview, final export, masks, alpha and real Studio recording. The comparison movies show the previous revision on the left and this repair on the right. No slowed, frozen or fabricated RGB frames are used.

The couch now retains its curved surface as the right arm moves; the former mic-support cut-throughs are repaired. All 72 native preview and exported frames were inspected, including hand/microphone overlaps and frames 35–37 around the corrective click. Fine plant colour contamination and compressed source edge detail remain visible. This is a bounded improvement, not professional approval or qualification of arbitrary movement, hair, camera motion or physical relighting.

Source: cam-combiner-60sec.mp4, interval 22.458333–25.458333 seconds, disclosed crop x170/y40/1430×1000. Same room plate and six foreground object selections. Final: 3 seconds, 72 frames, 1920×1080, 24fps, H.264/AAC with speech. Preview uses the same owned artifact and canonical compositor; final Fit full adds side bars and encoding differences. Every image in Actual frame review is decoded movie evidence.

Model alpha is the source-bound intermediate. Effective compositor alpha includes the actual saved native edge/colour cleanup and is supplied losslessly as PNGs; its MP4 is only a viewing copy. SAM object and union masks are the original tracked segmentation inputs, not relabelled as the final alpha.

Native Save, cold reopen, final export and final backup preserve the canonical document and all subject scenes exactly. The complete Studio recording shows the actual finished export and editable timeline, with ended playback. Its soundtrack is the actual exported audio muxed at the observed frame display epoch (0.138934s); QA browser/device was muted. Capture smoothness is unqualified.

The recovered local demo verified immutable original inputs, ownership, source generation and hashes before import. Fresh demo wallet/job history was not reconstructed. The editable backup references this running local demo's media; universal offline restore is not claimed. All source/mask/alpha/final files here are independently available for inspection. Earlier failed candidates remain retained privately and earlier deliveries are preserved. No paid inference, deployment, merge or production change.
''')

sections = [
    ('Final export', 'Background replacement - movement repair.mp4'),
    ('Before and after — real movement', 'Before and after - moving comparison.mp4'),
    ('Couch and moving hand — before left, after right', 'Couch and hand - moving comparison.mp4'),
    ('Mic supports — before left, after right', 'Microphone supports - moving comparison.mp4'),
    ('Actual Studio playback and editable timeline', 'Studio - complete final playback.mp4'),
    ('Source crop', 'Source - Studio crop - 3 seconds.mp4'),
    ('Native replacement preview', 'Native replacement preview.mp4'),
    ('Effective compositor alpha', 'Effective alpha matte.mp4'),
    ('Model alpha intermediate', 'Model alpha matte - visualisation.mp4'),
]
html = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Moving background replacement review</title><style>body{max-width:1200px;margin:32px auto;padding:0 20px;background:#10131b;color:#eee;font:17px system-ui;line-height:1.5}video,img{width:100%;background:#000}section{margin:36px 0}a{color:#adbbff}button{font:inherit;padding:8px;margin-right:8px}</style><h1>Movement and equipment repair</h1><p>Same failed three-second shot. Inspect the moving couch edge, hand and mic supports. Fine plant spill/detail remains unresolved; this is not a professional-quality approval.</p>'''
from html import escape
for title, filename in sections:
    html += f'<section><h2>{escape(title)}</h2><video controls playsinline preload="metadata" src="{escape(filename)}"></video></section>'
html += '<section><h2>Exact before/after frames</h2><img src="Actual frame review/before-after-0036.jpg" alt="Same decoded frame before left and after right"><img src="Actual frame review/focused-couch-hand.jpg" alt="Source, before and after couch"><img src="Actual frame review/focused-mic-stand.jpg" alt="Source, before and after microphone supports"></section><h2>Source evidence and editable project</h2><ul>'
for filename in ['Editable Studio project.autopromote.json','Separate object masks.tar.gz','Subject masks - source bound.tar.gz','Model alpha - source bound.tar.gz','Effective compositor alpha - PNG frames.tar.gz','native-persistence.json','studio-playback.json','licenses.md','README.md']:
    html += f'<li><a href="{escape(filename)}">{escape(filename)}</a></li>'
html += '</ul><p>Lossless PNG bundles are authoritative alpha evidence. MP4 alpha views are lossy visualisations. Earlier movies are preserved.</p></html>'
(DEST / 'review.html').write_text(html)
manifest = {str(path.relative_to(DEST)): {'bytes': path.stat().st_size, 'sha256': digest(path)}
            for path in sorted(DEST.rglob('*')) if path.is_file() and path.name != 'files.sha256.json'}
(DEST / 'files.sha256.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({'delivery': str(DEST), 'files': len(manifest), 'exportSha256': digest(after)}, indent=2))
