"""CPU-only pinned checkpoint preparation. Stream to private GCS; no GPU/model imports."""
import argparse
from datetime import datetime,timezone
import hashlib
import json
from pathlib import Path
import requests

def prepare(checkpoint,bucket,prefix,locks):
    from google.cloud import storage
    lock=next(m for m in locks['models'] if m['checkpoint']==checkpoint)
    b=storage.Client().bucket(bucket);key=f"{prefix}/{checkpoint}/{lock['revision']}"
    receipt=b.blob(key+'/receipt.json')
    if receipt.exists():
        previous=json.loads(receipt.download_as_bytes())
        if previous['checkpoint']!=checkpoint or previous['revision']!=lock['revision']:raise ValueError('Cache receipt collision')
        print(json.dumps({'event':'model_cache_exists','checkpoint':checkpoint,'revision':lock['revision']}),flush=True);return
    files=[]
    for f in lock['files']:
        target=b.blob(key+'/'+f['path']);expected=f.get('sha256');digest=hashlib.sha256();size=0
        if target.exists():
            target.reload();info=target.metadata or {}
            if int(target.size)!=f['size'] or not info.get('sha256') or (expected and info['sha256']!=expected):raise ValueError('Existing cache has unverified bytes')
            files.append({'path':f['path'],'sha256':info['sha256'],'bytes':int(target.size),'generation':str(target.generation)});continue
        url=f"https://huggingface.co/{checkpoint}/resolve/{lock['revision']}/{f['path']}"
        # File upload is immutable and streamed in bounded CPU memory. If a
        # checksum fails, no final model receipt is published; the bad staged
        # object is removed by generation, never silently trusted/relabelled.
        target.chunk_size=8*1024**2
        with requests.get(url,stream=True,timeout=(30,120)) as response:
            response.raise_for_status()
            with target.open('wb',content_type='application/octet-stream',if_generation_match=0) as out:
                for block in response.iter_content(8*1024**2):
                    size+=len(block);digest.update(block)
                    if size>f['size']:raise ValueError('Model file exceeds lock size')
                    out.write(block)
        target.reload();got=digest.hexdigest()
        if size!=f['size'] or (expected and got!=expected):
            target.delete(if_generation_match=int(target.generation));raise ValueError('Pinned model checksum failed')
        target.metadata={'sha256':got,'checkpointRevision':lock['revision'],'purpose':'model_capability_checkpoint'}
        target.patch(if_generation_match=int(target.generation))
        files.append({'path':f['path'],'sha256':got,'bytes':size,'generation':str(target.generation)})
        print(json.dumps({'event':'model_file_cached','checkpoint':checkpoint,'file':f['path'],'bytes':size}),flush=True)
    value={'schemaVersion':1,'checkpoint':checkpoint,'revision':lock['revision'],'license':lock['license'],
           'files':files,'createdAt':datetime.now(timezone.utc).isoformat(),'preparation':'CPU streaming; no model inference'}
    receipt.upload_from_string(json.dumps(value,sort_keys=True,separators=(',',':')),content_type='application/json',if_generation_match=0)
    print(json.dumps({'event':'model_cache_ready','checkpoint':checkpoint,'bytes':sum(f['bytes'] for f in files)}),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--checkpoint',required=True);p.add_argument('--bucket',required=True)
    p.add_argument('--prefix',default='studio/model-runtime/models');p.add_argument('--locks',type=Path,default=Path('config/model-runtime/sources.v1.json'))
    a=p.parse_args();prepare(a.checkpoint,a.bucket,a.prefix,json.loads(a.locks.read_text()))
