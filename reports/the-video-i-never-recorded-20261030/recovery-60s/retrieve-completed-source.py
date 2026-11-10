"""Retrieve only the two already-completed operations; never submit generation."""
import base64
import hashlib
import json
from pathlib import Path
import subprocess
import requests

root = Path(__file__).resolve().parent.parent
proof = root / 'proof/recovery-continuity'
endpoint = 'https://us-central1-aiplatform.googleapis.com/v1/projects/autopromote-cc6d3/locations/us-central1/publishers/google/models/veo-3.1-fast-generate-001:fetchPredictOperation'
token = subprocess.check_output(['gcloud', 'auth', 'print-access-token'], text=True).strip()
results = []
for take in [1, 2]:
    state = json.loads((proof / f'take-{take}-state.private.json').read_text())
    assert state['status'] == 'DOWNLOADED'
    assert state['operationName'].startswith('projects/autopromote-cc6d3/locations/us-central1/publishers/google/models/veo-3.1-fast-generate-001/operations/')
    movie = proof / f'take-{take}.mp4'
    if movie.exists():
        assert hashlib.sha256(movie.read_bytes()).hexdigest() == state['sha256']
        results.append({'take': take, 'alreadyRetained': True})
        continue
    response = requests.post(endpoint, headers={'Authorization': 'Bearer ' + token},
                             json={'operationName': state['operationName']}, timeout=60)
    response.raise_for_status()
    result = response.json()
    assert result.get('done') and not result.get('error'), 'Completed original operation is unavailable; do not regenerate.'
    videos = result.get('response', {}).get('videos', [])
    assert len(videos) == 1 and videos[0].get('mimeType') == 'video/mp4'
    data = base64.b64decode(videos[0]['bytesBase64Encoded'], validate=True)
    assert hashlib.sha256(data).hexdigest() == state['sha256'], 'Refuse different source bytes.'
    assert len(data) == state['bytes']
    with movie.open('xb') as file:
        file.write(data)
    results.append({'take': take, 'sameCompletedOperation': True, 'sha256': state['sha256'], 'bytes': len(data)})
record = {'retrievedExistingResultsOnly': True, 'newGenerationRequests': 0, 'results': results}
(root / 'recovery-60s/completed-source-retrieval.json').write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps(record))
