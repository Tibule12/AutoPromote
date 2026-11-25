import json,wave
from pathlib import Path
from piper import PiperVoice
from piper.config import SynthesisConfig
W=Path('/home/tibule12/.local/share/autopromote-qa/education-20261124/cat/extensions'); lines=json.loads((W.parent/'tutorial-voice/narration.json').read_text()); out=W/'guide-voice';out.mkdir(exist_ok=True)
changes={'graphics':'Open Graphics. Close Logo Workshop to make room for this lesson’s controls. Then scroll down through the panel.','export':'Open Export. Choose seven twenty p and twenty-four frames per second. These are the settings for our complete twenty-eight-second lesson.','render':'Now click Render Final Clip. Approve the local render. The unattended processing wait is omitted from this tutorial.','finished':'The actual Studio export is ready. Choose Show Finished Video. Then watch the whole result and check the code, the focus regions, the narration and the browser output.'}
v=PiperVoice.load('/home/tibule12/.cache/autopromote-education-20261124/voices/en_US-ljspeech-high.onnx',use_cuda=False)
for id,text in changes.items():
 p=out/(id+'.wav')
 with wave.open(str(p),'wb')as f:v.synthesize_wav(text,f,SynthesisConfig(length_scale=1.02))
 with wave.open(str(p),'rb')as f:duration=f.getnframes()/f.getframerate()
 line={'id':id,'text':text,'file':str(p),'duration':duration}
 if any(l['id']==id for l in lines): lines=[line if l['id']==id else l for l in lines]
 else:lines.append(line)
(W/'guide-voice.json').write_text(json.dumps(lines,indent=2))
