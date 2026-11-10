"""Observe each completed native movie in a fresh normally signed-in Studio."""
from pathlib import Path
import os,subprocess,json,time
root=Path(__file__).resolve().parents[2];p=root/'reports/studio-template-collection-20261104';cases=json.loads((p/'collection.json').read_text());deadline=time.time()+5400
env={**os.environ,'NODE_PATH':'/home/tibule12/Projects/AutoPromte/AutoPromote/node_modules','TMPDIR':'/dev/shm'}
while True:
    remaining=[c for c in cases if not (p/c['id']/'finished-ui.json').exists()]
    if not remaining:break
    assert time.time()<deadline,'Native film completion observation deadline reached; do not resubmit accepted jobs.'
    ready=next((c for c in remaining if (p/c['id']/'render-ui.json').exists()),None)
    if not ready:time.sleep(5);continue
    folder=p/ready['id']
    with (folder/'finished.log').open('ab',buffering=0) as log:
        c=subprocess.Popen(['node','scripts/studio-professional/template-collection-proof.cjs','/tmp/autopromote-application-demo-5izIlF','finished',ready['id']],cwd=root,env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT)
        (p/'finished-current.json').write_text(json.dumps({'id':ready['id'],'pid':c.pid,'startedAt':time.time()},indent=2));code=c.wait(timeout=300)
        assert code==0,f'{ready["id"]}: finished playback failed; no automatic retry.'
    print(ready['id'],'complete matching Studio playback retained',flush=True)
print('All six finished native Studio playbacks complete',flush=True)
