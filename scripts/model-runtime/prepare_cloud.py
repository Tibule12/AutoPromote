"""Submit/poll a CPU-only checkpoint preparation build; never start a GPU."""
import argparse
import json
from pathlib import Path
import subprocess
import requests

PROJECT = 'autopromote-cc6d3'
ROOT = Path(__file__).resolve().parents[2]
REPORT = ROOT / 'reports/model-capability-runtime-v1-20261009'

def main():
    p = argparse.ArgumentParser()
    p.add_argument('action', choices=['submit', 'poll'])
    p.add_argument('checkpoint_or_build')
    p.add_argument('--label', required=True)
    a = p.parse_args()
    # The token exists only in process memory, never in receipts or stdout.
    token = subprocess.check_output(['gcloud', 'auth', 'print-access-token'], text=True).strip()
    headers = {'Authorization': 'Bearer ' + token}
    base = f'https://cloudbuild.googleapis.com/v1/projects/{PROJECT}/builds'
    if a.action == 'submit':
        locks = json.loads((ROOT / 'config/model-runtime/sources.v1.json').read_text())
        if not any(m['checkpoint'] == a.checkpoint_or_build for m in locks['models']):
            raise ValueError('Checkpoint must be in the source lock')
        original = json.loads((REPORT / 'cloud-build-request.json').read_text())
        body = {'source': original['source'], 'steps': [{
            'name': 'python:3.12.11-slim', 'entrypoint': 'bash',
            'args': ['-c', 'pip install --no-cache-dir google-cloud-storage==3.4.1 requests==2.32.5 && '
                     'python scripts/model-runtime/prepare_model.py --checkpoint "$1" --bucket "$2"',
                     'prepare', a.checkpoint_or_build, PROJECT + '-viral-studio-3d']}],
            'timeout': '3600s', 'options': {'logging': 'CLOUD_LOGGING_ONLY'},
            'tags': ['model-runtime-v1', 'cpu-checkpoint-preparation', 'no-gpu']}
        response = requests.post(base, headers=headers, json=body, timeout=60)
        response.raise_for_status()
        operation = response.json()
        (REPORT / (a.label + '-preparation-operation.json')).write_text(json.dumps(operation, indent=2) + '\n')
        build = operation['metadata']['build']
    else:
        response = requests.get(base + '/' + a.checkpoint_or_build, headers=headers, timeout=60)
        response.raise_for_status()
        build = response.json()
        (REPORT / (a.label + '-preparation-state.json')).write_text(json.dumps(build, indent=2) + '\n')
    print(json.dumps({'buildId': build['id'], 'status': build['status'], 'gpuCount': 0}))

if __name__ == '__main__':
    main()
