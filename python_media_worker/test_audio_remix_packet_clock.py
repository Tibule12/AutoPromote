"""Mastering must turn timestamp gaps into continuous encoded audio."""
import json
import subprocess
import pytest
from python_media_worker.viral_audio_remix import render_audio_remix


def run(*args):
    return subprocess.check_output(['ffmpeg', '-v', 'error', '-nostdin', *map(str,args)],stderr=subprocess.PIPE)


def audio_frames(path):
    return json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','a:0',
        '-show_frames','-show_entries','frame=pts_time,nb_samples','-of','json',str(path)]))['frames']


@pytest.mark.parametrize('level_match',[False,True])
def test_remix_preserves_the_packet_clock_and_all_video_packets(tmp_path,level_match):
    source=tmp_path/'gap.mp4';final=tmp_path/'final.mp4'
    run('-f','lavfi','-i','color=blue:s=160x120:r=24:d=5','-f','lavfi','-i',
        'sine=frequency=440:sample_rate=48000:duration=5','-af',
        "asetpts=PTS+gte(T\\,4)*0.1/TB",'-t','5','-c:v','libx264','-threads','1',
        '-c:a','aac','-b:a','192k','-y',source)
    before=audio_frames(source)
    assert any(float(b['pts_time'])-float(a['pts_time'])-int(a['nb_samples'])/48000>.09
        for a,b in zip(before,before[1:])), 'The fixture must reproduce a real timestamp gap'
    result=render_audio_remix(source,final,{'enabled':True,'preset':'slowed_reverb','speed':.82,
        'pitch_semitones':-3,'keep_pitch':False,'content_type':'choir','target':'master',
        'bass_db':8,'clarity_db':2,'air_db':1,'reverb_mix':.68,'intensity':.75,
        'level_match':level_match,'quality':'studio'})
    assert result['status']=='applied'
    frames=audio_frames(final)
    gaps=[float(b['pts_time'])-float(a['pts_time'])-int(a['nb_samples'])/48000
        for a,b in zip(frames,frames[1:])]
    assert max(map(abs,gaps))<=1.1/48000
    assert abs(sum(int(f['nb_samples']) for f in frames)/48000-5)<=2*1024/48000+.002
    def picture_hash(path):
        return run('-i',path,'-map','0:v:0','-c:v','copy','-f','hash','-hash','sha256','-')
    assert picture_hash(source)==picture_hash(final)
