"""Real existing masks -> normal CPU preview worker protocol; no GPU/inference."""
import hashlib
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import tempfile
import time
from datetime import timedelta
import requests

ROOT=Path(__file__).resolve().parents[2]
PROOF=ROOT/'reports/model-capability-runtime-v1-20261009/proof'

def main():
    from google.cloud import storage
    from google.oauth2.credentials import Credentials
    token=subprocess.check_output(['gcloud','auth','print-access-token'],text=True).strip()
    bucket=storage.Client(project='autopromote-cc6d3',credentials=Credentials(token)).bucket('autopromote-cc6d3-viral-studio-3d')
    mask=json.loads((PROOF/'artifacts/91399a80c757d52f360868c0373123feee364b7b9535e0e63ae7b0ed443d5ba7.json').read_text())
    source=json.loads((PROOF/'source-identity.json').read_text())
    scene=json.loads((PROOF/'canonical-project.json').read_text())['snapshot']['subjectVfxScenes'][0]['scene']
    def signed(name,generation):
        return bucket.blob(name,generation=int(generation)).generate_signed_url(version='v4',expiration=timedelta(minutes=20),method='GET',
            query_parameters={'generation':generation},service_account_email='viral-studio-3d-renderer@autopromote-cc6d3.iam.gserviceaccount.com',access_token=token)
    files={}
    for key,name in [('normalizedSource','normalized_source.mp4'),('maskBundle',mask['output']['maskBundle']['name'])]:
        f=next(x for x in mask['files'] if x['name']==name)
        files[key]={'url':signed(f['storagePath'],f['generation']),'sha256':f['sha256'],'bytes':f['bytes']}
    spec={'jobId':'cpu-model-mask-bridge-'+secrets.token_hex(8),'ownerUid':mask['ownerUid'],
        'requestHash':hashlib.sha256(json.dumps(scene,sort_keys=True).encode()).hexdigest(),
        'sourceUrl':signed(source['storagePath'],source['generation']),'scene':scene,
        'modelInput':{'schemaVersion':1,'artifactHash':mask['artifactHash'],'sourceSha256':mask['sourceSha256'],
            'sourceRange':mask['sourceRange'],'files':files,'manifestSha256':mask['output']['maskManifest']['sha256'],
            'frameCount':mask['output']['frameCount'],'width':mask['output']['width'],'height':mask['output']['height']}}
    output=PROOF/'subject-bridge';output.mkdir(exist_ok=True)
    secret=secrets.token_urlsafe(48);headers={'Authorization':'Bearer '+secret}
    env={**os.environ,'STUDIO_VFX_MODE':'model_artifact_cpu','STUDIO_MODEL_VFX_SECRET':secret,
         'STUDIO_VFX_JOB_ROOT':str(output/'worker-journal'),'PYTHONPATH':str(ROOT/'python_media_worker')}
    env.pop('NVIDIA_SERVICE_DEADLINE_EPOCH',None)
    log=(output/'worker.private.log').open('wb');os.chmod(output/'worker.private.log',0o600)
    process=subprocess.Popen([sys.executable,'-m','uvicorn','studio_subject_vfx_server:app','--host','127.0.0.1','--port','6199'],env=env,stdout=log,stderr=log)
    base='http://127.0.0.1:6199';started=time.monotonic()
    try:
        for _ in range(50):
            try:
                health=requests.get(base+'/health',headers=headers,timeout=2)
                if health.status_code==200:break
            except requests.RequestException:pass
            time.sleep(.2)
        else:raise RuntimeError('Owned local CPU preview worker did not start')
        if health.json().get('gpuCount')!=0:raise RuntimeError('CPU worker must declare zero GPUs')
        response=requests.post(base+'/jobs',json=spec,headers=headers,timeout=20);response.raise_for_status()
        for _ in range(180):
            state=requests.get(base+'/jobs/'+spec['jobId'],headers=headers,timeout=10).json()
            if state['status'] in ['completed','failed','cancelled']:break
            time.sleep(.5)
        if state['status']!='completed':raise RuntimeError('CPU composition did not complete: '+str(state.get('error','timeout')))
        receipt=state['receipt']
        if receipt['modelArtifactHash']!=mask['artifactHash'] or receipt['gpuCount']!=0 or receipt['original_source_sha256']!=source['sha256']:
            raise RuntimeError('Completed CPU composition lost provenance')
        video=requests.get(base+'/jobs/'+spec['jobId']+'/media',headers=headers,timeout=30);video.raise_for_status()
        digest=hashlib.sha256(video.content).hexdigest()
        if digest!=receipt['output_sha256']:raise RuntimeError('Returned preview media changed')
        path=output/'preview.mp4';path.write_bytes(video.content)
        decode=subprocess.run(['ffmpeg','-v','error','-i',str(path),'-f','null','-'],capture_output=True,text=True,check=True)
        if decode.stderr.strip():raise RuntimeError('Actual CPU preview decode errors')
        same=receipt['pixel_sha256']==json.loads((PROOF/'derived/vfx-receipt.json').read_text())['pixel_sha256']
        if not same:raise RuntimeError('CPU preview differs from reviewed existing composition')
        subprocess.run(['ffmpeg','-v','error','-y','-ss','0.5','-i',str(path),'-frames:v','1',str(output/'preview-frame.png')],check=True)
        record={'status':'PASS','scope':'Real HTTP CPU preview worker with original owned GCS bytes and saved real masks. Service/UI guards are tested separately; authenticated browser lifecycle remains unqualified.',
            'jobId':spec['jobId'],'modelArtifactHash':mask['artifactHash'],'gpuCount':0,'newModelExecutions':0,
            'frames':receipt['frames'],'previewSha256':digest,'pixelSha256':receipt['pixel_sha256'],
            'matchesPreviouslyReviewedCompositionPixels':same,'runtimeSeconds':time.monotonic()-started,'receipt':receipt}
        (output/'verification.json').write_text(json.dumps(record,indent=2)+'\n')
        print(json.dumps({k:v for k,v in record.items() if k!='receipt'}))
    finally:
        process.terminate()
        try:process.wait(timeout=10)
        except subprocess.TimeoutExpired:process.kill();process.wait()
        log.close()

if __name__=='__main__':main()
