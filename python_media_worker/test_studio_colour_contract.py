"""Real final renderer: RGB frame canvas survives full/limited source clocks."""
import asyncio
import base64
from contextlib import ExitStack
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import unittest
from unittest import mock

import numpy as np
from PIL import Image
from python_media_worker import main_media_server as worker


class StudioColourContractTests(unittest.TestCase):
    def test_authored_24fps_sequence_retains_original_source_pictures(self):
        # Exercise ordinary ingest as well as sequence rendering. A CFR30
        # analysis proxy before this pass can shift the original 24fps cuts.
        with tempfile.TemporaryDirectory(prefix='studio-source-clock-', dir=Path(worker.__file__).resolve().parent.parent/'tmp') as temp, ExitStack() as patches:
            folder = Path(temp)
            source, final = folder/'source.mp4', folder/'final.mp4'
            frames = np.zeros((24,90,160,3), np.uint8)
            for i in range(24):
                frames[i] = [35 + (i % 3)*85, 35 + (i % 4)*55, 35 + (i % 2)*160]
            subprocess.run(['ffmpeg','-v','error','-f','rawvideo','-pix_fmt','rgb24','-s','160x90',
                '-r','24','-i','pipe:0','-c:v','libx264','-crf','0','-pix_fmt','yuv420p','-y',str(source)],
                input=frames.tobytes(),check=True,capture_output=True)
            def denied(*_args, **_kwargs):
                raise AssertionError('Source-clock regression must stay local')
            patches.enter_context(mock.patch.object(socket.socket, 'connect', denied))
            patches.enter_context(mock.patch.object(worker, 'update_firestore_job', denied))
            patches.enter_context(mock.patch.object(worker, 'studio_render_scratch_directory', lambda _job:str(folder)))
            patches.enter_context(mock.patch.object(worker, 'GPU_VIDEO_ENCODER', 'libx264'))
            patches.enter_context(mock.patch.object(worker, 'GPU_PRESET', 'ultrafast'))
            patches.enter_context(mock.patch.dict(os.environ, {'MEDIA_WORKER_STUDIO_FFMPEG_THREADS':'2'}))
            def output(file, **_options):
                shutil.copyfile(file, final)
                return 'local-output'
            patches.enter_context(mock.patch.object(worker, 'upload_file_to_firebase', output))
            request = worker.RenderViralRequest(video_url=str(source),start_time=0,end_time=1,
                timeline_segments=[{'id':'whole','url':str(source),'start_time':0,'end_time':1}],
                composition_plan={'version':1,'order':[],'layers':[{'id':'main-video','type':'video'}]},
                output_settings={'resolution':'source','fps':24,'quality':'master','colorSpace':'rec709'},
                brand_watermark=False)
            result = asyncio.run(worker.render_viral_clip_impl(request, 'original-source-clock'))
            self.assertEqual(result['status'], 'completed')
            def decoded(file):
                return np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-i',str(file),
                    '-pix_fmt','rgb24','-f','rawvideo','pipe:1']),np.uint8).reshape(-1,90,160,3)
            actual, original = decoded(final), decoded(source)
            self.assertEqual(len(actual), 24)
            # Every picture has an independent colour identity, including at
            # the 24/30fps cadence boundaries and the final picture.
            np.testing.assert_allclose(actual[:,45,80].astype(float), original[:,45,80].astype(float), atol=4)

    def test_rgb_composition_keeps_source_colour_and_authored_alpha(self):
        self.render_colour('tv', rgb_overlay=True)

    def test_full_range_source_has_the_authored_dark_canvas(self):
        self.render_colour('pc')

    def test_limited_range_source_has_the_same_authored_dark_canvas(self):
        self.render_colour('tv')

    def test_full_range_neutral_precision_grade_does_not_change_coloured_footage(self):
        self.render_colour('pc', precision=True)

    def test_limited_range_neutral_precision_grade_does_not_change_coloured_footage(self):
        self.render_colour('tv', precision=True)

    def render_colour(self, source_range, precision=False, rgb_overlay=False):
        with tempfile.TemporaryDirectory(prefix='studio-colour-contract-') as temp, ExitStack() as patches:
            folder=Path(temp)
            source, final=folder/'source.mp4', folder/'final.mp4'
            pixels=np.zeros((180,320,3),np.uint8);pixels[:]=[180,100,50]
            subprocess.run(['ffmpeg','-v','error','-f','rawvideo','-pix_fmt','rgb24','-s','320x180',
                '-r','24','-i','pipe:0','-vf',f'scale=out_color_matrix=bt709:out_range={source_range},format=yuv420p,'
                f'setparams=range={"full" if source_range=="pc" else "limited"}:colorspace=bt709',
                '-frames:v','24','-c:v','libx264','-threads','1','-crf','12',
                '-color_primaries','smpte432','-color_trc','bt709','-y',str(source)],
                input=pixels.tobytes()*24,check=True,capture_output=True)

            def replace(target,name,value):
                patches.enter_context(mock.patch.object(target,name,value))
            def denied(*_args,**_kwargs):
                raise AssertionError('Colour qualification must not contact a network or cloud writer')
            replace(socket,'create_connection',denied);replace(socket.socket,'connect',denied)
            replace(worker,'update_firestore_job',denied)
            replace(worker,'studio_render_scratch_directory',lambda _job:str(folder))
            replace(worker,'GPU_VIDEO_ENCODER','libx264');replace(worker,'GPU_PRESET','ultrafast')
            patches.enter_context(mock.patch.dict(os.environ,{'MEDIA_WORKER_STUDIO_FFMPEG_THREADS':'2'}))
            async def ingest(url,destination,**_options):
                assert url=='local-source';shutil.copyfile(source,destination);return destination
            def output(file,**_options):
                shutil.copyfile(file,final);return 'local-output'
            replace(worker,'materialize_video_input',ingest);replace(worker,'upload_file_to_firebase',output)
            request=worker.RenderViralRequest(video_url='local-source',start_time=0,end_time=1,
                timeline_segments=[{'id':'whole','url':'local-source','start_time':0,'end_time':1}],
                finish_plan={'enabled':precision,'color':{'precisionGrade':True,'sharpness':.12},
                    'main_frame':{'enabled':True,'inset_percent':5,
                    'border_radius_percent':10,'background':'studio_black'}},
                output_settings={'resolution':'source','fps':24,'quality':'master','colorSpace':'rec709'},brand_watermark=False)
            if rgb_overlay:
                import io
                image = io.BytesIO()
                Image.new('RGBA', (32,32), (255,255,255,128)).save(image, 'PNG')
                request.overlays = [worker.ViralOverlay(id='colour-overlay', type='image',
                    src='data:image/png;base64,'+base64.b64encode(image.getvalue()).decode(),
                    x=75,y=50,width=20,height=20,frameShape='edge',start_time=0,duration=1)]
                request.composition_plan = {'version': 1, 'order': ['colour-overlay'],
                    'layers': [{'id': 'main-video', 'type': 'video'},
                               {'id': 'colour-overlay', 'type': 'image'}]}
            result=asyncio.run(worker.render_viral_clip_impl(request,'range-'+source_range))
            self.assertEqual(result['status'],'completed')
            metadata=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v',
                '-show_entries','stream=color_range,color_space,color_transfer,color_primaries,width,height','-of','json',str(final)]))['streams'][0]
            self.assertEqual(metadata['color_range'],'tv');self.assertEqual(metadata['color_space'],'bt709')
            self.assertEqual(metadata['color_primaries'],'bt709');self.assertEqual(metadata['color_transfer'],'bt709')
            raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(final),'-frames:v','1',
                '-pix_fmt','rgb24','-f','rawvideo','pipe:1'])
            picture=np.frombuffer(raw,np.uint8).reshape(metadata['height'],metadata['width'],3)
            np.testing.assert_allclose(picture[90,3].astype(float),[3,5,9],atol=3)
            np.testing.assert_allclose(picture[90,160].astype(float),[180,100,50],atol=5)
            if rgb_overlay:
                np.testing.assert_allclose(picture[90,240].astype(float),[218,178,153],atol=6)


if __name__=='__main__':
    unittest.main()
