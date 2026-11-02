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
PRIVATE = REPORT / 'private/body-edge-r5'
DEMO = Path('/tmp/autopromote-application-demo-UByimw')
PARENT = Path('/home/tibule12/Videos/AutoPromote Background Replacement - 2026-11-01')
DEST = PARENT / 'Speaker edge refinement'
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
    (REPORT / 'private/two-speaker-r4/Speaker 2 - source 54-57s.mp4', 'Speaker 2 - source.mp4'),
    (PRIVATE / 'angle-1-preview.mp4', 'Speaker 1 - native preview.mp4'),
    (PRIVATE / 'angle-2-preview.mp4', 'Speaker 2 - native preview.mp4'),
    (REPORT / 'private/replacement.png', 'Replacement plate.png'),
    (REPORT / 'licenses.md', 'licenses.md'),
    (PRIVATE / 'source-provenance.json', 'source-provenance.json'),
    (PRIVATE / 'native-persistence.json', 'native-persistence.json'),
    (PRIVATE / 'export-media.json', 'export-media.json'),
    (PRIVATE / 'recording-media.json', 'recording-media.json'),
    (REPORT / 'body-edge-validation.json', 'validation.json'),
    (PRIVATE / 'final-native-recording/studio-playback.json', 'studio-playback.json'),
    (PRIVATE / 'preview-export-comparison-canonical.json', 'preview-export-comparison.json'),
    (PRIVATE / 'effective-alpha-checks.json', 'effective-alpha-checks.json'),
    (PRIVATE / 'demo-recovery.json', 'demo-recovery.json'),
    (PRIVATE / 'person-track-preservation.json', 'person-track-preservation.json'),
]:
    copy(source, name)

models = json.loads((PRIVATE / 'model-jobs.json').read_text())
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
    for detail, crop in [('Face and neck', '280:340:390:130' if angle==1 else '520:560:530:40'),
                         ('Hands and clothing', '650:590:200:380' if angle==1 else '1110:600:330:400')]:
        movie(['-i',str(REPORT/f'private/two-speaker-r4/angle-{angle}-preview.mp4'),
               '-i',str(PRIVATE/f'angle-{angle}-preview.mp4'),'-filter_complex',
               f'[0:v]crop={crop},scale=740:-2,drawtext=text=Previous:x=10:y=10:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.8[a];'
               f'[1:v]crop={crop},scale=740:-2,drawtext=text=Current:x=10:y=10:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.8[b];[a][b]hstack=inputs=2[v]',
               '-map','[v]','-map','1:a','-c:v','libx264','-crf','15','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart'],
              f'Speaker {angle}/{detail} - actual moving comparison.mp4')
    review_folder = f'angle-{angle}-review' if angle == 1 else 'corrected-angle-2-review'
    for path in (PRIVATE / review_folder).iterdir():
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

movie(['-i', str(PARENT / 'Two-speaker revision/Two speakers - background replacement.mp4'), '-i', str(final),
       '-filter_complex', '[0:v]scale=960:540,drawtext=text=Previous:x=18:y=18:fontsize=25:fontcolor=white:box=1:boxcolor=black@0.8[a];'
       '[1:v]scale=960:540,drawtext=text=Current:x=18:y=18:fontsize=25:fontcolor=white:box=1:boxcolor=black@0.8[b];[a][b]hstack=inputs=2[v]',
       '-map','[v]','-map','1:a','-c:v','libx264','-crf','16','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart'],
      'Previous and current - actual movement.mp4')

# Actual before and after frames, decoded at the same source-frame index.
movie(['-i', str(PARENT / 'Two-speaker revision/Two speakers - background replacement.mp4'),
       '-i', str(final), '-filter_complex',
       '[0:v]select=eq(n\\,36),scale=960:540[a];[1:v]select=eq(n\\,36),scale=960:540[b];[a][b]hstack=inputs=2[v]',
       '-map', '[v]', '-frames:v', '1'], 'Speaker 1 - before and after.png')
movie(['-i', str(REPORT / 'private/two-speaker-r4/angle-2-preview.mp4'), '-i', str(final),
       '-filter_complex', '[0:v]select=eq(n\\,36),scale=1430:1000:force_original_aspect_ratio=decrease,pad=1430:1000:(ow-iw)/2:(oh-ih)/2,scale=960:540:force_original_aspect_ratio=decrease,pad=960:540:(ow-iw)/2:(oh-ih)/2[a];'
       '[1:v]select=eq(n\\,108),scale=960:540[b];[a][b]hstack=inputs=2[v]',
       '-map', '[v]', '-frames:v', '1'], 'Speaker 2 - previous and final.png')

readme = (REPORT / 'body-edge-repair.md').read_text().replace('(body-edge-validation.json)', '(validation.json)').replace('(</home/tibule12/Videos/AutoPromote Background Replacement - 2026-11-01/Speaker edge refinement/review.html>)', '(review.html)')
(DEST / 'README.md').write_text(readme)
html = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Two-speaker background review</title><style>body{max-width:1200px;margin:32px auto;padding:0 20px;background:#10131b;color:#eee;font:17px system-ui;line-height:1.5}video,img{width:100%;background:#000}section{margin:36px 0}a{color:#b3c1ff}</style><h1>Both speakers — body and edge refinement</h1><p>Two consecutive three-second angles from different source intervals. Model soft edges retained around faces, cap, neck, clothes and moving hands; corrected source selections replace the sleeve colour key. Review the remaining fine boundaries at full size.</p>'
for title, filename in [
    ('Six-second final', 'Two speakers - background replacement.mp4'),
    ('Actual source and replacement movement', 'Source and replacement - movement comparison.mp4'),
    ('Previous and current movement', 'Previous and current - actual movement.mp4'),
    ('Actual Studio playback and editable timeline', 'Studio - complete two-speaker playback.mp4'),
    ('First speaker native preview', 'Speaker 1 - native preview.mp4'),
    ('Second speaker native preview', 'Speaker 2 - native preview.mp4'),
    ('First source', 'Speaker 1 - source.mp4'),
    ('Second source', 'Speaker 2 - source.mp4'),
    ('First effective alpha', 'Speaker 1/Effective alpha matte.mp4'),
    ('Second effective alpha', 'Speaker 2/Effective alpha matte.mp4'),
    ('First speaker face and neck — previous left, current right', 'Speaker 1/Face and neck - actual moving comparison.mp4'),
    ('Second speaker face and neck — previous left, current right', 'Speaker 2/Face and neck - actual moving comparison.mp4'),
    ('First speaker hands and clothes — previous left, current right', 'Speaker 1/Hands and clothing - actual moving comparison.mp4'),
    ('Second speaker hands and clothes — previous left, current right', 'Speaker 2/Hands and clothing - actual moving comparison.mp4'),
]:
    html += f'<section><h2>{escape(title)}</h2><video controls playsinline preload="metadata" src="{escape(filename)}"></video></section>'
for title, filename in [
    ('First speaker — previous left, latest right', 'Speaker 1 - before and after.png'),
    ('Second speaker — previous left, latest right', 'Speaker 2 - previous and final.png'),
    ('Native editable timeline', 'Editable timeline.png'),
]:
    html += f'<section><h2>{escape(title)}</h2><img src="{escape(filename)}" alt="{escape(title)}"></section>'
details = PRIVATE / 'body-details'
if details.exists():
    for path in sorted(details.iterdir()):
        if path.is_file():
            copy(path, 'Body close-ups/' + path.name)
            if path.suffix == '.jpg':
                html += f'<section><h2>{escape(path.stem)}</h2><img src="Body close-ups/{escape(path.name)}" alt="Actual source, previous and current body detail"></section>'
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
