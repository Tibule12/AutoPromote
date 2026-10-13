import json,subprocess,time
from pathlib import Path
p=Path(__file__).resolve().parent
state=json.loads((p/'production-state.json').read_text());deadline=state['finalEncodeWindow']['deadlineEpoch']
while time.time()<deadline:time.sleep(min(10,deadline-time.time()))
ssh=['ssh','-n','-T','-p','22','-o','BatchMode=yes','-o','ConnectTimeout=8','autopromote-l40s-staging-host']
r={'deadlineEpoch':deadline,'at':time.time()}
try:
 stop=subprocess.run(ssh+['docker stop -t 5 autopromote-founder-production-v3'],capture_output=True,text=True,timeout=15)
 probe=subprocess.run(ssh+['nvidia-smi --query-compute-apps=pid --format=csv,noheader; docker ps --format "{{.Names}}"'],capture_output=True,text=True,timeout=15)
 r.update(containerStopExitCode=stop.returncode,probeExitCode=probe.returncode,foreignWorkPresent=bool(probe.stdout.strip()))
 if probe.returncode==0 and not probe.stdout.strip():
  vm=subprocess.run(['/home/tibule12/.local/bin/brev','stop','autopromote-l40s-staging'],capture_output=True,text=True,timeout=120)
  r.update(status='IDLE_VM_STOP_REQUESTED',stopExitCode=vm.returncode)
 else:r['status']='FOREIGN_OR_UNCERTAIN_WORK_PRESERVED'
except Exception as e:r.update(status='INSPECTION_FAILED',error=type(e).__name__)
(p/'final-encode-watchdog-receipt.json').write_text(json.dumps(r,indent=2))
