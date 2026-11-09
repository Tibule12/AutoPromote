"""Stop this bounded production lease without canceling another active GPU job."""
import json
import subprocess
import sys
import time
from pathlib import Path

root = Path(sys.argv[1])
state = json.loads((root/'production-state.json').read_text())
deadline = state['gpuDeadlineEpoch']
while time.time() < deadline:
    time.sleep(min(10, deadline-time.time()))
ssh = ['ssh','-n','-T','-p','22','-o','BatchMode=yes','-o','ConnectTimeout=8',
       'autopromote-l40s-staging-host']
result = {'deadlineEpoch':deadline,'recordedAtEpoch':time.time()}
try:
    subprocess.run(ssh+['docker stop -t 10 autopromote-founder-rebuild-20261008'],
                   capture_output=True,timeout=30)
    probe = subprocess.run(ssh+[
        'nvidia-smi --query-compute-apps=pid,process_name --format=csv,noheader'],
        capture_output=True,text=True,timeout=20)
    if probe.returncode == 0 and probe.stdout.strip():
        result.update(status='OWN_JOB_STOPPED_OTHER_GPU_PROCESS_PRESERVED',
                      otherGpuProcesses=probe.stdout.strip())
    else:
        stop = subprocess.run(['/home/tibule12/.local/bin/brev','stop',
                               'autopromote-l40s-staging'],
                              capture_output=True,text=True,timeout=120)
        result.update(status='LEASE_EXPIRED_VM_STOP_REQUESTED',exitCode=stop.returncode)
except Exception as error:
    # A failed SSH inspection is not a reason to leave our exclusive lease paid.
    # The root controller also checks/cleans up before ending the turn.
    result['inspectionError'] = type(error).__name__
    stop = subprocess.run(['/home/tibule12/.local/bin/brev','stop',
                           'autopromote-l40s-staging'],capture_output=True,timeout=120)
    result.update(status='LEASE_EXPIRED_VM_STOP_REQUESTED',exitCode=stop.returncode)
(root/'watchdog-receipt.json').write_text(json.dumps(result,indent=2))
