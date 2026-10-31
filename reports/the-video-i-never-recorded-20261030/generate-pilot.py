#!/usr/bin/env python3
"""Bounded Google raw-source pilot. Never a full-production runner.

Two eight-second takes maximum, one non-idempotent submission per take.
An uncertain submission can only be polled if its operation ID is retained.
No automatic regeneration, API enablement, infrastructure or GPU operations.
"""
import argparse
import base64
import fcntl
import hashlib
import json
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent
MODEL = 'veo-3.1-fast-generate-001'
ENDPOINT = ('https://us-central1-aiplatform.googleapis.com/v1/projects/'
            'autopromote-cc6d3/locations/us-central1/publishers/google/models/' + MODEL)
CHARACTER = (
    'Fictional dramatic podcast; an original invented man, no resemblance to a real person. '
    'Daniel Vale, 38, short dark curly hair, brown eyes, light stubble, charcoal open-collar shirt '
    'with slightly uneven collar. One man seated, looking directly into the lens. '
    'Professionally lit dark charcoal acoustic studio, subtle blue practical on frame left, '
    'restrained purple rim on right, soft warm key. Black standard podcast microphone at frame '
    'right below his mouth. Fixed 50mm-equivalent main camera, medium waist-up shot, face near '
    '47 percent horizontal, eyes near 35 percent vertical. Human skin texture, natural breathing '
    'and restrained small gestures. No other person. No camera cuts or camera moves. '
    'Dry clean male speech, low midrange, light neutral English accent, intimate controlled '
    'delivery; no background music, score, stingers or effects. No subtitles, text, graphic '
    'overlays, logos, B-roll, split screens or animations. '
)
LINES = {
    'A': 'At eight forty-two that morning, I watched a video of myself saying something I had never said.',
    'B': 'Behind my shoulder, the clock read two seventeen. The second hand pointed at thirty-six.',
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def write(path, data):
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(data, indent=2) + '\n')
    tmp.chmod(0o600)
    tmp.replace(path)


def main(args):
    proof = ROOT / 'proof'
    proof.mkdir(mode=0o700, exist_ok=True)
    state_path = proof / f'take-{args.take}-operation.private.json'
    instance = {'prompt': CHARACTER + 'Speak exactly this dialogue once: "' + LINES[args.take] + '". '
                'Begin at the start of the take. Speak at a natural deliberate pace fitting eight '
                'seconds, with accurate lip synchronization. No additional words.'}
    if args.take == 'B':
        reference = proof / 'take-A-reference.png'
        assert reference.exists(), 'Inspect A and extract its actual character reference first.'
        assert args.accept_a, 'Take B requires explicit operator review of A.'
        instance['image'] = {'bytesBase64Encoded': base64.b64encode(reference.read_bytes()).decode(),
                             'mimeType': 'image/png'}
        instance['prompt'] += ' Preserve exactly the supplied face, wardrobe, room and lighting.'
    payload = {'instances': [instance], 'parameters': {
        'aspectRatio': '16:9', 'durationSeconds': 8, 'sampleCount': 1,
        'resolution': '1080p', 'personGeneration': 'allow_adult', 'generateAudio': True,
        'seed': 10421736, 'negativePrompt': 'subtitles, captions, text, logos, music, edits, camera cuts, graphics, extra people',
    }}
    fingerprint = sha(json.dumps(payload, sort_keys=True).encode())
    if args.dry_run:
        print(json.dumps({'take': args.take, 'model': MODEL, 'seconds': 8,
                          'resolution': '1080p', 'estimateUsd': .96,
                          'maximumPilotTakes': 2, 'maximumPilotEstimateUsd': 1.92,
                          'requestSha256': fingerprint, 'submitted': False}))
        return
    token = subprocess.check_output(['gcloud', 'auth', 'print-access-token'], text=True).strip()
    headers = {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}
    if state_path.exists():
        state = json.loads(state_path.read_text())
        assert state['requestSha256'] == fingerprint, 'Preserve the submitted request.'
        if state['status'] == 'DOWNLOADED':
            assert sha((proof / f'take-{args.take}.mp4').read_bytes()) == state['sha256']
            print(json.dumps({'take': args.take, 'status': 'DOWNLOADED', 'alreadyComplete': True}))
            return
        assert state.get('operationName'), 'Submission uncertain/rejected; do not resubmit.'
    else:
        assert args.submit, 'Use --submit only for this requested low-cost pilot.'
        state = {'take': args.take, 'model': MODEL, 'requestSha256': fingerprint,
                 'status': 'SUBMISSION_UNCERTAIN', 'attempts': 1, 'seconds': 8,
                 'estimateUsd': .96, 'actualBillUsd': None,
                 'authorization': 'Current user request to begin the first low-cost source/preview; bounded to 16 seconds, no full production.',
                 'submittedAt': datetime.now(timezone.utc).isoformat()}
        write(state_path, state)
        write(proof / f'take-{args.take}-request.private.json', payload)
        r = requests.post(ENDPOINT + ':predictLongRunning', headers=headers, json=payload, timeout=90)
        result = r.json()
        write(proof / f'take-{args.take}-ack.private.json', result)
        if not r.ok:
            state.update(status='REJECTED', httpStatus=r.status_code)
            write(state_path, state)
            raise RuntimeError('Provider rejected pilot: ' + str(r.status_code) + ' ' +
                               str(result.get('error', {}).get('message', ''))[:500])
        name = result.get('name', '')
        assert name.startswith('projects/autopromote-cc6d3/locations/us-central1/publishers/google/models/' + MODEL + '/operations/')
        state.update(status='ACCEPTED', operationName=name)
        write(state_path, state)
        print(json.dumps({'take': args.take, 'status': 'ACCEPTED', 'estimateUsd': .96}), flush=True)
    for _ in range(60):
        r = requests.post(ENDPOINT + ':fetchPredictOperation', headers=headers,
                          json={'operationName': state['operationName']}, timeout=60)
        r.raise_for_status()
        result = r.json()
        if result.get('done'):
            if result.get('error'):
                write(proof / f'take-{args.take}-failed.private.json', result)
                raise RuntimeError('Accepted pilot failed; no regeneration allowed.')
            videos = result.get('response', {}).get('videos', [])
            if len(videos) != 1:
                write(proof / f'take-{args.take}-no-output.private.json', result)
                state.update(status='COMPLETED_WITHOUT_VIDEO')
                write(state_path, state)
                raise RuntimeError('No single accepted output; no regeneration.')
            video = videos[0]
            assert video.get('mimeType') == 'video/mp4' and video.get('bytesBase64Encoded')
            data = base64.b64decode(video.pop('bytesBase64Encoded'), validate=True)
            movie = proof / f'take-{args.take}.mp4'
            assert not movie.exists(), 'Preserve the accepted source.'
            movie.write_bytes(data)
            write(proof / f'take-{args.take}-result.private.json', result)
            state.update(status='DOWNLOADED', sha256=sha(data), bytes=len(data))
            write(state_path, state)
            print(json.dumps({'take': args.take, 'status': 'DOWNLOADED', 'sha256': sha(data), 'bytes': len(data)}), flush=True)
            return
        print(json.dumps({'take': args.take, 'status': 'POLLING_SAME_OPERATION'}), flush=True)
        time.sleep(10)
    raise RuntimeError('Poll budget ended; resume same operation only.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--take', choices=['A', 'B'], required=True)
    parser.add_argument('--submit', action='store_true')
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--accept-a', action='store_true')
    args = parser.parse_args()
    (ROOT / 'proof').mkdir(mode=0o700, exist_ok=True)
    with (ROOT / 'proof/pilot.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        main(args)
