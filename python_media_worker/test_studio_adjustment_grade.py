import subprocess
import asyncio
import json
import tempfile
import unittest
from pathlib import Path
import numpy as np
from unittest.mock import patch
from python_media_worker.main_media_server import build_studio_finish_filter, plan_studio_adjustment_segments
from python_media_worker.studio_adjustment_grade import adjustment_grade_filter
from python_media_worker.studio_color_cube import write_color_cube


class AdjustmentGradeTests(unittest.TestCase):
    def test_precision_video_intermediate_keeps_full_chroma_and_picture_timing(self):
        from python_media_worker import main_media_server as worker
        with tempfile.TemporaryDirectory()as directory:
            root=Path(directory);source=root/'source.mp4';output=root/'graded.mp4'
            pixels=np.empty((32,64,3),np.uint8);pixels[:,::2]=[172,108,72];pixels[:,1::2]=[78,72,126]
            subprocess.run(['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s','64x32','-r','24','-i','pipe:0',
                '-frames:v','8','-c:v','libx264rgb','-crf','0','-preset','ultrafast',str(source)],input=pixels.tobytes()*8,capture_output=True,check=True)
            layers=[{'startTime':0,'duration':8/24,'effects':{'color':{'precisionGrade':True}}}]
            with patch.object(worker,'FIREBASE_STATUS_UPDATES_ENABLED',False):
                asyncio.run(worker.render_studio_finish_timeline_sequential(str(source),str(output),'',layers,8/24,job_id='colour-edge-test'))
            probe=json.loads(subprocess.run(['ffprobe','-v','error','-count_frames','-select_streams','v:0','-show_streams','-of','json',str(output)],capture_output=True,check=True).stdout)['streams'][0]
            self.assertEqual(probe['pix_fmt'],'yuv444p')
            self.assertEqual(int(probe['nb_read_frames']),8)
            self.assertEqual(probe['color_space'],'bt709')
            decoded=subprocess.run(['ffmpeg','-v','error','-threads','1','-i',str(output),'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],capture_output=True,check=True).stdout
            actual=np.frombuffer(decoded,np.uint8).reshape(pixels.shape)
            self.assertLess(float(np.abs(actual.astype(float)-pixels).mean()),3)

    def test_stacked_precision_grades_preserve_thin_colour_edges_before_delivery(self):
        image=np.empty((32,64,3),np.uint8)
        image[:,::2]=[172,108,72]
        image[:,1::2]=[78,72,126]
        graph=','.join(adjustment_grade_filter({'color':{'precisionGrade':True}},build_studio_finish_filter,f'edge{i}_')for i in range(3))
        result=subprocess.run(['ffmpeg','-v','error','-filter_threads','1','-f','rawvideo','-pix_fmt','rgb24','-s','64x32','-i','pipe:0',
            '-vf',graph,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],input=image.tobytes(),capture_output=True,check=True)
        actual=np.frombuffer(result.stdout,np.uint8).reshape(image.shape)
        np.testing.assert_array_equal(actual,image)

    def render(self, effects):
        filters = adjustment_grade_filter(effects, build_studio_finish_filter, 'test_')
        output = subprocess.run(['ffmpeg', '-v', 'error', '-filter_threads', '1', '-f', 'lavfi',
            '-i', 'color=c=0x345678:s=64x64:r=24:d=0.1', '-vf', filters, '-frames:v', '1',
            '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True, check=True)
        return np.frombuffer(output.stdout, dtype=np.uint8).reshape(64, 64, 3).mean(axis=(0, 1))

    def test_exposure_and_glow_change_real_ffmpeg_pixels(self):
        base = self.render({'color': {'precisionGrade': True}})
        bright = self.render({'color': {'precisionGrade': True, 'exposureStops': .5}})
        glow = self.render({'color': {'precisionGrade': True}, 'glow': {'radius': 8, 'intensity': .5}})
        self.assertTrue(np.all(bright > base + 8), (base, bright))
        self.assertTrue(np.all(glow > base + 8), (base, glow))

    def test_lut_changes_real_pixels(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'inverse.cube'
            data = [v for b in range(2) for g in range(2) for r in range(2) for v in (1-r, 1-g, 1-b)]
            write_color_cube({'size': 2, 'data': data}, str(path))
            original = self.render({'color': {'precisionGrade': True}})
            inverse = self.render({'color': {'precisionGrade': True}, '_worker_cube_path': str(path)})
            self.assertTrue(np.all(np.abs(original + inverse - 255) < 5), (original, inverse))

    def test_bypass_and_order_are_preserved_in_timeline_plan(self):
        layers = [
            {'id': 'disabled', 'enabled': False, 'duration': 3, 'effects': {'color': {'contrast': 1.7}}},
            {'id': 'exposure', 'duration': 3, 'effects': {'color': {'precisionGrade': True, 'exposureStops': .5}}},
            {'id': 'glow', 'duration': 3, 'effects': {'glow': {'radius': 8, 'intensity': .2}}},
        ]
        plan = plan_studio_adjustment_segments(layers, 3)
        self.assertEqual(len(plan[0]['grades']), 2)
        self.assertIn('lutrgb', plan[0]['grades'][0]); self.assertIn('gblur', plan[0]['grades'][1])

    def test_invalid_glow_is_rejected(self):
        with self.assertRaises(ValueError):
            adjustment_grade_filter({'glow': {'radius': float('nan')}}, build_studio_finish_filter, 'bad_')
