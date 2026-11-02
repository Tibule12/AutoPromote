import asyncio
import io
from pathlib import Path
import shutil
from unittest.mock import patch
import numpy as np
from PIL import Image
import pytest
from python_media_worker.studio_image_sources import materialize_studio_image


def test_repeated_images_share_bytes_only_within_the_current_render(tmp_path):
    cache = {}
    with patch('urllib.request.urlopen', side_effect=lambda *_args, **_kwargs: io.BytesIO(b'owned image')) as download:
        first = materialize_studio_image('https://test.invalid/signed-image', str(tmp_path/'first'), cache)
        assert materialize_studio_image('https://test.invalid/signed-image', str(tmp_path/'split'), cache) == first
        assert not (tmp_path/'split').exists()
        assert download.call_count == 1
        materialize_studio_image('https://test.invalid/signed-image', str(tmp_path/'other-job'), {})
        materialize_studio_image('https://test.invalid/another-image', str(tmp_path/'other-image'), cache)
        assert download.call_count == 3
    assert Path(first).read_bytes() == b'owned image'


def test_a_failed_read_is_never_cached_and_a_retry_replaces_partial_bytes(tmp_path):
    class Interrupted(io.BytesIO):
        def read(self, size=-1):
            if self.tell():
                raise OSError('connection interrupted')
            return super().read(size)
    cache = {}
    with patch('urllib.request.urlopen', side_effect=[Interrupted(b'partial'), io.BytesIO(b'complete')]), \
         patch('python_media_worker.studio_image_sources.time.sleep'):
        path = materialize_studio_image('https://test.invalid/image', str(tmp_path/'image'), cache)
    assert Path(path).read_bytes() == b'complete'
    with patch('urllib.request.urlopen', side_effect=OSError('unavailable')), \
         patch('python_media_worker.studio_image_sources.time.sleep'):
        with pytest.raises(OSError):
            materialize_studio_image('https://test.invalid/broken', str(tmp_path/'broken'), cache)
    assert 'https://test.invalid/broken' not in cache


def test_the_actual_renderer_keeps_both_occurrences_when_a_second_download_would_fail(tmp_path):
    from python_media_worker import main_media_server as worker
    from python_media_worker.test_studio_overlay_zero import run
    source, delivery = tmp_path/'source.mp4', tmp_path/'final.mp4'
    run('-f', 'lavfi', '-i', 'color=black:s=320x180:r=24:d=1', '-c:v', 'libx264', '-threads', '1', '-n', str(source))
    image = io.BytesIO()
    Image.new('RGB', (80, 80), (0, 255, 0)).save(image, 'PNG')
    calls = []
    def download(url, timeout):
        calls.append(url)
        if len(calls) > 1:
            raise OSError('A redundant download lost its connection')
        return io.BytesIO(image.getvalue())
    async def ingest(_url, destination, **_kwargs):
        shutil.copyfile(source, destination)
        return destination
    def upload(file):
        shutil.copyfile(file, delivery)
        return str(delivery)
    request = worker.RenderViralRequest(video_url='source', start_time=0, end_time=1,
        smart_crop=False, auto_captions=False, professional_cleanup=False, brand_watermark=False,
        overlays=[worker.ViralOverlay(id=id, type='image', src='https://test.invalid/same.png',
            x=x, y=50, width=20, height=40, frameShape='edge', start_time=0, duration=1)
            for id, x in [('first', 25), ('split', 75)]],
        output_settings={'resolution': 'source', 'fps': '24'})
    with patch.object(worker, 'materialize_video_input', ingest), patch.object(worker, 'upload_file_to_firebase', upload), \
         patch('urllib.request.urlopen', download):
        assert asyncio.run(worker.render_viral_clip(request))['status'] == 'completed'
    assert len(calls) == 1
    raw = run('-ss', '0.5', '-i', str(delivery), '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1')
    pixels = np.frombuffer(raw, np.uint8).reshape(180, 320, 3)
    for x in [80, 240]:
        assert pixels[90, x, 1] > 220 and pixels[90, x, 0] < 25
