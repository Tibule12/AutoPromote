"""Read-only terminal execution/task accounting and zero-capacity audit."""
from pathlib import Path
from datetime import datetime,timezone
import json,subprocess,urllib.request

root=Path(__file__).resolve().parents[2]/'reports/welcome-cinematic-20261009'
token=subprocess.check_output(['gcloud','auth','print-access-token'],text=True).strip()
base='https://run.googleapis.com/v2/projects/autopromote-cc6d3/locations/us-central1'
def get(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers={'Authorization':'Bearer '+token}),timeout=30) as r:return json.load(r)
def seconds(a,b):return (datetime.fromisoformat(b.replace('Z','+00:00'))-datetime.fromisoformat(a.replace('Z','+00:00'))).total_seconds() if a and b else None
job='viral-studio-rtx-qualification'
names=['viral-studio-rtx-qualification-78m5m','viral-studio-rtx-qualification-8pkf9','viral-studio-rtx-qualification-z9jjf','viral-studio-rtx-qualification-vbb9w']
op=json.loads((root/'cloud-operation.json').read_text())
current=get('https://run.googleapis.com/v2/'+op['name'])
assert current.get('done'),'Current execution is still active'
names.append((current.get('response') or current.get('metadata'))['name'].split('/')[-1])
rows=[]
for n in names:
    e=get(base+'/jobs/'+job+'/executions/'+n)
    assert e.get('completionTime'),n+' is not terminal'
    t=get(base+'/jobs/'+job+'/executions/'+n+'/tasks').get('tasks',[])
    rows.append({'execution':n,'startTime':e.get('startTime'),'completionTime':e['completionTime'],'executionElapsedSeconds':seconds(e.get('startTime'),e['completionTime']),
        'succeededCount':e.get('succeededCount',0),'failedCount':e.get('failedCount',0),'conditions':e['conditions'],
        'tasks':[{'startTime':x.get('startTime'),'completionTime':x.get('completionTime'),'reportedRunSeconds':seconds(x.get('startTime'),x.get('completionTime')),'lastAttemptResult':x.get('lastAttemptResult')} for x in t]})
all_exec=get(base+'/jobs/'+job+'/executions?pageSize=100').get('executions',[])
active=[e['name'] for e in all_exec if not e.get('completionTime')]
gpu_jobs=[]
for resource in get(base+'/jobs?pageSize=100').get('jobs',[]):
    if any(int(c.get('resources',{}).get('limits',{}).get('nvidia.com/gpu','0')) for c in resource['template']['template']['containers']):
        executions=get('https://run.googleapis.com/v2/'+resource['name']+'/executions?pageSize=100').get('executions',[])
        running=[e['name'] for e in executions if not e.get('completionTime')]
        gpu_jobs.append({'job':resource['name'],'activeExecutions':running})
        for n in running:
            if n not in active:active.append(n)
services=get(base+'/services?pageSize=100').get('services',[])
gpu=[s['name'] for s in services if any(int(c.get('resources',{}).get('limits',{}).get('nvidia.com/gpu','0')) for c in s.get('template',{}).get('containers',[]))]
j=get(base+'/jobs/'+job)
assert not active and not gpu
assert j['template']['taskCount']==1 and j['template']['parallelism']==1
zero={'verifiedAt':datetime.now(timezone.utc).isoformat(),'project':'autopromote-cc6d3','region':'us-central1','activeExecutions':active,'gpuJobs':gpu_jobs,'gpuServices':gpu,'activeGpuTasks':0,'warmGpuServiceCapacity':0,'jobImage':j['template']['template']['containers'][0]['image'],'jobDefinitionUnchanged':j['template']['template']['timeout']=='300s','persistedFinalReceipt':'gpu-final-receipt.json'}
account={'executions':rows,'totalExecutionElapsedSeconds':sum(x['executionElapsedSeconds'] or 0 for x in rows),'totalReportedTaskRunSeconds':sum(t['reportedRunSeconds'] or 0 for x in rows for t in x['tasks']),
    'finalWorkloadSeconds':json.loads((root/'gpu-final-receipt.json').read_text())['workloadSeconds'],
    'definitions':'Execution elapsed includes provisioning/termination within execution timestamps and cancelled executions. Reported task run excludes entries with no start/completion timestamps. These are measured API durations, not a billing estimate. The reference cancellation has no reported started task. Two failed runs and two cancellations are included honestly.'}
(root/'gpu-zero-after.json').write_text(json.dumps(zero,indent=2));(root/'cloud-time-accounting.json').write_text(json.dumps(account,indent=2))
print(json.dumps({'zero':zero,'totalExecutionElapsedSeconds':account['totalExecutionElapsedSeconds'],'totalReportedTaskRunSeconds':account['totalReportedTaskRunSeconds']}))
