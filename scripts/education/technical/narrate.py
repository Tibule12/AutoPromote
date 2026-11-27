"""Offline synthetic narration. Source movie is an EMPTY stage, never animation."""
import os,json,subprocess,wave
from pathlib import Path
from piper import PiperVoice
from piper.config import SynthesisConfig
R=Path(__file__).resolve().parents[3];A=R/'frontend/public/education/technical-v1';W=Path(os.environ.get('TECHNICAL_EDUCATION_WORK','/home/tibule12/.local/share/autopromote-qa/education-technical-20261125/revision2'));catalog=json.loads((W/'catalog.json').read_text())
voice=PiperVoice.load('/home/tibule12/.cache/autopromote-education-20261124/voices/en_US-ljspeech-high.onnx',use_cuda=False)
def say(text,file,max_seconds=None):
 scale=1.04
 for _ in range(8):
  with wave.open(str(file),'wb')as out:voice.synthesize_wav(text,out,SynthesisConfig(length_scale=scale))
  with wave.open(str(file),'rb')as f:d=f.getnframes()/f.getframerate()
  if not max_seconds or d<max_seconds:return d
  scale*=max_seconds/d*.95
 raise RuntimeError('Narration exceeds its phase')
common=[
 ('workspace','Workspace → Viral Clip Studio','Click Viral Clip Studio in the workspace. Each tool path shown at the top identifies where we are; long panel scrolling is shortened.'),
 ('upload','Viral Clip Studio → Choose videos','Choose videos and select source dot M P four from the practice kit. It is a plain stage with our concept narration, not a finished animation.'),
 ('open','Viral Clip Studio → Open Creator Studio','Open Creator Studio. Keep the preview, tools and timeline visible together. We will build the explanation with ordinary editable layers.'),
 ('pause','Preview → After → Full','Pause the comparison, choose After and set preview quality to Full. This shows the actual editable composition before any final render.'),
 ('reframe','Reframe → 16:9; View options → Fit full','Open Reframe. Choose sixteen by nine and Show Everyone. Under View options choose Fit full and turn the main frame off. Rounded footage stays off.'),
 ('sound','Sound → Keep original audio','Open Sound. Keep original audio on and voice repair off. The source carries the disclosed synthetic teaching voice; Studio will preserve it.'),
 ('captions','Captions → Preview captions off','Open Captions and leave preview captions off. The diagram labels explain the concept; there are no subtitle or caption tracks.'),
 ('graphics','Graphics → Import animated graphics','Click Graphics. Close Logo Workshop, then open Import animated graphics. The path label keeps you oriented while we move directly to the right control.'),
 ('import','Graphics → Import graphics composition…','Import starter dot graphics dot J S O N. Prepared static diagrams become ordinary native layers and keys. One deliberately incomplete value lets us practise the real motion controls.'),
 ('motion','Motion → Transform keyframes → Target layer','Click Motion, then Transform keyframes. Always check Target layer before changing a value. The supplied scaffold remains editable; it is not a flattened animation.'),
 ('original','Graphics → Add title layer → Label','Now create an original annotation. Click Graphics, find Add title layer and choose Label. This is a normal editable text layer.'),
 ('label','Graphics → Title text / time / size','Type Predict first. Set its start to twenty-four seconds, duration four seconds, size point five five and box width sixty percent.'),
 ('place','Motion → Transform keyframes → X / Y','Select the new title in Motion. Set X to fifty and Y to eighty-four. That places it in the reserved footer; check that it never covers the technical diagram.'),
 ('remove','Graphics → selected title → Remove','Return to Graphics and remove this practice label. Our final lesson already has its own footer callout. Keep the exercise project separately if you want to develop it.'),
 ('preview','Preview → seek zero → Play','Return the playhead to zero and play the full editable lesson. Check the relationships, timing, labels and sound before spending render time.'),
 ('save','Show media → Project name → Save','Choose Show media. Give this project a unique subject name and save it. The diagram layers, keys, audio and technical decisions stay editable.'),
 ('export','Export → 720p → 24 fps','Open Export. Choose seven twenty p and twenty-four frames per second. Keep the full twenty-eight-second programme and its original narration.'),
 ('render','Export → Render Final Clip','Click Render Final Clip. This recording uses the isolated local C P U worker and finite symbolic credits. The unattended processing wait is omitted.'),
 ('finished','Export → Show Finished Video','Choose Show Finished Video, then watch the complete native Studio export. Compare it with the editable preview. The tutorial ends with the actual result and its sound.')]
for l in catalog['lessons']:
 d=W/l['id'];d.mkdir(exist_ok=True);cues=[]
 for i,text in enumerate(l['voices']):
  f=d/f'concept-{i}.wav';dur=say(text,f,6.65);cues.append({'start':i*7+.15,'duration':dur,'text':text,'file':str(f)})
 (d/'concept-cues.json').write_text(json.dumps(cues,indent=2))
 cmd=['ffmpeg','-v','error','-y','-f','lavfi','-i','color=c=0x0c1628:s=1280x720:r=24:d=28'];filters=[]
 for i,c in enumerate(cues):cmd+=['-i',c['file']];filters.append(f'[{i+1}:a]adelay={round(c["start"]*1000)}:all=1[a{i}]')
 filters.append(''.join(f'[a{i}]'for i in range(4))+'amix=inputs=4:normalize=0,apad=whole_dur=28,alimiter=limit=0.92[audio]')
 subprocess.run(cmd+['-filter_complex',';'.join(filters),'-map','0:v','-map','[audio]','-c:v','libx264','-threads','2','-preset','fast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-b:a','144k','-t','28','-movflags','+faststart',str(A/l['id']/'source.mp4')],check=True)
 c=l['demoControl'];subject={
 'egd-drawing-views':('Choose Front focus. In the curve editor choose stroke End at two point eight seconds. The starter stops at fifty-five percent.','Set the selected key value to one hundred, with Ease in out. Now the native outline draws all the way around the front view.','Choose Top focus next. Its outline reaches one hundred at eight point eight seconds. Compare the matching dimensions and third-angle layout.'),
 'mechanical-gears':('Choose Driver gear. In the curve editor choose rotation at twenty-four seconds. The starter ends at ninety degrees, so its last interval is incomplete.','Change the selected key value to one hundred and eighty and choose Linear. From minus one eighty to plus one eighty is one full revolution.','Choose Driven gear. Its keys are ninety, forty-five, zero, minus forty-five and minus ninety at four, nine, fourteen, nineteen and twenty-four seconds. Linear keeps the opposite half-speed relationship.'),
 'electrical-simple-circuit':('Choose Switch lever. In the curve editor choose rotation at nine point five seconds. The starter stops at minus fifteen, leaving a visible gap.','Set this key to zero degrees, with Linear interpolation. The lever now reaches the contact. The lamp must not light before the circuit closes.','Choose Lamp light. Its opacity changes to one at nine point five seconds and back to zero when contact breaks. Indicators run only inside the closed interval.'),
 'civil-brick-sequence':('Choose Course two. In the curve editor choose Y at eight point nine seconds. The starter leaves this course twenty drawing pixels too high.','Set the selected Y key to sixty-three point eight eight eight nine, with Ease out. The course settles onto the previous bed joint.','Click Composite. Under Graphic groups, find Wall crop. Turn its mask off to see the continuing courses, then back on. The polygon path gives the exact crop. These edge fragments are not cutting instructions.')
 }[l['id']]
 rows=list(common);at=next(i for i,r in enumerate(rows)if r[0]=='original');rows[at:at]=[('key','Motion → Curve keyframe',subject[0]),('change','Motion → Selected key value / easing',subject[1]),('relationship','Motion → related target / mask',subject[2])]
 out=d/'guide-voice';out.mkdir(exist_ok=True);lines=[]
 for id,path,text in rows:
  if l['id']=='civil-brick-sequence'and id=='relationship':path='Composite → Graphic groups → Wall crop → mask'
  f=out/(id+'.wav');dur=say(text,f);lines.append({'id':id,'path':path,'text':text,'file':str(f),'duration':dur})
 (d/'guide-voice.json').write_text(json.dumps(lines,ensure_ascii=False,indent=2));print(l['id'], 'narrated stage and aligned guide cues ready',flush=True)
