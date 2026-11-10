"""Encode only the second 72-frame shot and compare actual encoded frames."""
from pathlib import Path
import hashlib
import json
import subprocess
import sys
from PIL import Image,ImageDraw,ImageFont

ROOT=Path(__file__).resolve().parent
detail='--detail' in sys.argv
WORK=ROOT/('private/head-model' if detail else 'private/attempt-2')
DELIVERY=Path('/home/tibule12/Videos/Unmuted - Shot Correction - 20261031')
previous=DELIVERY/('Before - same 3 seconds.mp4' if detail else 'Corrected Shot - 3 seconds.mp4')
audio_source=DELIVERY/'Shot Revision 2 - 3 seconds.mp4' if detail else previous
movie=DELIVERY/('Background Replacement - Detail Refinement.mp4' if detail else 'Shot Revision 2 - 3 seconds.mp4')
assert not movie.exists(),'Never overwrite a prior delivered candidate'
assert [p.name for p in sorted((WORK/'render').glob('*.png'))]==[f'{i:04d}.png' for i in range(1,73)]
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-framerate','24','-i',str(WORK/'render/%04d.png'),
    '-i',str(audio_source),'-map','0:v:0','-map','1:a:0','-vf','format=yuv420p','-c:v','libx264','-threads','2','-crf','17',
    '-preset','medium','-c:a','copy','-t','3','-movflags','+faststart',str(movie)],check=True)
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',18)
sheet=Image.new('RGB',(1280,1176),'#111820')
for row,frame in enumerate([0,36,71]):
    for col,(name,path) in enumerate([('Rejected original' if detail else 'Previous rejected attempt',previous),('Detail refinement' if detail else 'Revision 2',movie)]):
        out=WORK/f'encoded-{col}-{frame:03d}.png'
        subprocess.run(['ffmpeg','-v','error','-i',str(path),'-vf',f'select=eq(n\\,{frame})','-frames:v','1',str(out)],check=True)
        img=Image.open(out).convert('RGB')
        sheet.paste(img.resize((640,360)),(col*640,row*392+32))
        ImageDraw.Draw(sheet).text((col*640+10,row*392+6),f'{name} · {frame/24:.3f}s',font=font,fill='white')
        if col==1 and frame==36:
            img.save(DELIVERY/('Detail Refinement - actual frame.png' if detail else 'Revision 2 - actual frame.png'))
sheet.save(DELIVERY/('Rejected Original vs Detail Refinement - actual frames.png' if detail else 'Previous Attempt vs Revision 2 - actual frames.png'))
subprocess.run(['ffmpeg','-v','error','-i',str(movie),'-f','null','-'],check=True)
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-show_streams','-show_format','-of','json',str(movie)]))
v=next(s for s in probe['streams'] if s['codec_type']=='video')
assert int(v['nb_read_frames'])==72 and v['width']==1280 and v['height']==720 and v['r_frame_rate']=='24/1'
# AAC bytes are reused, so only the picture changes between these two shots.
audio_hash=[]
for path in [audio_source,movie]:
    data=subprocess.check_output(['ffmpeg','-v','error','-i',str(path),'-vn','-c:a','copy','-f','adts','pipe:1'])
    audio_hash.append(hashlib.sha256(data).hexdigest())
assert audio_hash[0]==audio_hash[1]
result={'movie':str(movie),'sha256':hashlib.sha256(movie.read_bytes()).hexdigest(),'frames':72,'fps':24,'duration':3,
    'wholeVideoRendered':False,'fullDecodePassed':True,'probe':probe,'previousAttemptAudioBytesPreserved':True,
    'actualSourceRGB':[1110,1000],'foregroundRender':'Blender separate sharp foreground scene over existing defocused physical set',
    'matte':'Cached pinned native ViTMatte head/earring refinement + existing Composite foreground-colour recovery; source-specific imported matte' if detail else 'Source-guided per-frame head/earring refinement; private source-specific preprocessing',
    'professionalQualification':False,'ownerCreativeApproval':False,'visualAssessment':'Pending actual encoded-frame and playback review'}
(ROOT/('detail-refinement.json' if detail else 'revision-2.json')).write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='probe'},indent=2))
