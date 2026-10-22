"""Private local Docker worker using the common capability request/artifacts.

The API supplies one owned, generation-pinned source read. No cloud credential,
GPU access, model download, rendering engine or client-selected code is accepted.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import resource
import time
from urllib.parse import urlparse, parse_qs

import requests
from model_workers.common import ROOT, sha, canonical, normalize, blob, write_json


def execute(spec, work):
    import jsonschema
    import torch
    import transformers
    if spec['model']['id']=='vitmatte-small-cpu-v1':
        from model_workers.adapters.cpu_matting import segment
    else:
        from model_workers.adapters.cpu_segmentation import segment
    started = time.monotonic()
    registry = json.loads((ROOT/'config/model-runtime/registry.v1.json').read_text())
    contracts = json.loads((ROOT/'contracts/model-capabilities-v1.json').read_text())
    model = next(m for m in registry['models'] if m['id'] == spec['model']['id'])
    request = spec['request']
    jsonschema.validate(request, contracts['request'])
    jsonschema.validate(request['parameters'], contracts['inputs'][request['capability']])
    if (canonical(model) != canonical(spec['model']) or model['id'] not in ['sam21-small-cpu-v1','vitmatte-small-cpu-v1']
            or request['capability'] != 'segment_subject' or model['requiredDevice'] != 'cpu'
            or os.environ.get('CUDA_VISIBLE_DEVICES') != ''):
        raise ValueError('CPU worker accepts only its pinned segmentation implementation')
    source_ref = spec['source']
    parsed = urlparse(spec['sourceUrl'])
    if (parsed.scheme != 'https' or parsed.hostname != 'storage.googleapis.com'
            or parse_qs(parsed.query).get('generation') != [source_ref['generation']]
            or source_ref['sha256'] != request['sourceSha256']
            or not source_ref['storagePath'].startswith('studio/sources/'+spec['ownerUid']+'/')):
        raise ValueError('Expected a generation-pinned owned source')
    source = work/'original.mp4'
    digest = hashlib.sha256(); total = 0
    response = requests.get(spec['sourceUrl'], stream=True, timeout=(15, 60), allow_redirects=False)
    response.raise_for_status()
    with source.open('xb') as output:
        for block in response.iter_content(1024*1024):
            total += len(block)
            if total > min(512*1024**2, source_ref['size']):
                raise ValueError('Oversized CPU source')
            digest.update(block); output.write(block)
    if digest.hexdigest() != source_ref['sha256'] or total != source_ref['size']:
        raise ValueError('CPU source bytes changed')
    output = work/'outputs'; output.mkdir()
    # The source-conditioned compositor consumes these RGB frames too. Retain
    # master detail instead of permanently reducing a 1080p edit to its proxy.
    normalized, geometry = normalize(source, request, output/'normalized_source.mp4', max_size=(1920, 1080))
    result = segment(spec, normalized, geometry, Path('/opt/model'), output)
    jsonschema.validate(result, contracts['outputs'][request['capability']])
    files = [blob(p, media_type='video/mp4' if p.suffix == '.mp4' else 'application/gzip' if p.name.endswith('.tar.gz') else 'application/json')
             for p in sorted(output.iterdir()) if p.is_file()]
    code = [ROOT/name for name in spec['codeFiles']]
    actual = {str(p.relative_to(ROOT)): sha(p) for p in code}
    if actual != spec['implementationFiles']:
        raise ValueError('Frozen worker implementation changed')
    return {'status': 'completed', 'jobId': spec['id'], 'attemptToken': spec['attemptToken'],
        'requestHash': spec['requestHash'], 'modelId': model['id'], 'revision': model['revision'],
        'output': result, 'files': files, 'finishedAt': datetime.now(timezone.utc).isoformat(),
        'metrics': {'device': 'cpu', 'gpuCount': 0, 'peakVramBytes': 0,
            'runtimeSeconds': time.monotonic()-started, 'peakRssKiB': resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
            'torch': torch.__version__, 'transformers': transformers.__version__},
        'provenance': {'implementationSha256': hashlib.sha256(canonical(actual).encode()).hexdigest(),
            'implementationFiles': actual, 'weights': model['weights'], 'license': model['license'],
            'runtimeImage': spec['workerImage'], 'runtimeKind': 'private_local_docker_cpu',
            'runtimeOverlay': spec['runtimeOverlay'], 'dependencies': request['dependencyHashes']}}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--spec', required=True, type=Path)
    args = parser.parse_args()
    spec = json.loads(args.spec.read_text())
    try:
        result = execute(spec, args.spec.parent)
    except Exception as error:
        import re
        import sys
        import traceback
        # Transport exceptions may embed the generation-pinned signed read.
        # Keep useful local diagnostics without retaining that credential.
        print(re.sub(r'https?://[^\s<>"\']+', '[source URL redacted]', traceback.format_exc()), file=sys.stderr)
        result = {'status': 'failed', 'jobId': spec['id'], 'attemptToken': spec['attemptToken'],
                  'requestHash': spec['requestHash'], 'error': type(error).__name__}
    write_json(args.spec.parent/'result.json', result)
    if result['status'] != 'completed':
        raise SystemExit(1)
