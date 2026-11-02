"""Actual lossless RGBA interchange for changing sculptural surfaces."""
import json,subprocess,sys
from pathlib import Path
import numpy as np
from PIL import Image

def test_png_quicktime_roundtrip_preserves_every_rgba_byte(tmp_path):
    frames=[]
    for index in range(6):
        y,x=np.indices((160,160));frame=np.stack(((x*7+index*31)%256,(y*11+index*17)%256,(x*y+index*47)%256,(x*3+y*5+index*19)%256),axis=2).astype(np.uint8)
        Image.fromarray(frame).save(tmp_path/f'frame_{index:04d}.png');frames.append(frame.tobytes())
    target=tmp_path/'overlay.mov'
    subprocess.run(['ffmpeg','-v','error','-y','-framerate','12','-i',str(tmp_path/'frame_%04d.png'),'-c:v','png','-pix_fmt','rgba','-an',str(target)],check=True)
    probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-of','json',str(target)]))['streams'][0]
    assert (probe['codec_name'],probe['pix_fmt'],int(probe['nb_frames']))==('png','rgba',6)
    decoded=subprocess.check_output(['ffmpeg','-v','error','-i',str(target),'-f','rawvideo','-pix_fmt','rgba','-'])
    assert decoded==b''.join(frames)
    sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'python_media_worker'))
    from studio_3d_overlay import validate_overlay_media
    assert validate_overlay_media(str(target),.5)
