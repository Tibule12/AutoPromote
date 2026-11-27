"""Offline CPU narration. Standard public-domain-data voice; no voice cloning."""
import json,wave,hashlib
from pathlib import Path
from piper import PiperVoice
from piper.config import SynthesisConfig
ROOT=Path(__file__).resolve().parents[2]
WORK=Path('/home/tibule12/.local/share/autopromote-qa/education-20261124')
VOICE=Path('/home/tibule12/.cache/autopromote-education-20261124/voices/en_US-ljspeech-high.onnx')
voice=PiperVoice.load(VOICE,use_cuda=False)
lessons=[x for x in json.loads((ROOT/'frontend/src/education/lessons.json').read_text())['lessons'] if x['number']<=5]
script=[
 ['A video can show what your program does. In this project, we explain a byte converter. Keep the code and the output visible, and use only non-personal practice data.', 'Choose the normal input recording. Open Creator Studio. The media library holds sources; the timeline decides what the audience will see.', 'In Reframe, choose sixteen by nine and preserve the frame. Cropping a screen recording can hide the evidence you are trying to explain.', 'Play the original recording. The input is eighteen. Sixteen and two are the active bit positions, so the output is correct.', 'Give the project a useful name and save it. Export a viewing copy separately. Your source code, editable project and movie each serve a different purpose.'],
 ['Remove waiting, but keep the evidence. A technical edit must still show the input, the action and the result.', 'In Cut, trim the start at source second one. At programme second six, click Trim end to here. This keeps six seconds.', 'Move the edited output position to three seconds, then split. The programme clock starts after your trim; it is different from the source clock.', 'Play across the split. A cut should help the explanation, not hide a failed test. Save both editable occurrences and export the six-second result.'],
 ['A useful test report explains normal, boundary and invalid cases. We will put three recordings into one twelve-second sequence.', 'The first clip shows eighteen working normally. Set the source start to one second and its end to five seconds.', 'Import the boundary recording and add it to the sequence. Use source seconds three to seven so the upper limit, two hundred and fifty-five, stays visible.', 'Import the invalid recording, add it to the sequence, and use seconds one to five. The program must reject two hundred and fifty-six.', 'Review the cuts at four and eight seconds. The movie should support a written test table with expected and actual results, not replace it.'],
 ['An annotation should explain what the audience can already see. We will label the active bit weights without covering the code.', 'Open the six-second source interval. In Graphics, add a headline and write: eighteen equals sixteen plus two.', 'Set the label to start at one second and last four seconds. Use a clear lower margin, white text, and the supported Inter font.', 'Play the moving result, then compare the export. Wording, placement and timing must agree. Keep the label editable for corrections.'],
 ['A clear voice connects the visible output to the idea. Use narration to explain, not to compete with the picture.', 'In Sound, import the provided voiceover. This is a disclosed synthetic reading of an original script, not a cloned student or teacher.', 'Place the voiceover at zero seconds and set its volume to one hundred percent. This source recording is silent, so no original speech needs mixing.', 'Play the whole six seconds. Check that the words about eighteen and the bit weights refer to what is visible.', 'In Export, choose seven twenty p, twenty-four frames per second, H dot two sixty-four and A A C audio. Render once, then download and inspect the complete movie with sound.']]
records=[]
for lesson,lines in zip(lessons,script):
 folder=WORK/lesson['id']/'narration';folder.mkdir(parents=True,exist_ok=True)
 for i,text in enumerate(lines):
  target=folder/f'{i:02}.wav'
  with wave.open(str(target),'wb')as f:voice.synthesize_wav(text,f,SynthesisConfig(length_scale=1.0))
  with wave.open(str(target),'rb')as f:duration=f.getnframes()/f.getframerate()
  records.append(dict(lessonId=lesson['id'],chapter=i,text=text,file=str(target),duration=duration,sha256=hashlib.sha256(target.read_bytes()).hexdigest()))
 target=ROOT/'frontend/public/education/it-studio-v1/byte-explanation.wav'
with wave.open(str(target),'wb')as f:voice.synthesize_wav('Eighteen is sixteen plus two. The lit bits explain the value.',f,SynthesisConfig(length_scale=.92))
(WORK/'narration.json').write_text(json.dumps({'model':str(VOICE),'modelSha256':hashlib.sha256(VOICE.read_bytes()).hexdigest(),'cpuOnly':True,'disclosure':'Standard synthetic narration. Public-domain LJ Speech dataset voice; no identity cloning.','chapters':records},indent=2))
print('Prepared',len(records),'narrated teaching chapters',flush=True)
