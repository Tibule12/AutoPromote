"""Credential-free CPU runner for the isolated Firebase emulator application.

Only the backend prepares this trusted spool after normal ownership checks.
Production network/download rules are deliberately not relaxed for this runner.
"""
import argparse,json,os,resource,socket,tarfile,time,signal
from datetime import datetime,timezone
from pathlib import Path
from model_workers.common import ROOT,sha,canonical,normalize,probe,blob,write_json


def execute(spec,work,*,device='cpu'):
    import jsonschema,torch,transformers
    cuda=device=='cuda'
    if (device not in ('cpu','cuda') or os.environ.get('GCLOUD_PROJECT')!='demo-autopromote-credits'
            or os.environ.get('STUDIO_BACKGROUND_DEMO')!='true'
            or os.environ.get('CUDA_VISIBLE_DEVICES')!=('0' if cuda else '')
            or cuda and os.environ.get('STUDIO_BACKGROUND_DEMO_LOCAL_CUDA')!='true'):
        raise ValueError('Isolated demo CPU environment required')
    # Neither weights nor source URLs may be fetched by this process.
    socket.socket.connect=lambda *args,**kwargs:(_ for _ in ()).throw(RuntimeError('Model process network disabled'))
    registry=json.loads((ROOT/'config/model-runtime/registry.v1.json').read_text());contracts=json.loads((ROOT/'contracts/model-capabilities-v1.json').read_text())
    if cuda:
        registry=json.loads((ROOT/'config/model-runtime/local-cuda-evaluation.v1.json').read_text())
    allowed=('sam21-multiobject-local-cuda-v2','vitmatte-small-temporal-local-cuda-v2') if cuda else ('sam21-multiobject-cpu-v2','vitmatte-small-temporal-cpu-v2')
    model=next(m for m in registry['models'] if m['id']==spec['model']['id']);request=spec['request']
    if canonical(model)!=canonical(spec['model']) or model['id'] not in allowed or model['requiredDevice']!=device:
        raise ValueError('Unregistered demo model')
    jsonschema.validate(request,contracts['request']);jsonschema.validate(request['parameters'],contracts['inputs']['segment_subject'])
    resource.setrlimit(resource.RLIMIT_CPU,(model['timeoutSeconds']*4,model['timeoutSeconds']*4+5))
    def deadline(_signal,_frame):raise TimeoutError('Bounded local model deadline exceeded')
    signal.signal(signal.SIGALRM,deadline);signal.alarm(model['timeoutSeconds'])
    source=work/'source';ref=spec['source']
    if ref['sha256']!=request['sourceSha256'] or not ref['storagePath'].startswith('studio/sources/'+spec['ownerUid']+'/') or sha(source)!=ref['sha256'] or source.stat().st_size!=ref['size']:
        raise ValueError('Owned source bytes changed')
    model_dir=Path(spec['modelDirectory'])
    for weight in model['weights']:
        if sha(model_dir/weight['path'])!=weight['sha256']:raise ValueError('Checkpoint changed')
    torch.set_num_threads(4);started=time.monotonic();output=work/'outputs';output.mkdir()
    if request['parameters'].get('refinement'):
        from model_workers.adapters.cpu_matting import refine
        from python_media_worker.studio_subject_matte import CachedSubjectMatte
        import shutil
        artifact=spec['maskDependency'];previous=work/'dependency';previous.mkdir()
        bundle=work/'dependency.tar.gz'
        if sha(bundle)!=artifact['output']['maskBundle']['sha256']:raise ValueError('Dependency bytes changed')
        count=artifact['output']['frameCount'];names={'manifest.json'}|{f'matte_{i:04d}.png' for i in range(count)}
        with tarfile.open(bundle,'r:gz') as archive:
            members=archive.getmembers()
            from python_media_worker.studio_source_background import evidence_files
            manifests=[m for m in members if m.name=='manifest.json']
            if len(manifests)!=1 or not manifests[0].isfile() or not 0<manifests[0].size<=8*1024**2:
                raise ValueError('Invalid mask manifest')
            data=archive.extractfile(manifests[0]).read()
            if __import__('hashlib').sha256(data).hexdigest()!=artifact['output']['maskManifest']['sha256']:
                raise ValueError('Dependency manifest changed')
            names|=evidence_files(json.loads(data))
            if {m.name for m in members}!=names or len(members)!=len(names) or any(not m.isfile() or m.size>8*1024**2 for m in members) or sum(m.size for m in members)>75*1024**2:raise ValueError('Invalid mask archive')
            archive.extractall(previous,members=members,filter='data')
        shutil.copyfile(work/'parent_source.mp4',output/'normalized_source.mp4')
        normalized=output/'normalized_source.mp4';geometry=probe(normalized);cache=CachedSubjectMatte(previous,normalized)
        if cache.artifact_sha256!=artifact['output']['maskManifest']['sha256']:raise ValueError('Dependency manifest changed')
        result=refine(spec,normalized,geometry,model_dir,output,cache,artifact,device=device)
    else:
        normalized,geometry=normalize(source,request,output/'normalized_source.mp4',max_size=(1920,1080))
        if cuda:
            from model_workers.adapters.component_segmentation import segment
            result=segment(spec,normalized,geometry,model_dir,output,device=device)
        else:
            from model_workers.adapters.cpu_segmentation import segment
            result=segment(spec,normalized,geometry,model_dir,output)
    jsonschema.validate(result,contracts['outputs']['segment_subject'])
    alpha_stage=json.loads((output/'subject_masks_manifest.json').read_text()).get('matting_stage')
    actual={name:sha(ROOT/name) for name in spec['implementationFiles']}
    if actual!=spec['implementationFiles']:raise ValueError('Frozen implementation changed')
    files=[blob(p,media_type='video/mp4' if p.suffix=='.mp4' else 'application/gzip' if p.name.endswith('.tar.gz') else 'application/json') for p in sorted(output.iterdir()) if p.is_file()]
    return {'status':'completed','jobId':spec['id'],'attemptToken':spec['attemptToken'],'requestHash':spec['requestHash'],
      'modelId':model['id'],'revision':model['revision'],'output':result,'files':files,'finishedAt':datetime.now(timezone.utc).isoformat(),
      'metrics':{'device':device,'gpuCount':int(cuda),'peakVramBytes':torch.cuda.max_memory_allocated() if cuda else 0,'runtimeSeconds':time.monotonic()-started,'peakRssKiB':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,'torch':torch.__version__,'transformers':transformers.__version__,
        **({'gpuName':torch.cuda.get_device_name(0),'gpuCapability':list(torch.cuda.get_device_capability(0)),'torchCuda':torch.version.cuda} if cuda else {})},
      'provenance':{'implementationSha256':__import__('hashlib').sha256(canonical(actual).encode()).hexdigest(),'implementationFiles':actual,
        'weights':model['weights'],'license':model['license'],'runtimeImage':spec['workerImage'],'runtimeKind':'local_cuda_emulator_process' if cuda else 'local_cpu_emulator_process',
        'dependencies':request['dependencyHashes'],**({'alphaStage':alpha_stage,'modelInferencePerformed':alpha_stage['modelInferencePerformed']} if alpha_stage else {})}}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--spec',required=True,type=Path);a=p.parse_args();spec=json.loads(a.spec.read_text())
    try:result=execute(spec,a.spec.parent)
    except Exception:
        import traceback;traceback.print_exc();result={'status':'failed','jobId':spec['id'],'attemptToken':spec['attemptToken'],'requestHash':spec['requestHash']}
    write_json(a.spec.parent/'result.json',result)
    if result['status']!='completed':raise SystemExit(1)
