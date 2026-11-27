import json,wave
from pathlib import Path
from piper import PiperVoice
from piper.config import SynthesisConfig
R=Path(__file__).resolve().parents[3];A=R/'frontend/public/education/cat-html-v1';W=Path('/home/tibule12/.local/share/autopromote-qa/education-20261124/cat');V=PiperVoice.load('/home/tibule12/.cache/autopromote-education-20261124/voices/en_US-ljspeech-high.onnx',use_cuda=False)
texts={
'html-structure':[(0,'HTML describes a webpage. The head contains information about the page.'),(6.5,'Title names the browser tab. It is different from the visible heading.'),(13,'The body holds visible content. H one creates a heading. P starts a paragraph.'),(20,'B makes Friday bold; I makes the time italic. Close nested tags in reverse order. Predict a title-only change.')],
'html-images-links':[(0,'Attributes add information inside an opening tag. S R C gives the image path.'),(9,'A wrong path breaks the image. Check the filename and folder.'),(16,'Alt describes the image. Here the corrected file loads.'),(22,'H ref gives the destination. Click the link: the browser opens the other page.')],
'html-lists-tables':[(0,'U L makes an unordered list. Each L I is one item.'),(9,'Change U L to O L when the order matters. The browser now numbers the items.'),(16,'A table contains rows. T H marks header cells. T D holds data. Friday matches Build.'),(24,'Legacy border attribute. Modern sites use C S S.')],
}
for lesson in json.loads((A/'catalog.json').read_text())['lessons']:
 d=W/lesson['id'];d.mkdir(exist_ok=True);cues=[]
 for i,(start,text) in enumerate(texts[lesson['id']]):
  p=d/f'concept-{i}.wav'
  with wave.open(str(p),'wb')as out:V.synthesize_wav(text,out,SynthesisConfig(length_scale=1.04))
  with wave.open(str(p),'rb')as f:duration=f.getnframes()/f.getframerate()
  end=texts[lesson['id']][i+1][0]if i<3 else 28
  assert start+duration<end+.15,(lesson['id'],i,duration,end-start)
  cues.append({'start':start,'file':str(p),'duration':duration,'text':text})
 (d/'concept-cues.json').write_text(json.dumps(cues,indent=2))
 print(lesson['id'],'aligned four voice sections',flush=True)
