"""Inspect native output; optional utility comparison only. No evaluated effects are authored here."""
from pathlib import Path
import json, subprocess, hashlib, shutil
from PIL import Image,ImageDraw
root=Path(__file__).resolve().parents[2]
out=Path('/dev/shm/autopromote-whatsapp-director-20261103');p=out/'proof'
movie=p/'native-motion-flow/final.mp4'
def run(a):return subprocess.run(a,check=True,capture_output=True)
def sha(f):return hashlib.sha256(f.read_bytes()).hexdigest()
d=json.loads(run(['ffprobe','-v','error','-count_frames','-show_streams','-show_format','-of','json',str(movie)]).stdout)
v=next(s for s in d['streams'] if s['codec_type']=='video');assert int(v['nb_read_frames'])==576;assert (v['width'],v['height'],v['r_frame_rate'])==(1280,720,'24/1');assert any(s['codec_type']=='audio' for s in d['streams'])
run(['ffmpeg','-v','error','-i',str(movie),'-f','null','-'])
times=[.1,.75,1.75,2.958333,3,3.8,5.5,8,8.958333,9,10.1,12.2,13.958333,14,15.2,17.6,19.6,20.958333,21,21.7,23,23.958333]
frames=p/'Inspection';frames.mkdir(exist_ok=True)
contact=Image.new('RGB',(1280,4*205),(17,17,20));draw=ImageDraw.Draw(contact)
for i,t in enumerate(times):
 f=frames/f'{t:.6f}.jpg';run(['ffmpeg','-v','error','-ss',str(t),'-i',str(movie),'-frames:v','1','-y',str(f)])
 im=Image.open(f);im.thumbnail((316,178));x=(i%4)*320;y=(i//4)*205
 # Two contact pages keep every sampled source/cue boundary legible.
 page=i//16
 if i==16:
  contact.save(p/'Contact 1.jpg');contact=Image.new('RGB',(1280,4*205),(17,17,20));draw=ImageDraw.Draw(contact)
 y=((i%16)//4)*205
 contact.paste(im,(x,y));draw.text((x+5,y+182),f'{t:.3f}s',fill='white')
contact.save(p/'Contact 2.jpg')
src=json.loads((out/'sources.json').read_text())
for item in src:assert sha(Path(item['path']))==item['sha256']
(p/'native-validation.json').write_text(json.dumps({'sha256':sha(movie),'frames':576,'fps':24,'seconds':24,'width':1280,'height':720,'fullDecode':True,'sampleTimes':times,'originalSourcesUnchanged':True,'audioStreams':[s for s in d['streams'] if s['codec_type']=='audio']},indent=2))
print('576 native frames decoded; all four originals unchanged; two contacts ready')
