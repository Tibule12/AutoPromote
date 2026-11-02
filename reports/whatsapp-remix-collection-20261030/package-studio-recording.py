"""Package real Studio authoring and its captured browser-audio playback."""
import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np

root = Path(sys.argv[1]).resolve()
preset = sys.argv[2]
project = root / preset
delivery = json.loads((project / 'delivery.json').read_text())
sync = json.loads((project / 'playback-sync.json').read_text())
assert sync.get('syncStatus', sync['status']) == 'PASS', 'Capture must pass the timing check'
movie = root / delivery['file']
assert hashlib.sha256(movie.read_bytes()).hexdigest() == delivery['sha256']
pcm = np.frombuffer(subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(movie),
    '-vn', '-ac', '2', '-ar', '48000', '-f', 'f32le', 'pipe:1'], timeout=90), dtype='<f4').reshape(-1, 2)
audit = dict(finite=bool(np.isfinite(pcm).all()), peak=float(np.max(np.abs(pcm))),
    rms=float(np.sqrt(np.mean(pcm**2))), clippedSamples=int(np.count_nonzero(np.abs(pcm) >= 1)),
    dcOffset=float(abs(pcm.mean())), duration=len(pcm)/48000)
assert audit['finite'] and audit['clippedSamples'] == 0 and audit['rms'] > .005
(project / 'delivered-audio-audit.json').write_text(json.dumps(audit, indent=2))
out = Path(os.environ.get('STUDIO_DELIVERY_DIRECTORY', '/home/tibule12/Videos/AutoPromote Remix Collection 2026-10-30'))
recordings = out / 'Studio recordings'
recordings.mkdir(exist_ok=True)
finals = out / 'Final'
finals.mkdir(exist_ok=True)
shutil.copy2(movie, finals / (delivery['name'] + '.mp4'))
shutil.copy2(movie, out / (delivery['name'] + '.mp4'))
making = recordings / (delivery['name'] + ' — Making the edit.mp4')
if not making.exists():
    setup = (project / 'BEFORE-SETUP.autopromote.json').stat().st_mtime
    end = (project / 'BEFORE-DELIVERY.autopromote.json').stat().st_mtime
    candidates = []
    for file in (root / 'editing-recordings').glob('*.webm'):
        born = int(subprocess.check_output(['stat', '-c', '%W', str(file)]))
        if born <= setup <= file.stat().st_mtime + 5:
            candidates.append((born, file))
    assert candidates, 'Retain the original actual authoring recording'
    born, source = max(candidates)
    start, stop = max(0, setup-born-5.5), end-born+10
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(start), '-i', str(source),
        '-t', str(stop-start), '-an', '-c:v', 'libx264', '-threads', '2', '-preset', 'veryfast',
        '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(making)], check=True, timeout=120)
    (project / 'making-of-extraction.json').write_text(json.dumps(dict(recording=str(source),
        actualStudioScreen=True, audioCaptured=False, clipStart=start, clipEnd=stop, output=str(making)), indent=2))
playback = project / 'Studio — full synchronized playback.mp4'
duration = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=nw=1:nk=1', str(making)]))
output = project / 'Studio — edit and full playback.mp4'
if output.exists():
    retained = project / 'earlier-linear-edit-then-playback.mp4'
    if not retained.exists():
        shutil.copy2(output, retained)
temporary = project / 'studio-combined-encoding.mp4'
shot = min(3, duration/3)
middle = max(shot, (duration-shot)/2)
last = max(0, duration-shot)
filters = (
    '[0:v]scale=1280:900:force_original_aspect_ratio=decrease,pad=1280:900:(ow-iw)/2:(oh-ih)/2,'
    'setsar=1,fps=25,split=3[edit0][edit1][edit2];'
    f'[edit0]trim=start=0:duration={shot},setpts=PTS-STARTPTS[e0];'
    f'[edit1]trim=start={middle}:duration={shot},setpts=PTS-STARTPTS[e1];'
    f'[edit2]trim=start={last}:duration={shot},setpts=PTS-STARTPTS[e2];'
    '[e0][e1][e2]concat=n=3:v=1:a=0[edit];'
    '[1:v]scale=1280:900:force_original_aspect_ratio=decrease,pad=1280:900:(ow-iw)/2:(oh-ih)/2,'
    'setsar=1,fps=25,split=2[teaserbase][finishedbase];'
    '[teaserbase]trim=start=0:duration=3,setpts=PTS-STARTPTS[teaser];'
    '[finishedbase]setpts=PTS-STARTPTS[finished];'
    '[1:a]aresample=48000,aformat=channel_layouts=stereo,asplit=3[s0][s1][s2];'
    '[s0]atrim=start=0:duration=3,asetpts=PTS-STARTPTS[hookaudio];'
    f'[s1]atrim=start=3:duration={shot*3},asetpts=PTS-STARTPTS,volume=0.30[editbed];'
    '[s2]asetpts=PTS-STARTPTS[sound];'
    '[teaser][hookaudio][edit][editbed][finished][sound]concat=n=3:v=1:a=1[v][a]'
)
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(making), '-i', str(playback),
    '-filter_complex', filters,
    '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-threads', '2', '-preset', 'veryfast',
    '-crf', '20', '-c:a', 'aac', '-b:a', '192k', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    str(temporary)], check=True, timeout=300)
temporary.replace(output)
target = recordings / (delivery['name'] + ' — Studio edit and full playback.mp4')
shutil.copy2(output, target)
receipt = dict(preset=preset, name=delivery['name'], file=str(output.relative_to(root)),
    sha256=hashlib.sha256(output.read_bytes()).hexdigest(), videosFile=str(target),
    actualStudioScreen=True, realBrowserPlaybackAudio=True, editingCaptureHasAudio=False,
    editingBedSource='actual captured final soundtrack, mixed underneath the edited screen footage',
    structure=['3s audible finished Hook', 'three actual 3s authoring shots', 'complete final Studio playback'],
    actualOwnerAccount=delivery.get('actualOwnerAccount') is True,
    accountContext='genuine owner account in local Studio' if delivery.get('actualOwnerAccount') else 'isolated local test account; do not publish as the owner account',
    finalMediaSha256=delivery['sha256'],
    nativeSourceEnd=json.loads((project/'FINAL-EDITABLE.autopromote.json').read_text())['snapshot']['timeline'][-1]['endRequest'], nativeOpeningHook=True, wideRoundedAfter=True,
    syncStatus=sync.get('syncStatus'), smoothnessStatus=sync.get('smoothnessStatus'),
    smoothnessQualified=sync.get('smoothnessStatus') == 'PASS', audioAudit=audit)
(project / 'studio-recording-delivery.json').write_text(json.dumps(receipt, indent=2))
print(json.dumps(dict(preset=preset, delivered=str(target), syncStatus=receipt['syncStatus'],
    smoothnessQualified=receipt['smoothnessQualified'], audioClippedSamples=audit['clippedSamples'])))
