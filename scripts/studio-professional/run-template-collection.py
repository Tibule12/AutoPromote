"""Bounded sequential observers of real Studio controls; never retry an accepted render."""
from pathlib import Path
import subprocess,json,os,time,sys
root=Path(__file__).resolve().parents[2];p=root/'reports/studio-template-collection-20261104';phase=sys.argv[1];assert phase in ['author','render','finished'];cases=json.loads((p/'collection.json').read_text());results=[]
if os.environ.get('STUDIO_COLLECTION_IDS'):cases=[c for c in cases if c['id'] in os.environ['STUDIO_COLLECTION_IDS'].split(',')]
env={**os.environ,'NODE_PATH':'/home/tibule12/Projects/AutoPromte/AutoPromote/node_modules','TMPDIR':'/dev/shm'}
for c in cases:
    folder=p/c['id'];folder.mkdir(exist_ok=True)
    marker=folder/(phase+'-ui.json')
    if marker.exists():
        assert json.loads(marker.read_text())['errors']==[]
        results.append({'id':c['id'],'preservedExistingSuccess':True});continue
    if phase=='render':assert not (folder/'native-motion-flow-render-request.private.json').exists(),'An accepted render requires recovery, not resubmission'
    with (folder/(phase+'.log')).open('ab',buffering=0) as log:
        child=subprocess.Popen(['node','scripts/studio-professional/template-collection-proof.cjs','/tmp/autopromote-application-demo-5izIlF',phase,c['id']],cwd=root,env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT)
        (p/(phase+'-current.json')).write_text(json.dumps({'id':c['id'],'phase':phase,'pid':child.pid,'startedAt':time.time()},indent=2))
        code=child.wait(timeout=2100 if phase=='render' else 450)
        results.append({'id':c['id'],'exitCode':code})
        (p/(phase+'-results.json')).write_text(json.dumps(results,indent=2))
        if code:raise SystemExit(f'{c["id"]}: {phase} stopped with {code}; no automatic retry')
        assert marker.exists()
print(phase,'complete for all six native projects',flush=True)
