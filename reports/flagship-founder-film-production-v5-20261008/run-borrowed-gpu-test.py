"""One bounded private film test, restoring the idle QA worker afterward."""
import argparse
import importlib.util
import json
import os
import shlex
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DEADLINE = 1791489600
HOST = 'autopromote-l40s-staging'
PACKAGE = '/data/autopromote-founder-production-v5-20261008/gpu-package'
SSH = ['ssh', '-n', '-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', HOST]
RESTORE = Path('/home/tibule12/.local/share/autopromote/studio-canonical-completion-20261008/worker-window.sh')
p=argparse.ArgumentParser();mode=p.add_mutually_exclusive_group()
mode.add_argument('--helm',action='store_true');mode.add_argument('--helm-response',action='store_true');mode.add_argument('--flf',action='store_true');mode.add_argument('--flf-full',action='store_true');mode.add_argument('--vace14b',action='store_true');p.add_argument('--aligned',action='store_true');args=p.parse_args()
if args.aligned and not (args.flf or args.flf_full):p.error('--aligned requires a first/last-frame mode')
watchdog_path=ROOT.parent.parent/'scripts/content-factory/founder-film/v4-gpu-watchdog.py'
spec=importlib.util.spec_from_file_location('film_watchdog',watchdog_path)
watchdog=importlib.util.module_from_spec(spec);spec.loader.exec_module(watchdog)
prefix='flf-transform-aligned' if args.aligned else 'flf-transform'
stages=[('run-vace14b-on-l40s.sh','vace14b-edges-run.log')] if args.vace14b else [('run-helm-i2v-on-l40s.sh','helm-response-i2v-720p-run.log')] if args.helm_response else [('run-flf-transform-on-l40s.sh',prefix+('-full-run.log' if args.flf_full else '-preview-run.log'))] if args.flf or args.flf_full else [
    ('run-helm-i2v-on-l40s.sh','helm-i2v-720p-run.log')] if args.helm else [
    ('run-sailor-source-on-l40s.sh','sailor-source-run.log'),('run-morph-i2v-on-l40s.sh','morph-i2v-65f-run.log')]
receipt_name='borrowed-vace14b-receipt.json' if args.vace14b else 'borrowed-helm-response-receipt.json' if args.helm_response else 'borrowed-flf-full-receipt.json' if args.flf_full else 'borrowed-flf-test-receipt.json' if args.flf else 'borrowed-helm-test-receipt.json' if args.helm else 'borrowed-gpu-test-receipt.json'
if args.aligned:receipt_name=receipt_name.replace('flf-','flf-aligned-')
record = {'startedAt': datetime.now(timezone.utc).isoformat(), 'cutoffEpoch': DEADLINE,
          'qaPause': 'Graceful SIGTERM to idle uvicorn after completed requests; 0% compute/encode/decode; no CUDA process',
          'stages': []}
try:
    for script, log_name in stages:
        suffix=(' full aligned' if args.flf_full else ' preview aligned') if args.aligned else ' v2' if args.helm_response else ' full' if args.flf_full else ''
        command = f'AUTHORIZED_DEADLINE_EPOCH={DEADLINE} bash {PACKAGE}/{script} {PACKAGE}'+suffix
        print(json.dumps({'event': 'RUN', 'script': script}), flush=True)
        with (ROOT/log_name).open('ab') as log:
            result = subprocess.run(SSH+[command], stdout=log, stderr=subprocess.STDOUT)
        record['stages'].append({'script': script, 'exitCode': result.returncode})
        print(json.dumps({'event': 'EXIT', 'script': script, 'exitCode': result.returncode}), flush=True)
        if result.returncode:
            break
finally:
    if time.time()+90 < DEADLINE:
        # Do not duplicate a server restored by its own QA session.
        try:
            probe = subprocess.run(SSH+['python3 -c '+shlex.quote(watchdog.REMOTE_PROBE)], capture_output=True, text=True, timeout=25)
            busy=watchdog.remote_busy(probe.stdout)[0] if probe.returncode==0 else True
        except (OSError, subprocess.TimeoutExpired, ValueError) as error:
            busy=True
            record['qaRestoreProbeError']=type(error).__name__
        if not busy:
            env = dict(os.environ, STUDIO_QA_GPU_DEADLINE_EPOCH=str(DEADLINE))
            with (ROOT/'qa-restored-worker.log').open('ab') as log:
                server = subprocess.Popen(['bash', str(RESTORE), 'media'], env=env,
                    stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
            record['qaRestorePid'] = server.pid
        else:
            record['qaRestore'] = 'Existing container or uncertain probe; do not contend with another GPU owner'
    else:
        record['qaRestore'] = 'Authorized cutoff is near or passed; no new server launched'
    record['completedAt'] = datetime.now(timezone.utc).isoformat()
    (ROOT/receipt_name).write_text(json.dumps(record, indent=2))
    print(json.dumps(record), flush=True)
