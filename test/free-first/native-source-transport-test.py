"""Real FFmpeg/HTTP regression for the production ingest transport only."""
import ast
import asyncio
import functools
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import logging
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import threading
import time
import unittest
import urllib.request

ROOT = Path(__file__).resolve().parents[2]


class HttpError(Exception):
    def __init__(self, status_code, detail):
        super().__init__(detail)


class NativeTransport(unittest.TestCase):
    def test_native_master_and_required_sidecars_are_owned_and_bounded(self):
        runner=ast.parse((ROOT/'python_media_worker/renewable_native_job_runner.py').read_text())
        upload=next(n for n in ast.walk(runner) if isinstance(n,ast.FunctionDef) and n.name=='upload')
        factory=ast.parse('def factory():\n upload_bytes=0\n outputs=[]\n pass\n return upload,outputs').body[0]
        factory.body[2]=upload
        receipts=[]
        class Blob:
            def upload_from_filename(self,filename,**options):
                self.options=options
                if options.get('if_generation_match')!=0 or options.get('retry') is not None:
                    raise AssertionError('Immutable single-attempt upload required')
                receipts.append(self.metadata)
        class Bucket:
            name='owned'
            def blob(self,_name):return Blob()
        scope={**globals(),'job_id':'owned-job-123','binding_id':'owned-binding',
            'binding':{'endpoint':'/render-multicam','userId':'owner'},'output_limit':128*1024**2,
            'profile':{'networkMaxBytes':256*1024**2},'bucket':Bucket()}
        tree=ast.fix_missing_locations(ast.Module(body=[factory],type_ignores=[]))
        exec(compile(tree,'actual-native-output-adapter','exec'),scope)
        send,outputs=scope['factory']()
        with tempfile.TemporaryDirectory() as folder:
            file=Path(folder)/'native.mp4';file.write_bytes(b'real-file-fixture')
            send(str(file),'processed/multicam_owned-job-123.mp4')
            send(str(file),'processed/manifests/multicam_owned-job-123.json')
            send(str(file),'processed/thumbnails/multicam_owned-job-123.jpg')
            with self.assertRaises(RuntimeError):send(str(file),'processed/manifests/multicam_other-job.json')
        self.assertEqual(len(outputs),3)
        self.assertTrue(all(r['ownerUid']=='owner' for r in receipts))

    def test_production_ingest_receives_admitted_bytes_without_allowing_local_paths(self):
        tree = ast.parse((ROOT / 'python_media_worker/main_media_server.py').read_text())
        names = ['materialize_video_input', 'materialize_audio_input', 'build_cfr_video_filter', 'redact_media_locator_for_logs', 'clamp_float']
        selected = ast.Module(body=[node for node in tree.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
                                   and node.name in names], type_ignores=[])
        async def run(command, **kwargs):
            return await asyncio.to_thread(subprocess.run, command, timeout=30, **kwargs)
        def duration(filename):
            return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                         '-of', 'default=noprint_wrappers=1:nokey=1', filename], text=True, timeout=5))
        scope = {**globals(), 'IS_PRODUCTION_ENV': True, 'HTTPException': HttpError,
                 'logger': logging.getLogger('native-source-test'), 'run_subprocess_async': run,
                 'get_media_duration': duration, 'MULTICAM_SYNC_SAMPLE_RATE': 8000,
                 'has_audio_stream': lambda filename: bool(subprocess.check_output(['ffprobe','-v','error',
                     '-select_streams','a','-show_entries','stream=codec_name','-of','csv=p=0',filename],text=True).strip())}
        exec(compile(selected, 'canonical-native-ingest', 'exec'), scope)
        with tempfile.TemporaryDirectory(prefix='native-source-handoff-') as folder:
            source = Path(folder) / 'source.mp4'
            subprocess.run(['ffmpeg', '-v', 'error', '-i', str(ROOT / 'tmp/free-first-workload-inputs/d563280d6d3f60c275be7900bafb71d4c67bcdc6531b811dcb19b904aeb3c526.mp4'),
                            '-t', '3', '-c', 'copy', '-y', str(source)], check=True, timeout=15)
            subprocess.run(['ffmpeg','-v','error','-i',str(ROOT/'tmp/free-first-workloads-20261126/external-audio-60s.wav'),
                '-t','3',str(Path(folder)/'source.wav')],check=True,timeout=15)
            runner = ast.parse((ROOT/'python_media_worker/renewable_native_job_runner.py').read_text())
            server_class = next(n for n in ast.walk(runner) if isinstance(n,ast.ClassDef) and n.name=='LocalSource')
            server_scope={**globals(),'local_cap':'test-cap','files':{
                'source.mp4':str(source),'source.wav':str(Path(folder)/'source.wav')}}
            exec(compile(ast.Module(body=[server_class],type_ignores=[]),'actual-bounded-loopback', 'exec'),server_scope)
            server = ThreadingHTTPServer(('127.0.0.1', 0), server_scope['LocalSource'])
            threading.Thread(target=server.serve_forever, daemon=True).start()
            try:
                with self.assertRaises(HttpError):
                    asyncio.run(scope['materialize_video_input'](str(source), str(Path(folder) / 'denied.mp4')))
                output = asyncio.run(scope['materialize_video_input'](
                    f'http://127.0.0.1:{server.server_port}/test-cap/source.mp4', str(Path(folder) / 'native.mp4'), keep_audio=True))
                self.assertGreater(Path(output).stat().st_size, 1000)
                self.assertGreater(duration(output), 0.5)
                original = asyncio.run(scope['materialize_video_input'](
                    f'http://127.0.0.1:{server.server_port}/test-cap/source.mp4', str(Path(folder) / 'original.mp4'),
                    keep_audio=True, preserve_source_bytes=True))
                self.assertEqual(hashlib.sha256(Path(original).read_bytes()).digest(), hashlib.sha256(source.read_bytes()).digest())
                with self.assertRaises(HttpError):
                    asyncio.run(scope['materialize_audio_input'](str(source), str(Path(folder) / 'denied.wav')))
                audio = asyncio.run(scope['materialize_audio_input'](
                    f'http://127.0.0.1:{server.server_port}/test-cap/source.wav', str(Path(folder) / 'audio.wav')))
                self.assertGreater(duration(audio),0.5)
                camera_audio = asyncio.run(scope['materialize_audio_input'](
                    f'http://127.0.0.1:{server.server_port}/test-cap/source.mp4', str(Path(folder) / 'camera-audio.wav')))
                self.assertGreater(duration(camera_audio),0.5)
            finally:
                server.shutdown()
                server.server_close()


if __name__ == '__main__':
    unittest.main()
