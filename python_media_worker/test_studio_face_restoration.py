import asyncio,json,os,subprocess,tempfile
from pathlib import Path
from unittest import mock
import cv2,numpy as np,pytest
from python_media_worker import studio_face_restoration as restore


def test_settings_model_parameters_are_explicit_and_bounded():
    assert restore.validate_settings(None)is None
    assert restore.validate_settings({'enabled':False})is None
    assert restore.validate_settings({'enabled':True})['strength']==.85
    for patch in [{'model':'other'},{'strength':True},{'strength':2},{'stability':float('nan')},{'strength':'1'}]:
        with pytest.raises(ValueError):restore.validate_settings({'enabled':True,**patch})


def test_warped_premultiplied_restoration_never_creates_rectangle_edges():
    worker=object.__new__(restore.FaceRestorer);worker.settings={'strength':1};worker.mask=restore.soft_face_mask()
    frame=np.full((640,640,3),80,np.uint8);aligned={'matrix':np.array([[1.,0.,-64.],[0.,1.,-64.]])}
    out=worker.paste(frame,aligned,np.full((512,512,3),40,np.float32))
    assert np.array_equal(out[:60],frame[:60])and np.array_equal(out[:,:60],frame[:,:60])
    assert out[320,320,0]==120
    assert np.max(np.abs(np.diff(restore.soft_face_mask(),axis=0)))<.07
    assert restore.soft_face_mask()[0].max()==0 and restore.soft_face_mask()[-1].max()==0


def test_same_frame_temporal_transport_preserves_detail_and_reliability():
    rng=np.random.default_rng(12);image=rng.integers(0,256,(512,512,3),dtype=np.uint8);delta=np.full(image.shape,4,np.float32)
    actual,confidence=restore.transport_residual(image,image,delta)
    np.testing.assert_allclose(actual,delta,atol=1e-4)
    assert np.mean(confidence)>.999


def test_face_track_transport_refuses_a_different_shot():
    a={'face':np.array([100.,70.,60.,70.])};b={'face':np.array([450.,40.,70.,80.])}
    assert not restore.same_shot(a,b)and not restore.same_shot(a,None)
    assert restore.same_shot(a,{'face':np.array([101.,69.,61.,71.])})


def test_changed_or_missing_checkpoint_is_not_advertised_or_downloaded(tmp_path):
    restore.model_path.cache_clear();p=tmp_path/'wrong.pth';p.write_bytes(b'not the model')
    with mock.patch.dict(os.environ,{'STUDIO_FACE_RESTORATION_MODEL':str(p)}):
        with pytest.raises(RuntimeError,match='verification'):restore.model_path()
        assert not restore.available()
    restore.model_path.cache_clear()


def test_real_streaming_clock_copies_audio_across_prefetch_boundaries(tmp_path):
    class Predictor:
        def __init__(self,*args):self.calls=0;self.device='cpu';self.settings={'strength':.5};self.mask=restore.soft_face_mask();self.fallback_reason=None
        def align(self,image):return {'image':cv2.resize(image,(512,512)),'matrix':np.array([[4.,0.,0.],[0.,4.,0.]]),'face':np.array([50.,50.,80.,90.])}
        def infer(self,image):self.calls+=1;return np.full(image.shape,8,np.float32)
        paste=restore.FaceRestorer.paste
    source=tmp_path/'source.mp4';out=tmp_path/'out.mp4'
    subprocess.run(['ffmpeg','-v','error','-y','-f','lavfi','-i','testsrc2=s=128x128:r=24:d=0.625','-f','lavfi','-i','sine=frequency=500:duration=0.625','-c:v','libx264','-c:a','aac',str(source)],check=True)
    with mock.patch.object(restore,'FaceRestorer',Predictor):receipt=restore.restore_video(source,out,{'enabled':True})
    streams=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-of','json',str(out)]))['streams']
    video=next(s for s in streams if s['codec_type']=='video')
    assert receipt['frames']==15 and int(video['nb_frames'])==15
    assert video['color_space']=='bt709'and video['pix_fmt']=='yuv444p'
    for p in [source,out]:
        pcm=subprocess.check_output(['ffmpeg','-v','error','-i',str(p),'-vn','-ac','1','-f','s16le','pipe:1'])
        if p==source:original=pcm
        else:assert pcm==original


def test_rec709_source_reader_matches_ffmpeg_instead_of_opencv_601(tmp_path):
    source=tmp_path/'709.mp4'
    subprocess.run(['ffmpeg','-v','error','-y','-f','lavfi','-i','testsrc2=s=128x128:r=24:d=0.125','-c:v','libx264',
        '-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709',str(source)],check=True)
    expected=subprocess.check_output(['ffmpeg','-v','error','-threads','1','-i',str(source),'-frames:v','1','-pix_fmt','bgr24','-f','rawvideo','pipe:1'])
    reader=restore.SourcePictures(source)
    try:
        ok,picture=reader.read();assert ok and picture.tobytes()==expected
    finally:reader.release()


def test_natural_style_keeps_source_structure_without_random_texture():
    y,x=np.mgrid[:512,:512].astype(np.float32)
    source=np.repeat((80+50*np.exp(-((x-240)**2+(y-230)**2)/9000))[:,:,None],3,axis=2)
    reconstructed=np.repeat((80+50*np.exp(-((x-270)**2+(y-240)**2)/9000))[:,:,None],3,axis=2)
    first=restore.preserve_source_structure(source,reconstructed)
    second=restore.preserve_source_structure(source,reconstructed)
    assert np.array_equal(first,second)
    assert np.mean(np.abs(first-source))<np.mean(np.abs(reconstructed-source))
    np.testing.assert_allclose(restore.preserve_source_structure(np.full((512,512,3),90,np.float32),np.full((512,512,3),90,np.float32)),90)
    assert restore.validate_settings({'enabled':True,'model':restore.NATURAL_MODEL_ID})['model']==restore.NATURAL_MODEL_ID


def test_natural_capability_requires_its_actual_render_filter():
    from types import SimpleNamespace
    restore.capability_version.cache_clear()
    with mock.patch.object(restore,'available',return_value=True),mock.patch.object(restore.subprocess,'run',return_value=SimpleNamespace(stdout=' T.. scale V->V resize\n')):
        assert restore.capability_version()==1
    restore.capability_version.cache_clear()
    with mock.patch.object(restore,'available',return_value=True),mock.patch.object(restore.subprocess,'run',return_value=SimpleNamespace(stdout=' T.. cas V->V Sharpen\n')):
        assert restore.capability_version()==2
    restore.capability_version.cache_clear()
