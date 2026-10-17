#!/usr/bin/env python3
"""One private generated source take; its edit still uses ordinary Studio.

No automatic generation retry. Polling resumes the persisted operation. A lost
submission response stays uncertain and cannot silently create another take.
Cloud auth stays in memory, outside requests, receipts and console output.
"""
import argparse
import base64
from datetime import datetime, timezone
import fcntl
import hashlib
import json
from pathlib import Path
import subprocess
import time
from urllib.parse import quote, urlparse

import requests


def now():
    return datetime.now(timezone.utc).isoformat()


def digest(value):
    return hashlib.sha256(value).hexdigest()


def write(file, value):
    temporary = file.with_suffix(file.suffix + '.tmp')
    temporary.write_text(json.dumps(value, indent=2) + '\n')
    temporary.chmod(0o600)
    temporary.replace(file)


def main(args):
    root = args.directory.resolve()
    brief = json.loads((root / 'brief.json').read_text())
    assert brief['maximumGenerativeSubmissions'] == 1
    assert brief['sampleCount'] == 1 and brief['durationSeconds'] == 8
    assert brief['model'] == 'veo-3.1-fast-generate-001'
    assert brief['resolution'] == '720p' and brief['generateAudio'] is True
    assert brief['estimatedGenerationUsd'] <= 1
    proof = root / 'proof'
    proof.mkdir(parents=True, exist_ok=True)
    state_file = proof / 'generation-state.private.json'
    payload = {
        'instances': [{'prompt': brief['prompt']}],
        'parameters': {
            'aspectRatio': brief['aspectRatio'],
            'durationSeconds': brief['durationSeconds'],
            'sampleCount': 1,
            'resolution': brief['resolution'],
            'personGeneration': 'allow_adult',
            'generateAudio': True,
            'seed': brief['seed'],
            'negativePrompt': brief['negativePrompt'],
        },
    }
    fingerprint = digest(json.dumps(payload, sort_keys=True).encode())
    endpoint = ('https://us-central1-aiplatform.googleapis.com/v1/projects/'
                'autopromote-cc6d3/locations/us-central1/publishers/google/models/'
                + brief['model'])
    token = subprocess.check_output(['gcloud', 'auth', 'print-access-token'],
                                    text=True).strip()
    headers = {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}
    if state_file.exists():
        state = json.loads(state_file.read_text())
        assert state['requestSha256'] == fingerprint, 'Preserve original request'
        if state['status'] == 'GENERATED_SOURCE_DOWNLOADED':
            movie = proof / 'generated-human.mp4'
            assert digest(movie.read_bytes()) == state['videoSha256']
            print(json.dumps({'status': state['status'], 'sha256': state['videoSha256'],
                              'alreadyComplete': True}), flush=True)
            return
        assert state.get('operationName'), 'Inspect prior submission before any retry'
    else:
        assert args.submit, 'Use --submit only for the owner-authorized single test'
        state = {'createdAt': now(), 'ownerInstruction': brief['ownerDirection'],
                 'status': 'SUBMISSION_UNCERTAIN', 'requestSha256': fingerprint,
                 'provider': brief['provider'], 'model': brief['model'],
                 'generativeSubmissionsAttempted': 1, 'maximumGenerativeSubmissions': 1,
                 'generationEstimateUsd': brief['estimatedGenerationUsd'],
                 'automaticRegeneration': False, 'publicRelease': False}
        # Durable before the one non-idempotent network operation.
        write(proof / 'generation-request.private.json', payload)
        write(state_file, state)
        response = requests.post(endpoint + ':predictLongRunning', headers=headers,
                                 json=payload, timeout=90)
        value = response.json()
        write(proof / 'generation-ack.private.json', value)
        if not response.ok:
            state.update(status='PROVIDER_REJECTED', httpStatus=response.status_code,
                         providerError=value.get('error'), rejectedAt=now())
            write(state_file, state)
            raise RuntimeError('Provider rejected the single take: ' +
                               str(response.status_code) + ' ' +
                               str(value.get('error', {}).get('message', ''))[:1000])
        name = value.get('name')
        assert isinstance(name, str) and name.startswith(
            'projects/autopromote-cc6d3/locations/us-central1/publishers/google/models/'
            + brief['model'] + '/operations/'), 'Unexpected provider operation identity'
        state.update(status='GENERATION_ACCEPTED', operationName=name, acceptedAt=now())
        write(state_file, state)
        print(json.dumps({'status': state['status'], 'seconds': 8, 'samples': 1,
                          'model': brief['model'], 'estimateUsd': brief['estimatedGenerationUsd']}),
              flush=True)
    deadline = time.monotonic() + 15 * 60
    while time.monotonic() < deadline:
        response = requests.post(endpoint + ':fetchPredictOperation', headers=headers,
                                 json={'operationName': state['operationName']}, timeout=60)
        if not response.ok:
            write(proof / 'poll-error.private.json', response.json())
            raise RuntimeError('Poll failed; resume this same operation: ' + str(response.status_code))
        value = response.json()
        if value.get('done'):
            if value.get('error'):
                state.update(status='PROVIDER_GENERATION_FAILED', providerError=value['error'],
                             completedAt=now())
                write(state_file, state)
                raise RuntimeError('Accepted operation failed: ' + str(value['error'])[:1000])
            result = value.get('response', {})
            videos = result.get('videos', [])
            if len(videos) != 1:
                write(proof / 'generation-result.private.json', value)
                state.update(status='NO_VIDEO_RETURNED', completedAt=now(),
                             filteredCount=result.get('raiMediaFilteredCount'))
                write(state_file, state)
                raise RuntimeError('Expected one generated take; no automatic regeneration')
            video = videos[0]
            assert video.get('mimeType') == 'video/mp4'
            encoded = video.get('bytesBase64Encoded')
            if encoded:
                data = base64.b64decode(encoded, validate=True)
            else:
                uri = urlparse(video['gcsUri'])
                assert uri.scheme == 'gs' and uri.netloc
                url = ('https://storage.googleapis.com/download/storage/v1/b/' +
                       quote(uri.netloc, safe='') + '/o/' + quote(uri.path.lstrip('/'), safe='') + '?alt=media')
                downloaded = requests.get(url, headers=headers, timeout=90)
                downloaded.raise_for_status()
                data = downloaded.content
            assert 1000 < len(data) <= 75 * 1024 * 1024
            movie = proof / 'generated-human.mp4'
            assert not movie.exists(), 'Preserve the first generated source'
            movie.write_bytes(data)
            # Keep a compact original response, excluding base64 video bytes.
            if encoded:
                video['bytesBase64Encoded'] = '[stored as exact generated-human.mp4]'
            write(proof / 'generation-result.private.json', value)
            state.update(status='GENERATED_SOURCE_DOWNLOADED', completedAt=now(),
                         videoSha256=digest(data), bytes=len(data),
                         receivedNativeAudio=brief['generateAudio'],
                         providerPublication=False, actualBilledUsd=None)
            write(state_file, state)
            print(json.dumps({'status': state['status'], 'sha256': state['videoSha256'],
                              'bytes': len(data), 'generativeSubmissions': 1}), flush=True)
            return
        state.update(lastPolledAt=now(), status='GENERATION_RUNNING')
        write(state_file, state)
        print(json.dumps({'status': 'GENERATION_RUNNING', 'at': state['lastPolledAt']}), flush=True)
        time.sleep(15)
    raise RuntimeError('Observer time budget reached; resume the same accepted operation')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--directory', type=Path, required=True)
    parser.add_argument('--submit', action='store_true')
    arguments = parser.parse_args()
    journal_directory = arguments.directory.resolve() / 'proof'
    journal_directory.mkdir(parents=True, exist_ok=True)
    with (journal_directory / 'generation-observer.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit('Another observer owns this take; no submission attempted.')
        main(arguments)
