"""Package actual native Studio evidence; no movie/effect rendering here."""
from pathlib import Path
import hashlib,json,shutil

ROOT=Path(__file__).resolve().parents[2]
REPORT=ROOT/'reports/studio-preview-throughput-20261102'
VIDEOS=Path('/home/tibule12/Videos/AutoPromote Motion and Flow - 2026-11-01/Cinematic Episode')
DEST=VIDEOS/'Studio preview repair - 2026-11-02'
read=lambda name:json.loads((REPORT/name).read_text())
digest=lambda file:hashlib.sha256(file.read_bytes()).hexdigest()
baseline=read('live-baseline-r2/playback.json')
live=read('final-live/playback.json');hold=read('final-live/terminal-hold.json')
finished=read('final-native-review/finished-playback.json')
controls=read('native-controls-r3/native-controls.json');pause=read('final-native-review/pause.json')
binding=read('native-binding.json');paired=read('final-native-review/paired-measurements.json')
assert baseline['complete'] and live['complete'] and finished['complete']
assert hold['paused'] and hold['live'] and hold['sourceTime']>11.9 and hold['programme']>35.9
assert controls['canonicalDecisionsPreserved'] and pause['operatorPauseHoldsSource']
assert binding['canonicalCompositionMatchesOriginalAcceptedWorker'] and binding['independentNativeRestore']
assert finished['sha256']==binding['unchangedMovieSha256']
assert len(paired['samples'])==19
preserved=[]
for item in json.loads((VIDEOS/'SHA256.json').read_text()):
    p=(VIDEOS/item['file']).resolve();assert p.is_relative_to(VIDEOS)
    assert p.stat().st_size==item['bytes'] and digest(p)==item['sha256'],item['file']
    preserved.append(item['file'])
metrics={'date':'2026-11-02','project':'AutoPromote — Flowing worlds / Episode',
 'baselineLiveSeconds':baseline['elapsedMs']/1000,'latestLiveSeconds':live['elapsedMs']/1000,
 'finishedSeconds':finished['elapsedMs']/1000,'finishedDrops':finished['dropped'],
 'terminalHold':hold,'nativeControls':controls,'operatorPause':pause,'binding':binding,
 'pairs':19,'minimumSsim':min(r['ssim'] for r in paired['samples']),
 'minimumPsnr':min(r['psnr'] for r in paired['samples']),
 'liveCapture':read('final-live/editing-recording.json'),
 'finishedCapture':read('final-native-review/finished-playback/editing-recording.json'),
 'priorManifestFilesVerifiedUnchanged':len(preserved),'newNativeExports':0,
 'liveRealtimeQualified':False,'wholePictureParityPassed':False,'creativeQualityQualified':False,
 'humanListeningApproved':False,'readinessPromotion':False,'productionWrites':False,'paidCalls':0}
(REPORT/'validation.json').write_text(json.dumps(metrics,indent=2)+'\n')
files={
 'Live Studio playback.mp4':REPORT/'final-live/editing-in-studio.mp4',
 'Finished video playback.mp4':REPORT/'final-native-review/finished-playback/editing-in-studio.mp4',
 'Native controls.mp4':REPORT/'native-controls-r3/native-controls/editing-in-studio.mp4',
 'Editable project.autopromote.json':REPORT/'native-controls-r3/Verified native project.autopromote.json',
 'Native controls.png':REPORT/'native-controls-r3/native-controls.png',
 'Preview vs export.jpg':REPORT/'final-native-review/paired-contact.jpg',
 'Surface at 22.5s.png':REPORT/'final-native-review/preview-22.50.png',
 'Dissolve at 24.25s.png':REPORT/'final-native-review/preview-24.25.png',
 'Final held frame.png':REPORT/'final-live/terminal.png',
 'Checks.json':REPORT/'validation.json',
 'Build identity.json':REPORT/'final-preflight.json',
}
DEST.mkdir(exist_ok=True)
for name,source in files.items():
    target=DEST/name
    if target.exists():assert digest(target)==digest(source),'Preserve the existing review file: '+name
    else:shutil.copy2(source,target)
    assert digest(target)==digest(source)
text=f'''# Studio preview repair — 2 November 2026

[Watch the actual live Studio/timeline recording](Live%20Studio%20playback.mp4) · [Native editing controls](Native%20controls.mp4) · [Finished movie played in Studio](Finished%20video%20playback.mp4).

This repairs the existing **Flowing worlds** project. The creative edit and exported movie are unchanged. The requested professional creative standard remains unmet.

The local live run takes **{metrics['latestLiveSeconds']:.3f}s for 36 programme seconds**, compared with {metrics['baselineLiveSeconds']:.3f}s in the retained baseline. It now stops on programme 35.958333/source 11.958333, with Play available. Operator Pause also holds an advancing source. This is still slower than real time. The checks use a muted headless software browser; preparation, stalls and capture overhead are included. These are local observations, not portable performance guarantees.

The exact existing finished movie plays in Studio in **{metrics['finishedSeconds']:.3f}s**, with {metrics['finishedDrops']} reported dropped frame. Its H.264 export remains 36s/864 frames/24fps/1280×720. Decoder counters and screenshot capture rate are separate from encoded frame count and do not establish perceptual sound or whole-picture quality. The live screen recording contains {metrics['liveCapture']['frames']} captured updates across {metrics['liveCapture']['seconds']:.3f}s; its wall-time pacing is preserved.

Native corner editing, Undo/Redo, Save, scene-plan construction, invalid-plan rejection without mutation and an independent backup reopen pass. The project retains 49 overlays and 10,968 keys; its compiled composition matches the accepted original CPU job exactly. [Editable native project](Editable%20project.autopromote.json) · [visible controls](Native%20controls.png).

The repair indexes corner channels once per validation, requests the Flow inspector's canonical snapshot on action, prepares source cuts while original speech ducking is active, retains each slot's Web Audio graph and closes its analysis contexts, and prevents a queued ended event from refocusing an earlier shot. A paused presented-frame refresh was added for shared secondary textures. **It does not fix all paused texture differences:** the first seek to the 24.25s dissolve still differs from a repeated seek/export. Nineteen paired pictures retain minimum SSIM {metrics['minimumSsim']:.6f}/PSNR {metrics['minimumPsnr']:.4f}dB. Comparison guides are disabled. [Actual pairs](Preview%20vs%20export.jpg). Colour/edge/source-clock parity, remaining live drawing/startup cost, audible mix review and visible surface faceting remain open.

The previous [36-second movie](../Flowing%20worlds%20-%202026-11-02/Flowing%20worlds.mp4), raw source cuts, comparison and original recordings remain in their existing folders. All {len(preserved)} files in the previous Cinematic Episode manifest were verified unchanged. This folder's SHA256.json covers its new review files. No new native export, paid model/GPU/provider operation, production write, push, merge or deployment occurred.

Validation: 86 tests in eight focused frontend suites, plus five focused full-editor cut/music/end regressions; 39 retained/current geometry validation cases agree. The broader full-editor suite was not run. Builds preserve eight anonymous welcome comparisons and normal emulator sign-in/help. The build retains two mixed-operator lint warnings in an existing inspector condition. Earlier unsuccessful observers remain in the repository report; their results are not reclassified as passes. Repeated raw QA snapshot dumps were losslessly compressed; source media, editable backups and historical recordings remain intact.

Next shared repair: exact paused picture sampling for independent overlay clocks, then remaining live drawing/startup cost and colour/edge parity. Creative depth and the continuous-surface/3D limitations remain separate unfinished work. Whole Studio and the creative brief are not complete.
'''
(DEST/'README.md').write_text(text)
manifest=[{'file':p.name,'sha256':digest(p),'bytes':p.stat().st_size} for p in sorted(DEST.iterdir()) if p.is_file() and p.name!='SHA256.json']
(DEST/'SHA256.json').write_text(json.dumps(manifest,indent=2)+'\n')
(REPORT/'delivery.json').write_text(json.dumps({'directory':str(DEST),'files':manifest,'priorFilesVerifiedUnchanged':len(preserved)},indent=2)+'\n')
print(json.dumps({'delivery':str(DEST),'files':len(manifest),'priorFilesVerifiedUnchanged':len(preserved)}))
