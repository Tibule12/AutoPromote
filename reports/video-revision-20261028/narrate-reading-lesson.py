"""Disclosed preset speech on cached local CPU. No cloned voice or paid API."""
from pathlib import Path
import sys,json,hashlib
import numpy as np
import soundfile as sf
import onnxruntime as ort
BASE=Path('/home/tibule12/Projects/AutoPromte/AutoPromote-main-integration-20261013/reports/daily-studio')
sys.path.insert(0,str(BASE/'voice-runtime'))
from kokoro_onnx import Kokoro
OUT=Path(__file__).resolve().parent/'proof/reading-lesson/narration-v2';OUT.mkdir(parents=True,exist_ok=True)
assert not (OUT/'narration-receipt.json').exists()
settings=ort.SessionOptions();settings.intra_op_num_threads=2;settings.inter_op_num_threads=1
model=BASE/'models/kokoro-onnx';session=ort.InferenceSession(str(model/'kokoro-v1.0.int8.onnx'),sess_options=settings,providers=['CPUExecutionProvider']);voice=Kokoro.from_session(session,str(model/'voices-v1.0.bin'))
segments=[('hook',5,'Make your text move, without making people pause to read it.'),('result',5,'Here is the finished poster. Now, build that entrance in Auto Promote.'),('title',8,'In Graphics, add a headline. Type your words, choose the colour, and centre the text.'),('position',9,'Open Motion to place the title. Keep the important words away from the phone\'s edges and controls.'),('kinetic',9,'Choose Rise and Letters. Set Entrance to point five, and Stagger to point zero six five.'),('build',8,'Build editable text motion. The first keys bring the letters in. After they land, give the words a reading hold.'),('check',8,'Keep the full phrase visible. Play it once without stopping. If you cannot finish reading, extend the title.'),('closing',8,'A quick entrance. A calm hold. Build yours in Auto Promote. What word would you animate first?')]
joined=[];rows=[];clock=0
for name,budget,text in segments:
 audio,rate=voice.create(text,voice='bf_emma',speed=1.02,lang='en-gb');seconds=len(audio)/rate
 if seconds>budget-.18:
  audio,rate=voice.create(text,voice='bf_emma',speed=min(1.15,1.02*seconds/(budget-.2)),lang='en-gb');seconds=len(audio)/rate
 assert seconds<=budget,(name,seconds,budget)
 audio=np.pad(audio,(0,round(budget*rate)-len(audio)))
 sf.write(OUT/(name+'.wav'),audio,rate,subtype='PCM_16');joined.append(audio);rows.append(dict(id=name,text=text,start=clock,duration=budget,speechSeconds=seconds));clock+=budget
raw=np.concatenate(joined);sf.write(OUT/'narration-24k.wav',raw,rate,subtype='PCM_16')
import subprocess
subprocess.run(['ffmpeg','-v','error','-y','-i',str(OUT/'narration-24k.wav'),'-af','loudnorm=I=-17:TP=-2:LRA=7','-ar','48000','-ac','2',str(OUT/'narration.wav')],check=True)
(OUT/'narration-receipt.json').write_text(json.dumps(dict(voice='bf_emma',model='Kokoro-82M int8',syntheticPresetNarration=True,voiceCloning=False,paidExecution=False,gpuJobs=0,seconds=clock,segments=rows,sha256=hashlib.sha256((OUT/'narration.wav').read_bytes()).hexdigest()),indent=2)+'\n')
print(json.dumps({'seconds':clock,'segments':len(rows),'presetVoice':'bf_emma','cpuOnly':True}))
