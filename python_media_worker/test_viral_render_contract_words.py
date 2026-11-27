import ast
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from viral_render_contract import build_edited_caption_transcript
from studio_caption_renderer import generate_studio_ass_captions

_BOXED_STYLE = {
    "fontname": "Inter ExtraBold",
    "fontsize": 48,
    "bold": True,
    "italic": False,
    "uppercase": False,
    "primary_color": "&H00FFFFFF",
    "highlight_color": "&H003DB3FF",
    "outline_color": "&H00000000",
    "back_color": "&H80000000",
    "border_style": 1,
    "outline": 3,
    "shadow": 0,
    "alignment": 2,
    "spacing": 0,
    "animation": "karaoke_fill",
}
MINIMAL_STYLES = {
    "bold_pop": _BOXED_STYLE,
    "boxed": _BOXED_STYLE,
}


class ViralRenderContractWordsTests(unittest.TestCase):
    def test_build_edited_caption_transcript_preserves_aligned_pause_word_timings(self):
        transcript = build_edited_caption_transcript(
            [
                {
                    "id": "cue-pause",
                    "start_time": 0.0,
                    "end_time": 3.0,
                    "text": "Wait yes now",
                    "words": [
                        {"word": "Wait", "start": 0.0, "end": 0.35, "probability": 0.96},
                        {"word": "yes", "start": 1.95, "end": 2.3, "probability": 0.98},
                        {"word": "now", "start": 2.35, "end": 2.85, "probability": 0.99},
                    ],
                }
            ]
        )
        words = transcript["segments"][0]["words"]
        self.assertEqual([w["word"] for w in words], ["Wait", "yes", "now"])
        self.assertAlmostEqual(words[0]["end"], 0.35, places=3)
        self.assertAlmostEqual(words[1]["start"], 1.95, places=3)
        self.assertAlmostEqual(words[2]["end"], 2.85, places=3)

        stale = build_edited_caption_transcript(
            [
                {
                    "id": "cue-edited",
                    "start_time": 0.0,
                    "end_time": 2.0,
                    "text": "Fresh text",
                    "words": [{"word": "Old", "start": 0.0, "end": 0.4}],
                }
            ]
        )
        self.assertAlmostEqual(stale["segments"][0]["words"][0]["end"], 1.0, places=3)

    def test_boxed_karaoke_ass_inserts_pause_delay_and_renders_with_ffmpeg(self):
        transcript = build_edited_caption_transcript(
            [
                {
                    "id": "k1",
                    "start_time": 0.0,
                    "end_time": 2.5,
                    "text": "Wait yes",
                    "words": [
                        {"word": "Wait", "start": 0.0, "end": 0.4},
                        {"word": "yes", "start": 1.6, "end": 2.1},
                    ],
                }
            ]
        )
        ass = generate_studio_ass_captions(
            transcript,
            caption_styles=MINIMAL_STYLES,
            resolve_story_treatment=lambda *a, **kw: {},
            style_name="boxed",
            video_width=640,
            video_height=360,
        )
        self.assertIn("{\\kf40}Wait", ass)
        self.assertIn("{\\k120}{\\kf50}yes", ass)

        with tempfile.TemporaryDirectory() as tmp:
            ass_path = os.path.join(tmp, "pause.ass")
            out_path = os.path.join(tmp, "out.mp4")
            with open(ass_path, "w", encoding="utf-8") as handle:
                handle.write(ass)
            subprocess.run(
                [
                    "ffmpeg",
                    "-y",
                    "-f",
                    "lavfi",
                    "-i",
                    "color=c=black:s=640x360:r=24:d=2.5",
                    "-vf",
                    f"ass={ass_path}",
                    "-c:v",
                    "libx264",
                    "-pix_fmt",
                    "yuv420p",
                    out_path,
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            probe = json.loads(
                subprocess.run(
                    ["ffprobe", "-v", "error", "-show_streams", "-of", "json", out_path],
                    check=True,
                    capture_output=True,
                    text=True,
                ).stdout
            )
            self.assertEqual(probe["streams"][0]["nb_frames"], "60")

    def test_main_media_server_diarization_and_ass_syntax(self):
        server_path = Path(__file__).resolve().with_name("main_media_server.py")
        source = server_path.read_text(encoding="utf-8")
        ast.parse(source)
        self.assertIn("def transcribe_with_openai_diarization(file_path, *, language=None):", source)
        self.assertIn("if diarize_allowed and (provider != \"auto\" or selected_source not in local_south_african_only):", source)

        try:
            from python_media_worker import main_media_server as mms
        except ModuleNotFoundError:
            return
        with patch.dict(os.environ, {"VIRAL_CAPTION_TRANSCRIPTION_PROVIDER": "auto"}, clear=False), patch(
            "python_media_worker.main_media_server.transcribe_with_openai_diarization",
            return_value={"segments": [], "language": "en", "engine": "openai-gpt-4o-transcribe-diarize"},
        ) as mock_diarize, patch(
            "python_media_worker.main_media_server.transcribe_with_hints",
            return_value={"segments": [], "language": None},
        ) as mock_local:
            res_en = mms.transcribe_captions_with_provider("/tmp/fake.mp4", source_language="en")
            self.assertEqual(res_en["engine"], "openai-gpt-4o-transcribe-diarize")
            mock_diarize.assert_called_once_with("/tmp/fake.mp4", language="en")
            mock_diarize.reset_mock()
            mms.transcribe_captions_with_provider("/tmp/fake.mp4", source_language="xh")
            mock_diarize.assert_not_called()
            mock_local.assert_called_once()

    def test_viral_caption_segment_schema_preserves_word_timings_and_fixes_renderer_polish(self):
        try:
            from python_media_worker import main_media_server as mms
        except ModuleNotFoundError:
            return
        req = mms.RenderViralRequest(
            video_url="https://example.com/clip.mp4",
            start_time=0.0,
            end_time=4.0,
            auto_captions=True,
            caption_style="karaoke",
            caption_segments=[
                {
                    "id": "cue-word-rt",
                    "start_time": 0.0,
                    "end_time": 4.0,
                    "text": "Hello paused world",
                    "wordTimings": [
                        {"word": "Hello", "start": 0.0, "end": 0.35},
                        {"word": "paused", "start": 2.10, "end": 2.45},
                        {"word": "world", "start": 2.50, "end": 3.00},
                    ],
                }
            ],
        )
        transcript = build_edited_caption_transcript(req.caption_segments)
        self.assertAlmostEqual(transcript["segments"][0]["words"][1]["start"], 2.10, places=3)

        # Karaoke uses \1c accent and \2c primary so spoken fill sweeps into signature yellow cleanly.
        ass_karaoke = mms.generate_ass_captions(transcript, "karaoke", 1080, 1920)
        self.assertIn(r"\1c&H0042F5F5\2c&H00FFFFFF", ass_karaoke)

        # Neon bloom uses white inner core over outer neon halo with dual-space breathing room.
        ass_neon = mms.generate_ass_captions(transcript, "neon_bloom", 1080, 1920)
        self.assertIn(r"\c&H00FFFFFF&\3c&H00D0E03C&\bord3\blur0.8", ass_neon)

        # Sticker renders high-contrast dark ink on cream badge.
        ass_sticker = mms.generate_ass_captions(transcript, "sticker", 1080, 1920)
        self.assertIn("&H001C1014", ass_sticker)

        # Creative mode showcases different spatial frame placements & side-by-side splits.
        multi_cue = build_edited_caption_transcript(
            [
                {"id": "c1", "start_time": 0.0, "end_time": 2.0, "text": "Host opens the story", "speaker": "host"},
                {"id": "c2", "start_time": 2.0, "end_time": 4.0, "text": "Guest replies side by side", "speaker": "guest"},
            ]
        )
        ass_split = mms.generate_ass_captions(multi_cue, "editorial_duo", 1080, 1920, caption_position="creative")
        self.assertIn(r"\an4\pos(65,", ass_split)
        self.assertIn(r"\an6\pos(1015,", ass_split)
        self.assertIn(r"\N", ass_split)
        ass_wall = mms.generate_ass_captions(multi_cue, "wall_type", 1080, 1920, caption_position="creative")
        self.assertIn(r"\an8\pos(540,326)", ass_wall)
        ass_retro = mms.generate_ass_captions(multi_cue, "retro", 1080, 1920, caption_position="creative")
        self.assertIn(r"\frz2.5", ass_retro)


if __name__ == "__main__":
    unittest.main()
