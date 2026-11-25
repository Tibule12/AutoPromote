import json,wave
from pathlib import Path
from piper import PiperVoice
from piper.config import SynthesisConfig
R=Path(__file__).resolve().parents[3];A=R/'frontend/public/education/cat-html-v1';W=Path('/home/tibule12/.local/share/autopromote-qa/education-20261124/cat');V=PiperVoice.load('/home/tibule12/.cache/autopromote-education-20261124/voices/en_US-ljspeech-high.onnx',use_cuda=False)
for lesson in json.loads((A/'catalog.json').read_text())['lessons']:
 d=W/lesson['id'];d.mkdir(exist_ok=True)
 with wave.open(str(d/'concept-voice.wav'),'wb') as out: V.synthesize_wav(lesson['voice'],out,SynthesisConfig(length_scale=1.0))
 with wave.open(str(d/'concept-voice.wav'),'rb') as f: duration=f.getnframes()/f.getframerate()
 (d/'concept-voice.json').write_text(json.dumps({'text':lesson['voice'],'duration':duration},indent=2))
 print(lesson['id'],round(duration,2),flush=True)
