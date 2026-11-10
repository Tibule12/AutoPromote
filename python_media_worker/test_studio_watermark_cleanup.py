import asyncio
import subprocess
import json
import numpy as np
import pytest
from python_media_worker.studio_watermark_cleanup import programme_cleanup_regions,studio_watermark_cleanup_filters

def test_disabled_is_identity_without_probe_or_execution():
    def bad(*a,**k):raise AssertionError('disabled cleanup must not read or mutate media')
    filters,receipt=asyncio.run(studio_watermark_cleanup_filters(enabled=False,mode='unknown',regions=None,segments=[],start_time=0,duration=1,width=160,height=240,video_path='original',build_filters=bad));assert filters==[]and receipt['status']=='not_requested'

def test_manual_seed_uses_the_assembled_programme_clock():
    src={'left':70,'top':78,'width':28,'height':12,'track':True,'seed_time':12};r=programme_cleanup_regions([src],[{'start_time':8,'end_time':16}],0);assert r[0]['seed_time']==4 and src['seed_time']==12

@pytest.mark.parametrize('region',[{'left':float('nan')},{'width':150},{'left':95,'width':20},{'track':'true'},{'shader':'x'}])
def test_malformed_rejected(region):
    with pytest.raises(ValueError):programme_cleanup_regions([{'left':1,'top':1,'width':10,'height':8,'track':False,**region}],[],0)

def test_multi_occurrence_tracking_refused_instead_of_guessing():
    with pytest.raises(ValueError,match='one source'):programme_cleanup_regions([{'left':1,'top':1,'width':10,'height':8,'track':True}], [{'start_time':8},{'start_time':20}],0)

def test_real_ffmpeg_removes_selected_badge_retaining_frames_and_audio(tmp_path):
    source=tmp_path/'source.mp4';target=tmp_path/'clean.mp4';subprocess.run(['ffmpeg','-v','error','-y','-f','lavfi','-i','color=c=0x345678:s=160x240:r=24:d=1','-f','lavfi','-i','sine=frequency=440:duration=1','-vf','drawbox=x=110:y=190:w=30:h=20:c=white:t=fill','-c:v','libx264','-c:a','aac','-shortest',str(source)],check=True)
    def probe(p):return json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-show_streams','-show_format','-of','json',str(p)]))
    def dimensions(p):s=next(x for x in probe(p)['streams']if x['codec_type']=='video');return s['width'],s['height']
    def duration(p):return float(probe(p)['format']['duration'])
    def filters(w,h,mode,**kw):assert mode=='manual';return ['delogo=x=106:y=186:w=39:h=29:show=0']
    async def execute(args,**kw):subprocess.run(args,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    cleaned_filters,receipt=asyncio.run(studio_watermark_cleanup_filters(enabled=True,mode='manual',regions=[{'left':65,'top':76,'width':30,'height':20,'track':True}],segments=[{'start_time':8}],start_time=0,duration=1,width=160,height=240,video_path=str(source),build_filters=filters));asyncio.run(execute(['ffmpeg','-v','error','-y','-i',str(source),'-vf',','.join(cleaned_filters),'-c:v','libx264','-c:a','copy',str(target)]));assert receipt['status']=='applied'and receipt['audioUnaffected']
    a,b=probe(source),probe(target);assert next(s for s in a['streams']if s['codec_type']=='video')['nb_read_frames']==next(s for s in b['streams']if s['codec_type']=='video')['nb_read_frames']=='24'
    audio=lambda p:subprocess.check_output(['ffmpeg','-v','error','-i',str(p),'-vn','-f','s16le','-'])
    assert audio(source)==audio(target)
    frame=lambda p:np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-i',str(p),'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','-']),np.uint8).reshape(240,160,3)
    original,clean=frame(source),frame(target);assert original[195:205,115:135].mean()>245;assert clean[195:205,115:135].mean()<140;assert np.max(np.abs(clean[20:60,20:60].astype(int)-original[20:60,20:60].astype(int)))<=3


def test_badge_mask_refuses_blank_seed_and_large_bright_picture():
    from python_media_worker.studio_watermark_cleanup import badge_ink_mask
    with pytest.raises(ValueError,match='No clear'):badge_ink_mask(np.zeros((60,100,3),np.uint8))


def test_static_seed_maps_source_to_programme_and_does_not_mutate_input():
    source={'left':77,'top':75,'width':22,'height':11,'track':False,'seed_time':14}
    mapped=programme_cleanup_regions([source],[{'start_time':8}],0)
    assert mapped[0]['seed_time']==6 and source['seed_time']==14


def test_precise_runtime_refuses_missing_installation(monkeypatch):
    from python_media_worker.studio_watermark_cleanup import apply_studio_glyph_cleanup
    monkeypatch.delenv('STUDIO_BADGE_INPAINT_MODEL',raising=False)
    with pytest.raises(ValueError,match='not installed'):apply_studio_glyph_cleanup('unread',{'method':'local_lama_masked'},[])


def test_precise_runtime_refuses_tampered_weights(tmp_path,monkeypatch):
    from python_media_worker.studio_watermark_cleanup import apply_studio_glyph_cleanup
    model=tmp_path/'model.onnx';model.write_bytes(b'invalid weights');monkeypatch.setenv('STUDIO_BADGE_INPAINT_MODEL',str(model))
    with pytest.raises(ValueError,match='hash mismatch'):apply_studio_glyph_cleanup('unread',{'method':'local_lama_masked'},[])


def test_disconnected_animated_icon_strokes_share_one_envelope():
    from python_media_worker.studio_watermark_cleanup import platform_icon_envelope
    core=np.zeros((112,126),np.uint8);core[10:44,97:109]=255;core[23:50,71:90]=255
    core[58:69,57:68]=255
    result=platform_icon_envelope(core,np.zeros_like(core),77)
    assert result[1,98]==255 and result[45,72]==255 and result[51,118]==255
    assert result[20,20]==0 and result[90,98]==0
    assert np.count_nonzero(core[0:10])==0


def test_left_icon_envelope_excludes_the_dancer_on_the_right():
    from python_media_worker.studio_watermark_cleanup import platform_icon_envelope
    core=np.zeros((133,121),np.uint8);core[30:65,15:35]=255;core[5:58,93:104]=255
    result=platform_icon_envelope(core,np.zeros_like(core),1)
    assert result[25,20]==255 and result[60,20]==255
    assert result[15,95]==0 and result[60,95]==0


def test_connected_costume_is_preserved_but_disconnected_badge_colour_is_not():
    from python_media_worker.studio_watermark_cleanup import connected_colour_foreground
    frame=np.full((240,160,3),50,np.uint8)
    frame[80:215,90:110]=[15,20,180]  # A moving leg enters the selected box.
    frame[170:190,135:145]=[10,190,220]  # A separate coloured badge stroke.
    protected=connected_colour_foreground(frame,(85,160,70,65))
    assert protected[190,100]==255
    assert protected[175,140]==0
    assert protected[230,100]==0


def test_registered_source_plate_refuses_a_large_change_of_view():
    import cv2
    from python_media_worker.studio_watermark_cleanup import fit_source_background
    rng=np.random.default_rng(81)
    image=rng.integers(20,80,(240,160,3),dtype=np.uint8)
    ring=np.full((240,160),255,np.uint8);ring[160:225,85:155]=0
    changed=np.roll(image,60,axis=1)
    assert fit_source_background(changed,{'image':image,'ring':ring},(85,160,70,65)) is None
