# Explicit local-model integration; unchanged image/audio assertions from the failed prototypes.
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
import numpy as np
import subprocess
def test_precise_native_pass_preserves_picture_outside_glyph_mask_and_audio(tmp_path,monkeypatch):
    import cv2
    from python_media_worker.studio_watermark_cleanup import badge_ink_mask,apply_studio_glyph_cleanup
    clean=np.zeros((240,320,3),np.uint8)
    for y in range(240):clean[y,:,:]=[35+y//6,55+y//8,75+y//10]
    clean[190:193,:]=[110,115,120]
    stamped=clean.copy();cv2.putText(stamped,'TikTok',(205,205),cv2.FONT_HERSHEY_SIMPLEX,.6,(255,255,255),1,cv2.LINE_AA)
    roi=stamped[175:220,200:315];core,mask,_=badge_ink_mask(roi);assert np.count_nonzero(mask)<mask.size*.55
    png=tmp_path/'stamped.png';cv2.imwrite(str(png),stamped);video=tmp_path/'native.mp4'
    subprocess.run(['ffmpeg','-v','error','-y','-loop','1','-i',str(png),'-f','lavfi','-i','sine=frequency=440:duration=1','-t','1','-r','24','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',str(video)],check=True)
    audio=lambda p:subprocess.check_output(['ffmpeg','-v','error','-i',str(p),'-vn','-f','s16le','-'])
    before_audio=audio(video)
    monkeypatch.setenv('STUDIO_BADGE_INPAINT_MODEL','/home/tibule12/.cache/autopromote-model-runtime/lama-badge-cpu-v1/lama_fp32.onnx')
    receipt={'method':'local_lama_masked','manual_regions':[{'left':62.5,'top':72.9166667,'width':35.9375,'height':18.75,'track':False,'seed_time':0}]}
    result=apply_studio_glyph_cleanup(str(video),receipt,['-c:v','libx264','-crf','15','-preset','veryfast','-pix_fmt','yuv420p'])
    assert result['frames']==24 and result['regionAppliedFrames']==[24]and result['placementBoxBlurred']is False
    assert before_audio==audio(video)
    cap=cv2.VideoCapture(str(video));ok,picture=cap.read();cap.release();assert ok
    native_err=np.mean(np.abs(picture[175:220,200:315].astype(float)-clean[175:220,200:315]))
    dirty_err=np.mean(np.abs(stamped[175:220,200:315].astype(float)-clean[175:220,200:315]))
    assert native_err<dirty_err*.45
    assert np.mean(np.abs(picture[20:60,20:60].astype(float)-clean[20:60,20:60]))<3


