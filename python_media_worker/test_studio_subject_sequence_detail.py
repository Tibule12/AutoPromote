"""Actual FFmpeg regression for detail lost between reviewed preview and export."""
import subprocess

import numpy as np

from python_media_worker.main_media_server import build_studio_sequence_encode_args


def command(*args):
    return subprocess.run(['ffmpeg','-nostdin','-v','error','-threads','1',*map(str,args)],
                          capture_output=True,check=True,timeout=30).stdout


def decoded(path):
    return command('-i',path,'-map','0:v:0','-pix_fmt','yuv420p','-f','rawvideo','-')


def source(path, seed):
    # Fine texture, one-pixel rails and moving edge detail must survive the
    # temporary cut. Compare YUV directly so RGB conversion cannot hide loss.
    rng=np.random.default_rng(seed)
    frames=[]
    for i in range(6):
        y=rng.integers(64,192,(72,128),dtype=np.uint8)
        y[:,24+i]=240
        y[30:33,40:100]=30
        frames.append(y.tobytes()+bytes([128])*(128*72//2))
    pixels=b''.join(frames)
    subprocess.run(['ffmpeg','-nostdin','-v','error','-threads','1','-f','rawvideo',
        '-pix_fmt','yuv420p','-s','128x72','-r','24','-i','pipe:0',
        '-c:v','ffv1','-y',str(path)],input=pixels,capture_output=True,check=True,timeout=30)
    assert decoded(path)==pixels
    return pixels


def encode(source, target, reviewed):
    command('-i',source,'-map','0:v:0','-an',
            *build_studio_sequence_encode_args(reviewed_subject=reviewed),
            '-pix_fmt','yuv420p','-y',target)


def test_reviewed_replacement_temporary_cut_retains_every_decoded_sample(tmp_path):
    original=tmp_path/'original.mkv';pixels=source(original,7)
    old=tmp_path/'old-default.mp4';fixed=tmp_path/'reviewed.mp4'
    encode(original,old,False);encode(original,fixed,True)
    assert decoded(old)!=pixels, 'Historical temporary encoding must reproduce detail loss'
    assert decoded(fixed)==pixels, 'Reviewed replacement detail must survive sequence assembly'


def test_two_reviewed_cuts_keep_exact_pixels_and_frame_order_through_concat(tmp_path):
    expected=[];cuts=[]
    for i in range(2):
        original=tmp_path/f'source-{i}.mkv';expected.append(source(original,i))
        cut=tmp_path/f'cut-{i}.mp4';encode(original,cut,True);cuts.append(cut)
    listing=tmp_path/'concat.txt'
    listing.write_text(''.join(f"file '{p}'\n" for p in cuts))
    assembled=tmp_path/'assembled.mp4'
    command('-f','concat','-safe','0','-i',listing,'-c:v','copy','-y',assembled)
    assert decoded(assembled)==b''.join(expected)


def test_actual_subject_reframe_keeps_decoded_texture(tmp_path):
    import asyncio
    from python_media_worker.main_media_server import render_reframe_timeline_sequential
    original=tmp_path/'source.mkv';pixels=source(original,11)
    output=tmp_path/'reframed.mp4'
    asyncio.run(render_reframe_timeline_sequential(
        str(original),str(output),128,72,128,72,.25,
        [{'time':0,'mode':'center'}],job_id='reviewed-texture',reviewed_subject=True))
    assert decoded(output)==pixels


def test_actual_subject_finish_timeline_keeps_neutral_texture(tmp_path):
    import asyncio
    from python_media_worker.main_media_server import render_studio_finish_timeline_sequential
    original=tmp_path/'source.mkv';pixels=source(original,13)
    output=tmp_path/'finished.mp4'
    asyncio.run(render_studio_finish_timeline_sequential(
        str(original),str(output),'null',
        [{'startTime':0,'duration':.25,'effects':{'color':{}}}],.25,
        job_id='reviewed-neutral-finish',reviewed_subject=True))
    assert decoded(output)==pixels
