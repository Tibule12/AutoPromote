"""Borrow the idle existing API reservation for one bounded private asset."""
import argparse,json,os,shlex,subprocess,sys,time
from datetime import datetime,timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parent
REMOTE='/data/autopromote-founder-realism-20261009/gpu-package'
SSH=['ssh','-n','-T','-o','BatchMode=yes','-o','ConnectTimeout=15','autopromote-l40s-staging']
DEADLINE=1791536400
RESTORE=Path('/home/tibule12/.local/share/autopromote/podcast-two-minute-20261009/worker-window.sh')
API='autopromote-podcast-media-20261009'
p=argparse.ArgumentParser();mode=p.add_mutually_exclusive_group();mode.add_argument('--render',action='store_true');mode.add_argument('--sources',type=int,choices=(1,2),nargs='?',const=1);args=p.parse_args()

def remote(code):
 r=subprocess.run(SSH+['python3 -c '+shlex.quote(code)],capture_output=True,text=True,timeout=35)
 if r.returncode:raise RuntimeError(r.stderr or r.stdout)
 return r.stdout

preflight=r'''
import json,subprocess,urllib.request
names=subprocess.check_output(['docker','ps','--format','{{.Names}}'],text=True).splitlines()
gpu=subprocess.check_output(['nvidia-smi','--query-gpu=name,utilization.gpu,utilization.encoder,utilization.decoder,memory.used','--format=csv,noheader'],text=True)
pids=subprocess.check_output(['nvidia-smi','--query-compute-apps=pid','--format=csv,noheader'],text=True).strip()
if pids or any(n!='autopromote-podcast-media-20261009' for n in names):raise SystemExit('Existing GPU owner; do not interrupt')
if names:
 state=json.load(urllib.request.urlopen('http://127.0.0.1:8080/health',timeout=4))['worker_state']
 if state!={'status':'idle','job_id':None,'type':None}:raise SystemExit('Media worker busy')
 # Graceful uvicorn termination; never force-stop a process with an active request.
 inner="import os,signal,urllib.request,json; s=json.load(urllib.request.urlopen('http://127.0.0.1:8080/health',timeout=4))['worker_state']; assert s=={'status':'idle','job_id':None,'type':None}; from pathlib import Path; p=[int(x.parent.name) for x in Path('/proc').glob('[0-9]*/cmdline') if b'main_media_server:app' in x.read_bytes().split(b'\\x00') and any(a.rsplit(b'/',1)[-1]==b'uvicorn' for a in x.read_bytes().split(b'\\x00'))]; assert len(p)==1; os.kill(p[0],signal.SIGTERM)"
 stop=subprocess.run(['docker','exec','autopromote-podcast-media-20261009','/opt/media/bin/python3','-c',inner],capture_output=True,text=True)
 if stop.returncode:raise SystemExit(stop.stderr)
print(json.dumps({'gpu':gpu.strip(),'cudaProcesses':pids,'containerNames':names,'idleServiceGracefulShutdownRequested':bool(names)}))
'''
record={'startedAt':datetime.now(timezone.utc).isoformat(),'deadlineEpoch':DEADLINE,'stage':'existing Factory/Director/NVENC scene assembly' if args.render else 'matched-direction paper source images' if args.sources else 'one native720 yacht take','stages':[]}
try:
 if time.time()+(180 if args.render or args.sources else 2100)>=DEADLINE:raise RuntimeError('Insufficient existing authorized window')
 record['preflight']=json.loads(remote(preflight));print(json.dumps(record['preflight']),flush=True)
 for _ in range(15):
  names=remote("import subprocess; print(subprocess.check_output(['docker','ps','--format','{{.Names}}'],text=True).strip())").strip()
  if not names:break
  time.sleep(1)
 else:raise RuntimeError('Graceful API shutdown incomplete; do not force or submit')
 if args.render:
  with (ROOT/'scene-render.log').open('ab') as log:
   r=subprocess.run(['node',str(ROOT.parents[1]/'scripts/content-factory/render-transformation.js'),str(ROOT),'30'],stdout=log,stderr=subprocess.STDOUT)
  record['stages'].append({'script':'existing render-transformation.js v30','exitCode':r.returncode})
 elif args.sources:
  with (ROOT/'source-images.log').open('ab') as log:
   r=subprocess.run(SSH+[f'AUTHORIZED_DEADLINE_EPOCH={DEADLINE} bash {REMOTE}/run-sources.sh {REMOTE} {args.sources}'],stdout=log,stderr=subprocess.STDOUT)
  record['stages'].append({'script':'run-sources.sh','exitCode':r.returncode})
 else:
  with (ROOT/'yacht-run.log').open('ab') as log:
   r=subprocess.run(SSH+[f'AUTHORIZED_DEADLINE_EPOCH={DEADLINE} bash {REMOTE}/run-yacht.sh {REMOTE}'],stdout=log,stderr=subprocess.STDOUT)
  record['stages'].append({'script':'run-yacht.sh','exitCode':r.returncode})
finally:
 if time.time()+90<DEADLINE:
  try:
   names=remote("import subprocess; print(subprocess.check_output(['docker','ps','--format','{{.Names}}'],text=True).strip()); print(subprocess.check_output(['nvidia-smi','--query-compute-apps=pid','--format=csv,noheader'],text=True).strip())").strip()
   if not names:
    with (ROOT/'media-restored.log').open('ab') as log:
     server=subprocess.Popen(['bash',str(RESTORE),'media'],env=dict(os.environ,STUDIO_QA_GPU_DEADLINE_EPOCH=str(DEADLINE)),stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
    record['restoredMediaPid']=server.pid
   else:record['restore']='Existing GPU owner retained; no duplicate API started'
  except Exception as e:record['restoreError']=str(e)
 else:record['restore']='Deadline near; no new service started'
 record['completedAt']=datetime.now(timezone.utc).isoformat()
 (ROOT/('borrowed-render-receipt.json' if args.render else ('borrowed-source-receipt.json' if args.sources==1 else 'borrowed-source2-receipt.json') if args.sources else 'borrowed-gpu-receipt.json')).write_text(json.dumps(record,indent=2)+'\n')
 print(json.dumps(record),flush=True)
if any(stage.get('exitCode') for stage in record['stages']):sys.exit(1)
