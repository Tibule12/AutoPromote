"""CPU-only image build and idle proof-job update, pinned by source and image SHA."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tarfile
import time
import requests

PROJECT='autopromote-cc6d3'
ROOT=Path(__file__).resolve().parents[2]
REPORT=ROOT/'reports/model-capability-runtime-v1-20261009'
REGISTRY=ROOT/'config/model-runtime/deployment.proof.v1.json'
PREFIX=f'us-central1-docker.pkg.dev/{PROJECT}/thulani-repo/autopromote-model-runtime-'
KEYS={'vision':'vision-understanding:cuda','segmentation':'segmentation-tracking:cuda',
      'video':'video-generation:cuda','tracking-cpu':'segmentation-tracking:cpu'}

def main():
    p=argparse.ArgumentParser();p.add_argument('action',choices=['submit','poll','apply']);p.add_argument('target')
    p.add_argument('--label',required=True);a=p.parse_args()
    token=subprocess.check_output(['gcloud','auth','print-access-token'],text=True).strip()
    h={'Authorization':'Bearer '+token};base=f'https://cloudbuild.googleapis.com/v1/projects/{PROJECT}/builds'
    if a.action=='submit':
        classes=list(KEYS) if a.target=='all' else [a.target]
        if any(c not in KEYS for c in classes):raise ValueError('Unknown worker class')
        stream=io.BytesIO()
        files=[*(ROOT/'model_workers').rglob('*'),*(ROOT/'contracts').glob('model-capabilities-v1.json'),
               *(ROOT/'config/model-runtime').glob('*.json'),ROOT/'python_media_worker/studio_subject_matte.py',
               ROOT/'scripts/model-runtime/prepare_model.py']
        with tarfile.open(fileobj=stream,mode='w:gz') as archive:
            for path in sorted(files):
                if path.is_file() and '__pycache__' not in path.parts:archive.add(path,arcname=str(path.relative_to(ROOT)))
        data=stream.getvalue();digest=hashlib.sha256(data).hexdigest()
        from google.cloud import storage
        from google.oauth2.credentials import Credentials
        bucket=storage.Client(project=PROJECT,credentials=Credentials(token)).bucket(PROJECT+'-viral-studio-3d')
        source=bucket.blob('studio/model-runtime/builds/'+digest+'/source.tar.gz')
        if not source.exists():source.upload_from_string(data,content_type='application/gzip',if_generation_match=0)
        source.reload()
        base_image=PREFIX+'base@sha256:10dadd3acb2374a59267cd06b106c22e68f5eb40b277763e2cc7f0ec2ece80fa'
        steps=[];images=[]
        for cls in classes:
            image=PREFIX+cls+':source-'+digest[:16];images.append(image)
            steps.append({'name':'gcr.io/cloud-builders/docker','args':['build',
                *(['--build-arg','BASE_IMAGE='+base_image] if cls!='tracking-cpu' else []),
                '-f','model_workers/Dockerfile.'+cls,'-t',image,'.']})
        body={'source':{'storageSource':{'bucket':bucket.name,'object':source.name,'generation':str(source.generation)}},
              'steps':steps,'images':images,'timeout':'1800s',
              'options':{'machineType':'E2_HIGHCPU_8','diskSizeGb':100,'logging':'CLOUD_LOGGING_ONLY'},
              'tags':['model-runtime-v1','cpu-image-build','no-production-traffic']}
        r=requests.post(base,headers=h,json=body,timeout=60);r.raise_for_status();op=r.json();build=op['metadata']['build']
        (REPORT/(a.label+'-build-operation.json')).write_text(json.dumps(op,indent=2)+'\n')
    else:
        r=requests.get(base+'/'+a.target,headers=h,timeout=60);r.raise_for_status();build=r.json()
        (REPORT/(a.label+'-build-state.json')).write_text(json.dumps(build,indent=2)+'\n')
        if a.action=='apply':
            if build['status']!='SUCCESS':raise ValueError('Completed image build required')
            config=json.loads(REGISTRY.read_text())
            for image in build['results']['images']:
                cls=image['name'].split('/')[-1].split(':')[0].removeprefix('autopromote-model-runtime-')
                entry=config['workers'][KEYS[cls]];url='https://run.googleapis.com/v2/'+entry['jobName']
                r=requests.get(url+'/executions?pageSize=100',headers=h,timeout=30);r.raise_for_status()
                if any(not e.get('completionTime') for e in r.json().get('executions',[])):
                    raise ValueError('Cannot replace an active worker')
                digest=image['name'].rsplit(':',1)[0]+'@'+image['digest']
                job=entry['definition'];job['template']['template']['containers'][0]['image']=digest
                r=requests.patch(url,headers=h,json={'name':entry['jobName'],**job},timeout=60)
                if not r.ok:raise ValueError('Idle worker patch rejected: '+r.text)
                op=r.json()
                for _ in range(15):
                    if op.get('done'):break
                    time.sleep(2)
                    r=requests.get('https://run.googleapis.com/v2/'+op['name'],headers=h,timeout=30)
                    r.raise_for_status();op=r.json()
                if not op.get('done') or op.get('error'):raise ValueError('Worker update is not confirmed complete')
                r=requests.get(url,headers=h,timeout=30);r.raise_for_status()
                if r.json()['template']['template']['containers'][0]['image']!=digest or r.json().get('reconciling'):
                    raise ValueError('Worker digest is not ready')
                entry['image']=digest
            REGISTRY.write_text(json.dumps(config,indent=2)+'\n')
    print(json.dumps({'buildId':build['id'],'status':build['status'],'gpuCount':0,'action':a.action}))

if __name__=='__main__':main()
