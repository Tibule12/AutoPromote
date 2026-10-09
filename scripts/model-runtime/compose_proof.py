"""Compose reviewed model masks with AutoPromote's existing deterministic VFX."""
import argparse
from datetime import timedelta
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tarfile

ROOT = Path(__file__).resolve().parents[2]
PROOF = ROOT / 'reports/model-capability-runtime-v1-20261009/proof'
sys.path.insert(0, str(ROOT))

def sha(path):
    return hashlib.file_digest(Path(path).open('rb'), 'sha256').hexdigest()

def compose():
    from python_media_worker.studio_vfx_plan import render_vfx
    source = PROOF / 'outputs/segment_subject/normalized_source.mp4'
    bundle = PROOF / 'outputs/segment_subject/subject_masks.tar.gz'
    maskdir = PROOF / 'derived/subject_masks'
    maskdir.mkdir(parents=True, exist_ok=True)
    with tarfile.open(bundle) as archive:
        members = archive.getmembers()
        if any(not m.isfile() or Path(m.name).name != m.name or m.size > 8 * 1024**2 for m in members):
            raise ValueError('Only bounded flat mask files are accepted')
        archive.extractall(maskdir, members=members, filter='data')
    manifest = json.loads((maskdir / 'manifest.json').read_text())
    tracking = json.loads((PROOF / 'outputs/track_object/tracking_path.json').read_text())
    if len(tracking['samples']) != manifest['frame_count']:
        raise ValueError('Track/mask clocks disagree')
    for mask, sample in zip(manifest['frames'], tracking['samples']):
        point = mask['centroid']
        expected = [point[0] / manifest['width'], point[1] / manifest['height']] if point else None
        if sample['sourceTick'] != mask['sourceTick'] or sample['point'] != expected:
            raise ValueError('Track does not derive from the real mask')
    effects = [
        {'id': 'title', 'type': 'text_behind', 'start': 0, 'end': 3,
         'text': 'ON AIR', 'x': 36, 'y': 28, 'font_size': 110, 'color': '#d8a5ff'},
        {'id': 'track', 'type': 'tracked_callout', 'start': 0, 'end': 3,
         'text': 'VISIBLE SUBJECT', 'offset_x': 220, 'offset_y': -100,
         'font_size': 20, 'color': '#ffffff', 'avoid_subject': True},
        {'id': 'grade', 'type': 'background_grade', 'start': 0, 'end': 3,
         'exposure': -.35, 'saturation': .8, 'contrast': 1.08},
    ]
    plan = {'version': 1, 'source_sha256': sha(source), 'matte_sha256': sha(maskdir / 'manifest.json'), 'effects': effects}
    derived = PROOF / 'derived'
    (derived / 'vfx-plan.json').write_text(json.dumps(plan, indent=2) + '\n')
    receipt = render_vfx(source, maskdir, plan, derived / 'subject-composite.mp4', encoder='cpu')
    (derived / 'vfx-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps({'event': 'existing_vfx_composed', 'receipt': receipt}))

def publish():
    from google.cloud import storage
    from google.oauth2.credentials import Credentials
    owner = 'model-runtime-proof'
    job = 'model-runtime-v1-subject-proof'
    bucket_name = 'autopromote-cc6d3-viral-studio-3d'
    token = subprocess.check_output(['gcloud', 'auth', 'print-access-token'], text=True).strip()
    bucket = storage.Client(project='autopromote-cc6d3', credentials=Credentials(token)).bucket(bucket_name)
    file = bucket.blob(f'temp_studio_vfx/{owner}/{job}/render.mp4')
    path = PROOF / 'derived/subject-composite.mp4'
    digest = sha(path)
    if not file.exists():
        file.metadata = {'ownerUid': owner, 'sha256': digest, 'purpose': 'private_model_runtime_vfx_proof'}
        file.upload_from_filename(str(path), if_generation_match=0, content_type='video/mp4')
    file.reload()
    if file.metadata.get('ownerUid') != owner or file.metadata.get('sha256') != digest:
        raise ValueError('Immutable subject proof collision')
    url = file.generate_signed_url(version='v4', expiration=timedelta(hours=2), method='GET',
        service_account_email='viral-studio-3d-renderer@autopromote-cc6d3.iam.gserviceaccount.com', access_token=token)
    receipt = json.loads((PROOF / 'derived/vfx-receipt.json').read_text())
    original = json.loads((PROOF / 'source-identity.json').read_text())
    ref = {'jobId': job, 'ownerUid': owner, 'source_clip_id': 'proof-source', 'start_time': 0, 'end_time': 3,
           'url': url, 'sha256': digest, 'pixel_sha256': receipt['pixel_sha256'], 'source_sha256': original['sha256']}
    target = PROOF / 'derived/resolved-subject.private.json'
    target.write_text(json.dumps(ref, indent=2) + '\n')
    target.chmod(0o600)
    public = {k: v for k, v in ref.items() if k != 'url'}
    public.update(storagePath=file.name, generation=str(file.generation), signedUrlPersistedOnlyInPrivateInput=True)
    (PROOF / 'derived/resolved-subject.json').write_text(json.dumps(public, indent=2) + '\n')
    print(json.dumps({'event': 'private_subject_artifact_persisted', 'sha256': digest, 'generation': str(file.generation)}))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['compose', 'publish'])
    args = parser.parse_args()
    {'compose': compose, 'publish': publish}[args.action]()
