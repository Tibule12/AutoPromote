import json,wave,shutil
from pathlib import Path
from piper import PiperVoice
from piper.config import SynthesisConfig
R=Path(__file__).resolve().parents[2];W=Path('/home/tibule12/.local/share/autopromote-qa/education-20261124/steady-navigation');old={x['id']:x for x in json.loads((W/'narration.json').read_text())};items=json.loads((R/'scripts/education/steady-navigation-script.json').read_text());v=PiperVoice.load('/home/tibule12/.cache/autopromote-education-20261124/voices/en_US-ljspeech-high.onnx',use_cuda=False)
for x in items:
 target=W/(x['id']+'.wav')
 if x['id']in old and old[x['id']]['text']==x['text']:
  if Path(old[x['id']]['file'])!=target:shutil.copy2(old[x['id']]['file'],target)
 else:
  with wave.open(str(target),'wb')as f:v.synthesize_wav(x['text'],f,SynthesisConfig(length_scale=1.02))
 with wave.open(str(target),'rb')as f:x.update(file=str(target),duration=f.getnframes()/f.getframerate())
(W/'narration.json').write_text(json.dumps(items,indent=2)+'\n')
