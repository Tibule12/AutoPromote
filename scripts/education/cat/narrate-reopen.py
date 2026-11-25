import json,wave
from pathlib import Path
from piper import PiperVoice
from piper.config import SynthesisConfig
W=Path('/home/tibule12/.local/share/autopromote-qa/education-20261124/cat');p=W/'reopen-voice.wav';text='The edit is saved. We are continuing from that saved project. Open Viral Clip Studio, then choose the lesson project. The same editable layers and keys reopen.'
v=PiperVoice.load('/home/tibule12/.cache/autopromote-education-20261124/voices/en_US-ljspeech-high.onnx',use_cuda=False)
with wave.open(str(p),'wb')as out:v.synthesize_wav(text,out,SynthesisConfig(length_scale=1.04))
with wave.open(str(p),'rb')as f:duration=f.getnframes()/f.getframerate()
(W/'reopen-voice.json').write_text(json.dumps({'id':'reopen','text':text,'file':str(p),'duration':duration},indent=2))
