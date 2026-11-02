#!/usr/bin/env python3
"""Exactly two explicitly approved source tests; no retry or model fallback.

Provider credentials remain in memory. Persist uncertain submissions before the
non-idempotent request; resume only the same accepted operation. No app launch,
production-account upload, user-data mutation or infrastructure change.
"""
import argparse
import base64
import fcntl
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import subprocess
import time

import requests

ROOT = Path(__file__).resolve().parent
PROOF = ROOT.parent / 'proof' / 'recovery-continuity'
MODEL = 'veo-3.1-fast-generate-001'
ENDPOINT = ('https://us-central1-aiplatform.googleapis.com/v1/projects/'
            'autopromote-cc6d3/locations/us-central1/publishers/google/models/' + MODEL)
TERMINAL = {'DOWNLOADED', 'REJECTED', 'FILTERED', 'FAILED', 'NO_VIDEO'}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def write(path, value):
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, indent=2) + '\n')
    temporary.chmod(0o600)
    temporary.replace(path)


def prepare(take):
    proposal = json.loads((ROOT / 'source-test-proposal.json').read_text())
    authorization = json.loads((ROOT / 'source-test-authorization.json').read_text())
    assert authorization['approved'] is True
    assert authorization['maximumRequests'] == 2
    assert authorization['maximumEstimatedGenerationUsd'] == 1.92
    assert proposal['model'] == MODEL and proposal['secondsPerRequest'] == 8
    assert take in (1, 2)
    prompt = (
        'A raw single-presenter fictional podcast performance. '
        'One original fictional adult man named Daniel Vale, approximately 38, '
        'short dark curly hair, brown eyes, subtle stubble, charcoal open-collar shirt. '
        'A SINGLE LOCKED-OFF CAMERA IS DIRECTLY IN FRONT OF HIS FACE, at eye level. '
        'His shoulders and face are square to the camera; both ears are equally visible. '
        'His pupils look straight into the lens at the viewer throughout. '
        'He speaks directly to the viewer, not to an interviewer beside the camera. '
        'Frontal symmetrical medium chest-up composition, face centred horizontally, '
        'eyes around the upper third of the image. Small natural blinks and gestures '
        'but no head turn or looking away. '
        'Professional dark charcoal acoustic studio, subtle blue light on one side, '
        'restrained purple rim on the other, soft neutral key on his face. '
        'A small plain black unbranded podcast microphone below his chin and below '
        'his mouth, slightly to frame right, with no lettering. '
        'Single continuous shot, fixed framing and lighting, no cuts or camera movement. '
        'Dry clean male narration, low-mid register, neutral English pronunciation, '
        'intimate controlled concern rather than theatrical shouting. Natural breaths. '
        'Accurate natural lip synchronization and visible mouth. '
        'No music, sound effects, captions, subtitles, graphics, text, logos, clock '
        'graphics, overlays or B-roll. Nothing is edited or animated outside his '
        'natural performance. He says exactly this sentence once, finishing within '
        'eight seconds and leaving a short still breath after the final word: "' +
        proposal['tests'][take - 1]['dialogue'] + '".'
    )
    instance = {'prompt': prompt}
    reference_sha = None
    if take == 2:
        review = json.loads((PROOF / 'take-1-review.json').read_text())
        assert review['proceedToSecondTest'] is True, 'First take needs actual review.'
        first = json.loads((PROOF / 'take-1-state.private.json').read_text())
        assert first['status'] == 'DOWNLOADED'
        assert review['sourceSha256'] == first['sha256']
        reference = PROOF / 'take-1-reference.png'
        reference_sha = digest(reference.read_bytes())
        instance['image'] = {
            'bytesBase64Encoded': base64.b64encode(reference.read_bytes()).decode(),
            'mimeType': 'image/png',
        }
        instance['prompt'] += (
            ' This is the next uninterrupted sentence by exactly the same fictional '
            'presenter shown in the supplied frame. Preserve that face, hair, shirt, '
            'room, microphone, framing and lighting exactly. Keep the same low-mid '
            'male voice and neutral accent. Maintain direct lens eye contact.'
        )
    payload = {'instances': [instance], 'parameters': {
        'durationSeconds': 8, 'sampleCount': 1, 'aspectRatio': '16:9',
        'resolution': '1080p', 'generateAudio': True,
        'personGeneration': 'allow_adult', 'seed': 8421106,
        'negativePrompt': 'side profile, three-quarter camera, off-camera gaze, '
                          'interviewer, camera cuts, subtitles, text, logos, '
                          'music, sound effects, motion graphics, other people',
    }}
    return payload, reference_sha, proposal['tests'][take - 1]['dialogue']


def main(args):
    payload, reference_sha, dialogue = prepare(args.take)
    request_sha = digest(json.dumps(payload, sort_keys=True).encode())
    state_file = PROOF / f'take-{args.take}-state.private.json'
    movie = PROOF / f'take-{args.take}.mp4'
    if args.dry_run:
        print(json.dumps({'take': args.take, 'model': MODEL, 'seconds': 8,
                          'resolution': '1080p', 'estimateUsd': .96,
                          'approvedPairMaximumUsd': 1.92, 'submitted': False,
                          'requestSha256': request_sha, 'dialogue': dialogue}))
        return
    if state_file.exists():
        state = json.loads(state_file.read_text())
        assert state['requestSha256'] == request_sha, 'Preserve the original request.'
        if state['status'] in TERMINAL:
            if state['status'] == 'DOWNLOADED':
                assert digest(movie.read_bytes()) == state['sha256']
            print(json.dumps({'take': args.take, 'status': state['status'],
                              'alreadyTerminal': True, 'submittedAgain': False}))
            return
        assert state.get('operationName'), 'Uncertain submission: do not resubmit.'
    else:
        assert args.submit, 'Explicit --submit required for approved test only.'
        assert not movie.exists(), 'Preserve retained source.'
        attempted = list(PROOF.glob('take-*-state.private.json'))
        assert len(attempted) < 2, 'Two-request authorization exhausted.'
        state = {'take': args.take, 'model': MODEL, 'durationSeconds': 8,
                 'estimatedGenerationUsd': .96, 'actualBilledUsd': None,
                 'requestSha256': request_sha, 'referenceSha256': reference_sha,
                 'status': 'SUBMISSION_UNCERTAIN', 'submissionsAttempted': 1,
                 'submittedAt': datetime.now(timezone.utc).isoformat(),
                 'authorizationFile': 'source-test-authorization.json',
                 'automaticRegeneration': False}
    token = subprocess.check_output(['gcloud', 'auth', 'print-access-token'], text=True).strip()
    headers = {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}
    if not state_file.exists():
        write(PROOF / f'take-{args.take}-request.private.json', payload)
        write(state_file, state)
        response = requests.post(ENDPOINT + ':predictLongRunning', headers=headers,
                                 json=payload, timeout=90)
        result = response.json()
        write(PROOF / f'take-{args.take}-ack.private.json', result)
        if not response.ok:
            state.update(status='REJECTED', httpStatus=response.status_code,
                         errorMessage=str(result.get('error', {}).get('message', ''))[:1000])
            write(state_file, state)
            raise RuntimeError('Provider rejected approved test: ' + str(response.status_code))
        name = result.get('name', '')
        assert name.startswith('projects/autopromote-cc6d3/locations/us-central1/publishers/google/models/' + MODEL + '/operations/')
        state.update(status='ACCEPTED', operationName=name)
        write(state_file, state)
        print(json.dumps({'take': args.take, 'status': 'ACCEPTED',
                          'estimatedGenerationUsd': .96}), flush=True)
    deadline = time.monotonic() + 15 * 60
    while time.monotonic() < deadline:
        response = requests.post(ENDPOINT + ':fetchPredictOperation', headers=headers,
                                 json={'operationName': state['operationName']}, timeout=60)
        response.raise_for_status()
        result = response.json()
        if result.get('done'):
            value = result.get('response', {})
            videos = value.get('videos', [])
            if result.get('error') or len(videos) != 1:
                state.update(status='FAILED' if result.get('error') else
                             'FILTERED' if value.get('raiMediaFilteredCount') else 'NO_VIDEO',
                             reasons=value.get('raiMediaFilteredReasons', []),
                             providerError=result.get('error'))
                write(PROOF / f'take-{args.take}-result.private.json', result)
                write(state_file, state)
                print(json.dumps({'take': args.take, 'status': state['status'],
                                  'reasons': state['reasons'], 'regeneration': False}), flush=True)
                return
            video = videos[0]
            assert video.get('mimeType') == 'video/mp4'
            assert video.get('bytesBase64Encoded'), 'Unexpected output transport; preserve operation.'
            data = base64.b64decode(video.pop('bytesBase64Encoded'), validate=True)
            assert 1000 < len(data) <= 100 * 1024 * 1024
            assert not movie.exists()
            movie.write_bytes(data)
            write(PROOF / f'take-{args.take}-result.private.json', result)
            state.update(status='DOWNLOADED', sha256=digest(data), bytes=len(data),
                         completedAt=datetime.now(timezone.utc).isoformat())
            write(state_file, state)
            print(json.dumps({'take': args.take, 'status': 'DOWNLOADED',
                              'sha256': state['sha256'], 'bytes': len(data)}), flush=True)
            return
        state['lastPolledAt'] = datetime.now(timezone.utc).isoformat()
        write(state_file, state)
        print(json.dumps({'take': args.take, 'status': 'POLLING_SAME_OPERATION'}), flush=True)
        time.sleep(15)
    raise RuntimeError('Poll window ended; resume this operation only, never regenerate.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--take', type=int, choices=[1, 2], required=True)
    parser.add_argument('--submit', action='store_true')
    parser.add_argument('--dry-run', action='store_true')
    arguments = parser.parse_args()
    PROOF.mkdir(parents=True, mode=0o700, exist_ok=True)
    with (PROOF / 'continuity.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        main(arguments)
