"""CPU-side media/transport helpers. No torch/model imports at module load."""
import hashlib
import json
import math
import os
from pathlib import Path
import subprocess
import tarfile
import time
from concurrent.futures import ThreadPoolExecutor

ROOT = Path(__file__).resolve().parents[1]

def sha(path):
    d = hashlib.sha256()
    with Path(path).open('rb') as f:
        for b in iter(lambda: f.read(8 * 1024 * 1024), b''): d.update(b)
    return d.hexdigest()

def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False)

def write_json(path, value):
    Path(path).write_text(canonical(value), encoding='utf-8')

def run(argv, timeout=120):
    r = subprocess.run(argv, capture_output=True, check=True, timeout=timeout)
    return r.stdout

def probe(path):
    return json.loads(run(['ffprobe','-v','error','-select_streams','v:0','-count_frames','-show_streams','-of','json',str(path)],60))['streams'][0]

def blob(path, name=None, media_type='application/json'):
    return {'name':name or Path(path).name, 'sha256':sha(path), 'bytes':Path(path).stat().st_size, 'mediaType':media_type}

def frame(path, index=0):
    from PIL import Image
    import io
    data=run(['ffmpeg','-nostdin','-v','error','-i',str(path),'-vf',f'select=eq(n\\,{index})','-frames:v','1','-f','image2pipe','-c:v','png','pipe:1'])
    return Image.open(io.BytesIO(data)).convert('RGB')

def normalize(source, request, target):
    r=request['sourceRange']; count=math.floor((r['endTick']-r['startTick'])/3750+.5)
    if not 1 <= count <= 720: raise ValueError('Bounded source range required')
    # Same derivative is used by analysis, segmentation, editing and composition.
    # Native source hash/range remain authoritative in the parent artifact.
    run(['ffmpeg','-nostdin','-v','error','-ss',str(r['startTick']/90000),'-i',str(source),
         '-frames:v',str(count),'-map','0:v:0','-an','-vf',
         "scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,fps=24,setsar=1",
         '-c:v','libx264','-threads','1','-preset','fast','-crf','17','-pix_fmt','yuv420p','-movflags','+faststart',str(target)])
    geometry=probe(target)
    if int(geometry['nb_read_frames'])!=count: raise ValueError('Source has insufficient frames for requested range')
    return target, geometry

def gpu_metrics():
    import torch
    if not torch.cuda.is_available() or torch.cuda.device_count()!=1: raise RuntimeError('Exactly one GPU is required')
    name=torch.cuda.get_device_name(0)
    if 'RTX PRO 6000' in name.upper() and ('sm_120' not in torch.cuda.get_arch_list() or tuple(map(int,torch.version.cuda.split('.')[:2]))<(12,8)):
        raise RuntimeError('Blackwell requires a compatible CUDA/sm_120 runtime')
    torch.cuda.reset_peak_memory_stats()
    return {'device':name,'gpuCount':1,'torch':torch.__version__,'cuda':torch.version.cuda,
            'driver':run(['nvidia-smi','--query-gpu=driver_version','--format=csv,noheader'],10).decode().strip()}

def materialize_model(spec, bucket, root):
    model=spec['model']
    locks=json.loads((ROOT/'config/model-runtime/sources.v1.json').read_text())['models']
    lock=next(m for m in locks if m['checkpoint']==model['checkpoint'] and m['revision']==model['revision'])
    directory=root/'model'; directory.mkdir()
    key=f"{spec['modelCachePrefix']}/{model['checkpoint']}/{model['revision']}"
    receipt=json.loads(bucket.blob(key+'/receipt.json').download_as_bytes(timeout=60))
    if receipt['revision']!=model['revision'] or receipt['checkpoint']!=model['checkpoint']:raise ValueError('Model cache identity changed')
    def download(file):
        info=next(f for f in receipt['files'] if f['path']==file['path'])
        if file['sha256'] and info['sha256']!=file['sha256']:raise ValueError('Model cache is not the pinned checkpoint')
        target=directory/file['path'];target.parent.mkdir(parents=True,exist_ok=True)
        bucket.blob(key+'/'+file['path'],generation=int(info['generation'])).download_to_filename(str(target),timeout=600)
        if target.stat().st_size!=info['bytes'] or sha(target)!=info['sha256']:raise ValueError('Model bytes changed')
    # Bounded parallel transport reduces paid cold-start time. Every immutable
    # file still passes its own size/hash check before any model is loaded.
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(download,lock['files']))
    return directory, {'checkpointReceiptSha256':hashlib.sha256(canonical(receipt).encode()).hexdigest(),
                       'weights':model['weights'],'license':model['license']}

def bundle_masks(directory, target):
    # No extraction of an untrusted tar is needed at the inference boundary.
    with tarfile.open(target,'w:gz') as archive:
        for p in sorted(directory.iterdir()):
            info=archive.gettarinfo(str(p),arcname=p.name); info.mtime=0;info.uid=info.gid=0;info.uname=info.gname=''
            with p.open('rb') as f:archive.addfile(info,f)

def read_dependency(spec, capability):
    for dep in spec['dependencies']:
        if dep['capability']==capability and dep['artifactHash'] in spec['request']['dependencyHashes']:
            if dep['ownerUid']!=spec['ownerUid'] or dep['projectId']!=spec['request']['projectId'] or dep['sourceSha256']!=spec['request']['sourceSha256']:
                raise ValueError('Dependency scope changed')
            return dep
    raise ValueError('Required verified capability artifact absent')
