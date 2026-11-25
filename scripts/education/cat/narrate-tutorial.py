import json,wave
from pathlib import Path
from piper import PiperVoice
from piper.config import SynthesisConfig
R=Path(__file__).resolve().parents[3];W=Path('/home/tibule12/.local/share/autopromote-qa/education-20261124/cat/tutorial-voice');W.mkdir(exist_ok=True);V=PiperVoice.load('/home/tibule12/.cache/autopromote-education-20261124/voices/en_US-ljspeech-high.onnx',use_cuda=False);items=json.loads((R/'scripts/education/cat/tutorial-script.json').read_text())
for i,item in enumerate(items):
 p=W/f'{i:02}.wav'
 if not p.exists():
  with wave.open(str(p),'wb')as out:V.synthesize_wav(item['text'],out,SynthesisConfig(length_scale=1.04))
 with wave.open(str(p),'rb')as f:item.update(file=str(p),duration=f.getnframes()/f.getframerate())
(W/'narration.json').write_text(json.dumps(items,indent=2));print('23 aligned tutorial cues ready.')
