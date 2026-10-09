"""Bound this production's jobs; another session owns the already-running VM."""
import json
from pathlib import Path
import subprocess
import sys
import time

root=Path(sys.argv[1])
state=json.loads((root/'production-state.json').read_text())
deadline=state['GPUWindow']['jobDeadlineEpoch']
while time.time()<deadline:
    time.sleep(min(10,deadline-time.time()))
ssh=['ssh','-n','-T','-p','22','-o','BatchMode=yes','-o','ConnectTimeout=8','autopromote-l40s-staging-host']
receipt={'deadlineEpoch':deadline,'recordedAtEpoch':time.time(),'scope':'Own production container only. Preserve existing Studio VFX worker and VM.'}
try:
    result=subprocess.run(ssh+['docker stop -t 10 autopromote-founder-production-v3'],capture_output=True,text=True,timeout=30)
    receipt.update(status='OWN_CONTAINER_STOP_REQUESTED',exitCode=result.returncode)
    current=json.loads((root/'production-state.json').read_text())
    if current['GPUWindow'].get('startedVmHere'):
        probe=subprocess.run(ssh+['nvidia-smi --query-compute-apps=pid --format=csv,noheader; docker ps --format "{{.Names}}"'],capture_output=True,text=True,timeout=20)
        if probe.returncode==0 and not probe.stdout.strip():
            stop=subprocess.run(['/home/tibule12/.local/bin/brev','stop','autopromote-l40s-staging'],capture_output=True,text=True,timeout=120)
            receipt.update(status='OWN_LEASE_EXPIRED_VM_STOP_REQUESTED',stopExitCode=stop.returncode)
        else:
            receipt.update(status='OWN_JOB_STOPPED_FOREIGN_WORK_OR_UNCERTAIN_STATE_PRESERVED')
except Exception as error:
    receipt.update(status='OWN_CONTAINER_STOP_INSPECTION_FAILED',error=type(error).__name__)
(root/'watchdog-receipt.json').write_text(json.dumps(receipt,indent=2))
