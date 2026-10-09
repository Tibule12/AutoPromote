"""Read-only execution/log receipts and time accounting for the private proof."""
from datetime import datetime
import json
from pathlib import Path
import subprocess
import requests

ROOT=Path(__file__).resolve().parents[2]/'reports/model-capability-runtime-v1-20261009/proof'
def date(s):return datetime.fromisoformat(s.replace('Z','+00:00'))
def main():
    h={'Authorization':'Bearer '+subprocess.check_output(['gcloud','auth','print-access-token'],text=True).strip()}
    folder=ROOT/'executions';folder.mkdir(exist_ok=True)
    results=[]
    for path in sorted((ROOT/'journal/jobs').glob('*.json')):
        job=json.loads(path.read_text());name=job.get('executionName')
        if not name or '/executions/' not in name:continue
        r=requests.get('https://run.googleapis.com/v2/'+name,headers=h,timeout=30);r.raise_for_status();execution=r.json()
        short=name.rsplit('/',1)[1];(folder/(short+'.json')).write_text(json.dumps(execution,indent=2)+'\n')
        filter_=f'resource.type="cloud_run_job" AND labels."run.googleapis.com/execution_name"="{short}" AND (logName:"stdout" OR logName:"stderr")'
        filter_+=f' AND timestamp>="{execution["createTime"]}"'
        if execution.get('completionTime'):filter_+=f' AND timestamp<="{execution["completionTime"]}"'
        logs=[];page=None
        for _ in range(50):
            query={'resourceNames':['projects/autopromote-cc6d3'],'filter':filter_,'orderBy':'timestamp asc','pageSize':1000}
            if page:query['pageToken']=page
            r=requests.post('https://logging.googleapis.com/v2/entries:list',headers=h,json=query,timeout=30)
            r.raise_for_status();data=r.json();logs.extend(data.get('entries',[]));page=data.get('nextPageToken')
            if not page:break
        if page:raise ValueError('Execution log pagination incomplete')
        (folder/(short+'-logs.json')).write_text(json.dumps(logs,indent=2)+'\n')
        worker_receipt=[l['jsonPayload'] for l in logs if l.get('jsonPayload',{}).get('event')=='capability_finished']
        task=execution.get('template',{})
        row={'jobId':job['id'],'capability':job['request']['capability'],'status':job['status'],'executionName':name,
             'workerImage':job['workerImage'],'gpuCount':int(task.get('containers',[{}])[0].get('resources',{}).get('limits',{}).get('nvidia.com/gpu',0)),
             'createdAt':execution.get('createTime'),'startTime':execution.get('startTime'),'completionTime':execution.get('completionTime'),
             'workerReceipt':worker_receipt[-1] if worker_receipt else None,'artifactHash':job.get('artifactHash')}
        if row['startTime'] and row['completionTime']:row['executionWallSeconds']=(date(row['completionTime'])-date(row['startTime'])).total_seconds()
        results.append(row)
    value={'scope':'Cloud execution wall time and measured worker time, not a billing estimate','executions':results}
    (ROOT/'execution-accounting.json').write_text(json.dumps(value,indent=2)+'\n')
    print(json.dumps({'executions':len(results),'stillActive':sum(not e['completionTime'] for e in results)}))

if __name__=='__main__':main()
