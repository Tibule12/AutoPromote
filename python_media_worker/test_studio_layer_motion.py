import json
from pathlib import Path
import subprocess
import tempfile

import numpy as np
import pytest
from PIL import Image, ImageDraw

from python_media_worker.studio_layer_motion import (
    composition_layer,
    interpolate_layer_value,
    layer_clip_mask,
    layer_pose,
    _render_pose,
    render_image_layer_motion,
    render_video_layer_motion,
)


def test_moving_video_uses_canonical_position_scale_opacity_and_changing_source_frames(tmp_path):
    source, output = tmp_path / "moving.mov", tmp_path / "motion.mov"
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y",
        "-f", "lavfi", "-i", "color=c=red:s=16x16:r=10:d=0.3",
        "-f", "lavfi", "-i", "color=c=blue:s=16x16:r=10:d=0.3",
        "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0[v]", "-map", "[v]",
        "-c:v", "qtrle", str(source)], check=True)
    original = source.read_bytes()
    overlay = {"type": "video", "start_time": 0, "duration": .6,
        "width": 40, "height": 40, "frameShape": "edge", "mediaFit": "contain"}
    layer = {"motion_keyframes": [
        {"property": prop, "time": time, "value": value, "easing": "linear"}
        for prop, pairs in [("x", [(0, 25), (.4, 75)]),
                            ("scale", [(0, 1), (.4, .5)]),
                            ("opacity", [(0, 1), (.3, 1), (.5, 0)])]
        for time, value in pairs]}
    receipt = render_video_layer_motion(source, output, overlay, layer, 160, 100, .6, [], fps=10)
    raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(output),
        "-f", "rawvideo", "-pix_fmt", "rgba", "-"])
    frames = np.frombuffer(raw, np.uint8).reshape(-1, 100, 160, 4)
    assert len(frames) == 6 and receipt["duration"] == .6
    first, later = frames[0, ..., 3] > 20, frames[3, ..., 3] > 20
    assert np.where(later)[1].mean() > np.where(first)[1].mean() + 45
    assert later.sum() < first.sum() * .6
    assert frames[0, ..., 0][first].mean() > 200
    assert frames[3, ..., 2][later].mean() > 200, "Video must keep changing, not animate a frozen poster"
    assert frames[-1, ..., 3].max() == 0, "Canonical opacity must reveal the underlying timeline"
    assert source.read_bytes() == original


def test_video_layer_maps_its_cue_and_pose_to_the_retained_speed_clock(tmp_path):
    source, output = tmp_path / "prepared.mov", tmp_path / "motion.mov"
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i",
        "color=c=white:s=16x16:r=10:d=0.3", "-c:v", "qtrle", str(source)], check=True)
    receipt = render_video_layer_motion(source, output,
        {"type": "video", "start_time": .5, "duration": .5, "width": 20, "height": 20},
        {"motion_keyframes": [{"property": "opacity", "time": .5, "value": .5}]},
        80, 80, .75, [{"start_time": 0, "end_time": 1.5, "rate": 2}], fps=10)
    assert receipt["start_time"] == .25 and receipt["duration"] == .25
    raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(output),
        "-f", "rawvideo", "-pix_fmt", "rgba", "-"])
    assert np.frombuffer(raw, np.uint8).reshape(-1, 80, 80, 4)[..., 3].max() == 128


def test_video_layer_refuses_a_prepared_source_that_ends_far_before_the_clip(tmp_path):
    source, output = tmp_path / "short.mov", tmp_path / "motion.mov"
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i",
        "color=c=white:s=16x16:r=10:d=0.2", "-c:v", "qtrle", str(source)], check=True)
    with pytest.raises(RuntimeError, match="ended before"):
        render_video_layer_motion(source, output,
            {"type": "video", "start_time": 0, "duration": 1}, {}, 80, 80, 1, [], fps=10)


def test_geometric_masks_use_layer_box_and_native_shape_precedence():
    ellipse = np.asarray(layer_clip_mask((100, 100), {"enabled": True, "shape": "ellipse"}, 45, 45))
    assert ellipse[50, 50] == 255 and ellipse[0, 50] == 0 and ellipse[50, 0] == 0
    assert ellipse[50, 10] == 255, "Ellipse uses its own native path rather than rectangular crop"
    polygon = np.asarray(layer_clip_mask((100, 100), {"enabled": True, "shape": "polygon"}))
    assert polygon[5, 5] == 0 and polygon[50, 50] == 255 and polygon[95, 10] == 0
    custom = np.asarray(layer_clip_mask((100, 100), {"enabled": True, "shape": "polygon", "path": "polygon(0% 0%, 100% 0%, 0% 100%)"}))
    assert custom[10, 10] == 255 and custom[90, 90] == 0


def test_soft_mask_feathers_only_alpha_and_inversion_is_its_exact_complement():
    settings = {"enabled": True, "shape": "ellipse", "feather": 10}
    soft = np.asarray(layer_clip_mask((100, 100), settings))
    inverse = np.asarray(layer_clip_mask((100, 100), {**settings, "inverted": True}))
    assert soft[50, 50] > 250 and 30 < soft[50, 2] < 180
    assert np.all(soft.astype(int) + inverse.astype(int) == 255)
    sharper = np.asarray(layer_clip_mask((100, 100), settings, feather_scale=.5))
    assert sharper[50, 10] > soft[50, 10], "Sigma scales with programme/layer geometry"


def test_rectangle_zero_radius_preserves_square_corners_and_inverse_coverage():
    settings = {"enabled": True, "shape": "rectangle", "radius": 0}
    square = np.asarray(layer_clip_mask((100, 100), settings))
    assert square[0, 0] == 255 and square[-1, -1] == 255
    rounded = np.asarray(layer_clip_mask((100, 100), {**settings, "radius": 6}))
    assert rounded[0, 0] <= 1  # antialiasing may retain one alpha code value
    inverse = np.asarray(layer_clip_mask((100, 100), {**settings, "feather": 8, "inverted": True}))
    soft = np.asarray(layer_clip_mask((100, 100), {**settings, "feather": 8}))
    assert np.all(soft.astype(int) + inverse.astype(int) == 255)


def test_inverted_feathered_image_renders_a_hole_and_keeps_native_corner_rounding():
    overlay = {"type": "image", "width": 100, "height": 100, "mediaFit": "stretch"}
    layer = {"effects": {"mask": {"enabled": True, "shape": "ellipse", "inverted": True, "feather": 10}}}
    frame = np.asarray(_render_pose(Image.new("RGBA", (100, 100), "magenta"), overlay, layer, layer_pose(layer, overlay, 0), (100, 100)))
    assert frame[50, 50, 3] == 0
    assert frame[5, 50, 3] > 0 and frame[0, 0, 3] == 0
    assert np.all(frame[frame[..., 3] > 0, :3] == (255, 0, 255)), "Feather changes alpha rather than smearing artwork"


def test_blurred_transparent_artwork_preserves_color_at_partial_alpha():
    # CSS blur filters premultiplied color. Filtering straight RGBA multiplies
    # edge color by coverage twice when it is composited over the footage.
    asset = Image.new("RGBA", (100, 100))
    ImageDraw.Draw(asset).rectangle((25, 25, 74, 74), fill="magenta")
    overlay = {"type": "image", "width": 100, "height": 100,
               "mediaFit": "stretch", "frameShape": "edge"}
    layer = {"effects": {"blur": 12}}
    frame = np.asarray(_render_pose(asset, overlay, layer, layer_pose(layer, overlay, 0), (100, 100)))
    edge = (frame[..., 3] >= 32) & (frame[..., 3] <= 224)
    assert edge.sum() > 100
    assert np.all(frame[edge, :3] == (255, 0, 255)), "Transparent pixels must not add a dark fringe"
    on_white = Image.new("RGBA", (100, 100), "white")
    on_white.alpha_composite(Image.fromarray(frame))
    assert np.all(np.asarray(on_white)[edge][:, [0, 2]] == 255)


@pytest.mark.parametrize("effects", [
    {"blur": 12},
    {"shadow": {"enabled": True, "x": 20, "y": 12, "blur": 8, "opacity": .8}},
    {"glow": {"enabled": True, "radius": 16, "intensity": .7}},
    {"blur": 8, "shadow": {"enabled": True, "x": 20, "y": 12, "blur": 8, "opacity": .8},
     "glow": {"enabled": True, "radius": 16, "intensity": .7}},
])
def test_image_effects_keep_the_same_coverage_when_delivery_resolution_doubles(effects):
    asset = Image.new("RGBA", (100, 100))
    ImageDraw.Draw(asset).rectangle((25, 25, 74, 74), fill="magenta")
    overlay = {"type": "image", "width": 40, "height": 40,
               "mediaFit": "stretch", "frameShape": "edge"}
    layer = {"effects": effects}
    pose = layer_pose(layer, overlay, 0)
    standard = _render_pose(asset, overlay, layer, pose, (720, 720))
    doubled = _render_pose(asset, overlay, layer, pose, (1440, 1440)).resize((720, 720), Image.Resampling.LANCZOS)
    a = np.asarray(standard.getchannel("A"), dtype=float) / 255
    b = np.asarray(doubled.getchannel("A"), dtype=float) / 255
    edge = (a > .05) & (a < .95)
    assert np.sqrt(np.mean((a[edge] - b[edge]) ** 2)) < .02


def test_crop_interpolates_canonical_camel_case_keys_on_edit_clock():
    layer = {"base_transform": {"crop_x": 5, "crop_y": 10}, "motion_keyframes": [
        {"property": "cropX", "time": 0, "value": 0},
        {"property": "cropX", "time": 2, "value": 40, "easing": "linear"},
    ]}
    assert layer_pose(layer, {}, 1)["crop_x"] == 20
    assert layer_pose(layer, {}, 1)["crop_y"] == 10
    frame = _render_pose(Image.new("RGBA", (20, 20), "white"), {"width": 50, "height": 50}, layer, layer_pose(layer, {}, 1), (200, 100))
    alpha = np.asarray(frame)[..., 3]
    assert alpha[50, 55] == 0 and alpha[50, 100] == 255 and alpha[50, 145] == 0


def test_mask_clips_effect_group_before_rotation_and_contains_letterbox():
    asset = Image.new("RGBA", (40, 20), "white")
    layer = {"effects": {"mask": {"enabled": True, "shape": "ellipse"},
                         "shadow": {"enabled": True, "x": 20, "blur": 0, "opacity": 1}}}
    overlay = {"width": 50, "height": 50, "mediaFit": "contain"}
    frame = np.asarray(_render_pose(asset, overlay, layer, layer_pose(layer, overlay, 0), (100, 100)))
    assert frame[50, 50, 3] == 255 and frame[50, 80, 3] == 0, "The mask clips the offset shadow too"
    assert frame[27, 50, 3] == 0, "Contain stays centered within the layer box"
    rotated = _render_pose(asset, overlay, layer, {**layer_pose(layer, overlay, 0), "rotation": 90}, (100, 100))
    assert np.asarray(rotated)[50, 27, 3] == 0


def test_real_crop_movie_follows_retimed_output_clock(tmp_path):
    source, output = tmp_path / "crop.png", tmp_path / "crop.mov"
    Image.new("RGBA", (100, 100), "white").save(source)
    overlay = {"start_time": 0, "duration": 2, "width": 100, "height": 100}
    layer = {"base_transform": {"x": 50, "y": 50}, "motion_keyframes": [
        {"property": "cropX", "time": 0, "value": 0},
        {"property": "cropX", "time": 2, "value": 40, "easing": "linear"},
    ]}
    render_image_layer_motion(source, output, overlay, layer, 100, 100, 1,
                              [{"start_time": 0, "end_time": 2, "rate": 2}], fps=4)
    raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(output), "-f", "rawvideo", "-pix_fmt", "rgba", "-"])
    frames = np.frombuffer(raw, dtype=np.uint8).reshape(4, 100, 100, 4)
    assert frames[0, 50, 5, 3] == 255
    assert frames[2, 50, 15, 3] == 0 and frames[2, 50, 25, 3] == 255


def test_title_masks_use_layout_box_excluding_shadow_asset_padding(tmp_path):
    from python_media_worker.studio_text import render_title_asset
    source = tmp_path / "title.png"
    geometry = render_title_asset({"text": "MASK", "bg": "#ff00ff", "color": "#ff00ff", "shadow": "none"}, source, 720, 720)
    asset = Image.open(source).convert("RGBA")
    clip_box = geometry["clipBox"]
    raster_width = round(asset.width * clip_box["width"])
    raster_height = round(asset.height * clip_box["height"])
    assert asset.width > raster_width and asset.height > raster_height
    # The title asset is supersampled. Expected output bounds use its declared
    # programme-space dimensions, not its higher-density PNG pixel dimensions.
    content_width = round(720 * geometry["width"] / 100 * clip_box["width"])
    content_height = round(720 * geometry["height"] / 100 * clip_box["height"])
    # Probe the declared layout box, rather than assuming four glyphs or their
    # text background fill its entire width. Keep the actual asset padding and
    # the same one-pixel mask/anchor assertions below.
    left, top = round(asset.width * clip_box["x"]), round(asset.height * clip_box["y"])
    ImageDraw.Draw(asset).rectangle((left, top, left + raster_width - 1, top + raster_height - 1),
                                   fill=(255, 0, 255, 255))
    overlay = {**geometry, "type": "text", "mediaFit": "stretch"}
    layer = {"anchor_x": geometry["anchorX"], "anchor_y": geometry["anchorY"],
             "clip_box": clip_box, "base_transform": {"x": 50, "y": 50, "crop_x": 25}}
    frame = np.asarray(_render_pose(asset, overlay, layer, layer_pose(layer, overlay, 0), (720, 720)))
    ys, xs = np.where(frame[..., 3] > 200)
    assert abs(xs.min() - (360 - content_width * .25)) <= 1
    assert abs(xs.max() + 1 - (360 + content_width * .25)) <= 1
    assert abs(ys.min() - (360 - content_height / 2)) <= 1


def test_composition_layer_and_custom_curve_interpolation():
    layer = {
        "id": "logo",
        "base_transform": {"x": 50},
        "motion_keyframes": [
            {"property": "x", "time": 0, "value": 10},
            {"property": "x", "time": 1, "value": 90, "easing": "bezier", "curve": [.1, 0, .2, 1]},
        ],
    }
    assert composition_layer({"layers": [layer]}, "logo") is layer
    assert interpolate_layer_value(layer, "x", 0, 50) == 10
    assert interpolate_layer_value(layer, "x", 1, 50) == 90
    assert interpolate_layer_value(layer, "x", .5, 50) > 70


def test_real_logo_layer_render_preserves_alpha_and_moves_across_canvas():
    with tempfile.TemporaryDirectory() as temp:
        source, output = Path(temp) / "logo.png", Path(temp) / "motion.mov"
        logo = Image.new("RGBA", (80, 40))
        draw = ImageDraw.Draw(logo)
        draw.rounded_rectangle((2, 2, 77, 37), radius=8, fill="#7c3aed")
        draw.polygon([(18, 32), (31, 8), (41, 8), (54, 32), (44, 32), (36, 17), (28, 32)], fill="white")
        logo.save(source)
        overlay = {
            "id": "logo", "start_time": 0, "duration": 1, "x": 20, "y": 50,
            "width": 32, "height": 24, "mediaFit": "contain", "opacity": 1,
        }
        layer = {
            "id": "logo",
            "base_transform": {"x": 20, "y": 50, "scale": 1, "rotation": 0, "opacity": 1},
            "anchor_x": 50,
            "anchor_y": 50,
            "effects": {
                "glow": {"enabled": True, "color": "#8b5cf6", "radius": 4, "intensity": .5},
                "motion_blur": {"enabled": True, "samples": 3, "shutter": .5},
            },
            "motion_keyframes": [
                {"property": "x", "time": 0, "value": 20},
                {"property": "x", "time": 1, "value": 80, "easing": "ease_in_out"},
                {"property": "rotation", "time": 0, "value": -12},
                {"property": "rotation", "time": 1, "value": 12, "easing": "ease_in_out"},
            ],
        }
        receipt = render_image_layer_motion(
            source, output, overlay, layer, 160, 90, 1,
            [{"start_time": 0, "end_time": 1, "rate": 1}], fps=10,
        )
        assert receipt["duration"] == 1
        info = json.loads(subprocess.check_output([
            "ffprobe", "-v", "error", "-show_streams", "-of", "json", str(output),
        ]))
        assert info["streams"][0]["pix_fmt"] == "argb"
        raw = subprocess.check_output([
            "ffmpeg", "-v", "error", "-i", str(output), "-f", "rawvideo", "-pix_fmt", "rgba", "-",
        ])
        frames = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 90, 160, 4)
        assert frames[:, :, :, 3].max() == 255
        first_x = np.where(frames[0, :, :, 3] > 20)[1].mean()
        last_x = np.where(frames[-1, :, :, 3] > 20)[1].mean()
        assert last_x > first_x + 50


def test_layer_render_uses_identity_clock_without_speed_segments():
    with tempfile.TemporaryDirectory() as temp:
        source, output = Path(temp) / "logo.png", Path(temp) / "motion.mov"
        Image.new("RGBA", (16, 16), "white").save(source)
        receipt = render_image_layer_motion(
            source,
            output,
            {"start_time": .25, "duration": .5, "width": 10, "height": 10},
            {"base_transform": {"x": 50, "y": 50, "scale": 1, "opacity": 1}},
            64,
            64,
            1,
            [],
            fps=10,
        )
        assert receipt["start_time"] == .25
        assert receipt["duration"] == .5
        assert output.exists()


def test_fullscreen_image_covers_stage_despite_inactive_pip_keys_and_retains_opacity():
    with tempfile.TemporaryDirectory() as temp:
        source, output = Path(temp) / "shot.png", Path(temp) / "full.mov"
        Image.new("RGBA", (32, 64), (3, 120, 230, 255)).save(source)
        overlay = {"start_time": 0, "duration": .2, "bRollMode": "fullscreen",
                   "width": 20, "height": 10, "mediaFit": "contain"}
        layer = {"anchor_x": 0, "anchor_y": 100,
                 "base_transform": {"x": 10, "y": 20, "rotation": 45, "scale": .25},
                 "motion_keyframes": [{"property": "x", "time": 0, "value": 80},
                                      {"property": "opacity", "time": 0, "value": .5}]}
        render_image_layer_motion(source, output, overlay, layer, 160, 90, .2, [], fps=10)
        raw = subprocess.check_output([
            "ffmpeg", "-v", "error", "-i", str(output), "-f", "rawvideo", "-pix_fmt", "rgba", "-",
        ])
        frames = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 90, 160, 4)
        assert len(frames) == 2
        assert np.all(frames[..., 3] == 128), "Full-stage coverage and authored opacity must survive"
        assert np.all(frames[..., :3] == (3, 120, 230))


def test_real_effect_layer_fades_as_one_group_including_shadow_and_glow(tmp_path):
    source, output = tmp_path / "subject.png", tmp_path / "fade.mov"
    Image.new("RGBA", (16, 16), "white").save(source)
    overlay = {"start_time": 0, "duration": 1, "width": 25, "height": 25}
    layer = {
        "base_transform": {"x": 50, "y": 50, "scale": 1},
        "effects": {
            "shadow": {"enabled": True, "x": 8, "y": 0, "blur": 0, "opacity": .55},
            "glow": {"enabled": True, "radius": 4, "intensity": .5},
        },
        "motion_keyframes": [
            {"property": "opacity", "time": 0, "value": 0},
            {"property": "opacity", "time": 1, "value": 1, "easing": "linear"},
        ],
    }
    render_image_layer_motion(source, output, overlay, layer, 64, 64, 1, [], fps=4)
    raw = subprocess.check_output([
        "ffmpeg", "-v", "error", "-i", str(output), "-f", "rawvideo", "-pix_fmt", "rgba", "-",
    ])
    frames = np.frombuffer(raw, dtype=np.uint8).reshape(4, 64, 64, 4)
    assert frames[0, ..., 3].max() == 0, "An invisible layer must not leave its effects visible"
    assert frames[2, ..., 3].max() == 128, "Opacity belongs to the complete filtered group"
    shadow_alpha = frames[2, 32, 46, 3]
    # This pixel includes the soft glow as well as the offset shadow. Its
    # combined alpha must remain below the half-opacity opaque artwork.
    assert 0 < shadow_alpha < 128, "Offset effects must fade with their parent group"
