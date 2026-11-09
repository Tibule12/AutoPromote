from pathlib import Path
import subprocess,json,time,os
root=Path(__file__).resolve().parents[2];p=root/'reports/studio-template-collection-20261104';cases=[c for c in json.loads((p/'collection.json').read_text()) if c['id'] not in ['living_infinity_v1','editorial_fan_v1']];deadline=time.time()+3600
while not (all((p/c['id']/'render-ui.json').exists() and (p/c['id']/'finished-ui.json').exists() for c in cases) and (p/'welcome-r3/verification.json').exists() and (p/'candidate-auth-r3/verification.json').exists()):
    assert time.time()<deadline,'First five native exports/playbacks not complete; no resubmission.'
    time.sleep(5)
env={**os.environ,'NODE_PATH':'/home/tibule12/Projects/AutoPromte/AutoPromote/node_modules','TMPDIR':'/dev/shm'}
with (p/'promote-r2.log').open('ab',buffering=0) as log:
    subprocess.run(['node','scripts/studio-professional/promote-template-collection.cjs'],env=env,cwd=root,stdout=log,stderr=subprocess.STDOUT,check=True,timeout=120)
for identity,phases in [('editorial_fan_v1',['author','render']),('living_infinity_v1',['render'])]:
    folder=p/identity;folder.mkdir(exist_ok=True)
    for phase in phases:
        if phase=='render':assert not (folder/'native-motion-flow-render-request.private.json').exists()
        with (folder/(phase+'.log')).open('ab',buffering=0) as log:
            c=subprocess.Popen(['node','scripts/studio-professional/template-collection-proof.cjs','/tmp/autopromote-application-demo-5izIlF',phase,identity],cwd=root,env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT)
            (p/'type-render-current.json').write_text(json.dumps({'pid':c.pid,'id':identity,'phase':phase,'startedAt':time.time()},indent=2));assert c.wait(timeout=2100 if phase=='render' else 450)==0,'Native corrected style failed; no automatic retry.'
        print(identity,phase,'complete',flush=True)
print('All selected native exports complete',flush=True)
