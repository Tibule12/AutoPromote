"""Production-handler regressions for zero-valued overlay controls."""
import asyncio
import builtins
import io
import shutil
import subprocess
import tempfile
from pathlib import Path
from unittest.mock import patch

import numpy as np
import pytest
from PIL import Image, ImageDraw
from python_media_worker import main_media_server as worker


def test_high_resolution_graphics_keep_detail_when_small_footage_is_exported_at_720p(tmp_path):
    source, picture, delivery = [tmp_path / name for name in ["small.mp4", "detail.png", "delivered.mp4"]]
    run("-f", "lavfi", "-i", "color=blue:s=320x240:r=24:d=1",
        "-c:v", "libx264", "-threads", "1", "-n", str(source))
    image = Image.new("RGB", (480, 144), "black")
    draw = ImageDraw.Draw(image)
    for x in range(0, 480, 6): draw.rectangle((x, 0, x + 1, 143), fill="white")
    image.save(picture)
    async def ingest(url, destination, **kwargs):
        shutil.copyfile(source, destination); return destination
    def deliver(path):
        shutil.copyfile(path, delivery); return str(delivery)
    request = worker.RenderViralRequest(video_url="test-source", start_time=0, end_time=1,
        smart_crop=False, auto_captions=False, professional_cleanup=False, brand_watermark=False,
        overlays=[worker.ViralOverlay(id="detail", type="image", src="https://test.invalid/detail.png",
                 x=50, y=50, width=50, height=20, mediaFit="stretch", start_time=0, duration=1)],
        composition_plan={"layers": [{"id": "detail", "effects": {"mask": {"enabled": True, "shape": "rectangle"}}}]},
        output_settings={"resolution": "720p", "fps": "24", "codec": "h264", "quality": "high"})
    with patch.object(worker, "materialize_video_input", ingest), patch.object(worker, "upload_file_to_firebase", deliver), \
         patch("urllib.request.urlopen", lambda *args, **kwargs: io.BytesIO(picture.read_bytes())):
        asyncio.run(worker.render_viral_clip(request))
    raw = run("-ss", "0.5", "-i", str(delivery), "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1")
    frame = np.frombuffer(raw, np.uint8).reshape(720, 960, 3)
    assert frame[360, 270:690, 0].std() > 100, "Composition must retain fine graphic contrast rather than upscale a blurred low-res layer"


def run(*args):
    return subprocess.run(["ffmpeg", "-v", "error", *args], check=True,
                          capture_output=True, timeout=60).stdout


def test_unsupported_geometric_video_mask_fails_before_source_ingest():
    request = worker.RenderViralRequest(video_url="test", start_time=0, end_time=1,
        composition_plan={"layers": [{"id": "main-video", "type": "video", "effects": {"mask": {"enabled": True, "feather": 20}}}]})
    with patch.object(worker, "materialize_video_input") as ingest:
        with pytest.raises(worker.HTTPException) as error:
            asyncio.run(worker.render_viral_clip(request))
    assert error.value.status_code == 422
    ingest.assert_not_called()


@pytest.mark.parametrize("interrupted", [False, True])
def test_sequence_render_releases_only_owned_scratch(tmp_path, monkeypatch, interrupted):
    # Exercise real segment/finish FFmpeg stages and the production finally
    # block, including a download interrupted after it has written bytes.
    source = tmp_path / "original.mp4"
    second = tmp_path / "second-original.mp4"
    delivery = tmp_path / "delivered.mp4"
    scratch = tmp_path / "tmp"
    scratch.mkdir()
    sentinel = scratch / "another-job_segment_src_1.mp4"
    sentinel.write_bytes(b"Unrelated job must survive")
    monkeypatch.setattr(worker, "__file__", str(tmp_path / "worker" / "main_media_server.py"))
    run("-f", "lavfi", "-i", "color=blue:s=128x72:r=24:d=1",
        "-c:v", "libx264", "-threads", "1", "-n", str(source))
    run("-f", "lavfi", "-i", "color=red:s=128x72:r=24:d=1",
        "-c:v", "libx264", "-threads", "1", "-n", str(second))
    original = source.read_bytes()
    second_original = second.read_bytes()
    generated = []

    async def ingest(url, destination, **kwargs):
        generated.append(Path(destination))
        shutil.copyfile(second if url == "second" else source, destination)
        if interrupted and url == "second":
            raise RuntimeError("Second sequence download interrupted")
        return destination

    def deliver(path):
        shutil.copyfile(path, delivery)
        return str(delivery)

    request = worker.RenderViralRequest(video_url="main", start_time=0, end_time=0.75,
        smart_crop=False, auto_captions=False, professional_cleanup=False, brand_watermark=False,
        finish_plan={"contrast": 1.1},
        output_settings={"resolution": "source", "fps": "24", "codec": "h264", "quality": "high"},
        timeline_segments=[worker.ViralTimelineSegment(url=name, start_time=0, end_time=0.25)
                           for name in ["first", "second", "first"]])
    with patch.object(worker, "materialize_video_input", ingest), \
         patch.object(worker, "upload_file_to_firebase", side_effect=deliver) as upload:
        if interrupted:
            with pytest.raises(worker.HTTPException, match="Second sequence download interrupted"):
                asyncio.run(worker.render_viral_clip_impl(request))
            upload.assert_not_called()
        else:
            result = asyncio.run(worker.render_viral_clip_impl(request))
            assert result["status"] == "completed"
            assert delivery.is_file() and Path(result["output_path"]).is_file()
            pixels = run("-i", str(delivery), "-map", "0:v:0", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1")
            # Independently declared original source size; do not accept the
            # general helper's 320px floor as though it were source geometry.
            width, height = 128, 72
            assert len(pixels) == 18 * width * height * 3
            frames = np.frombuffer(pixels, np.uint8).reshape(18, height, width, 3)
            for index, channel in [(3, 2), (9, 0), (15, 2)]:
                assert frames[index, height // 2, width // 2, channel] > 200
    assert len(generated) == 3
    assert all(not path.exists() for path in generated)
    assert not list(scratch.glob("*_segment_v_*.mp4"))
    assert not list(scratch.glob("*_segment_a_*.m4a"))
    assert not list(scratch.glob("*_finish.mp4"))
    assert not list(scratch.glob("*_concat.txt"))
    assert sentinel.read_bytes() == b"Unrelated job must survive"
    assert source.read_bytes() == original
    assert second.read_bytes() == second_original


@pytest.mark.parametrize("kind", ["image", "video"])
def test_missing_media_source_is_rejected_before_ingestion(kind):
    request = worker.RenderViralRequest(video_url="test-source", start_time=0, end_time=1,
        auto_captions=False, overlays=[worker.ViralOverlay(id="missing-layer", type=kind, src=" ", x=50, y=50)])
    with patch.object(worker, "materialize_video_input") as ingest, \
         patch.object(worker, "upload_file_to_firebase") as deliver:
        with pytest.raises(worker.HTTPException) as error:
            asyncio.run(worker.render_viral_clip(request))
    assert error.value.status_code == 400
    assert "missing-layer" in error.value.detail
    ingest.assert_not_called()
    deliver.assert_not_called()


@pytest.mark.parametrize("kind", ["image", "video"])
def test_unavailable_media_stops_export_and_cleans_intermediates(kind):
    with tempfile.TemporaryDirectory(prefix="studio-missing-media-") as temp:
        source = Path(temp) / "source.mp4"
        run("-f", "lavfi", "-i", "color=blue:s=320x240:r=10:d=1",
            "-c:v", "libx264", "-threads", "1", "-n", str(source))
        request = worker.RenderViralRequest(video_url="test-source", start_time=0, end_time=1,
            smart_crop=False, auto_captions=False, professional_cleanup=False, brand_watermark=False,
            overlays=[worker.ViralOverlay(id="unavailable-layer", type=kind, src="https://test.invalid/missing.png", x=50, y=50)])
        generated = []

        async def ingest(url, destination, **kwargs):
            generated.append(Path(destination))
            shutil.copyfile(source, destination)
            if url != "test-source":
                raise RuntimeError("Media download interrupted")
            return destination

        class InterruptedImage:
            def __enter__(self):
                self.sent = False
                return self

            def __exit__(self, *args):
                return False

            def read(self, size):
                if self.sent:
                    raise RuntimeError("Media download interrupted")
                self.sent = True
                return source.read_bytes()

        original_open = builtins.open

        def track_image_write(path, mode="r", *args, **kwargs):
            if "w" in mode and "_img_" in str(path) and Path(path) not in generated:
                generated.append(Path(path))
            return original_open(path, mode, *args, **kwargs)

        with patch.object(worker, "materialize_video_input", ingest), \
             patch("urllib.request.urlopen", side_effect=lambda *args, **kwargs: InterruptedImage()), \
             patch("builtins.open", side_effect=track_image_write), \
             patch.object(worker, "upload_file_to_firebase") as deliver:
            with pytest.raises(worker.HTTPException) as error:
                asyncio.run(worker.render_viral_clip(request))
        assert error.value.status_code == 500
        assert "export stopped" in error.value.detail if kind == "image" else "interrupted" in error.value.detail
        deliver.assert_not_called()
        assert len(generated) == 2
        assert all(not path.exists() for path in generated)
        assert source.exists()


@pytest.mark.parametrize("opacity,volume", [(0, 0), (1, 0.7), (0, 0.7), (1, 0)])
def test_overlay_zero_values_survive_real_render(opacity, volume):
    with tempfile.TemporaryDirectory(prefix="studio-overlay-zero-") as temp:
        directory = Path(temp)
        source, overlay, delivery = [directory / name for name in ["source.mp4", "overlay.mp4", "delivery.mp4"]]
        run("-f", "lavfi", "-i", "color=blue:s=320x240:r=10:d=1",
            "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
            "-t", "1", "-c:v", "libx264", "-threads", "1", "-c:a", "aac", "-n", str(source))
        run("-f", "lavfi", "-i", "color=red:s=320x240:r=10:d=1",
            "-f", "lavfi", "-i", "sine=frequency=880:sample_rate=48000:duration=1",
            "-c:v", "libx264", "-threads", "1", "-c:a", "aac", "-n", str(overlay))
        request = worker.RenderViralRequest(video_url="test-source", start_time=0, end_time=1,
            smart_crop=False, auto_captions=False, professional_cleanup=False, brand_watermark=False,
            output_settings={"resolution": "source", "fps": "30", "codec": "h264", "quality": "high"},
            overlays=[worker.ViralOverlay(id="overlay", type="video", src="test-overlay", x=50, y=50,
                width=50, height=50, start_time=0, duration=1, frameShape="edge", opacity=opacity,
                useOverlayAudio=True, overlayAudioVolume=volume)])

        async def ingest(url, destination, **kwargs):
            assert url in {"test-source", "test-overlay"}, url
            shutil.copyfile(source if url == "test-source" else overlay, destination)
            return destination

        def deliver(path):
            shutil.copyfile(path, delivery)
            return str(delivery)

        with patch.object(worker, "materialize_video_input", ingest), \
             patch.object(worker, "upload_file_to_firebase", deliver):
            result = asyncio.run(worker.render_viral_clip(request))
        assert result["status"] == "completed"
        raw = run("-ss", "0.5", "-i", str(delivery), "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1")
        pixels = np.frombuffer(raw, np.uint8).reshape(240, 320, 3)
        red, _, blue = pixels[120, 160]
        assert (blue > 200 and red < 30) if opacity == 0 else (red > 200 and blue < 30)
        pcm = np.frombuffer(run("-i", str(delivery), "-vn", "-ac", "1", "-ar", "48000",
                               "-f", "f32le", "pipe:1"), "<f4")
        rms = np.sqrt(np.mean(pcm**2))
        assert rms < 0.00001 if volume == 0 else rms > 0.02


@pytest.mark.parametrize("behavior,speed", [("return", 1), ("loop", 1), ("hold", 1), ("loop", 1.25), ("loop", "ramp")])
def test_broll_source_trim_late_cue_and_end_behavior(behavior, speed):
    with tempfile.TemporaryDirectory(prefix="studio-broll-cue-") as temp:
        directory = Path(temp)
        source, overlay, delivery = [directory / name for name in ["source.mp4", "overlay.mp4", "delivery.mp4"]]
        run("-f", "lavfi", "-i", "color=blue:s=320x240:r=20:d=4",
            "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", "4",
            "-c:v", "libx264", "-threads", "1", "-c:a", "aac", "-n", str(source))
        run("-f", "lavfi", "-i", "color=red:s=320x240:r=20:d=2,drawbox=color=lime:t=fill:enable='gte(t,1)'",
            "-f", "lavfi", "-i", "sine=frequency=880:sample_rate=48000:duration=2",
            "-c:v", "libx264", "-threads", "1", "-c:a", "aac", "-n", str(overlay))
        request = worker.RenderViralRequest(video_url="test-source", start_time=0, end_time=4,
            smart_crop=False, auto_captions=False, professional_cleanup=False, brand_watermark=False,
            preview_speed=1 if speed == "ramp" else speed,
            speed_segments=([{"start_time": 0, "end_time": 1, "rate": 1},
                             {"start_time": 1, "end_time": 4, "rate": 2}] if speed == "ramp" else []),
            output_settings={"resolution": "source", "fps": "30", "codec": "h264", "quality": "high"},
            overlays=[worker.ViralOverlay(id="overlay", type="video", src="test-overlay", x=50, y=50,
                width=50, height=50, start_time=.5, duration=3, frameShape="edge",
                sourceStartTime=.5, sourceEndBehavior=behavior, useOverlayAudio=True)])

        async def ingest(url, destination, **kwargs):
            assert url in {"test-source", "test-overlay"}
            shutil.copyfile(source if url == "test-source" else overlay, destination)
            return destination

        def deliver(path):
            shutil.copyfile(path, delivery)
            return str(delivery)

        with patch.object(worker, "materialize_video_input", ingest), \
             patch.object(worker, "upload_file_to_firebase", deliver):
            result = asyncio.run(worker.render_viral_clip(request))
        def output_time(time):
            return (time if time <= 1 else 1+(time-1)/2) if speed == "ramp" else time/speed
        assert abs(result["duration"] - output_time(4)) < .1
        checks = [(.2, 2), (.65, 0), (1.25, 1), (2.15, {"return": 2, "loop": 0, "hold": 1}[behavior]), (3.7, 2)]
        for time, color in checks:
            raw = run("-ss", str(output_time(time)), "-i", str(delivery), "-frames:v", "1",
                      "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1")
            pixel = np.frombuffer(raw, np.uint8).reshape(240, 320, 3)[120, 160]
            assert pixel[color] > 200, (behavior, speed, time, pixel)
        pcm = np.frombuffer(run("-i", str(delivery), "-vn", "-ac", "1", "-ar", "48000",
                               "-f", "f32le", "pipe:1"), "<f4")
        for start, end, audible in [(.05, .3, False), (.8, 1.5, True), (2.2, 2.6, behavior == "loop"), (3.7, 3.9, False)]:
            samples = pcm[int(output_time(start)*48000):int(output_time(end)*48000)]
            rms = np.sqrt(np.mean(samples**2))
            assert (rms > .02) if audible else (rms < .001), (behavior, start, rms)


@pytest.mark.parametrize("front", ["video", "image", "text"])
def test_mixed_media_layer_order_is_not_replaced_by_media_type(front):
    with tempfile.TemporaryDirectory(prefix="studio-stack-") as temp:
        directory = Path(temp)
        source, video, picture, delivery = [directory/name for name in ["source.mp4", "video.mp4", "image.png", "delivery.mp4"]]
        run("-f", "lavfi", "-i", "color=blue:s=320x240:r=10:d=1",
            "-c:v", "libx264", "-threads", "1", "-n", str(source))
        run("-f", "lavfi", "-i", "color=red:s=320x240:r=10:d=1",
            "-c:v", "libx264", "-threads", "1", "-n", str(video))
        run("-f", "lavfi", "-i", "color=lime:s=160x120", "-frames:v", "1", "-threads", "1", "-n", str(picture))
        layers = [worker.ViralOverlay(id=kind, type=kind, src=f"https://test.invalid/{kind}.png" if kind == "image" else "test-video",
            text="██████████████", color="white", bg="white", x=50, y=50, width=50, height=50,
            frameShape="edge", start_time=0, duration=1) for kind in ["text", "image", "video"]]
        layers.sort(key=lambda layer: layer.id == front)
        request = worker.RenderViralRequest(video_url="test-source", start_time=0, end_time=1,
            smart_crop=False, auto_captions=False, professional_cleanup=False, brand_watermark=False,
            overlays=layers, output_settings={"resolution": "source", "fps": "30"},
            timeline_segments=[worker.ViralTimelineSegment(url="test-source", start_time=0, end_time=1)])
        async def ingest(url, destination, **kwargs):
            assert url in {"test-source", "test-video"}
            shutil.copyfile(source if url == "test-source" else video, destination)
            return destination
        def download(url, timeout):
            assert url == "https://test.invalid/image.png"
            assert timeout == 30
            return io.BytesIO(picture.read_bytes())
        def deliver(path):
            shutil.copyfile(path, delivery)
            return str(delivery)
        with patch.object(worker, "materialize_video_input", ingest), patch.object(worker, "upload_file_to_firebase", deliver), \
             patch("urllib.request.urlopen", download):
            asyncio.run(worker.render_viral_clip(request))
        raw = run("-ss", "0.5", "-i", str(delivery), "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1")
        red, green, blue = np.frombuffer(raw, np.uint8).reshape(240, 320, 3)[120, 160]
        assert {"video": red > 200 and green < 30, "image": green > 200 and red < 30,
                "text": red > 200 and green > 200 and blue > 200}[front], (front, red, green, blue)
