"""Finish each real-account native recording once its real export is delivered."""
import json
import os
from pathlib import Path
import subprocess
import time

root=Path(__file__).resolve().parent
collection=Path(os.environ.get('CREDITS_REMIX_COLLECTION',str(root/'private/own-account-local-v5'))).resolve()
recordings_only=os.environ.get('STUDIO_RECORDINGS_ONLY')=='true'
runtime='/dev/shm/autopromote-real-account-studio-20261030'
python='/home/tibule12/Projects/AutoPromte/AutoPromote/python_media_worker/.venv/bin/python'
presets=['slowed_reverb','sped_up','deep_voice','nightcore','amapiano_space','warm_vocal','bass_boost','lo_fi','telephone','spatial_8d']
if os.environ.get('STUDIO_SELECTED_PRESETS'):
    presets=os.environ['STUDIO_SELECTED_PRESETS'].split(',')
assert not collection.name.startswith('selected-three') or recordings_only
env=dict(os.environ,STUDIO_REAL_ACCOUNT_LOCAL='true',CREDITS_REMIX_COLLECTION=str(collection),PUBLISH_PLATFORMS='youtube,tiktok,instagram,linkedin,facebook')
progress={'recordings':[],'schedules':[],'reddit':'Blocked by the existing five-destination release plan; no subscription modification'}
def save():
    (collection/'completion-progress.json').write_text(json.dumps(progress,indent=2))
def run(args,timeout):
    subprocess.run(args,env=env,check=True,timeout=timeout)
if os.environ.get('STUDIO_WAIT_ALL_NATIVE')=='true':
    deadline=time.monotonic()+1800
    while not all((collection/preset/'delivery.json').exists() for preset in presets):
        if time.monotonic()>deadline:raise RuntimeError('Selected native exports did not complete')
        time.sleep(2)
for preset in presets:
    directory=collection/preset
    end=time.monotonic()+1800
    while not(directory/'delivery.json').exists():
        if time.monotonic()>end:raise RuntimeError('Native export did not complete: '+preset)
        time.sleep(2)
    if not(directory/'studio-recording-delivery.json').exists():
        run(['node',str(root/'prepare-owned-recording.cjs'),str(collection),preset],180)
        run(['node',str(root/'record-playback.cjs'),runtime,preset],420)
        run([python,str(root/'package-studio-recording.py'),str(collection),preset],300)
    receipt=json.loads((directory/'studio-recording-delivery.json').read_text())
    assert receipt['actualOwnerAccount'] and receipt['syncStatus']=='PASS'
    progress['recordings'].append(preset);save();print('COMBINED STUDIO RECORDING DELIVERED: '+preset,flush=True)
    if recordings_only:continue
    run([python,str(root/'update-delivery-status.py')],60)
    publication=directory/'publication.json'
    previous=json.loads(publication.read_text()) if publication.exists() else {}
    if not previous.get('contentId'):
        assert previous.get('status') not in ['SUBMITTING','SUBMISSION_UNCERTAIN'],'Reconcile a submission before retrying'
        run(['node',str(root/'publish-native.cjs'),preset,'--publish'],240)
    previous=json.loads(publication.read_text())
    assert previous.get('contentId'),'Require the genuine upload acknowledgement'
    progress['schedules'].append({'preset':preset,'contentId':previous['contentId'],'scheduledAt':previous.get('scheduledAt'),'status':previous['status']});save()
    run([python,str(root/'update-delivery-status.py')],60)
print('All requested genuine-account combined recordings delivered.' if recordings_only else 'All requested combined recordings delivered and uploads acknowledged.',flush=True)
