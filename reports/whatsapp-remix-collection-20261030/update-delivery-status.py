"""Publish a local, credential-free inventory of the actual delivered files."""
import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

report = Path(__file__).resolve().parent
root = report / 'private/own-account-local-v5'
videos = Path('/home/tibule12/Videos/AutoPromote Remix Collection 2026-10-30')
order = ['chipmunk', 'slowed_reverb', 'sped_up']
entries = []
for preset in order:
    directory = root / preset
    receipt = directory / 'delivery.json'
    if not receipt.exists():
        entries.append(dict(preset=preset, native=False, combined=False, publication='Pending'))
        continue
    d = json.loads(receipt.read_text())
    assert d['actualOwnerAccount'] is True
    source = root / d['file']
    assert hashlib.sha256(source.read_bytes()).hexdigest() == d['sha256']
    for target in [videos / source.name, videos / 'Final' / source.name]:
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest() != d['sha256']:
            previous = videos / 'Earlier versions/Before genuine-account recovery' / (target.parent.name+'-'+target.name)
            previous.parent.mkdir(parents=True, exist_ok=True)
            if not previous.exists():
                shutil.copy2(target, previous)
        shutil.copy2(source, target)
    combined = directory / 'studio-recording-delivery.json'
    c = json.loads(combined.read_text()) if combined.exists() else {}
    publication = directory / 'publication.json'
    p = json.loads(publication.read_text()) if publication.exists() else {}
    state = 'Pending'
    outcomes = directory / 'platform-outcomes.json'
    if outcomes.exists() and all(row.get('success') for row in json.loads(outcomes.read_text())):
        state = 'Five successful provider responses'
    elif p.get('contentId'):
        count = len(p.get('observedDestinations', []))
        state = f'{count} Queue destinations observed' if count else 'Upload acknowledged; reconcile Queue'
    entries.append(dict(preset=preset, name=d['name'], native=True,
        finalFile=str(videos/source.name), sha256=d['sha256'], combined=bool(c),
        combinedFile=c.get('videosFile'), sync=c.get('syncStatus'),
        smoothness=c.get('smoothnessStatus'), publication=state))
status = dict(at=datetime.now(timezone.utc).isoformat(), nativeCount=sum(e['native'] for e in entries),
    combinedCount=sum(e['combined'] for e in entries), total=len(order), entries=entries,
    reddit='Blocked by current five-destination release limit; no plan change',
    productionControlFixesDeployed=False, wholeControlConformance=False)
(report/'current-status.json').write_text(json.dumps(status, indent=2)+'\n')
lines = [f"# Selected three: {status['nativeCount']}/3 final files, {status['combinedCount']}/3 combined Studio recordings", '',
    'The owner selected these three and requested captions in Studio. Captioned revisions are in progress. Further remix variants and publication automation have been stopped.', '',
    'Current combined recordings use the genuine owner account in local Studio at localhost:5008. Earlier demo-account recordings are retained under Earlier versions.', '',
    'Each combined file opens with the actual finished Hook, shows three short actual editing shots, then plays the complete finished result in Studio with captured browser audio. Native exports use Music protection, higher-quality pitch processing, wide rounded framing, and a source cut before the TikTok outro.', '',
    '| Remix | Final file | Combined recording | Publishing |', '| --- | --- | --- | --- |']
for e in entries:
    lines.append(f"| {e.get('name',e['preset'])} | {'Ready' if e['native'] else 'Pending'} | {'Ready' if e['combined'] else 'Pending'} | {e['publication']} |")
lines += ['', 'Audio timing and display smoothness are separate checks. Recordings marked REVIEW_REQUIRED for smoothness still have dropped display frames; they are not claimed to be smooth.', '',
    'Reddit remains blocked by the current five-destination release limit. The local control fixes have not been deployed to production, and complete control functionality is not yet verified.', '']
(videos/'DELIVERY STATUS.md').write_text('\n'.join(lines))
print(json.dumps({k:status[k] for k in ['nativeCount','combinedCount','total']}))
