"""Editable score arrangements for short edits, derived from original stems."""
from pathlib import Path
import numpy as np,subprocess,json,hashlib
r=Path(__file__).resolve().parents[3]/'reports/flagship-founder-film-20261008';o=r/'assets/sound';sr=48000
for name,segments in [('cutdown',[(0,3),(29,3.5),(36,4),(42,6.5),(55,5),(61,5)]),('teaser',[(49,3),(55,4),(63,3)])]:
 for stem in ['score','cues']:
  wav=o/(stem+'.wav');raw=subprocess.run(['ffmpeg','-v','error','-i',str(wav),'-f','f32le','-ac','2','-ar',str(sr),'-'],capture_output=True,check=True).stdout;samples=np.frombuffer(raw,dtype='<f4').reshape(-1,2);parts=[]
  for at,d in segments:
   data=samples[round(at*sr):round((at+d)*sr)].copy();n=round(.035*sr);data[:n]*=np.linspace(0,1,n)[:,None];data[-n:]*=np.linspace(1,0,n)[:,None];parts.append(data)
  final=np.concatenate(parts);tmp=o/(stem+'-'+name+'.f32');tmp.write_bytes(final.astype('<f4').tobytes());target=o/(stem+'-'+name+'.wav');subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar',str(sr),'-ac','2','-i',str(tmp),'-c:a','pcm_s16le',str(target)],check=True);tmp.unlink()
  (o/(stem+'-'+name+'-receipt.json')).write_text(json.dumps({'status':'GENERATED_PENDING_REVIEW','tool':'Original AutoPromote score arrangement / CPU','model':'authored narrative synthesis','modelRevision':hashlib.sha256((o/'sound-plan.json').read_bytes()).hexdigest(),'settings':{'sampleRate':sr,'channels':2,'sourceRanges':segments,'boundaryFadesSeconds':.035},'sourceLineage':{'sourcePath':str(wav),'sourceSha256':hashlib.sha256(wav.read_bytes()).hexdigest()},'artifact':{'path':str(target),'duration':len(final)/sr,'sha256':hashlib.sha256(target.read_bytes()).hexdigest()}},indent=2))
print('Short score and sound cues ready: 27s and 10s.')
