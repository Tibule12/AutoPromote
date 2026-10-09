"""One capability, one process, one device. Publish durable bytes before receipt."""
from datetime import datetime,timezone
import hashlib
import importlib
import json
import mimetypes
import os
from pathlib import Path
import sys
import tempfile
import time
from urllib.parse import urlparse
from model_workers.common import ROOT,sha,canonical,write_json,normalize,materialize_model,gpu_metrics,blob

ADAPTERS={'understand_video':('vision','understand'),'detect_object':('vision','detect'),
          'segment_subject':('segmentation','segment'),'track_object':('segmentation','track'),
          'generate_video':('video','generate')}

def now():return datetime.now(timezone.utc).isoformat()

def validate(spec):
    import jsonschema
    contracts=json.loads((ROOT/'contracts/model-capabilities-v1.json').read_text())
    r=spec['request'];jsonschema.validate(r,contracts['request']);jsonschema.validate(r['parameters'],contracts['inputs'][r['capability']])
    registry=json.loads((ROOT/'config/model-runtime/registry.v1.json').read_text())
    pinned=next(m for m in registry['models'] if m['id']==spec['model']['id'])
    if not pinned['enabled'] or canonical(pinned)!=canonical(spec['model']):raise ValueError('Unpinned model or implementation override')
    if pinned['workerClass']!=os.environ['MODEL_WORKER_CLASS']:raise ValueError('Capability sent to the wrong specialized worker')
    if r['sourceRange']['endTick']<=r['sourceRange']['startTick'] or r['sourceRange']['endTick']-r['sourceRange']['startTick']>30*90000:raise ValueError('Unbounded range')
    expected=f"studio/model-runtime/executions/{spec['ownerUid']}/{spec['id']}/{spec['attemptToken']}"
    if spec['resultPrefix']!=expected or spec['bucket']!=os.environ['MODEL_ARTIFACT_BUCKET']:raise ValueError('Untrusted result scope')
    source=spec['source']
    if source['sha256']!=r['sourceSha256'] or source['storagePath']!=r['sourceStoragePath'] or source['bucket']!=spec['bucket']:raise ValueError('Unverified source binding')
    if not source['storagePath'].startswith(f"studio/sources/{spec['ownerUid']}/"):raise ValueError('Source is outside owner namespace')
    return pinned,contracts

def execute(spec,bucket,work):
    started=time.monotonic();model,contracts=validate(spec);output=work/'outputs';output.mkdir()
    metrics={'device':'cpu','gpuCount':0,'peakVramBytes':0};model_provenance={}
    cap=spec['request']['capability'];adapter,fn=ADAPTERS[cap]
    if model['requiredDevice']=='cuda':metrics.update(gpu_metrics())
    module=importlib.import_module('model_workers.adapters.'+adapter)
    if cap=='track_object':result=getattr(module,fn)(spec,bucket,output)
    else:
        obj=bucket.blob(spec['source']['storagePath'],generation=int(spec['source']['generation']));obj.reload()
        if not 1<=obj.size<=512*1024**2 or obj.metadata.get('ownerUid')!=spec['ownerUid']:raise ValueError('Owned bounded source required')
        print(json.dumps({'event':'source_loading','capability':cap}),flush=True)
        source=work/'original.mp4';obj.download_to_filename(str(source),timeout=120)
        if sha(source)!=spec['request']['sourceSha256']:raise ValueError('Source bytes no longer match binding')
        normalized,geometry=normalize(source,spec['request'],output/'normalized_source.mp4')
        print(json.dumps({'event':'checkpoint_loading','capability':cap,'revision':model['revision']}),flush=True)
        model_started=time.monotonic();model_dir,model_provenance=materialize_model(spec,bucket,work)
        metrics['modelLoadStorageSeconds']=time.monotonic()-model_started
        print(json.dumps({'event':'inference_started','capability':cap}),flush=True)
        inference_started=time.monotonic()
        result=getattr(module,fn)(spec,normalized,geometry,model_dir,output)
        metrics['inferenceAndModelLoadSeconds']=time.monotonic()-inference_started
    import jsonschema
    jsonschema.validate(result,contracts['outputs'][cap])
    if model['requiredDevice']=='cuda':
        import torch
        torch.cuda.synchronize();metrics['peakVramBytes']=torch.cuda.max_memory_allocated()
    metrics.update(runtimeSeconds=time.monotonic()-started,peakRssKiB=__import__('resource').getrusage(__import__('resource').RUSAGE_SELF).ru_maxrss)
    files=[]
    for p in sorted(output.iterdir()):
        if not p.is_file():continue # Individual masks are inside the hashed bundle.
        file=blob(p,media_type=mimetypes.guess_type(p.name)[0] or 'application/octet-stream')
        dest=bucket.blob(spec['resultPrefix']+'/outputs/'+p.name)
        dest.metadata={'ownerUid':spec['ownerUid'],'sha256':file['sha256'],'purpose':'model_capability_artifact'}
        dest.upload_from_filename(str(p),content_type=file['mediaType'],if_generation_match=0,timeout=120)
        files.append({**file,'storagePath':dest.name,'generation':str(dest.generation)})
    code_files=[Path(__file__),ROOT/'model_workers/common.py',Path(module.__file__),ROOT/'config/model-runtime/registry.v1.json',ROOT/'contracts/model-capabilities-v1.json']
    implementation=hashlib.sha256(''.join(sha(p) for p in code_files).encode()).hexdigest()
    return {'status':'completed','jobId':spec['id'],'attemptToken':spec['attemptToken'],'requestHash':spec['requestHash'],
       'modelId':model['id'],'revision':model['revision'],'output':result,'files':files,'metrics':metrics,'finishedAt':now(),
       'provenance':{**model_provenance,'implementationSha256':implementation,
          'implementationFiles':{str(p.relative_to(ROOT)):sha(p) for p in code_files},'executionName':os.environ.get('CLOUD_RUN_EXECUTION','local'),
          'dependencies':spec['request']['dependencyHashes'],'runtimeImage':spec['workerImage']}}

def main():
    from google.cloud import storage
    uri=urlparse(os.environ['MODEL_REQUEST_URI'])
    if uri.scheme!='gs' or uri.netloc!=os.environ['MODEL_ARTIFACT_BUCKET']:raise ValueError('Private request bucket required')
    client=storage.Client();bucket=client.bucket(uri.netloc)
    bytes_=bucket.blob(uri.path.lstrip('/')).download_as_bytes(timeout=60)
    if len(bytes_)>1024*1024 or hashlib.sha256(bytes_).hexdigest()!=os.environ['MODEL_REQUEST_SHA256']:raise ValueError('Request envelope changed')
    spec=json.loads(bytes_);validate(spec)
    started=time.monotonic()
    with tempfile.TemporaryDirectory(prefix='model-capability-') as directory:
        try:result=execute(spec,bucket,Path(directory))
        except Exception as e:
            # Failed raw responses are private diagnostics, never canonical evidence.
            import traceback
            traceback.print_exc()
            diagnostics=[]
            for name in ['model_response.txt','inference_metrics.json']:
                path=Path(directory)/'outputs'/name
                if not path.exists():continue
                dest=bucket.blob(spec['resultPrefix']+'/diagnostics/'+name)
                dest.upload_from_filename(str(path),if_generation_match=0,timeout=60)
                diagnostics.append({**blob(path), 'storagePath':dest.name,'generation':str(dest.generation)})
            result={'status':'failed','jobId':spec['id'],'attemptToken':spec['attemptToken'],'requestHash':spec['requestHash'],
                    'error':'MODEL_INFERENCE_FAILED','errorClass':type(e).__name__,'finishedAt':now(),
                    'runtimeSeconds':time.monotonic()-started,'diagnostics':diagnostics}
    bucket.blob(spec['resultPrefix']+'/result.json').upload_from_string(canonical(result),content_type='application/json',if_generation_match=0,timeout=60)
    print(json.dumps({'event':'capability_finished','capability':spec['request']['capability'],'status':result['status'],'runtimeSeconds':time.monotonic()-started}),flush=True)
    if result['status']!='completed':raise SystemExit(1)

if __name__=='__main__':main()
