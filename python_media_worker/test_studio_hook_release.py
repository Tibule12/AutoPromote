"""Exercise the real Hook filter without booting the media service."""
import ast
import re
import subprocess
from pathlib import Path

import numpy as np


def test_opening_hook_releases_to_the_authored_picture():
    source = Path(__file__).with_name("main_media_server.py")
    names = {"escape_drawtext_text", "wrap_hook_text", "build_hook_filter_chain"}
    tree = ast.parse(source.read_text())
    selected = ast.Module(body=[n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in names], type_ignores=[])
    scope = {"re": re}
    exec(compile(selected, str(source), "exec"), scope)
    chain = scope["build_hook_filter_chain"]("HEAR THE DIFFERENCE CHIPMUNK", 2.5,
        width_val=320, height_val=180, template="zoom_focus", zoom_scale=1.16,
        blur_background=False, dark_overlay=True, text_animation="fade_in")
    pattern = "color=0x203050:s=320x180:r=25:d=4,drawgrid=w=32:h=18:t=2:c=white,drawbox=x=35:y=30:w=60:h=80:c=red:t=fill"
    def frames(filters):
        return np.frombuffer(subprocess.check_output(["ffmpeg", "-v", "error", "-threads", "1",
            "-f", "lavfi", "-i", pattern, "-vf", filters, "-pix_fmt", "rgb24",
            "-f", "rawvideo", "-threads", "1", "pipe:1"], timeout=30), dtype=np.uint8).reshape(-1,180,320,3)
    baseline = frames("null")
    hooked = frames(chain)
    assert len(hooked) == len(baseline) == 100
    assert np.mean(np.abs(hooked[25].astype(float)-baseline[25])) > 10
    # The final second must use the unchanged framing, with no residual zoom,
    # darkening or title after the opening has released.
    assert np.max(np.abs(hooked[80:].astype(float)-baseline[80:])) <= 1
