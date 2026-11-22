import asyncio
from collections import Counter
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

import numpy as np


def check_native_render_reuses_owned_camera_ingest_and_trim_but_preserves_both_independent_windows(tmp_path):
    from python_media_worker import main_media_server as worker
    from python_media_worker.test_studio_overlay_zero import run
    main, camera, delivery = tmp_path/'main.mp4', tmp_path/'camera.mp4', tmp_path/'final.mp4'
    run('-f','lavfi','-i','color=black:s=320x180:r=24:d=1', '-c:v','libx264','-threads','1',str(main))
    run('-f','lavfi','-i','testsrc2=s=96x80:r=24:d=2', '-c:v','libx264','-threads','1',str(camera))
    ingests, trims = Counter(), []
    async def ingest(url, destination, **kwargs):
        ingests[url] += 1
        if url == 'owned-camera' and ingests[url] > 1:
            raise OSError('Redundant camera download')
        shutil.copyfile(camera if url == 'owned-camera' else main, destination)
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
    with patch.object(worker,'materialize_video_input',ingest), patch.object(worker,'upload_file_to_firebase',upload), \
         patch.object(worker,'run_subprocess_async',observe), patch.object(worker,'update_firestore_job') as updates:
        result = asyncio.run(worker.render_viral_clip(request))
    assert result['status'] == 'completed'
    assert ingests == {'owned-main': 1, 'owned-camera': 1}
    assert len(trims) == 1
    assert result['performance_timing']['video_occurrence_count'] == 2
    assert result['performance_timing']['video_source_count'] == 1
    details = [call.args[1].get('detail', '') for call in updates.call_args_list]
    assert any(detail.startswith('Preparing video layers') for detail in details)
    assert 'Render complete' in details
    raw = run('-i', str(delivery), '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1')
    pixels = np.frombuffer(raw, np.uint8).reshape(24, 180, 320, 3)
    assert pixels[:, 65:115, 60:100].max() > 150
    np.testing.assert_allclose(pixels[:, 65:115, 60:100].astype(float), pixels[:, 65:115, 220:260].astype(float), atol=6)
    assert not np.array_equal(pixels[0,65:115,60:100], pixels[-1,65:115,60:100])


class StudioVideoReuseTests(unittest.TestCase):
    def test_native_camera_windows(self):
        with tempfile.TemporaryDirectory() as directory:
            check_native_render_reuses_owned_camera_ingest_and_trim_but_preserves_both_independent_windows(Path(directory))
