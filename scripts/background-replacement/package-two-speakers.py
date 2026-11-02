"""Deliver actual native two-angle evidence; preserve every earlier delivery."""
from pathlib import Path
from html import escape
import hashlib
import json
import shutil
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[2]
REPORT = ROOT / 'reports/background-replacement-20261101'
PRIVATE = REPORT / 'private/two-speaker-r4'
DEMO = Path('/tmp/autopromote-application-demo-UByimw')
PARENT = Path('/home/tibule12/Videos/AutoPromote Background Replacement - 2026-11-01')
DEST = PARENT / 'Two-speaker revision'
DEST.mkdir(exist_ok=True)


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def copy(source, relative):
    target = DEST / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        assert digest(source) == digest(target), f'Refusing to overwrite {relative}'
    else:
        shutil.copy2(source, target)


def movie(args, relative):
    target = DEST / relative
    if not target.exists():
        subprocess.run(['ffmpeg', '-v', 'error', '-n', *args, str(target)], check=True)


for source, name in [
    (PRIVATE / 'two-speaker-native-export.mp4', 'Two speakers - background replacement.mp4'),
    (PRIVATE / 'final-native-recording/Studio - complete final playback.mp4', 'Studio - complete two-speaker playback.mp4'),
    (PRIVATE / 'final-native-recording/editable-timeline.png', 'Editable timeline.png'),
    (PRIVATE / 'two-speaker-final-project.autopromote.json', 'Editable Studio project.autopromote.json'),
    (REPORT / 'private/source-3s.mp4', 'Speaker 1 - source.mp4'),
    (PRIVATE / 'Speaker 2 - source 54-57s.mp4', 'Speaker 2 - source.mp4'),
    (PRIVATE / 'angle-1-preview.mp4', 'Speaker 1 - native preview.mp4'),
    (PRIVATE / 'angle-2-preview.mp4', 'Speaker 2 - native preview.mp4'),
    (REPORT / 'private/replacement.png', 'Replacement plate.png'),
    (REPORT / 'licenses.md', 'licenses.md'),
    (PRIVATE / 'source-provenance.json', 'source-provenance.json'),
    (PRIVATE / 'native-persistence.json', 'native-persistence.json'),
    (PRIVATE / 'export-media.json', 'export-media.json'),
    (PRIVATE / 'recording-media.json', 'recording-media.json'),
    (REPORT / 'two-speakers-validation.json', 'validation.json'),
    (PRIVATE / 'final-native-recording/studio-playback.json', 'studio-playback.json'),
    (PRIVATE / 'preview-export-comparison-canonical.json', 'preview-export-comparison.json'),
    (PRIVATE / 'effective-alpha-checks.json', 'effective-alpha-checks.json'),
]:
    copy(source, name)

models = [
    ('331c9030f85c40b06299e86ba2622971ab0b8dbb31800553f08870ebb1d5cfb5', '729d6556c9546cc43de7d2c000252422eacbebaf31f06ad00e2f1485815a88df'),
    ('3bff62b3c7e5ce09f8b35564d8c27556a8e5c51452e20c8a0febdb090ae041a7', '99df7e385154cd45e140cf8d02750cd89b39ba1b9603d8614eec66d424d7232e'),
]
for angle, (sam_job, alpha_job) in enumerate(models, 1):
    alpha = next((DEMO / 'model-jobs' / alpha_job).glob('*/outputs'))
    for filename, label in [
        ('component_masks.tar.gz', 'Separate object masks.tar.gz'),
        ('component_masks_manifest.json', 'object-mask-manifest.json'),
        ('subject_masks.tar.gz', 'Subject union masks.tar.gz'),
        ('subject_masks_manifest.json', 'subject-mask-manifest.json'),
    ]:
        if angle == 1:
            retained = {'component_masks.tar.gz': 'Separate object masks.tar.gz',
                        'component_masks_manifest.json': 'object-mask-manifest.json',
                        'subject_masks.tar.gz': 'Subject masks - source bound.tar.gz',
                        'subject_masks_manifest.json': 'subject-mask-manifest.json'}
            copy(PARENT / retained[filename], f'Speaker {angle}/{label}')
        else:
            sam = next((DEMO / 'model-jobs' / sam_job).glob('*/outputs'))
            copy(sam / filename, f'Speaker {angle}/{label}')
    for filename, label in [
        ('subject_masks.tar.gz', 'Model alpha - source bound.tar.gz'),
        ('subject_masks_manifest.json', 'model-alpha-manifest.json'),
        ('temporal_diagnostics.json', 'temporal-diagnostics.json'),
    ]:
        copy(alpha / filename, f'Speaker {angle}/{label}')
    effective = PRIVATE / f'angle-{angle}-effective'
    copy(effective / 'Effective alpha matte.mp4', f'Speaker {angle}/Effective alpha matte.mp4')
    copy(effective / 'effective-alpha.json', f'Speaker {angle}/effective-alpha.json')
    archive = DEST / f'Speaker {angle}/Effective compositor alpha - PNG frames.tar.gz'
    if not archive.exists():
        with tarfile.open(archive, 'w:gz') as bundle:
            bundle.add(effective / 'effective-alpha', arcname='effective-alpha')
            bundle.add(effective / 'effective-alpha.json', arcname='effective-alpha.json')
    movie(['-framerate', '24', '-i', str(alpha / 'subject_masks/matte_%04d.png'),
           '-frames:v', '72', '-c:v', 'libx264', '-crf', '16', '-pix_fmt', 'yuv420p',
           '-movflags', '+faststart'], f'Speaker {angle}/Model alpha - viewing copy.mp4')
    for path in (PRIVATE / f'angle-{angle}-review').iterdir():
        if path.is_file():
            copy(path, f'Speaker {angle}/Actual preview frame review/{path.name}')

for path in (PRIVATE / 'export-review').iterdir():
    if path.is_file():
        copy(path, f'Actual export frame review/{path.name}')

final = DEST / 'Two speakers - background replacement.mp4'
source_fit = 'scale=1430:1000:force_original_aspect_ratio=decrease,pad=1430:1000:(ow-iw)/2:(oh-ih)/2,fps=24,setsar=1,scale=960:540:force_original_aspect_ratio=decrease,pad=960:540:(ow-iw)/2:(oh-ih)/2'
movie(['-i', str(DEST / 'Speaker 1 - source.mp4'), '-i', str(DEST / 'Speaker 2 - source.mp4'), '-i', str(final),
       '-filter_complex', f'[0:v]{source_fit},setpts=PTS-STARTPTS[a];[1:v]{source_fit},setpts=PTS-STARTPTS[b];'
       '[a][b]concat=n=2:v=1:a=0,drawtext=text=Source:x=18:y=18:fontsize=25:fontcolor=white:box=1:boxcolor=black@0.8[s];'
       '[2:v]scale=960:540,drawtext=text=Replacement:x=18:y=18:fontsize=25:fontcolor=white:box=1:boxcolor=black@0.8[r];'
       '[s][r]hstack=inputs=2[v]', '-map', '[v]', '-map', '2:a', '-t', '6', '-c:v', 'libx264', '-crf', '16',
       '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart'], 'Source and replacement - movement comparison.mp4')

# Actual before and after frames, decoded at the same source-frame index.
movie(['-i', str(PARENT / 'Movement and equipment repair/Background replacement - movement repair.mp4'),
       '-i', str(final), '-filter_complex',
       '[0:v]select=eq(n\\,36),scale=960:540[a];[1:v]select=eq(n\\,36),scale=960:540[b];[a][b]hstack=inputs=2[v]',
       '-map', '[v]', '-frames:v', '1'], 'Speaker 1 - before and after.png')
movie(['-i', str(PRIVATE / 'rejected-second-tv-frame/angle-2-preview.mp4'), '-i', str(final),
       '-filter_complex', '[0:v]select=eq(n\\,36),scale=1430:1000:force_original_aspect_ratio=decrease,pad=1430:1000:(ow-iw)/2:(oh-ih)/2,scale=960:540:force_original_aspect_ratio=decrease,pad=960:540:(ow-iw)/2:(oh-ih)/2[a];'
       '[1:v]select=eq(n\\,108),scale=960:540[b];[a][b]hstack=inputs=2[v]',
       '-map', '[v]', '-frames:v', '1'], 'Speaker 2 - rejected TV strip and final.png')

readme = '''# Two speakers — actual native background-replacement revision

Open **review.html** or **Two speakers - background replacement.mp4**. The six-second native export contains the striped-shirt speaker for three seconds, followed by the cream-shirt/cap speaker for three seconds. These are different original source intervals, not simultaneous action or an enlarged picture-in-picture.

The first angle retains the previously repaired couch/moving hand and adds an existing native interior holdout to fill shirt/boom holes. The second uses new local SAM 2.1 person/three-object tracks and ViTMatte/source-conditioned temporal alpha, native corrective background clicks, and supplemental native TV-frame exclusions with narrow source-colour sleeve recovery. The large old TV strip is gone. The source-colour recovery matters when the sleeve crosses that region. This is not a claim that the neural model alone solved those remnants. No new editor or engine feature was added.

All 72 preview frames of each angle and all 144 final frames were visually inspected, including cap/head turns, moving hands/sleeve and microphone overlaps. Fine foliage/prop edge contamination and jagged detail remain. Physical relighting, reconstructed perspective, arbitrary camera/person motion, wispy hair and unrestricted occlusions are unqualified. This is bounded repair evidence, not professional approval.

The before/after stills put the prior/rejected output on the left and the actual latest native export on the right. The source/replacement moving comparison uses actual source frames, retains their motion, and carries the final soundtrack. No synthetic RGB, frozen movement or manually painted image evidence is substituted for export.

Source 1: cam-combiner-60sec.mp4 at 22.458333–25.458333s, crop x170/y40/1430×1000. Source 2: 54–57s, crop x430/y40/1440×1000. The 53–56s first trim was rejected because it contained a camera cut; the failed take remains private. Same CC0 room plate. Final: six seconds, 144 frames, 24fps, 1920×1080, H.264/AAC stereo. Fit full uses a shared 1430×1000 intermediate canvas before the 1920×1080 export, preserving source aspect with padding.

Native Save, cold reopen, final export and backup preserve the canonical document and both subject scenes exactly. The actual complete Studio recording shows the finished export with the editable two-angle timeline. Its soundtrack is the final exported audio muxed at the observed frame-display epoch (0.188076s); browser/device QA was muted. Capture smoothness is unqualified.

Separate object/union masks are segmentation intermediates. Model alpha is supplied separately from effective compositor alpha, which includes the actual saved edge/holdout/colour cleanup. Lossless PNG archives are authoritative; MP4 alpha copies are viewing aids. The backup references this running isolated local demo's owned media/artifacts; universal offline restore is not claimed. Source/masks/alpha/movies here are available independently.

Existing approved local model weights were reused, with new CPU inference for the second angle. No paid inference, production operation, deployment, merge, unrelated branch edit or new model purchase. Earlier deliveries and rejected previews remain preserved.
'''
(DEST / 'README.md').write_text(readme)
html = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Two-speaker background review</title><style>body{max-width:1200px;margin:32px auto;padding:0 20px;background:#10131b;color:#eee;font:17px system-ui;line-height:1.5}video,img{width:100%;background:#000}section{margin:36px 0}a{color:#b3c1ff}</style><h1>Both speakers — actual native replacement</h1><p>Two consecutive three-second angles from different source intervals. Large TV-frame remnant and shirt/boom holes repaired; fine foliage/prop edges remain unqualified.</p>'
for title, filename in [
    ('Six-second final', 'Two speakers - background replacement.mp4'),
    ('Actual source and replacement movement', 'Source and replacement - movement comparison.mp4'),
    ('Actual Studio playback and editable timeline', 'Studio - complete two-speaker playback.mp4'),
    ('First speaker native preview', 'Speaker 1 - native preview.mp4'),
    ('Second speaker native preview', 'Speaker 2 - native preview.mp4'),
    ('First source', 'Speaker 1 - source.mp4'),
    ('Second source', 'Speaker 2 - source.mp4'),
    ('First effective alpha', 'Speaker 1/Effective alpha matte.mp4'),
    ('Second effective alpha', 'Speaker 2/Effective alpha matte.mp4'),
]:
    html += f'<section><h2>{escape(title)}</h2><video controls playsinline preload="metadata" src="{escape(filename)}"></video></section>'
for title, filename in [
    ('First speaker — previous left, latest right', 'Speaker 1 - before and after.png'),
    ('Second speaker — rejected TV strip left, latest right', 'Speaker 2 - rejected TV strip and final.png'),
    ('Native editable timeline', 'Editable timeline.png'),
]:
    html += f'<section><h2>{escape(title)}</h2><img src="{escape(filename)}" alt="{escape(title)}"></section>'
html += '<h2>Evidence and source-bound project</h2><ul>'
for path in sorted(DEST.rglob('*')):
    if path.is_file() and path.suffix in ['.json', '.gz', '.md']:
        rel = str(path.relative_to(DEST))
        html += f'<li><a href="{escape(rel)}">{escape(rel)}</a></li>'
html += '</ul></html>'
(DEST / 'review.html').write_text(html)
manifest = {str(p.relative_to(DEST)): {'bytes': p.stat().st_size, 'sha256': digest(p)}
            for p in sorted(DEST.rglob('*')) if p.is_file() and p.name != 'files.sha256.json'}
(DEST / 'files.sha256.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({'delivery': str(DEST), 'files': len(manifest), 'exportSha256': digest(final)}, indent=2))
