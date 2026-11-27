"""Run one existing native endpoint under a renewable reservation. No renderer fork."""
import asyncio
import hashlib
import hmac
import io
import json
import os
from pathlib import Path
import re
import resource
import shutil
import signal
import sys
import threading
import time
from urllib.parse import unquote, urlparse

STARTED = time.monotonic()


class CappedLog(io.TextIOBase):
    def __init__(self, stream):
        self.stream, self.remaining = stream, 512 * 1024

    def write(self, text):
        value = str(text)
        if self.remaining > 0:
            encoded = value.encode('utf-8', errors='replace')[:self.remaining]
            self.remaining -= len(encoded)
            self.stream.write(encoded.decode('utf-8', errors='ignore'))
        return len(value)

    def flush(self):
        self.stream.flush()


def run():
    # The platform timeout is independent of this in-process watchdog. Neither
    # loss of the API nor a lost worker callback can release the cash liability.
    timeout = int(os.environ['PROCESSING_MAX_SECONDS'])
    if not 30 <= timeout <= 900 or os.environ.get('CLOUD_RUN_TASK_ATTEMPT') != '0':
        raise RuntimeError('Invalid bounded task attempt')
    try:
        os.setsid()
    except PermissionError:
        pass
    resource.setrlimit(resource.RLIMIT_FSIZE, (4 * 1024 ** 3, 4 * 1024 ** 3))
    watchdog = threading.Timer(timeout, lambda: os.killpg(os.getpgrp(), signal.SIGKILL))
    watchdog.daemon = True
    watchdog.start()
    sys.stdout, sys.stderr = CappedLog(sys.stdout), CappedLog(sys.stderr)
    os.environ['PROCESSING_BUDGET_REQUIRED'] = 'true'
    os.environ['ENABLE_LOCAL_MEDIA_OUTPUT_FALLBACK'] = 'false'
    # No external AI credentials/fallbacks in a CPU/GPU reservation.
    for key in list(os.environ):
        if re.search(r'(OPENAI|ANTHROPIC|GEMINI|REPLICATE|RUNWAY|ELEVENLABS).*KEY', key):
            os.environ.pop(key)
    os.environ['HF_HUB_OFFLINE'] = '1'
    os.environ['TRANSFORMERS_OFFLINE'] = '1'
    os.environ['ALLOW_RUNTIME_DEPENDENCY_INSTALL'] = 'false'
    os.environ['FIREBASE_UPLOAD_TIMEOUT_SECONDS'] = '90'
    import main_media_server as worker
    from google.cloud import storage
    import requests
    worker.verify_required_gpu_runtime()
    db = worker.firestore.client()
    binding_id = os.environ['PROCESSING_BINDING_ID']
    nonce = os.environ['PROCESSING_DISPATCH_NONCE']
    if not re.fullmatch(r'[a-f0-9]{64}', binding_id):
        raise RuntimeError('Invalid binding')
    ref = db.collection('processing_worker_bindings').document(binding_id)
    binding = ref.get().to_dict()
    if (not binding or binding['state'] != 'dispatch_claimed' or
            not hmac.compare_digest(binding['nonce'], nonce) or
            hashlib.sha256(binding['requestCanonicalJSON'].encode()).hexdigest() != binding['requestDigest']):
        raise RuntimeError('Reservation binding mismatch')
    profile = binding['profile']
    approved = db.collection('processing_worker_qualifications').document(binding['qualificationId']).get().to_dict()
    import datetime
    expiry = datetime.datetime.fromisoformat(str((approved or {}).get('expiresAt', '')).replace('Z', '+00:00'))
    if (not approved or not approved.get('approved') or expiry.timestamp() <= time.time() or
            approved.get('profileDigest') != binding['profileDigest']):
        raise RuntimeError('Expired native authorization')
    if approved.get('kind') == 'funded-qualification':
        if not any(r.get('userId') == binding['userId'] and r.get('requestId') == binding['requestId'] and
                   r.get('fingerprint') == binding['fingerprint'] for r in approved.get('allowedRequests', [])):
            raise RuntimeError('Unapproved qualification request')
    elif approved.get('workerContract') != 'renewable-native-v1' or any(approved.get(key) is not True for key in
            ['sourceAndOutputBoundsVerified', 'networkAndStorageBoundsVerified', 'terminalReconciliationVerified']):
        raise RuntimeError('Native production qualification required')
    if profile['maxSeconds'] != timeout:
        raise RuntimeError('Resource reservation mismatch')
    job_id = binding['nativeJobId']
    job_ref = db.collection('video_edits').document(job_id)
    job = job_ref.get().to_dict()
    if job['userId'] != binding['userId'] or job['processingBindingId'] != binding_id:
        raise RuntimeError('Native owner mismatch')
    ledger_id = hashlib.sha256(json.dumps([binding['userId'], binding['requestId']], separators=(',', ':')).encode()).hexdigest()
    ledger_collection = binding.get('ledgerCollection', 'processing_jobs')
    if not re.fullmatch(r'processing(?:_qualification_[a-z0-9_]+)?_jobs', ledger_collection):
        raise RuntimeError('Invalid ledger authority')
    ledger = db.collection(ledger_collection).document(ledger_id).get().to_dict()
    if not ledger or ledger['state'] != 'started' or not ledger.get('dispatchClaimed'):
        raise RuntimeError('Unfunded native dispatch')
    transaction = db.transaction()
    @worker.firestore.transactional
    def claim_native(tx):
        current = ref.get(transaction=tx).to_dict()
        if current.get('workerClaim'):
            raise RuntimeError('Native reservation already claimed')
        tx.set(ref, {'workerClaim': {'execution': os.environ.get('CLOUD_RUN_EXECUTION'),
            'taskAttempt': 0, 'claimedAt': time.time()}}, merge=True)
    claim_native(transaction)
    body = json.loads(binding['requestCanonicalJSON'])
    storage_client = storage.Client()
    bucket = storage_client.bucket(os.environ['FIREBASE_STORAGE_BUCKET'])
    staging = Path('/tmp') / ('renewable-' + binding_id)
    staging.mkdir()
    consumed = 0
    sources = {}

    def stage(value):
        nonlocal consumed
        if value in sources:
            return sources[value]
        u = urlparse(value)
        name = None
        if u.scheme == 'gs' and u.netloc == bucket.name:
            name = unquote(u.path.lstrip('/'))
        elif u.scheme == 'https' and u.hostname == 'storage.googleapis.com':
            prefix = '/' + bucket.name + '/'
            if u.path.startswith(prefix):
                name = unquote(u.path[len(prefix):])
        elif u.scheme == 'https' and u.hostname == 'firebasestorage.googleapis.com':
            prefix = '/v0/b/' + bucket.name + '/o/'
            if u.path.startswith(prefix):
                name = unquote(u.path[len(prefix):])
        elif u.scheme == 'https' and u.hostname == bucket.name + '.storage.googleapis.com':
            name = unquote(u.path.lstrip('/'))
        if not name or '..' in name.split('/'):
            raise RuntimeError('Native input must be an admitted storage object')
        blob = bucket.blob(name)
        blob.reload(timeout=15)
        size = int(blob.size)
        consumed += size
        if size < 1 or consumed > profile['inputMaxBytes']:
            raise RuntimeError('Input byte bound exceeded')
        target = staging / (hashlib.sha256(value.encode()).hexdigest() + Path(name).suffix)
        if u.scheme == 'gs':
            if (blob.metadata or {}).get('ownerUid') != binding['userId'] and binding['userId'] not in name.split('/'):
                raise RuntimeError('Unowned private storage input')
            blob.download_to_filename(str(target), if_generation_match=int(blob.generation), timeout=60)
        else:
            # Use the existing read capability. ADC must not turn a guessed
            # private object URL into authority to read another user's media.
            with requests.get(value, stream=True, timeout=(10, 60), allow_redirects=False) as response:
                response.raise_for_status()
                if str(response.headers.get('x-goog-generation', blob.generation)) != str(blob.generation):
                    raise RuntimeError('Source generation changed')
                downloaded = 0
                with target.open('wb') as output:
                    for chunk in response.iter_content(1024 * 1024):
                        downloaded += len(chunk)
                        if downloaded > size:
                            raise RuntimeError('Input byte bound exceeded')
                        output.write(chunk)
                if downloaded != size:
                    raise RuntimeError('Source size changed')
        sources[value] = str(target)
        return str(target)

    def prepare(value, key=""):
        if isinstance(value, list):
            return [prepare(v, key) for v in value]
        if isinstance(value, dict):
            return {k: prepare(v, k) for k, v in value.items()}
        if isinstance(value, str) and (key.lower().endswith('url') or key in ('src', 'url')) and value.startswith(('https://', 'http://', 'gs://')):
            local = stage(value)
            return value if binding['endpoint'] in ('/render-multicam','/multicam/preflight-sync') else local
        return value

    body = prepare(body)
    # After staging, ordinary network libraries cannot fetch more media or
    # model weights. Only the existing Google progress/output clients remain.
    native_request = requests.sessions.Session.request
    network_calls = 0
    def bounded_request(session, method, url, *args, **kwargs):
        nonlocal network_calls
        host = urlparse(str(url)).hostname or ''
        if not (host == 'metadata.google.internal' or host == '169.254.169.254' or
                host in ('oauth2.googleapis.com', 'storage.googleapis.com', 'firestore.googleapis.com',
                         'iamcredentials.googleapis.com', 'compute.googleapis.com') or
                host == bucket.name + '.storage.googleapis.com' or host == '127.0.0.1'):
            raise RuntimeError('Unfunded native network fallback')
        network_calls += 1
        if network_calls > 512:
            raise RuntimeError('Native request count exceeded')
        kwargs.setdefault('timeout', 30)
        return native_request(session, method, url, *args, **kwargs)
    requests.sessions.Session.request = bounded_request
    upload_bytes = 0
    outputs = []
    output_limit = min(profile['outputMaxBytes'], 128 * 1024 ** 2)

    def upload(local_path, destination_path=None):
        nonlocal upload_bytes
        size = Path(local_path).stat().st_size
        upload_bytes += size
        if not 0 < size <= output_limit or upload_bytes > profile['networkMaxBytes']:
            raise RuntimeError('Output byte bound exceeded')
        name = destination_path or f'processed/{job_id}_viral.mp4'
        if binding['endpoint'] in ('/render-clip', '/render-montage') and str(local_path).endswith('.mp4'):
            name = f'processed/{job_id}_viral.mp4'
        if binding['endpoint'] == '/auto-generate-clips':
            name = f'processed/{job_id}_clips/{Path(destination_path or local_path).name}'
        if binding['endpoint'] == '/extract-audio':
            name = f'processed/{job_id}_audio{Path(local_path).suffix}'
        if not (name.startswith(f'processed/{job_id}') or name == f'processed/multicam_{job_id}.mp4' or
                name == f'processed/manifests/multicam_{job_id}.json' or
                name == f'processed/thumbnails/multicam_{job_id}.jpg'):
            raise RuntimeError('Unexpected output namespace')
        blob = bucket.blob(name)
        sha256 = hashlib.sha256(Path(local_path).read_bytes()).hexdigest()
        blob.metadata = {'autopromoteJobId': job_id, 'ownerUid': binding['userId'], 'sha256': sha256,
                         'processingBindingId': binding_id}
        blob.cache_control = 'private, no-store'
        blob.upload_from_filename(local_path, if_generation_match=0, timeout=90, retry=None)
        outputs.append({'path': name, 'bytes': size, 'sha256': sha256})
        # The trusted API adopts private bucket objects through the existing
        # owned-output path. Do not issue public/Firebase download credentials.
        return f'https://storage.googleapis.com/{bucket.name}/{name}'

    worker.upload_file_to_firebase = upload
    # Stage all admitted source bytes before native processing. Native FFmpeg
    # receives local inputs. A surprise model/API/network fallback is refused.
    # The production ingest deliberately accepts HTTP URLs. Serve already
    # admitted bytes on loopback so its existing CFR/audio preparation still
    # runs unchanged, without another cloud download or local-path bypass.
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
    local_cap = os.urandom(24).hex()
    files = {hashlib.sha256(str(v).encode()).hexdigest(): v for v in sources.values()}
    class LocalSource(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass
        def do_GET(self):
            key = self.path.split('?', 1)[0].removeprefix('/' + local_cap + '/')
            value = files.get(key)
            if not self.path.startswith('/' + local_cap + '/') or not value:
                self.send_error(403)
                return
            size = Path(value).stat().st_size
            start, end = 0, size - 1
            if self.headers.get('Range'):
                match = re.fullmatch(r'bytes=(\d+)-(\d*)', self.headers['Range'])
                if not match:
                    self.send_error(416)
                    return
                start = int(match[1])
                end = min(int(match[2]) if match[2] else end, end)
                if start > end:
                    self.send_error(416)
                    return
            self.send_response(206 if self.headers.get('Range') else 200)
            self.send_header('Accept-Ranges', 'bytes')
            if self.headers.get('Range'):
                self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
            self.send_header('Content-Length', str(end-start+1))
            self.send_header('Content-Type', 'application/octet-stream')
            self.end_headers()
            if self.command == 'HEAD':
                return
            try:
                with open(value, 'rb') as source:
                    source.seek(start)
                    remaining = end-start+1
                    while remaining:
                        chunk = source.read(min(remaining, 1024*1024))
                        if not chunk:
                            break
                        self.wfile.write(chunk)
                        remaining -= len(chunk)
            except (BrokenPipeError, ConnectionResetError):
                pass
        do_HEAD = do_GET
    local_server = ThreadingHTTPServer(('127.0.0.1', 0), LocalSource)
    threading.Thread(target=local_server.serve_forever, daemon=True).start()
    original_materialize = worker.materialize_video_input

    async def materialize(url, target, *args, **kwargs):
        local = sources.get(url, url)
        key = hashlib.sha256(str(local).encode()).hexdigest()
        if key not in files:
            raise RuntimeError('Undeclared native source')
        source_url = f'http://127.0.0.1:{local_server.server_port}/{local_cap}/{key}'
        return await original_materialize(source_url, target, *args, **kwargs)

    worker.materialize_video_input = materialize
    original_audio_materialize = worker.materialize_audio_input
    async def materialize_audio(url, target, *args, **kwargs):
        local = sources.get(url, url)
        key = hashlib.sha256(str(local).encode()).hexdigest()
        if key not in files:
            raise RuntimeError('Undeclared native audio source')
        source_url = f'http://127.0.0.1:{local_server.server_port}/{local_cap}/{key}'
        return await original_audio_materialize(source_url, target, *args, **kwargs)
    worker.materialize_audio_input = materialize_audio
    update = worker.update_firestore_job
    progress_times = {}
    def progress(native_id, data, *, critical=False, max_attempts=None):
        previous = progress_times.get(native_id, 0)
        if critical or data.get('status') in ('completed', 'failed', 'cancelled') or time.monotonic() - previous >= 3:
            progress_times[native_id] = time.monotonic()
            if native_id != job_id:
                return None
            return update(native_id, data, critical=critical, max_attempts=1)
    worker.update_firestore_job = progress
    endpoint = binding['endpoint']
    auto_clip_ref = None
    if endpoint == '/auto-generate-clips':
        auto_clip_ref = db.collection('clip_analyses').document(job_id)
        if (auto_clip_ref.get().to_dict() or {}).get('userId') != binding['userId']:
            raise RuntimeError('Clip analysis owner mismatch')
    job_ref.set({'status': 'processing', 'stage': 'native_processing', 'progress': 5}, merge=True)
    # Native progress and output transport remain the existing trusted Firebase
    # client; optional paid inference is separately blocked by provider_budget.
    async def execute():
        if endpoint == '/render-viral-clip':
            return await worker.render_viral_clip_impl(worker.RenderViralRequest(**body), provided_job_id=job_id)
        if endpoint == '/render-clip':
            if hasattr(worker, 'render_clip_impl'):
                return await worker.render_clip_impl(worker.RenderClipRequest(**body), provided_job_id=job_id)
            return await worker.render_clip(worker.RenderClipRequest(**body))
        if endpoint == '/render-montage':
            return await worker.render_montage(worker.RenderMontageRequest(**body))
        if endpoint == '/auto-generate-clips':
            from starlette.background import BackgroundTasks
            background = BackgroundTasks()
            await worker.auto_generate_clips({**body, 'job_id': job_id}, background)
            await background()
            completed = job_ref.get().to_dict() or {}
            if completed.get('status') in ('failed', 'error'):
                raise RuntimeError('Native clip generation failed')
            return {**completed, 'status': 'completed', 'job_id': job_id}
        preview_models = {'/preview-silence': ('preview_silence', 'SilencePreviewRequest'),
            '/preview-music': ('preview_music', 'MusicPreviewRequest'),
            '/preview-audio-remix': ('preview_audio_remix', 'AudioRemixExactPreviewRequest'),
            '/preview-watermark-cleanup': ('preview_watermark_cleanup', 'WatermarkPreviewRequest')}
        if endpoint in preview_models:
            function, model = preview_models[endpoint]
            return await getattr(worker, function)(getattr(worker, model)(**body))
        if endpoint == '/render-multicam':
            return await worker.render_multicam_impl(worker.RenderMultiCamRequest(**{**body, 'job_id': job_id,
                'async_mode': True, 'plan_only': False, 'planOnly': False}), provided_job_id=job_id,
                propagate_errors=True, allow_embedded_server_proof=bool(job.get('requireServerProof', True)))
        if endpoint == '/extract-audio':
            return await worker.extract_audio_impl(worker.ExtractAudioRequest(**body), provided_job_id=job_id)
        if endpoint == '/multicam/preflight-sync':
            return await worker.multicam_preflight_sync(worker.RenderMultiCamRequest(**{**body, 'job_id': job_id}))
        if endpoint == '/clean-audio-sync':
            return await worker.clean_audio_sync_impl(worker.CleanAudioSyncRequest(**body), job_id=job_id)
        if endpoint == '/analyze-clips':
            return await worker.analyze_clips(body)
        if endpoint == '/transcribe':
            return await worker.transcribe_video(body)
        if endpoint in ('/process-video', '/process'):
            return await worker.run_pipeline_impl(worker.VideoProcessRequest(**{**body, 'async_mode': False}), provided_job_id=job_id)
        raise RuntimeError('Unpriced native endpoint')
    try:
        result = asyncio.run(execute())
        if not isinstance(result, dict) or result.get('status') in ('failed', 'error', 'cancelled'):
            raise RuntimeError('Native operation failed')
        if profile['operation'] in ('studio.render', 'multicam.render') and not endpoint.startswith('/preview-') and not outputs:
            raise RuntimeError('Native render delivered no output')
        if len(json.dumps(result).encode()) > 750000:
            raise RuntimeError('Native result exceeds receipt bound')
        job_ref.set({'status': 'completed', 'progress': 100, 'processingResult': result,
                     'processingOutputs': outputs, **({'segments': result['segments']} if 'segments' in result else {}), 'processingWallSeconds': time.monotonic() - STARTED,
                     **({'outputStoragePath': result.get('output_storage_path') or next((o['path'] for o in outputs if o['path'].endswith(('.mp4', '.mov'))), outputs[0]['path'])} if outputs else {})}, merge=True)
        if auto_clip_ref:
            auto_clip_ref.set({'status':'completed', 'progress':100,
                'processingBindingId':binding_id,
                'clips':result.get('clips',[]), 'completed_clips':len(result.get('clips',[]))},merge=True)
    except Exception:
        job_ref.set({'status': 'failed', 'processingError': 'Native bounded execution failed'}, merge=True)
        if auto_clip_ref:
            auto_clip_ref.set({'status':'failed','error':'Native bounded execution failed'},merge=True)
        raise
    finally:
        if endpoint == '/render-multicam':
            from multicam_job_runner import _release_capacity
            _release_capacity(job_id, 'bounded_native_terminal')
        local_server.shutdown()
        shutil.rmtree(staging, ignore_errors=True)
        watchdog.cancel()


if __name__ == '__main__':
    run()
