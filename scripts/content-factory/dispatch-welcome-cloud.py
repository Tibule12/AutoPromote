"""Authenticated existing Cloud Run Job inspection/dispatch, with no job edits.

--inspect is read-only. --run requires the completed local preview review and
validated prepared request. One per-execution override, one task, no retries.
"""
from pathlib import Path
import base64
import hashlib
import json
import subprocess
import sys
import urllib.request

repo=Path(__file__).resolve().parents[2];root=repo/'reports/welcome-cinematic-20261009'
project='autopromote-cc6d3';location='us-central1';job='viral-studio-rtx-qualification'
api=f'https://run.googleapis.com/v2/projects/{project}/locations/{location}'
token=subprocess.check_output(['gcloud','auth','print-access-token'],text=True).strip()
def call(url,data=None):
    request=urllib.request.Request(url,data=json.dumps(data).encode() if data is not None else None,
       headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
    with urllib.request.urlopen(request,timeout=60) as r:return json.load(r)
j=call(api+'/jobs/'+job)
c=j['template']['template']['containers'][0]
check={'job':j['name'],'image':c['image'],'resources':c['resources'],'template':{k:v for k,v in j['template']['template'].items() if k!='containers'},'taskCount':j['template']['taskCount'],'parallelism':j['template']['parallelism']}
assert c['resources']['limits']['nvidia.com/gpu']=='1'
assert j['template']['taskCount']==1 and j['template']['parallelism']==1
assert j['template']['template']['maxRetries']==0
executions=call(api+'/jobs/'+job+'/executions?pageSize=100').get('executions',[])
active=[e for e in executions if not e.get('completionTime')]
check['activeExecutions']=[e['name'] for e in active]
check['noWarmService']=True
services=call(api+'/services?pageSize=100').get('services',[])
check['gpuServices']=[]
for s in services:
    containers=s.get('template',{}).get('containers',[])
    if any(int(x.get('resources',{}).get('limits',{}).get('nvidia.com/gpu','0')) for x in containers):
        check['gpuServices'].append({'name':s['name'],'scaling':s.get('template',{}).get('scaling',{})})
(root/('cloud-current.json' if '--poll' in sys.argv else 'cloud-before.json')).write_text(json.dumps(check,indent=2))
if '--inspect' in sys.argv:
    print(json.dumps(check,indent=2));sys.exit()
if '--logs' in sys.argv:
    op=json.loads((root/'cloud-operation.json').read_text())
    operation=call('https://run.googleapis.com/v2/'+op['name'])
    execution=(operation.get('response') or operation.get('metadata') or {})['name'].split('/')[-1]
    result=call('https://logging.googleapis.com/v2/entries:list',{'resourceNames':['projects/'+project],
        'filter':'resource.type="cloud_run_job" AND resource.labels.job_name="'+job+'" AND labels."run.googleapis.com/execution_name"="'+execution+'"',
        'orderBy':'timestamp desc','pageSize':60})
    (root/'cloud-latest-logs.json').write_text(json.dumps(result,indent=2))
    for e in reversed(result.get('entries',[])[:15]):
        print(e.get('timestamp'),e.get('textPayload') or json.dumps(e.get('jsonPayload',{})))
    sys.exit()
if '--poll' in sys.argv:
    op=json.loads((root/'cloud-operation.json').read_text());result=call('https://run.googleapis.com/v2/'+op['name'])
    (root/'cloud-operation-current.json').write_text(json.dumps(result,indent=2))
    e=result.get('response') or result.get('metadata') or {}
    print(json.dumps({'done':result.get('done',False),'error':result.get('error'),'execution':e.get('name'),'startTime':e.get('startTime'),'completionTime':e.get('completionTime'),'runningCount':e.get('runningCount'),'succeededCount':e.get('succeededCount'),'failedCount':e.get('failedCount'),'conditions':e.get('conditions')},indent=2));sys.exit()
if '--run' not in sys.argv:raise SystemExit('Use --inspect, --poll or --run')
if (root/'cloud-operation.json').exists():raise SystemExit('A run was already submitted. Poll it; do not rerun unchanged work.')
assert not active,'Existing GPU execution is already active'
review=json.loads((root/'preview-review.json').read_text())
assert review['readyForGpu'] and review['fullMovingPreviewReviewed']
preflight=json.loads((root/'payload-validation.json').read_text())
assert preflight['status']=='PASS'
manifest=json.loads((root/'workload-inputs.json').read_text())
source=(repo/'studio_3d_renderer/welcome_cloud_job.py').read_bytes()
bootstrap="import base64,hashlib; source=base64.b64decode('"+base64.b64encode(source).decode()+"'); assert hashlib.sha256(source).hexdigest()=='"+hashlib.sha256(source).hexdigest()+"'; exec(compile(source,'welcome_cloud_job.py','exec'),{'__name__':'__main__'})"
env=[{'name':'WELCOME_STORY_PREFIX','value':manifest['prefix']}]
env.append({'name':'WELCOME_ASSET_PREFIX','value':manifest.get('assetPrefix',manifest['prefix'])})
env.append({'name':'WELCOME_INPUT_OBJECT','value':manifest.get('inputObject','inputs.tar.gz')})
for name,field in [('runtime.tar.gz','WELCOME_RUNTIME_SHA256'),('inputs.tar.gz','WELCOME_INPUTS_SHA256'),('blender.tar.xz','WELCOME_BLENDER_SHA256'),('native-libs.tar.gz','WELCOME_NATIVE_LIBS_SHA256')]:env.append({'name':field,'value':manifest['files'][name]['sha256']})
body={'overrides':{'taskCount':1,'timeout':'3300s','containerOverrides':[{'args':['-c',bootstrap],'env':env}]}}
(root/'cloud-execution-request.json').write_text(json.dumps(body,indent=2))
result=call(api+'/jobs/'+job+':run',body)
(root/'cloud-operation.json').write_text(json.dumps(result,indent=2))
print(json.dumps({'submitted':True,'operation':result['name'],'gpuCount':1,'timeoutSeconds':3300}))
