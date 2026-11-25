import json,wave,sys
from pathlib import Path
from piper import PiperVoice
from piper.config import SynthesisConfig
R=Path(__file__).resolve().parents[2];W=Path('/home/tibule12/.local/share/autopromote-qa/education-20261124/click-by-click');W.mkdir(exist_ok=True)
v=PiperVoice.load('/home/tibule12/.cache/autopromote-education-20261124/voices/en_US-ljspeech-high.onnx',use_cuda=False)
s=json.loads((R/'scripts/education/click-lesson-script.json').read_text())
for i,c in enumerate(s):
 if len(sys.argv)>1 and c['id']!=sys.argv[1]:
  p=W/f'{i:02}.wav'
  with wave.open(str(p),'rb')as f:c.update(file=str(p),duration=f.getnframes()/f.getframerate())
  continue
 p=W/f'{i:02}.wav'
 with wave.open(str(p),'wb')as f:v.synthesize_wav(c['text'],f,SynthesisConfig(length_scale=1.04))
 with wave.open(str(p),'rb')as f:c.update(file=str(p),duration=f.getnframes()/f.getframerate())
(W/'narration.json').write_text(json.dumps(s,indent=2)+'\n');print('Prepared explicit control-by-control narration.')
