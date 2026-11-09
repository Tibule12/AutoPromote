"""Turn the rendered native frame sequence into ordinary reusable Studio media."""
from pathlib import Path
import json
import subprocess
import sys

root=Path(sys.argv[1]).resolve()
story=json.loads((root/'story-plan.json').read_text())
scenes=story['scenes'] if '--smoke' not in sys.argv else [{'id':'smoke','at':0,'duration':2}]
for s in scenes:
    seq=root/'proxy-sequences'/s['id'];seq.mkdir(parents=True,exist_ok=True)
    for i,n in enumerate(range(s['at']*24+1,(s['at']+s['duration'])*24+1,2),1):
        source=root/'proxy-frames'/f'frame_{n:04d}.png'
        if not source.is_file():raise ValueError('Missing proxy frame '+str(source))
        target=seq/f'frame_{i:04d}.png'
        if not target.exists():target.symlink_to(source)
    out=root/'assets/proxy';out.mkdir(exist_ok=True)
    subprocess.run(['ffmpeg','-v','error','-y','-framerate','12','-i',str(seq/'frame_%04d.png'),'-frames:v',str(s['duration']*12),'-vf','scale=640:360','-c:v','libx264','-preset','veryfast','-crf','19','-pix_fmt','yuv420p','-an','-movflags','+faststart',str(out/(s['id']+'.mp4'))],check=True)
    print(json.dumps({'scene':s['id'],'seconds':s['duration']}))
