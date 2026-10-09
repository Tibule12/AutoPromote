"""Bound this film's own jobs; preserve another workflow if it acquires the GPU."""
import time,json,subprocess
from pathlib import Path
r=Path(__file__).resolve().parents[3]/'reports/flagship-founder-film-20261008';state=json.loads((r/'production-state.json').read_text());deadline=state['gpuDeadlineEpoch']
while time.time()<deadline:time.sleep(min(15,deadline-time.time()))
ssh=['ssh','-n','-T','-p22','-o','ControlMaster=no','-o','ControlPath=none','-o','ConnectTimeout=8','autopromote-l40s-staging-host']
cmd='docker ps --format "{{.Names}}"'
try:
 p=subprocess.run(ssh+[cmd],capture_output=True,text=True,timeout=20)
 names=p.stdout.splitlines();others=[n for n in names if n and not n.startswith('autopromote-founder-film-')]
 if others:
  result={'status':'FILM_WINDOW_EXPIRED_SHARED_VM_PRESERVED','otherContainers':others}
  for n in names:
   if n.startswith('autopromote-founder-film-'):subprocess.run(ssh+['docker stop '+n],capture_output=True,timeout=45)
 else:
  stop=subprocess.run(['/home/tibule12/.local/bin/brev','stop','autopromote-l40s-staging'],capture_output=True,text=True,timeout=120);result={'status':'FILM_WINDOW_EXPIRED_VM_STOP_REQUESTED','exitCode':stop.returncode}
except Exception as e:result={'status':'WATCHDOG_CHECK_FAILED','error':type(e).__name__}
(r/'watchdog-receipt.json').write_text(json.dumps(result,indent=2))
