"""Inspect canonical exports. This script cannot edit or replace their content."""
from pathlib import Path
import json, subprocess, hashlib, sys, os
import numpy as np
ROOT=Path(__file__).resolve().parent/'proof'
def samples(file):
 return np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-i',str(file),'-vn','-ar','24000','-ac','1','-f','f32le','-']),dtype='<f4').astype(np.float64)
for story in sys.argv[1:] or ['product','transition','logo']:
 folder=ROOT/story/os.environ.get('STUDIO_MOTION_TAKE','')/'tutorial'/os.environ.get('STUDIO_TUTORIAL_REVISION','');movie=folder/'final/final.mp4';plan=json.loads((folder/'lesson-plan.json').read_text())
 probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(movie)]))
 video=next(s for s in probe['streams'] if s['codec_type']=='video');duration=plan['duration']
 expected=plan.get('expectedDimensions',[720,1280])
 assert (video['width'],video['height'],video['avg_frame_rate'])==(*expected,'24/1')
 assert int(video['nb_frames'])==round(duration*24)
 assert abs(float(probe['format']['duration'])-duration)<=1/24
 subprocess.run(['ffmpeg','-v','error','-i',str(movie),'-f','null','-'],check=True)
 source,decoded=samples(folder/'narration.wav'),samples(movie);n=min(len(source),len(decoded))
 corr=float(np.corrcoef(source[:n],decoded[:n])[0,1]);assert corr>.98,corr
 result=subprocess.run(['ffmpeg','-hide_banner','-i',str(movie),'-af','loudnorm=I=-17:TP=-2:LRA=7:print_format=json','-f','null','-'],capture_output=True,text=True,check=True).stderr
 loudness=json.loads(result[result.rfind('{'):result.rfind('}')+1])
 assert -23<=float(loudness['input_i'])<=-14
 assert float(loudness['input_tp'])<=0
 times=sorted(set([0,1,2.5,duration-1]+[round(row['start']+min(3,row['duration']/2),3) for row in plan['rows']]))
 frames=[]
 for t in times:
  target=folder/'final'/f'frame-{t}.png'
  subprocess.run(['ffmpeg','-v','error','-y','-ss',str(t),'-i',str(movie),'-frames:v','1','-update','1',str(target)],check=True)
  frames.append(dict(time=t,file=target.name))
 thumbnail=folder/'thumbnail.png'
 subprocess.run(['ffmpeg','-v','error','-y','-ss','2.5','-i',str(movie),'-frames:v','1','-update','1',str(thumbnail)],check=True)
 subprocess.run(['ffmpeg','-v','error','-y','-i',str(movie),'-vf',f'fps=1/{duration/12},scale=240:-2,tile=6x2','-frames:v','1','-update','1',str(folder/'final/contact-sheet.png')],check=True)
 subprocess.run(['ffmpeg','-v','error','-y','-i',str(movie),'-map','0:v:0','-map','0:a:0','-c:v','copy','-c:a','libmp3lame','-q:a','2','-movflags','+faststart',str(folder/'final/final.ide-preview.mp4')],check=True)
 record=dict(story=story,nativeMovieSha256=hashlib.sha256(movie.read_bytes()).hexdigest(),duration=duration,
  dimensions=expected,fps=24,frames=int(video['nb_frames']),independentFullDecode=True,
  zeroOffsetVoiceCorrelation=corr,loudness=loudness,musicBed=False,presetNarration=True,
  thumbnail=dict(file='thumbnail.png',nativeFrameTime=2.5,sha256=hashlib.sha256(thumbnail.read_bytes()).hexdigest()),
  frameFiles=frames,externalPhysicalIPhoneVerified=False,ownerApproved=False,scheduled=False,
  limits='Native output and decoded speech measurements do not establish human listening approval, platform UI safety certification or whole predictive preview/render parity.')
 (folder/'final/independent-validation.json').write_text(json.dumps(record,indent=2)+'\n')
 print(json.dumps({k:record[k] for k in ['story','duration','frames','zeroOffsetVoiceCorrelation','loudness']}),flush=True)
