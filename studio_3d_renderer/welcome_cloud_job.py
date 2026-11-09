"""Bounded private film workload in the existing one-GPU Cloud Run Job.

Inputs are prepared/validated locally and pinned by SHA256. No server, queue,
infrastructure creation, Firestore writes, traffic changes or retained process.
Native source generation feeds the existing canonical RenderViralRequest worker.
"""
import asyncio
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import time
import threading
from concurrent.futures import ThreadPoolExecutor

from google.cloud import storage


def digest(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def now():return datetime.now(timezone.utc).isoformat()


def main():
    bucket=storage.Client(project='autopromote-cc6d3').bucket('autopromote-cc6d3-viral-studio-3d')
    prefix=os.environ['WELCOME_STORY_PREFIX']
    if not prefix.startswith('founder_films/welcome-cinematic-20261009/') or '..' in prefix:
        raise ValueError('Invalid private workload prefix')
    base=Path('/tmp/welcome-native');base.mkdir()
    receipt={'status':'RUNNING','startedAt':now(),'execution':os.getenv('CLOUD_RUN_EXECUTION'),'stages':[],'outputs':[],'gpuCount':1,'prefix':prefix}
    started=time.monotonic()
    def stage(name,argv,timeout=1200,env=None):
        t=time.monotonic()
        with (base/(name+'.log')).open('w') as f:
            process=subprocess.Popen(argv,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,bufsize=1,env=env)
            deadline=threading.Timer(timeout,process.kill)
            deadline.start()
            try:
                for output_line in process.stdout:
                    f.write(output_line)
                    if output_line.startswith('{"event":'):print(output_line.strip(),flush=True)
                exit_code=process.wait()
            finally:
                deadline.cancel()
                deadline.join()
                if process.poll() is None:
                    process.kill()
                    process.wait(timeout=15)
            if exit_code:raise subprocess.CalledProcessError(exit_code,argv)
        receipt['stages'].append({'name':name,'seconds':time.monotonic()-t,'log':name+'.log'})
        print(json.dumps({'event':'stage_completed',**receipt['stages'][-1]}),flush=True)
    try:
        smi=shutil.which('nvidia-smi') or '/usr/local/nvidia/bin/nvidia-smi'
        identity=subprocess.check_output([smi,'--query-gpu=name,memory.total','--format=csv,noheader'],text=True).strip()
        if len(identity.splitlines())!=1 or 'RTX PRO 6000' not in identity.upper():raise RuntimeError('Wrong GPU identity')
        receipt['gpuIdentity']=identity
        asset_prefix=os.environ.get('WELCOME_ASSET_PREFIX',prefix)
        if not asset_prefix.startswith('founder_films/welcome-cinematic-20261009/') or '..' in asset_prefix:raise ValueError('Invalid asset prefix')
        for object_name,hashvar in [('runtime.tar.gz','WELCOME_RUNTIME_SHA256'),('inputs.tar.gz','WELCOME_INPUTS_SHA256'),('blender.tar.xz','WELCOME_BLENDER_SHA256'),('native-libs.tar.gz','WELCOME_NATIVE_LIBS_SHA256')]:
            local=base/object_name
            remote_name=os.environ.get('WELCOME_INPUT_OBJECT','inputs.tar.gz') if object_name=='inputs.tar.gz' else object_name
            if '/' in remote_name or '..' in remote_name:raise ValueError('Invalid input object')
            bucket.blob(asset_prefix+'/'+remote_name).download_to_filename(local,timeout=90)
            if digest(local)!=os.environ[hashvar]:raise ValueError('Pinned input hash mismatch: '+object_name)
            with tarfile.open(local) as t:
                # Input archives are authored and prevalidated; extraction stays in base.
                for m in t.getmembers():
                    if m.name.startswith('/') or '..' in Path(m.name).parts:raise ValueError('Unsafe archive path')
                t.extractall(base,filter='data')
            local.unlink()
        root=base/'film'
        worker=base/'worker'
        runtime=base/'python'
        sys.path.insert(0,str(runtime))
        sys.path.insert(0,str(worker))
        sys.path.insert(0,str(base/'scripts'))
        os.environ.update({'VIRAL_EXPORT_ENCODER':'nvenc','VIRAL_REQUIRE_GPU':'1','LOCAL_MEDIA_OUTPUT_ONLY':'true',
           'ENABLE_LOCAL_MEDIA_OUTPUT_FALLBACK':'true','FIREBASE_STATUS_UPDATES_ENABLED':'false','ALLOW_RUNTIME_DEPENDENCY_INSTALL':'false',
           'MEDIA_WORKER_SUBPROCESS_TIMEOUT_SECONDS':'600','MEDIA_WORKER_MAX_VIDEO_DURATION_SECONDS':'60',
           'STUDIO_3D_DEVICE':'optix','STUDIO_3D_SAMPLES':'24'})
        os.environ['LD_LIBRARY_PATH']=str(base/'native-libs')+':'+os.environ.get('LD_LIBRARY_PATH','')
        blender=next(base.glob('blender-*/blender'))
        stage('native-optix',[str(blender),'-b','-t','16','-noaudio','--python',str(root/'assets/author_welcome_world.py'),'--','--root',str(root),'--mode','frames','--device','optix','--width','1920','--samples','24'],timeout=3000)
        frames=root/'gpu-frames'
        device=json.loads((frames/'receipt.json').read_text())
        if not device['device']['gpu_verified'] or device['frameCount']!=912:raise RuntimeError('Incomplete genuine GPU source')
        receipt['nativeRender']=device
        media=root/'assets/final';media.mkdir(exist_ok=True)
        def persist(file):
            name=str(file.relative_to(root))
            bucket.blob(prefix+'/result/'+name).upload_from_filename(file,timeout=90)
            receipt['outputs'].append({'path':name,'sha256':digest(file),'bytes':file.stat().st_size})
        story=json.loads((root/'story-plan.json').read_text())
        for s in story['scenes']:
            stage('source-'+s['id'],['ffmpeg','-v','error','-y','-framerate','24','-start_number',str(s['at']*24+1),'-i',str(frames/'frame_%04d.png'),'-frames:v',str(s['duration']*24),'-c:v','h264_nvenc','-preset','p5','-cq','17','-b:v','0','-pix_fmt','yuv420p','-an','-movflags','+faststart',str(media/(s['id']+'.mp4'))],timeout=180)
            # Retain completed expensive source work before final composition.
            persist(media/(s['id']+'.mp4'))
        persist(root/'assets/welcome-world.blend')
        persist(frames/'receipt.json')
        # The request was compiled/validated locally. Resolve source transport to
        # these newly generated normal media files, retaining every edit decision.
        request=json.loads((root/'outputs/final/render-request.json').read_text())
        assert sum(s['end_time']-s['start_time'] for s in request['timeline_segments'])==38
        output=root/'outputs/final'
        output.mkdir(exist_ok=True)
        import render_existing_studio as shared
        from types import SimpleNamespace
        t=time.monotonic()
        asyncio.run(shared.render(SimpleNamespace(root=root,worker=worker,request=root/'outputs/final/render-request.json',output=output)))
        receipt['stages'].append({'name':'existing-studio-final','seconds':time.monotonic()-t})
        result=json.loads((output/'render-receipt.json').read_text())
        if result['encoder']!='h264_nvenc':raise RuntimeError('Final renderer did not use NVENC')
        receipt['studioRender']=result
        # Persist normal media, native source, output and receipts before exit.
        for file in [output/'final.mp4',output/'poster.jpg',output/'render-receipt.json']:
            persist(file)
        receipt['status']='SUCCEEDED'
    except Exception as e:
        receipt['status']='FAILED';receipt['error']=repr(e)
        raise
    finally:
        receipt['finishedAt']=now();receipt['workloadSeconds']=time.monotonic()-started
        cache=base/'film/gpu-frames'
        # If an encoding/composition repair is ever needed, retain completed
        # sources above. If the native stage fails mid-sequence, preserve its
        # completed frames as a hash-bound cache instead of throwing them away.
        if receipt['status']!='SUCCEEDED' and cache.exists() and len([o for o in receipt['outputs'] if o['path'].startswith('assets/final/')])<5:
            files=list(cache.glob('frame_*.png'))
            def keep_frame(file):
                bucket.blob(prefix+'/frame-cache/'+file.name).upload_from_filename(file,timeout=30)
                return {'name':file.name,'sha256':digest(file),'bytes':file.stat().st_size}
            with ThreadPoolExecutor(max_workers=8) as pool:items=list(pool.map(keep_frame,files))
            cache_manifest={'nativeSceneSha256':digest(base/'film/assets/welcome-world.blend'),'width':1920,'samples':24,'denoiser':'OPENIMAGEDENOISE_CPU','frames':items}
            bucket.blob(prefix+'/frame-cache/manifest.json').upload_from_string(json.dumps(cache_manifest),content_type='application/json',timeout=30)
            receipt['partialNativeCache']={'prefix':prefix+'/frame-cache','frames':len(items)}
        for f in base.glob('*.log'):
            bucket.blob(prefix+'/logs/'+f.name).upload_from_filename(f,timeout=30)
        bucket.blob(prefix+'/gpu-receipt.json').upload_from_string(json.dumps(receipt,indent=2,default=str),content_type='application/json',timeout=30)
        print(json.dumps({'event':'workload_terminal','status':receipt['status'],'seconds':receipt['workloadSeconds']}),flush=True)
        # No daemon or child is retained after synchronous render completion.


if __name__=='__main__':main()
