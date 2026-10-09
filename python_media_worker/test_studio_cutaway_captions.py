"""Real raster regression: opaque cutaways must retain programme captions."""
import subprocess
import tempfile
import unittest
from pathlib import Path

from PIL import Image
from python_media_worker.viral_render_contract import append_studio_caption_filter


class CutawayCaptionRasterTest(unittest.TestCase):
    def test_fullscreen_moving_media_does_not_cover_caption_words(self):
        with tempfile.TemporaryDirectory(prefix="studio-cutaway-captions-") as folder:
            root = Path(folder)
            ass = root / "captions.ass"
            ass.write_text("""[Script Info]
ScriptType: v4.00+
PlayResX: 640
PlayResY: 360
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,DejaVu Sans,36,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,20,20,30,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,Spoken words remain visible
""", encoding="utf-8")
            results = {}
            for order in ["previous", "fixed"]:
                chain = []
                label = "0:v"
                if order == "previous":
                    label = append_studio_caption_filter(chain, label, ass, root)
                chain.append(f"[{label}][1:v]overlay=0:0[cutaway];")
                label = "cutaway"
                if order == "fixed":
                    label = append_studio_caption_filter(chain, label, ass, root)
                output = root / f"{order}.png"
                subprocess.run([
                    "ffmpeg", "-v", "error", "-filter_complex_threads", "1",
                    "-f", "lavfi", "-i", "color=red:s=640x360:r=24:d=1",
                    "-f", "lavfi", "-i", "color=blue:s=640x360:r=24:d=1",
                    "-filter_complex", "".join(chain).rstrip(";"),
                    "-map", f"[{label}]", "-frames:v", "1", "-threads", "1",
                    "-y", str(output),
                ], check=True, capture_output=True)
                with Image.open(output) as picture:
                    results[order] = sum(min(pixel) > 200 for pixel in picture.convert("RGB").getdata())
            self.assertEqual(results["previous"], 0, "The former ordering must reproduce missing words")
            self.assertGreater(results["fixed"], 500, "Caption glyphs must remain above the opaque cutaway")


if __name__ == "__main__":
    unittest.main()
