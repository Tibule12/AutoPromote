import subprocess
from pathlib import Path

import numpy as np
from PIL import Image
import unittest
import tempfile

from python_media_worker.studio_text import render_title_asset
from python_media_worker.studio_layer_motion import render_image_layer_motion, _render_pose


def check_wrapped_weighted_title_preserves_outline_background_and_alignment(tmp_path):
    overlay = {"text": "Shared project state\nSecond line", "fontFamily": "Inter", "fontWeight": 900,
               "strokeWidth": 2, "shadow": "strong", "bg": "rgba(7,10,20,0.88)", "textAlign": "right"}
    output = tmp_path/"title.png"
    geometry = render_title_asset(overlay, output, 576, 720)
    assert geometry["lines"] == ["Shared project state", "Second line"]
    pixels = np.asarray(Image.open(output))
    assert pixels[..., 3].max() == 255
    assert pixels[..., 3].min() == 0
    assert (pixels[..., :3] > 240).all(axis=2).sum() > 1000
    assert (pixels[..., 3] == round(.88*255)).sum() > 100
    regular = tmp_path/"regular.png"
    lighter = render_title_asset({**overlay, "fontWeight": 400}, regular, 576, 720)
    assert lighter["width"] < geometry["width"]
    wrapped = {**overlay, "text": "Shared project state", "width": 45}
    canonical = render_title_asset(wrapped, output, 576, 720)
    proxy = render_title_asset(wrapped, regular, 328, 410)
    assert canonical["lines"] == proxy["lines"] == ["Shared", "project", "state"]
    with unittest.TestCase().assertRaisesRegex(ValueError, "choose Inter"):
        render_title_asset({**overlay, "fontFamily": "Impact"}, output, 576, 720)


def check_real_title_compositor_renders_timed_fades_and_keyframe_position(tmp_path):
    overlay = {"type": "text", "text": "Title", "start_time": .2, "duration": .8,
               "x": 30, "y": 50, "fontWeight": 900, "shadow": "none",
               "animation": {"enter": "fade", "exit": "fade", "enterDuration": .2, "exitDuration": .2}}
    asset, output = tmp_path/"asset.png", tmp_path/"title.mov"
    geometry = render_title_asset(overlay, asset, 160, 90)
    overlay.update({k: v for k, v in geometry.items() if k != "lines"})
    layer = {"anchor_x": geometry["anchorX"], "anchor_y": geometry["anchorY"],
             "motion_keyframes": [{"property": "x", "time": .2, "value": 30},
                                  {"property": "x", "time": 1, "value": 70, "easing": "linear"}]}
    receipt = render_image_layer_motion(asset, output, overlay, layer, 160, 90, 1.2, [], fps=10)
    raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(output), "-f", "rawvideo", "-pix_fmt", "rgba", "-"])
    frames = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 90, 160, 4)
    assert receipt["start_time"] == .2
    assert frames[0, ..., 3].max() == 0
    assert frames[2, ..., 3].max() > 180
    assert frames[-1, ..., 3].max() < frames[2, ..., 3].max()
    assert np.where(frames[-1, ..., 3] > 20)[1].mean() > np.where(frames[2, ..., 3] > 20)[1].mean()+20


class StudioTextTests(unittest.TestCase):
    def test_every_importable_title_weight_has_matching_browser_worker_font_and_renders(self):
        import hashlib
        from python_media_worker.studio_text import WEIGHTS
        root = Path(__file__).resolve().parents[1]
        assert set(WEIGHTS) == {400, 600, 800, 900}
        with tempfile.TemporaryDirectory() as temp:
            for weight, name in WEIGHTS.items():
                worker = root / 'python_media_worker/assets/fonts' / f'Inter-{name}.ttf'
                browser = root / 'frontend/src/components/motion/fonts' / worker.name
                assert hashlib.sha256(worker.read_bytes()).digest() == hashlib.sha256(browser.read_bytes()).digest()
                output = Path(temp) / f'{weight}.png'
                geometry = render_title_asset({'text': 'Schedule.', 'fontWeight': weight, 'shadow': 'none'}, output, 1280, 720)
                assert geometry['lines'] == ['Schedule.']
                assert np.asarray(Image.open(output))[..., 3].max() > 200

    def test_large_titles_keep_geometry_with_sharper_glyph_edges(self):
        with tempfile.TemporaryDirectory() as temp:
            results, geometry = [], []
            for density in [1, 4]:
                path = Path(temp)/f"density-{density}.png"
                spec = {"type": "text", "text": "I", "fontWeight": 900, "color": "white", "shadow": "none"}
                box = render_title_asset(spec, path, 1280, 720, raster_scale=density)
                geometry.append(box)
                pose = {"x": 50, "y": 50, "scale": 5, "rotation": 0, "opacity": 1, "crop_x": 0, "crop_y": 0}
                frame = _render_pose(Image.open(path).convert("RGBA"), {**spec, **box},
                    {"anchor_x": box["anchorX"], "anchor_y": box["anchorY"]}, pose, (1280, 720))
                alpha = np.asarray(frame)[..., 3]
                y, x = np.where(alpha > 127)
                row = alpha[(y.min()+y.max())//2]
                results.append(((x.min(), y.min(), x.max(), y.max()), int(((row > 10) & (row < 245)).sum())))
            assert geometry[0] == geometry[1]
            assert max(abs(a-b) for a,b in zip(results[0][0], results[1][0])) <= 1
            assert results[1][1] <= results[0][1]*.5, results

    def test_styled_asset(self):
        with tempfile.TemporaryDirectory() as temp:
            check_wrapped_weighted_title_preserves_outline_background_and_alignment(Path(temp))

    def test_outline_uses_canonical_color_and_preserves_legacy_black(self):
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp)/"outline.png"
            spec = {"text": "LOOP", "fontWeight": 900, "color": "#121215", "shadow": "none", "strokeWidth": 8}
            render_title_asset({**spec, "strokeColor": "#ff5436"}, target, 1280, 720)
            pixels = np.asarray(Image.open(target))
            red = (pixels[..., 0] > 180) & (pixels[..., 1] < 140) & (pixels[..., 2] < 120) & (pixels[..., 3] > 180)
            assert red.sum() > 100
            render_title_asset(spec, target, 1280, 720)
            legacy = np.asarray(Image.open(target))
            assert not ((legacy[..., 0] > 180) & (legacy[..., 1] < 140)).any()

    def test_real_timed_composition(self):
        with tempfile.TemporaryDirectory() as temp:
            check_real_title_compositor_renders_timed_fades_and_keyframe_position(Path(temp))
