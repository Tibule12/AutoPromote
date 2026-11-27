import asyncio
import io
from pathlib import Path
import shutil
from unittest.mock import patch
import numpy as np
from PIL import Image
import pytest
from python_media_worker.studio_image_sources import materialize_studio_image

def test_rec709_png_uses_its_cicp_transfer_before_fallback_gamma(tmp_path):
    from PIL import PngImagePlugin
    from python_media_worker.studio_image_sources import normalize_studio_image_colour
    source=tmp_path/'rec709.png'
    pixels=np.zeros((1,256,4),dtype=np.uint8)
    pixels[0,:,:3]=np.arange(256)[:,None];pixels[0,:,3]=np.arange(256)
    tags=PngImagePlugin.PngInfo();tags.add(b'gAMA',(50994).to_bytes(4,'big'))
    Image.fromarray(pixels,'RGBA').save(source,pnginfo=tags)
    import struct,zlib
    original=source.read_bytes();chunk=b'cICP'+bytes((1,1,0,1))
    source.write_bytes(original[:33]+struct.pack('>I',4)+chunk+struct.pack('>I',zlib.crc32(chunk))+original[33:])
    normalize_studio_image_colour(source)
    actual=np.array(Image.open(source))
    linear=(np.arange(256)/255)**2.4
    expected=np.rint(np.where(linear<=.0031308,linear*12.92,1.055*linear**(1/2.4)-.055)*255).astype(np.uint8)
    np.testing.assert_array_equal(actual[0,:,:3],np.repeat(expected[:,None],3,axis=1))
    np.testing.assert_array_equal(actual[0,:,3],pixels[0,:,3])
    original=source.read_bytes();normalize_studio_image_colour(source);assert source.read_bytes()==original

def test_untagged_png_render_copy_keeps_its_original_bytes(tmp_path):
    from python_media_worker.studio_image_sources import normalize_studio_image_colour
    source=tmp_path/'untagged.png';Image.new('RGBA',(4,4),(91,135,200,127)).save(source)
    original=source.read_bytes();normalize_studio_image_colour(source);assert source.read_bytes()==original

def test_native_rig_inline_svg_materializes_pixels_and_reuses_the_surface(tmp_path):
    from urllib.parse import quote
    svg="<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='64' height='64' fill='#00d455'/><circle cx='32' cy='32' r='16' fill='white'/></svg>"
    source='data:image/svg+xml;utf8,'+quote(svg);cache={}
    file=materialize_studio_image(source,str(tmp_path/'key.png'),cache)
    assert materialize_studio_image(source,str(tmp_path/'repeat.png'),cache)==file
    image=Image.open(file).convert('RGBA')
    assert image.getpixel((32,32))==(255,255,255,255)
    assert image.getpixel((2,2))==(0,212,85,255)

@pytest.mark.parametrize('content',["<image href='https://example.invalid/image.png'/>","<rect onload='alert(1)'/>","<script>1</script>","<rect fill='url(file:///tmp/image)'/>"])
def test_inline_svg_refuses_external_or_active_content(tmp_path,content):
    from urllib.parse import quote
    source='data:image/svg+xml;utf8,'+quote("<svg width='64' height='64'>"+content+'</svg>')
    cache={}
    with pytest.raises(ValueError):materialize_studio_image(source,str(tmp_path/'refused.png'),cache)
    assert not cache


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


def test_vector_glow_and_matte_filter_svgs_materialize_cleanly(tmp_path):
    from urllib.parse import quote
    svg = (
        "<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 100 100'>"
        "<defs><linearGradient id='p'><stop stop-color='#8b5cf6'/><stop offset='1' stop-color='#22d3ee'/></linearGradient>"
        "<filter id='g'><feGaussianBlur stdDeviation='1.4' result='b'/><feMerge><feMergeNode in='b'/><feMergeNode in='SourceGraphic'/></feMerge>"
        "<feColorMatrix type='matrix' values='1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0'/>"
        "<feComponentTransfer><feFuncA type='table' tableValues='0 1'/></feComponentTransfer></filter></defs>"
        "<path d='M 15 15 L 85 15 L 85 85 L 15 85 Z' fill='url(#p)' filter='url(#g)'/></svg>"
    )
    file = materialize_studio_image('data:image/svg+xml;utf8,' + quote(svg), str(tmp_path / 'vec.png'), {})
    image = Image.open(file).convert('RGBA')
    assert image.size == (64, 64)
    assert image.getpixel((32, 32))[3] > 200
