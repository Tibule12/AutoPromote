import json,wave
from pathlib import Path
from piper import PiperVoice
from piper.config import SynthesisConfig
W=Path('/home/tibule12/.local/share/autopromote-qa/education-20261124/cat/extensions');c=json.loads((W/'catalog.json').read_text());v=PiperVoice.load('/home/tibule12/.cache/autopromote-education-20261124/voices/en_US-ljspeech-high.onnx',use_cuda=False)
for lesson in c['lessons']:
 d=W/lesson['id'];d.mkdir(exist_ok=True);cues=[]
 for i,phase in enumerate(lesson['phases']):
  p=d/f'concept-{i}.wav'
  with wave.open(str(p),'wb')as out:v.synthesize_wav(phase['voice'],out,SynthesisConfig(length_scale=1.02))
  with wave.open(str(p),'rb')as f:duration=f.getnframes()/f.getframerate()
  if duration>6.85:
   with wave.open(str(p),'wb')as out:v.synthesize_wav(phase['voice'],out,SynthesisConfig(length_scale=max(.88,1.02*6.75/duration)))
   with wave.open(str(p),'rb')as f:duration=f.getnframes()/f.getframerate()
  assert duration<7,(lesson['id'],i,duration)
  cues.append({'start':phase['start'],'duration':duration,'text':phase['voice'],'file':str(p)})
 (d/'concept-cues.json').write_text(json.dumps(cues,indent=2)+'\n');print(lesson['id'],[round(x['duration'],2)for x in cues],flush=True)
