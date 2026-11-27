from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from python_media_worker.studio_finish_reuse import can_fuse_neutral_finish

FILTER = ("eq=brightness=0.0000:contrast=1.0000:saturation=1.0000:eval=frame,"
          "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,"
          "setparams=range=limited:colorspace=bt709")


class StudioFinishReuseTests(unittest.TestCase):
    def test_exact_neutral_qualifies_without_changing_the_filter(self):
        self.assertTrue(can_fuse_neutral_finish(FILTER,adjustment_layers=[],request=SimpleNamespace()))
        ordinary = SimpleNamespace(creative_plan={"enabled":False,"effects":[]},motionGraphics={"version":1,"scenes":[]},
                                   speed_segments=[{"start_time":0,"end_time":60,"rate":1}])
        self.assertTrue(can_fuse_neutral_finish(FILTER,adjustment_layers=[],request=ordinary))

    def test_authored_grading_motion_masks_and_unknown_filters_do_not_qualify(self):
        for graph in [FILTER.replace("contrast=1.0000","contrast=1.0200"),FILTER+",vignette",FILTER+",crop=80:80"]:
            self.assertFalse(can_fuse_neutral_finish(graph,adjustment_layers=[],request=SimpleNamespace()))
        self.assertFalse(can_fuse_neutral_finish(FILTER,adjustment_layers=[{}],request=SimpleNamespace()))
        for name in ["subjectVfx","threeDGraphics","creative_plan","speed_segments","motionGraphics"]:
            self.assertFalse(can_fuse_neutral_finish(FILTER,adjustment_layers=[],request=SimpleNamespace(**{name:[{}]})))

    def test_fused_conversion_before_overlay_has_exact_lossless_pixel_parity(self):
        with tempfile.TemporaryDirectory() as folder:
            intermediate=Path(folder)/"finish.mkv"
            common=["ffmpeg","-v","error","-filter_threads","1","-filter_complex_threads","1"]
            source=["-f","lavfi","-i","testsrc2=s=160x90:r=4:d=1"]
            subprocess.run(common+source+["-vf",FILTER,"-c:v","ffv1","-y",str(intermediate)],check=True)
            overlay="drawbox=x=10:y=10:w=30:h=20:color=white:t=fill"
            raw=["-frames:v","4","-pix_fmt","rgb24","-f","rawvideo","pipe:1"]
            separated=subprocess.check_output(common+["-i",str(intermediate),"-vf",overlay]+raw)
            fused=subprocess.check_output(common+source+["-vf",FILTER+","+overlay]+raw)
            self.assertEqual(separated,fused)


if __name__ == "__main__": unittest.main()
