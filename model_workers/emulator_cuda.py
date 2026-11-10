"""Explicit local CUDA qualification of the existing owned-model pipeline.

Only the guarded loopback demo can select this host overlay. It is neither a
CPU execution nor a hermetic Cloud Run image; every receipt says so.
"""
import argparse
import json
import os
from pathlib import Path

from model_workers.common import sha, write_json


def execute(spec, work):
    if (os.environ.get('GCLOUD_PROJECT') != 'demo-autopromote-credits'
            or os.environ.get('STUDIO_BACKGROUND_DEMO') != 'true'
            or os.environ.get('STUDIO_BACKGROUND_DEMO_LOCAL_CUDA') != 'true'
            or os.environ.get('CUDA_VISIBLE_DEVICES') != '0'):
        raise ValueError('Explicit isolated local CUDA environment required')
    overlay = spec['runtimeOverlay']
    if overlay['kind'] != 'private_local_cuda_host_overlay_v1':
        raise ValueError('Unrecognized CUDA overlay')
    directory = Path(overlay['directory']).resolve()
    if directory != Path('/dev/shm/autopromote-local-cu118-20261104'):
        raise ValueError('Unqualified local CUDA directory')
    for filename, digest in overlay['files'].items():
        path = directory / filename
        if (Path(filename).is_absolute() or '..' in Path(filename).parts
                or not path.resolve().is_relative_to(directory) or sha(path) != digest):
            raise ValueError('Local CUDA runtime bytes changed')
    import torch
    from model_workers.adapters.bounded_attention import bounded_attention
    from model_workers.emulator_cpu import execute as owned_execute
    if (torch.__version__ != '2.5.1+cu118' or torch.version.cuda != '11.8'
            or not torch.cuda.is_available() or torch.cuda.device_count() != 1):
        raise ValueError('Pinned local CUDA execution is unavailable')
    torch.cuda.reset_peak_memory_stats()
    torch.backends.cuda.enable_flash_sdp(False)
    torch.backends.cuda.enable_mem_efficient_sdp(False)
    torch.backends.cuda.enable_math_sdp(True)
    checks = {}
    def record(row):
        checks[json.dumps([row['queryShape'], row['keyShape']])] = row
    with bounded_attention(128, verify_actual=True, record=record):
        result = owned_execute(spec, work, device='cuda')
    # The shared runner still checks owner/source generations, frozen code,
    # immutable dependencies, complete frame coverage and pinned model weights.
    result['provenance']['runtimeOverlay'] = overlay
    result['provenance']['fullKeyAttentionChecks'] = list(checks.values())
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--spec', required=True, type=Path)
    args = parser.parse_args()
    spec = json.loads(args.spec.read_text())
    try:
        result = execute(spec, args.spec.parent)
    except Exception:
        import traceback
        traceback.print_exc()
        result = dict(status='failed', jobId=spec['id'],
                      attemptToken=spec['attemptToken'], requestHash=spec['requestHash'])
    write_json(args.spec.parent / 'result.json', result)
    if result['status'] != 'completed':
        raise SystemExit(1)
