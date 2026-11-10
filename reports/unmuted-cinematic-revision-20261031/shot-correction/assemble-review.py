"""Assemble only the corrected 72-frame shot and actual encoded-frame pairs."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

from PIL import Image,ImageDraw,ImageFont

ROOT=Path(__file__).resolve().parent
rejected=Path('/home/tibule12/Videos/Unmuted Podcast - Cinematic Revision - 20261031/UNMUTED - Cinematic Set Revision.mp4')
delivery=Path('/home/tibule12/Videos/Unmuted - Shot Correction - 20261031')
delivery.mkdir(exist_ok=True)
movie=delivery/'Corrected Shot - 3 seconds.mp4'
before=delivery/'Before - same 3 seconds.mp4'
assert len(list((ROOT/'private/render').glob('*.png')))==72
assert not movie.exists(),'Preserve every delivered candidate; never silently overwrite'
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-framerate','24','-i',str(ROOT/'private/render/%04d.png'),
    '-ss','4','-i',str(rejected),'-map','0:v:0','-map','1:a:0','-vf','format=yuv420p',
    '-c:v','libx264','-threads','2','-crf','17','-preset','medium','-c:a','aac','-b:a','192k',
    '-ar','48000','-ac','2','-t','3','-movflags','+faststart',str(movie)],check=True)
shutil.copyfile(ROOT/'private/before.mp4',before)
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',20)
sheet=Image.new('RGB',(1280,3*392),'#111820')
for row,frame in enumerate([0,36,71]):
    for col,(name,path) in enumerate([('before',before),('after',movie)]):
        target=ROOT/'frames'/f'{name}-encoded-{frame:03d}.png'
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-i',str(path),'-vf',f'select=eq(n\\,{frame})',
            '-frames:v','1',str(target)],check=True)
        actual=Image.open(target).convert('RGB')
        sheet.paste(actual.resize((640,360)),(col*640,row*392+32))
        ImageDraw.Draw(sheet).text((col*640+12,row*392+5),f'{name.upper()} · shot {frame/24:.3f}s',font=font,fill='white')
        if frame==0:
            actual.save(delivery/(name.title()+' - actual frame.png'))
sheet.save(delivery/'Before and After - actual frames.png')
for label,path in [('before',before),('after',movie)]:
    probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-show_streams','-show_format','-of','json',str(path)]))
    stream=next(s for s in probe['streams'] if s['codec_type']=='video')
    assert int(stream['nb_read_frames'])==72
    assert stream['width']==1280 and stream['height']==720 and stream['r_frame_rate']=='24/1'
    assert any(s['codec_type']=='audio' for s in probe['streams'])
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-i',str(path),'-f','null','-'],check=True)
    (ROOT/(label+'-probe.json')).write_text(json.dumps(probe,indent=2)+'\n')
manifest={'delivery':str(delivery),'duration':3,'fps':24,'frames':72,
    'beforeIntervalInRejectedMovie':[4,7],'sourceInterval':[539/24,611/24],
    'sourceClockUnchanged':True,'sound':'Existing rejected programme soundtrack, same 4–7s interval; no new sound generation',
    'files':{p.name:{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in delivery.iterdir() if p.is_file()},
    'technicalDecodePassed':True,'creativePass':False,'professionalQualification':False,
    'note':'Visual judgment is recorded separately; successful encoding is not creative acceptance.'}
(ROOT/'delivery.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest,indent=2))
