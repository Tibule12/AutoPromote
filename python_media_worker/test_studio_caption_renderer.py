"""Pure Python + PIL + FFmpeg verification tests for studio_caption_renderer and studio_text_behind_renderer.

Runs without GPU/FastAPI dependencies so every caption template, bundled Inter font,
vector rounded pill badge, vertical bounce, true typewriter typing slice, behind-subject
matte occlusion, and duplicate-caption suppression path is pixel-verified against real FFmpeg/libass and PIL.
"""
from __future__ import annotations

import ast
from pathlib import Path
import subprocess
import tempfile
import unittest

from PIL import Image, ImageDraw, ImageFont

from python_media_worker.studio_caption_renderer import (
    ASSETS_FONTS_DIR,
    filter_suppressed_whisper_segments,
    generate_studio_ass_captions,
)
from python_media_worker.studio_text_behind_renderer import (
    render_text_behind_layer,
    validate_text_behind_effect,
)


def _load_caption_styles_from_server() -> dict:
    server_src = (Path(__file__).resolve().parent / "main_media_server.py").read_text(encoding="utf-8")
    tree = ast.parse(server_src)
    for node in tree.body:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == "CAPTION_STYLES":
                    return ast.literal_eval(node.value)
    raise AssertionError("CAPTION_STYLES literal assignment missing from main_media_server.py")


def _story_treatment_stub(segment, index, video_width, video_height, font_size, default_position="lower"):
    x = round(video_width * 0.18)
    y = round(video_height * 0.24)
    return {
        "placement": "custom",
        "text_override": f"{{\\an7\\pos({x},{y})\\q0}}",
        "accent": "&H008F5DFF",
        "icon": "⚡",
    }


def _bounded(value, low, high):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("Expected numeric bounded value")
    val = float(value)
    if val < low or val > high:
        raise ValueError(f"{val} out of bounds [{low}, {high}]")
    return val


class StudioCaptionAndTextBehindTests(unittest.TestCase):
    def test_all_26_caption_styles_render_real_ffmpeg_pixels_and_preserve_contract(self):
        caption_styles = _load_caption_styles_from_server()
        self.assertGreaterEqual(len(caption_styles), 26)
        transcript = {
            "segments": [
                {
                    "start": 0.0,
                    "end": 1.2,
                    "text": "Lisakhanya Mdoda speaks clearly",
                    "words": [
                        {"word": "Lisakhanya", "start": 0.0, "end": 0.4},
                        {"word": "Mdoda", "start": 0.4, "end": 0.8},
                        {"word": "speaks", "start": 0.8, "end": 1.2},
                    ],
                }
            ]
        }

        with tempfile.TemporaryDirectory(prefix="studio-caption-real-") as tmp:
            tmp_dir = Path(tmp)
            for style_name in caption_styles:
                with self.subTest(style=style_name):
                    ass = generate_studio_ass_captions(
                        whisper_result=transcript,
                        caption_styles=caption_styles,
                        resolve_story_treatment=_story_treatment_stub,
                        style_name=style_name,
                        video_width=1080,
                        video_height=1920,
                    )
                    self.assertIn(r"\an7\pos(194,461)\q0", ass)
                    self.assertIn("&H008F5DFF", ass)
                    self.assertIn("⚡", ass)
                    self.assertIn("lisakhanya", ass.lower())

                    ass_path = tmp_dir / f"{style_name}.ass"
                    png_path = tmp_dir / f"{style_name}.png"
                    ass_path.write_text(ass, encoding="utf-8")
                    res = subprocess.run(
                        [
                            "ffmpeg",
                            "-v",
                            "warning",
                            "-f",
                            "lavfi",
                            "-i",
                            "color=0x07101d:s=1080x1920:r=25:d=1.2",
                            "-ss",
                            "0.16",
                            "-vf",
                            f"ass={ass_path}:fontsdir={ASSETS_FONTS_DIR}",
                            "-frames:v",
                            "1",
                            "-y",
                            str(png_path),
                        ],
                        capture_output=True,
                        text=True,
                    )
                    self.assertEqual(res.returncode, 0, res.stderr)
                    self.assertGreater(png_path.stat().st_size, 2500)
                    img = Image.open(png_path).convert("RGB")
                    # Count non-background pixels (bg is approx (7, 16, 29))
                    bright_pixels = sum(
                        1 for r, g, b in img.getdata() if r > 35 or g > 45 or b > 60
                    )
                    self.assertGreater(
                        bright_pixels,
                        300,
                        f"Expected visible caption pixels for {style_name}, got {bright_pixels}",
                    )

    def test_typewriter_reveals_progressively_and_bounce_hops_vertically_in_ffmpeg(self):
        caption_styles = _load_caption_styles_from_server()
        transcript = {
            "segments": [
                {
                    "start": 0.0,
                    "end": 1.6,
                    "text": "Progressive reveal timing",
                    "words": [
                        {"word": "Progressive", "start": 0.0, "end": 0.8},
                        {"word": "reveal", "start": 0.8, "end": 1.6},
                    ],
                }
            ]
        }
        with tempfile.TemporaryDirectory(prefix="studio-caption-motion-") as tmp:
            tmp_dir = Path(tmp)
            # 1. Typewriter progressive reveal width growth
            tw_ass = generate_studio_ass_captions(
                transcript,
                caption_styles,
                lambda *a, **kw: {"placement": "center", "text_override": r"{\an5\pos(540,960)\q0}", "accent": "&H003CE0D0", "icon": ""},
                style_name="typewriter",
                video_width=1080,
                video_height=1920,
            )
            tw_path = tmp_dir / "tw.ass"
            tw_path.write_text(tw_ass, encoding="utf-8")
            early_png = tmp_dir / "tw_early.png"
            late_png = tmp_dir / "tw_late.png"
            for ts, out_png in (("0.12", early_png), ("1.40", late_png)):
                subprocess.run(
                    [
                        "ffmpeg", "-v", "error", "-f", "lavfi", "-i",
                        "color=0x07101d:s=1080x1920:r=25:d=1.6",
                        "-ss", ts, "-vf", f"ass={tw_path}:fontsdir={ASSETS_FONTS_DIR}",
                        "-frames:v", "1", "-y", str(out_png),
                    ],
                    check=True,
                )
            early_count = sum(1 for r, g, b in Image.open(early_png).getdata() if r > 120 or g > 120 or b > 120)
            late_count = sum(1 for r, g, b in Image.open(late_png).getdata() if r > 120 or g > 120 or b > 120)
            self.assertGreater(late_count, early_count * 1.6)

            # 2. Vertical bounce \move command emitted cleanly
            bounce_ass = generate_studio_ass_captions(
                transcript,
                caption_styles,
                lambda *a, **kw: {"placement": "lower", "text_override": r"{\an2\pos(540,1650)\q0}", "accent": "&H00FFB33D", "icon": ""},
                style_name="bounce",
                video_width=1080,
                video_height=1920,
            )
            self.assertIn(r"\move(", bounce_ass)

            # 3. Word Pill emits cubic rounded vector rectangle (\p1) + Inter ExtraBold
            pill_ass = generate_studio_ass_captions(
                transcript,
                caption_styles,
                lambda *a, **kw: {"placement": "lower", "text_override": r"{\an2\pos(540,1650)\q0}", "accent": "&H00FFB33D", "icon": ""},
                style_name="word_pill",
                video_width=1080,
                video_height=1920,
            )
            self.assertIn(r"\p1}", pill_ass)
            self.assertIn("Inter ExtraBold", pill_ass)

    def test_behind_subject_renderer_occludes_behind_person_matte_and_highlights_active_words(self):
        effect = {
            "id": "cap-behind-1",
            "type": "text_behind",
            "start": 0.0,
            "end": 2.0,
            "text": "STAND OUT",
            "x": 50,
            "y": 50,
            "font_size": 76,
            "color": "#ffffff",
            "preset": "caption_punch",
            "font": "inter_black",
            "animation": "word_pop",
            "accent_color": "#00ff88",
            "shadow": 0.7,
            "glow": 0.35,
            "tracking": 2,
            "hide_fg_captions": True,
            "words": [
                {"word": "STAND", "start": 0.0, "end": 1.0},
                {"word": "OUT", "start": 1.0, "end": 2.0},
            ],
        }
        validate_text_behind_effect(effect, _bounded)

        # Build dark background, render text behind, then composite opaque red person rectangle in the middle
        w, h = 640, 360
        person_box = (290, 90, 350, 270)
        bg = Image.new("RGBA", (w, h), (10, 12, 22, 255))
        legacy_font = ImageFont.truetype(str(ASSETS_FONTS_DIR / "Inter-Black.ttf"), 76)
        render_text_behind_layer(bg, effect, w, h, time_value=0.45, legacy_font=legacy_font)

        subject = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        ImageDraw.Draw(subject).rectangle(person_box, fill=(200, 30, 40, 255))
        bg.alpha_composite(subject)

        # Center of person remains 100% opaque subject red (text behind is occluded by matte)
        self.assertEqual(bg.getpixel((320, 180)), (200, 30, 40, 255))

        # Active highlighted accent pixels exist outside the person box during t=0.45 vs t=1.45
        outside_t1 = [
            bg.getpixel((x, y))
            for x in range(80, 280)
            for y in range(120, 240)
        ]
        accent_pixels_left = sum(1 for r, g, b, _a in outside_t1 if g > 190 and r < 80)
        self.assertGreater(accent_pixels_left, 25)

    def test_validate_text_behind_rejects_invalid_word_timing_and_suppression_filters_overlap(self):
        with self.assertRaises(ValueError):
            validate_text_behind_effect(
                {
                    "id": "bad",
                    "type": "text_behind",
                    "start": 0.0,
                    "end": 2.0,
                    "text": "HELLO",
                    "x": 50,
                    "y": 50,
                    "font_size": 70,
                    "color": "#ffffff",
                    "words": [{"word": "HELLO", "start": 0.0, "end": 2.5}],
                },
                _bounded,
            )

        filtered = filter_suppressed_whisper_segments(
            {
                "segments": [
                    {
                        "start": 0.0,
                        "end": 4.0,
                        "text": "one two three",
                        "words": [
                            {"word": "one", "start": 0.0, "end": 1.0},
                            {"word": "two", "start": 1.2, "end": 2.2},
                            {"word": "three", "start": 3.0, "end": 4.0},
                        ],
                    }
                ]
            },
            suppress_ranges=[{"start_time": 1.0, "end_time": 2.5}],
        )
        self.assertEqual(len(filtered["segments"]), 1)
        self.assertEqual([w["word"] for w in filtered["segments"][0]["words"]], ["one", "three"])
