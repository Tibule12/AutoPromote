"""Read-only regional GPU inventory. Does not start, terminate or warm anything."""
from datetime import datetime,timezone
import json
import subprocess
import requests
import argparse
from pathlib import Path
def inspect():
    project='autopromote-cc6d3';h={'Authorization':'Bearer '+subprocess.check_output(['gcloud','auth','print-access-token'],text=True).strip()}
    result={'at':datetime.now(timezone.utc).isoformat(),'project':project,'gpuJobs':[],'gpuServices':[],'activeGpuExecutions':[]}
    for region in ['us-central1','us-east4','europe-west1','europe-west4','asia-southeast1','asia-south1','asia-south2']:
        base=f'https://run.googleapis.com/v2/projects/{project}/locations/{region}'
        r=requests.get(base+'/jobs',headers=h,timeout=30);r.raise_for_status()
        for job in r.json().get('jobs',[]):
            task=job['template']['template']
            if not any(int(c.get('resources',{}).get('limits',{}).get('nvidia.com/gpu',0)) for c in task.get('containers',[])):continue
            result['gpuJobs'].append({'name':job['name'],'accelerator':task.get('nodeSelector',{}).get('accelerator')})
            e=requests.get('https://run.googleapis.com/v2/'+job['name']+'/executions?pageSize=100',headers=h,timeout=30);e.raise_for_status()
            for execution in e.json().get('executions',[]):
                if not execution.get('completionTime') and not execution.get('deleteTime'):result['activeGpuExecutions'].append({'name':execution['name'],'runningCount':execution.get('runningCount',0)})
        r=requests.get(base+'/services',headers=h,timeout=30);r.raise_for_status()
        for service in r.json().get('services',[]):
            if any(int(c.get('resources',{}).get('limits',{}).get('nvidia.com/gpu',0)) for c in service.get('template',{}).get('containers',[])):
                result['gpuServices'].append({'name':service['name'],'scaling':service.get('template',{}).get('scaling')})
    return result
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);a=p.parse_args();r=inspect();a.output.write_text(json.dumps(r,indent=2)+'\n')
    print(json.dumps({'activeGpuExecutions':len(r['activeGpuExecutions']),'gpuServices':len(r['gpuServices']),'gpuJobTemplates':len(r['gpuJobs'])}))
