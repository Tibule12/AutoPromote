"""Stop only this v4 production at its current, explicitly supplied cutoff.

Run detached on the workstation after an authorized GPU start. The VM is
stopped only when this session started it and no other work is visible.
"""
import argparse
import json
import shlex
import subprocess
import time
from pathlib import Path

OWN = ('autopromote-founder-v4-vace', 'autopromote-founder-v4-ident-preview',
       'autopromote-founder-v4-cascade-preview', 'autopromote-founder-v4-capacity-turn-preview',
       'autopromote-founder-v6-ident-preview', 'autopromote-founder-v6-ident-full',
       'autopromote-founder-v5-crew-image', 'autopromote-founder-v5-crew-action',
       'autopromote-founder-v5-crew-action-v2', 'autopromote-founder-v5-paper-origin',
       'autopromote-founder-v5-i2v-transform', 'autopromote-founder-v5-i2v-sailor',
       'autopromote-founder-v5-sailor-source', 'autopromote-founder-v5-flf-transform',
       'autopromote-founder-flf-preparation')
SSH = ['ssh', '-n', '-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', 'autopromote-l40s-staging']
BREV = '/home/tibule12/.local/bin/brev'

# A GPU API worker may have no CUDA process while waiting for its next request.
# Check Docker device reservations as well as the explicit exclusive label.
REMOTE_PROBE = '''import json,subprocess
def checked(args):
    result=subprocess.run(args,capture_output=True,text=True,check=True)
    return result.stdout
pids=checked(['nvidia-smi','--query-compute-apps=pid','--format=csv,noheader']).split()
ids=checked(['docker','ps','-q']).split()
containers=json.loads(checked(['docker','inspect',*ids])) if ids else []
gpu=[]
for item in containers:
    host=item.get('HostConfig') or {}
    labels=(item.get('Config') or {}).get('Labels') or {}
    reserved=any(r.get('Driver')=='nvidia' or any('gpu' in caps for caps in (r.get('Capabilities') or [])) for r in (host.get('DeviceRequests') or []))
    if reserved or host.get('Runtime')=='nvidia' or labels.get('autopromote.gpu.exclusive')=='true':
        gpu.append(item['Name'].lstrip('/'))
print(json.dumps({'computePids':pids,'gpuContainers':gpu}))
'''


def remote_busy(stdout):
    record=json.loads(stdout)
    if not isinstance(record,dict) or any(not isinstance(record.get(k),list) or any(not isinstance(v,str) for v in record[k]) for k in ('computePids','gpuContainers')):
        raise ValueError('Invalid GPU reservation probe')
    return bool(record['computePids'] or record['gpuContainers']),record


def run(deadline, output, started_here):
    if deadline <= time.time()+60:
        raise ValueError('Current GPU cutoff must be at least one minute ahead')
    while time.time() < deadline:
        time.sleep(min(10, max(.1, deadline-time.time())))
    receipt = {'cutoffEpoch':deadline,'checkedAtEpoch':time.time(),
               'startedVmHere':started_here,'ownContainers':list(OWN)}
    stopped = []
    for name in OWN:
        try:
            result = subprocess.run(SSH + [f'docker stop -t 10 {name}'],
                                    capture_output=True,text=True,timeout=35)
            if result.returncode == 0:
                stopped.append(name)
        except (OSError, subprocess.TimeoutExpired):
            receipt.setdefault('stopErrors', []).append(name)
    receipt['stoppedOwnContainers'] = stopped
    try:
        probe = subprocess.run(SSH + ['python3 -c '+shlex.quote(REMOTE_PROBE)],
                               capture_output=True,text=True,timeout=25)
        receipt['remoteProbeExitCode'] = probe.returncode
        receipt['remoteBusy'] = None
        if probe.returncode == 0:
            receipt['remoteBusy'],receipt['remoteReservations']=remote_busy(probe.stdout)
    except (OSError, subprocess.TimeoutExpired, ValueError):
        receipt['remoteProbeExitCode'] = None
        receipt['remoteBusy'] = None
    if started_here and receipt['remoteBusy'] is False:
        try:
            vm = subprocess.run([BREV,'stop','autopromote-l40s-staging'],
                                capture_output=True,text=True,timeout=120)
            receipt['vmStopExitCode'] = vm.returncode
            receipt['status'] = 'OWN_VM_STOP_REQUESTED' if vm.returncode == 0 else 'OWN_VM_STOP_FAILED'
        except (OSError, subprocess.TimeoutExpired):
            receipt['vmStopExitCode'] = None
            receipt['status'] = 'OWN_VM_STOP_FAILED'
    else:
        receipt['status'] = 'OWN_JOBS_STOPPED_VM_PRESERVED_FOREIGN_OR_UNCERTAIN' if started_here else 'OWN_JOBS_STOPPED_EXISTING_VM_PRESERVED'
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(receipt,indent=2))


if __name__ == '__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--deadline-epoch',type=int,required=True)
    p.add_argument('--output',type=Path,required=True)
    p.add_argument('--started-vm-here',action='store_true')
    a=p.parse_args()
    run(a.deadline_epoch,a.output,a.started_vm_here)
