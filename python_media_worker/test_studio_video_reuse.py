import asyncio
from collections import Counter
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import numpy as np


def run(*args):
    # This test also runs under unittest in the production image. Keep its
    # fixture helper independent of pytest-only test modules.
    return subprocess.run(['ffmpeg', '-v', 'error', '-y', *args],
                          check=True, capture_output=True, timeout=60).stdout


def check_native_render_reuses_owned_camera_ingest_and_trim_but_preserves_both_independent_windows(tmp_path):
    from python_media_worker import main_media_server as worker
    main, camera, delivery = tmp_path/'main.mp4', tmp_path/'camera.mp4', tmp_path/'final.mp4'
    run('-f','lavfi','-i','color=black:s=320x180:r=24:d=1', '-c:v','libx264','-threads','1',str(main))
    run('-f','lavfi','-i','testsrc2=s=96x80:r=24:d=2', '-c:v','libx264','-threads','1',str(camera))
    ingests, trims = Counter(), []
    async def ingest(url, destination, **kwargs):
        ingests[url] += 1
        if url == 'owned-camera' and ingests[url] > 1:
            raise OSError('Redundant camera download')
        shutil.copyfile(camera if url.startswith('owned-camera') else main, destination)
        return destination
    def upload(file):
        shutil.copyfile(file, delivery);return str(delivery)
    original_run = worker.run_subprocess_async
    async def observe(command, *args, **kwargs):
        if str(command[-1]).endswith('_trim.mp4') and '_ov_' in str(command[-1]):
            trims.append(command)
        return await original_run(command, *args, **kwargs)
    layers = [{'id': identity, 'type': 'video', 'base_transform': {'opacity': .8},
               'effects': {'mask': {'enabled': True, 'shape': 'ellipse'}}} for identity in ['left','right']]
    request = worker.RenderViralRequest(video_url='owned-main', start_time=0, end_time=1,
        async_mode=True, job_id='bounded-camera-reuse-test',
        smart_crop=False, auto_captions=False, professional_cleanup=False, brand_watermark=False,
        composition_plan={'layers': layers},
        overlays=[worker.ViralOverlay(id=identity, type='video', src='owned-camera',
            x=x, y=50, width=30, height=60, frameShape='edge', start_time=0, duration=1,
            sourceStartTime=.25) for identity, x in [('left',25),('right',75)]],
        output_settings={'resolution': 'source', 'fps': '24'})
    with patch.dict(os.environ, {'VIRAL_EXPORT_ENCODER': 'cpu', 'MEDIA_WORKER_STUDIO_FFMPEG_THREADS': '2'}), \
         patch.object(worker,'materialize_video_input',ingest), patch.object(worker,'upload_file_to_firebase',upload), \
         patch.object(worker,'run_subprocess_async',observe), patch.object(worker,'update_firestore_job') as updates:
        result = asyncio.run(worker.render_viral_clip(request))
        cached_raw = run('-i', str(delivery), '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1')
        # Independently ingest the same camera bytes under two distinct source
        # identities. This prevents reuse and supplies a true reference for the
        # complete picture. Lossy H.264 can encode identical windows differently
        # at different spatial macroblocks; left/right equality is not a valid
        # CPU-versus-GPU correctness check.
        reference_request = request.model_copy(update={
            'job_id': 'bounded-camera-reference-test',
            'overlays': [overlay.model_copy(update={'src': 'owned-camera-' + overlay.id})
                         for overlay in request.overlays],
        })
        reference = asyncio.run(worker.render_viral_clip(reference_request))
        reference_raw = run('-i', str(delivery), '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1')
    assert result['status'] == 'completed'
    assert reference['status'] == 'completed'
    assert ingests == {'owned-main': 2, 'owned-camera': 1, 'owned-camera-left': 1, 'owned-camera-right': 1}
    assert len(trims) == 3, 'One shared preparation and two independent reference preparations'
    assert result['performance_timing']['video_occurrence_count'] == 2
    assert result['performance_timing']['video_source_count'] == 1
    assert reference['performance_timing']['video_source_count'] == 2
    details = [call.args[1].get('detail', '') for call in updates.call_args_list]
    assert any(detail.startswith('Preparing video layers') for detail in details)
    assert 'Render complete' in details
    pixels = np.frombuffer(cached_raw, np.uint8).reshape(24, 180, 320, 3)
    reference_pixels = np.frombuffer(reference_raw, np.uint8).reshape(24, 180, 320, 3)
    np.testing.assert_array_equal(pixels, reference_pixels)
    assert pixels[:, 65:115, 60:100].max() > 150
    assert pixels[:, 65:115, 220:260].max() > 150
    for left, right in [(60, 100), (220, 260)]:
        assert not np.array_equal(pixels[0,65:115,left:right], pixels[-1,65:115,left:right])


class StudioVideoReuseTests(unittest.TestCase):
    def test_native_camera_windows(self):
        with tempfile.TemporaryDirectory() as directory:
            check_native_render_reuses_owned_camera_ingest_and_trim_but_preserves_both_independent_windows(Path(directory))
