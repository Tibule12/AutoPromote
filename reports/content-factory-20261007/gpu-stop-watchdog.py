import json,time,subprocess
from pathlib import Path
p=Path(__file__).resolve().parent
r=json.loads((p/"gpu-window.json").read_text())
time.sleep(max(0,r["deadline_epoch"]-time.time()-30))
with (p/"gpu-stop.log").open("a") as out:
 for attempt in range(4):
  result=subprocess.run(["/home/tibule12/.local/bin/brev","stop",r["instance"]],stdout=out,stderr=out,timeout=180)
  if result.returncode==0: break
  time.sleep(10)
 subprocess.run(["/home/tibule12/.local/bin/brev","ls"],stdout=out,stderr=out,timeout=60)
