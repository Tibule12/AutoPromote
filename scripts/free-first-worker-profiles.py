#!/usr/bin/env python3
"""Prepare bounded Jobs from the currently serving images. Never executes jobs."""
import base64
import hashlib
import json
import subprocess
from pathlib import Path
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
PRIVATE = Path('/home/tibule12/.local/share/autopromote-qa/free-first-launch-20261127')
PROJECT = 'autopromote-cc6d3'
BASE = 'https://run.googleapis.com/v2/'
BOOTSTRAP = "import base64,hashlib,os; b=base64.b64decode(os.environ['PROCESSING_RUNNER_B64']); assert hashlib.sha256(b).hexdigest()==os.environ['PROCESSING_RUNNER_SHA256']; exec(compile(b,'renewable_native_job_runner.py','exec'))"


def profiles():
    code = (ROOT / 'python_media_worker/renewable_native_job_runner.py').read_bytes()
    sha = hashlib.sha256(code).hexdigest()
    cpu = json.loads((PRIVATE / 'media-worker-v1.revision.private.json').read_text())
    gpu = json.loads((PRIVATE / 'media-worker-gpu.revision.private.json').read_text())
    cam_job=json.loads((PRIVATE / 'cam-combiner-render-gpu-job.config.private.json').read_text())['template']['template']
    cam_image=json.loads((PRIVATE / 'cam-gpu-image.private.json').read_text())['image_summary']['fully_qualified_digest']
    cam={'containers':[{'image':cam_image}],'serviceAccount':cam_job['serviceAccount']}
    configs = {
        'speech-cpu': ('audio.transcribe', 10, 2, 4, 360, 30000, 44, cpu),
        'finder-cpu': ('clips.analyze', 20, 4, 8, 600, 80000, 88, cpu),
        'render-cpu': ('studio.render', 40, 4, 8, 600, 130000, 88, cpu),
        'clip-cpu': ('studio.render', 30, 4, 8, 360, 100000, 88, cpu),
        'render-gpu': ('studio.render', 40, 20, 80, 600, 810000, 886, gpu),
        'cam-gpu': ('multicam.render', 60, 20, 80, 900, 1070000, 886, cam),
        'failure-cpu': ('studio.render', 30, 4, 8, 360, 60000, 88, cpu),
        'audio-cpu': ('audio.extract', 5, 2, 4, 360, 30000, 44, cpu),
        'sync-cpu': ('audio.sync', 10, 4, 8, 600, 80000, 88, cam),
    }
    output = []
    for name, (operation, tokens, cpus, memory, seconds, maximum, rate, revision) in configs.items():
        profile = {
            'id': name, 'operation': operation, 'requestScope': 'existing-native-v1',
            'tokens': tokens, 'job': f'projects/{PROJECT}/locations/us-central1/jobs/free-first-{name}-{sha[:8]}' + ('-native-cam' if name=='cam-gpu' else ''),
            'image': revision['containers'][0]['image'],
            'serviceAccount': revision['serviceAccount'], 'device': 'gpu' if name.endswith('gpu') else 'cpu',
            'qualificationId': 'free-first-' + name + '-' + sha[:12],
            'maxMicros': maximum, 'maxSeconds': seconds, 'cpuMilli': cpus * 1000,
            'memoryBytes': memory * 1024 ** 3, 'inputMaxBytes': 1024 ** 3,
            'outputMaxBytes': 128 * 1024 ** 2, 'networkMaxBytes': 256 * 1024 ** 2,
            'storageMaxByteHours': 1024 ** 3 * 144, 'rateMicrosPerSecond': rate,
            # Includes the conservative 250s startup/shutdown reserve and the
            # remaining capped network/storage/control allocation. Not an invoice.
            'fixedCostMicros': maximum - seconds * rate,
            'runnerSha256': sha, 'runnerBootstrap': BOOTSTRAP,
        }
        if profile['device'] == 'gpu':
            profile.update(gpuCount=1, accelerator='nvidia-rtx-pro-6000')
        assert maximum >= (seconds + 250) * rate
        env = [{'name': 'NODE_ENV', 'value': 'production'},
               {'name': 'MEDIA_WORKER_REQUIRE_GPU', 'value': 'true' if profile['device']=='gpu' else 'false'},
               {'name': 'FIREBASE_STORAGE_BUCKET', 'value': PROJECT + '.firebasestorage.app'},
               {'name': 'PROCESSING_MAX_SECONDS', 'value': str(seconds)},
               {'name': 'PROCESSING_RUNNER_SHA256', 'value': sha},
               {'name': 'PROCESSING_RUNNER_B64', 'value': base64.b64encode(code).decode()},
               {'name': 'MULTICAM_UPLOAD_FIREBASE', 'value': 'true'},
               {'name': 'MULTICAM_EMBEDDED_SERVER_PROOF', 'value': '1'},
               {'name': 'HF_HUB_OFFLINE', 'value': '1'},
               {'name': 'ALLOW_RUNTIME_DEPENDENCY_INSTALL', 'value': 'false'},
               {'name': 'ENABLE_LOCAL_MEDIA_OUTPUT_FALLBACK', 'value': 'false'}]
        if name in ('cam-gpu', 'sync-cpu'):
            env += [item for item in cam_job['containers'][0].get('env',[]) if item['name'] in
                    ['MULTICAM_QA_RECEIPT_SECRET','MULTICAM_INGEST_BUCKET','MULTICAM_REUSE_VIDEO_ONLY_SYNC_AUDIT',
                     'MULTICAM_SOURCE_PREP_CONCURRENCY','MULTICAM_VISUAL_PROXY_CONCURRENCY',
                     'MULTICAM_SEGMENT_RENDER_CONCURRENCY','MULTICAM_X264_THREADS']]
        if profile['device'] == 'gpu':
            env += [{'name': 'MEDIA_WORKER_REQUIRE_GPU', 'value': 'true'},
                    {'name': 'VIRAL_EXPORT_ENCODER', 'value': 'h264_nvenc'},
                    {'name': 'FASTER_WHISPER_DEVICE', 'value': 'cuda'}]
        template = {'containers': [{'image': profile['image'], 'command': ['python3'],
                    'args': ['-c', BOOTSTRAP], 'env': env,
                    'resources': {'limits': {'cpu': str(cpus), 'memory': str(memory) + 'Gi',
                        **({'nvidia.com/gpu': '1'} if profile['device'] == 'gpu' else {})}}}],
                    'timeout': str(seconds) + 's', 'maxRetries': 0, 'serviceAccount': profile['serviceAccount']}
        if profile['device'] == 'gpu':
            template.update(nodeSelector={'accelerator': profile['accelerator']}, gpuZonalRedundancyDisabled=True)
        output.append((profile, {'name': profile['job'], 'template': {'taskCount': 1, 'parallelism': 1, 'template': template}}))
    return output


def main():
    import sys
    apply = '--prepare' in sys.argv
    values = profiles()
    selected = next((arg.split('=', 1)[1].split(',') for arg in sys.argv if arg.startswith('--only=')), None)
    if selected:
        if any(name not in [p['id'] for p, _ in values] for name in selected):
            raise RuntimeError('Unknown profile selection')
        values = [(p, b) for p, b in values if p['id'] in selected]
    token = subprocess.check_output(['gcloud', 'auth', 'print-access-token'], text=True).strip() if apply else None
    receipts = []
    for profile, body in values:
        if apply:
            headers = {'Authorization': 'Bearer ' + token, 'X-Goog-User-Project': PROJECT,
                       'Content-Type': 'application/json'}
            try:
                req = urllib.request.Request(BASE + profile['job'], headers=headers)
                remote = json.load(urllib.request.urlopen(req, timeout=30))
                existing=remote['template']['template']
                expected=body['template']['template']
                if any(existing.get(k)!=expected.get(k) for k in ['containers','serviceAccount','maxRetries','timeout']):
                    raise RuntimeError('Existing qualification Job differs; refusing overwrite: ' + profile['id'])
            except urllib.error.HTTPError as error:
                if error.code != 404:
                    raise
                parent, job_id = profile['job'].rsplit('/jobs/', 1)
                req = urllib.request.Request(BASE + parent + '/jobs?jobId=' + job_id, method='POST',
                                             headers=headers, data=json.dumps({k:v for k,v in body.items() if k != 'name'}).encode())
                try:
                    remote = json.load(urllib.request.urlopen(req, timeout=30))
                except urllib.error.HTTPError as failure:
                    raise RuntimeError(failure.read().decode()[:4000]) from None
            receipts.append({'id': profile['id'], 'job': profile['job'], 'providerOperation': remote.get('name'), 'executed': False})
    target = ROOT / 'config/free-first-release/worker-profiles.prepared.json'
    merged = [profile for profile, _ in values]
    if selected and target.exists():
        old = json.loads(target.read_text())
        merged += [profile for profile in old if profile['id'] not in selected]
    target.write_text(json.dumps(merged, indent=2) + '\n')
    if apply:
        receipt_path = ROOT / 'reports/free-first-launch-20261127/worker-jobs-prepared.json'
        if selected and receipt_path.exists():
            receipts += [receipt for receipt in json.loads(receipt_path.read_text()) if receipt['id'] not in selected]
        receipt_path.write_text(json.dumps(receipts, indent=2) + '\n')
    print(json.dumps({'prepared': apply, 'profiles': len(values), 'executions': 0, 'runnerSha256': values[0][0]['runnerSha256']}))


if __name__ == '__main__':
    main()
