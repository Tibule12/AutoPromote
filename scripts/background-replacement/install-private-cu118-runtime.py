"""Install pinned local-review CUDA wheels into RAM, never application Python.

Exact publisher hashes are mandatory. Only one compressed wheel temporarily
uses disk; it is removed after verified extraction. Preserve a 2.5GiB disk and
384MiB RAM-volume reserve. No driver/system change, cloud call or model fetch.
"""
from pathlib import Path
import argparse,json,urllib.request,hashlib,concurrent.futures,tempfile,zipfile,shutil,os,time
p=argparse.ArgumentParser();p.add_argument('plan',type=Path);p.add_argument('receipt',type=Path);a=p.parse_args();plan=json.load(open(a.plan));target=Path(plan['target']);assert target.parent==Path('/dev/shm') and target.name=='autopromote-local-cu118-20261104';target.mkdir(exist_ok=True);records=[]
for package in plan['packages']:
    done=target/(package['name']+'.installed.json')
    if done.exists():records.append(json.load(open(done)));continue
    assert shutil.disk_usage('/tmp').free>package['bytes']+int(2.5*1024**3),'Preserve root disk reserve'
    with tempfile.TemporaryDirectory(prefix='autopromote-local-cuda-wheel-20261104-') as temporary:
        wheel=Path(temporary)/'pinned.whl';size=package['bytes']
        with wheel.open('wb') as file:file.truncate(size)
        def fetch(bounds):
            start,end=bounds
            for attempt in range(3):
                try:
                    request=urllib.request.Request(package['url'],headers={'Range':f'bytes={start}-{end}'})
                    with urllib.request.urlopen(request,timeout=60) as source,wheel.open('r+b',buffering=0) as file:
                        assert source.status==206 and source.headers['Content-Range'].startswith(f'bytes {start}-{end}/'),source.headers.get('Content-Range')
                        file.seek(start);n=0
                        while n<end-start+1:
                            chunk=source.read(min(1024**2,end-start+1-n));assert chunk,'Truncated range';file.write(chunk);n+=len(chunk)
                    return n
                except Exception:
                    if attempt==2:raise
                    time.sleep(1)
        ranges=[(i,min(size-1,i+8*1024**2-1)) for i in range(0,size,8*1024**2)]
        with concurrent.futures.ThreadPoolExecutor(12) as pool:
            for future in concurrent.futures.as_completed([pool.submit(fetch,b) for b in ranges]):future.result()
        assert hashlib.file_digest(wheel.open('rb'),'sha256').hexdigest()==package['sha256'],'Publisher wheel hash differs'
        with zipfile.ZipFile(wheel) as archive:
            keep=[v for v in archive.infolist() if not v.filename.startswith(('torch/include/','torch/test/'))]
            assert all(not Path(v.filename).is_absolute() and '..' not in Path(v.filename).parts for v in keep)
            total=sum(v.file_size for v in keep);assert shutil.disk_usage(target).free>total+384*1024**2,'Preserve RAM-volume reserve'
            archive.extractall(target,members=keep)
        record={**package,'extractedBytes':total,'inferenceOnlyExcludedTorchHeadersAndTests':package['name']=='torch','target':str(target)};done.write_text(json.dumps(record,indent=2)+'\n');records.append(record)
        a.receipt.write_text(json.dumps({'packages':records,'complete':False,'applicationEnvironmentChanged':False,'target':str(target)},indent=2)+'\n');print('LOCAL_RAM_RUNTIME_PACKAGE_VERIFIED',package['name'],total,flush=True)
a.receipt.write_text(json.dumps({'packages':records,'complete':True,'applicationEnvironmentChanged':False,'target':str(target),'newPermanentDiskRuntimeBytes':0},indent=2)+'\n');print('LOCAL_RAM_CUDA_RUNTIME_EXTRACTED',flush=True)
