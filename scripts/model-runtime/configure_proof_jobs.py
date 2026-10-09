"""Register isolated, idle Cloud Run job templates. This never executes a GPU."""
import argparse
from datetime import datetime,timezone
import json
from pathlib import Path
import subprocess
import requests

PROJECT='autopromote-cc6d3'
REGION='us-central1'
BUCKET=PROJECT+'-viral-studio-3d'
ACCOUNT='viral-studio-3d-renderer@'+PROJECT+'.iam.gserviceaccount.com'

def main():
    p=argparse.ArgumentParser();p.add_argument('--build-receipt',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--create-jobs',action='store_true');a=p.parse_args()
    build=json.loads(a.build_receipt.read_text())
    if build['status']!='SUCCESS':raise ValueError('Completed CPU image build required')
    images={i['name'].split('/')[-1].split(':')[0]:i['name'].rsplit(':',1)[0]+'@'+i['digest'] for i in build['results']['images']}
    classes=[('vision-understanding','vision','cuda',600),('segmentation-tracking','segmentation','cuda',600),
             ('video-generation','video','cuda',3300),('segmentation-tracking','tracking-cpu','cpu',120)]
    config={'schemaVersion':1,'purpose':'private_model_runtime_v1_proof','productionTraffic':False,'createdAt':datetime.now(timezone.utc).isoformat(),'workers':{}}
    token=subprocess.check_output(['gcloud','auth','print-access-token'],text=True).strip();h={'Authorization':'Bearer '+token}
    base=f'https://run.googleapis.com/v2/projects/{PROJECT}/locations/{REGION}'
    for cls,key,device,timeout in classes:
        name='autopromote-model-v1-'+key;image=images['autopromote-model-runtime-'+key];gpu=device=='cuda'
        task={'containers':[{'image':image,'env':[{'name':'MODEL_ARTIFACT_BUCKET','value':BUCKET}],
          'resources':{'limits':{'cpu':'20' if gpu else '2','memory':'80Gi' if gpu else '2Gi',**({'nvidia.com/gpu':'1'} if gpu else {})}}}],
          'maxRetries':0,'timeout':f'{timeout}s','serviceAccount':ACCOUNT,'executionEnvironment':'EXECUTION_ENVIRONMENT_GEN2'}
        if gpu:task.update(nodeSelector={'accelerator':'nvidia-rtx-pro-6000'},gpuZonalRedundancyDisabled=True)
        job={'labels':{'purpose':'model-runtime-v1-proof','production-traffic':'false','product':'autopromote'},
             'template':{'parallelism':1,'taskCount':1,'template':task}}
        uri=f'projects/{PROJECT}/locations/{REGION}/jobs/{name}'
        config['workers'][cls+':'+device]={'jobName':uri,'image':image,'gpuCount':int(gpu),'timeoutSeconds':timeout,'definition':job}
        if a.create_jobs:
            existing=requests.get(base+'/jobs/'+name,headers=h,timeout=30)
            if existing.status_code==404:
                r=requests.post(base+'/jobs',params={'jobId':name},headers=h,json=job,timeout=60);r.raise_for_status()
                print(json.dumps({'event':'idle_job_registered','job':name,'operation':r.json()['name'],'gpuExecutionStarted':False}),flush=True)
            else:
                existing.raise_for_status();d=existing.json()
                if d['template']['template']['containers'][0]['image']!=image:raise ValueError('Existing proof job has a different image; inspect before replacing')
    a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(config,indent=2)+'\n')

if __name__=='__main__':main()
