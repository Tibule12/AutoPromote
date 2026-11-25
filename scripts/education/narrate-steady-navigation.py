import json,wave
from pathlib import Path
from piper import PiperVoice
from piper.config import SynthesisConfig
R=Path(__file__).resolve().parents[2];W=Path('/home/tibule12/.local/share/autopromote-qa/education-20261124/steady-navigation');W.mkdir(exist_ok=True)
v=PiperVoice.load('/home/tibule12/.cache/autopromote-education-20261124/voices/en_US-ljspeech-high.onnx',use_cuda=False);items=json.loads((R/'scripts/education/steady-navigation-script.json').read_text())
for i,item in enumerate(items):
 p=W/f'{i:02}.wav'
 with wave.open(str(p),'wb')as f:v.synthesize_wav(item['text'],f,SynthesisConfig(length_scale=1.02))
 with wave.open(str(p),'rb')as f:item.update(file=str(p),duration=f.getnframes()/f.getframerate())
(W/'narration.json').write_text(json.dumps(items,indent=2)+'\n')
