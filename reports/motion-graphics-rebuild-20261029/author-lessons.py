"""Speech and static title sources. All final editing stays in native Studio."""
from pathlib import Path
import json, sys, subprocess, hashlib, os
import numpy as np
import soundfile as sf
import onnxruntime as ort

ROOT = Path(__file__).resolve().parent
BASE = Path('/home/tibule12/Projects/AutoPromte/AutoPromote-main-integration-20261013/reports/daily-studio')
sys.path.insert(0, str(BASE/'voice-runtime'))
from kokoro_onnx import Kokoro

scripts = {
 'product': [
 ('source-import', 'START WITH LAYERS', 'Import the separate artwork', 'Start with separate artwork for the can, lime slices, leaf and shadow. In Graphics, import the source composition. These are illustrated sample assets.'),
 ('motion-0', 'GIVE IT WEIGHT', 'Motion / Transform keyframes', 'In Motion, target the can. Start it lower, smaller and tilted, with opacity at zero. Add a transform keyframe. Move forward, raise it and bring opacity to one. Add a slight overshoot, then a settled pose. Choose Ease out.'),
 ('motion-1', 'OFFSET THE ARRIVALS', 'Rear lime / earlier entrance', 'Select the back lime as its own layer. Start it off to the left, with a smaller scale and a stronger rotation. Add its landing keys a little after the can. The offset keeps everything from arriving together.'),
 ('motion-2', 'BUILD THE DEPTH', 'Leaf / a separate motion rhythm', 'Now target the leaf. Bring it in from the other side, and let it settle above the can. A separate start time and direction make the composition feel layered without needing a three dimensional scene.'),
 ('motion-3', 'ADD THE FOREGROUND', 'Front lime / later entrance', 'Bring the front lime in last. Let it grow slightly beyond its resting size, then settle back. The rear slice, can and front slice overlap in a deliberate order. Keep the product label visible.'),
 ('motion-4', 'GROUND THE PRODUCT', 'Shadow / fade with the landing', 'Animate the ground shadow separately. It starts smaller and transparent, then widens as the can lands. Keep the shadow quiet. Its job is to give the product a base, rather than compete for attention.'),
 ('editable-type', 'CHOREOGRAPH THE TYPE', 'Graphics / Animate this title', 'Select the headline in Graphics. Choose Animate this title, then Words and Ease out. Add a short upward travel and a stagger, and rebuild the entrance keys. The copy stays one editable title. Watch the entrance, then leave the phrase still long enough to read.'),
 ],
 'transition': [
 ('source-import', 'ASSEMBLE THE DESIGN', 'Import separate headphone parts', 'Import the separate headphone artwork in Graphics. The headband, earcups, texture and circular wipe are independent layers. That lets the transition grow out of the design.'),
 ('motion-0', 'MOVE THE HEADBAND', 'Motion / Transform keyframes', 'Target the headband in Motion. Begin above its final position, slightly smaller and rotated, with opacity at zero. Add a transform keyframe. Move forward and add an overshoot, then the settled pose. Use Ease out so the arrival slows down.'),
 ('motion-1', 'BRING IN ONE SIDE', 'Left earcup / offset the keys', 'Select the left earcup. Give it a sideways entrance and a different start time from the headband. Add the landing and settling keys. Keep its final position aligned with the band, rather than letting the parts drift apart.'),
 ('motion-2', 'ANSWER FROM THE RIGHT', 'Right earcup / a later arrival', 'Now animate the right earcup from the opposite side. Start it slightly later. Matching the final alignment gives you a complete object, while the different starting positions create the assembly. Scrub the early frames to check that order.'),
 ('motion-3', 'BUILD THE CENTRE', 'Listening core / scale and rotation', 'Bring the listening texture up from a small scale. Let it turn slowly after it arrives. The texture is a separate source illustration. Its movement supports the headphone design, without moving the headline or the whole scene.'),
 ('motion-4', 'LET THE CIRCLE LEAD', 'Cover the cut, then reveal', 'Animate the circular layer from small to large enough to cover the frame. The second colour and headphone layout begin behind that cover. Then shrink the circle again. The hidden scene change makes the transition feel connected to the object.'),
 ('ellipse-mask', 'SHAPE THE TEXTURE', 'Composite / ellipse mask', 'In Composite, choose the listening core as the target. Enable its mask and select Ellipse. This clips the square texture into the circular centre. The mask belongs to that layer, so the other headphone parts stay intact.'),
 ('editable-type', 'KEEP THE WORDS CLEAR', 'Graphics / editable word entrance', 'Animate the opening headline by Words, with Ease out and a short stagger. Rebuild the entrance keys, then inspect the complete phrase. Keep it clear of the headphones. The transition can move quickly, but the message still needs a calm reading hold.'),
 ],
 'logo': [
 ('logo-import', 'USE THE REAL IDENTITY', 'Graphics / Logo motion', 'Open Logo motion in Graphics and choose the original transparent logo. Enable Separate left symbol from wordmark, and set the symbol width. Keep the original gradient and lettering. This demonstration uses masked bitmap components, not automatic vector tracing.'),
 ('component-build', 'BUILD EDITABLE MOTION', 'Build editable logo motion', 'Choose Build editable logo motion. Studio creates timed component layers and motion keys. Scrub the assembly: the symbol pieces arrive before the complete identity. You can select and change each component, instead of moving one rectangle.'),
 ('component-keys', 'REFINE A COMPONENT', 'Motion / Curve keyframe', 'In Motion, target the second symbol ribbon. Select a Curve keyframe and adjust its value. Undo once to compare, then redo the change. Scrub the early assembly and the landing. This is the actual control workflow: change one component, check its relationship to the others, and keep the final mark intact.'),
 ('original-lockup', 'RESOLVE TO THE ORIGINAL', 'Inspect the settled wordmark', 'Select the original gradient wordmark and inspect the later frames. The symbol resolves into the original lockup. Check the spacing and contrast. The final lettering should stay recognisable.'),
 ]}
hooks = {
 'product': ('BUILD A\nPRODUCT REVEAL', 'Build this product reveal from separate layers.'),
 'transition': ('BUILD A\nCONNECTED WIPE', 'Make the transition part of the design.'),
 'logo': ('MAKE THE\nLOGO ASSEMBLE', 'Build the reveal from the logo itself.')}
polish = {
 'product': ('CUT THE CLUTTER', 'Larger words / cleaner spacing', 'Remove the tiny top label. Resize and position the headline, then simplify the source label. Small text should not fight the product.'),
 'transition': ('FINISH THE REVEAL', 'Fade the wipe after it opens', 'Fade the circle out after it shrinks. It should reveal the headphones, rather than sit over them. Inspect the later frames to make sure the design is fully visible.'),
 'logo': ('PROTECT THE IDENTITY', 'Clean stage / original gradient', 'Remove the promotional layers. Add a light stage underneath, so the original lettering stays clear.')}
closing = {
 'product': 'Watch the sequence again: product first, supporting layers next, then a readable headline. Start with your own separate artwork in Auto Promote. What product would you build this around?',
 'transition': 'Watch the full transition: assemble the object, cover the scene change, then reveal the new colour. Build your own version in Auto Promote. Which two looks would you connect?',
 'logo': 'Here is the complete reveal on a clean stage. Keep the original identity, and let its components create the motion. Try your own logo in Auto Promote.'}

settings = ort.SessionOptions(); settings.intra_op_num_threads = 2; settings.inter_op_num_threads = 1
model = BASE/'models/kokoro-onnx'
session = ort.InferenceSession(str(model/'kokoro-v1.0.int8.onnx'), sess_options=settings, providers=['CPUExecutionProvider'])
voice = Kokoro.from_session(session, str(model/'voices-v1.0.bin'))

for story in sys.argv[1:] or scripts:
 folder = ROOT/'proof'/story/os.environ.get('STUDIO_MOTION_TAKE','')
 out = folder/'tutorial'; out.mkdir(exist_ok=True)
 assert not (out/'lesson-plan.json').exists(), 'Preserve the prepared lesson.'
 native = json.loads((folder/'teaching-actions.json').read_text())
 steps = {s['id']:s for s in native['steps']}
 refined = json.loads((folder/'polish-actions.json').read_text())['actions']
 changes = [a for a in refined if a['id'] != 'review-the-refinement']
 edit = folder/'editing-in-studio.mp4'; refinement = folder/'polish-editing-in-studio.mp4'
 result = folder/'result/final.mp4'
 rows = [dict(id='hook', title=hooks[story][0], instruction='', speech=hooks[story][1], file=str(result), sourceStart=0, duration=5, camera='result')]
 for sid, title, instruction, speech in scripts[story]:
  step = steps[sid]
  rows.append(dict(id=sid, title=title, instruction=instruction, speech=speech, file=str(edit), sourceStart=step['start'], duration=step['end']-step['start'], camera='controls'))
 title, instruction, speech = polish[story]
 rows.append(dict(id='refinement', title=title, instruction=instruction, speech=speech, file=str(refinement), sourceStart=changes[0]['start'], duration=changes[-1]['end']-changes[0]['start'], camera='controls'))
 rows.append(dict(id='payoff', title='BUILD IT\nIN STUDIO', instruction='Make your version', speech=closing[story], file=str(result), sourceStart=0, duration=14 if story=='logo' else 16, camera='result'))
 joined = []; clock = 0; layers = []
 def title_layer(name, text, start, duration, y, scale, color='#F6F2E9'):
  return dict(id=name, name=name, type='text', text=text, startTime=start, duration=duration,
   x=48, y=y, width=88, scale=scale, rotation=0, opacity=1, color=color,
   fontWeight=800, textAlign='center', strokeWidth=0, keys=[])
 for row in rows:
  # Quantize source ranges and programme duration to real delivery frames.
  row['sourceStart'] = round(row['sourceStart']*24)/24
  row['duration'] = round(row['duration']*24)/24
  row['start'] = clock
  cache = out/(row['id']+'.speech.json'); wave = out/(row['id']+'.wav')
  identity = hashlib.sha256(row['speech'].encode()).hexdigest()
  cached = json.loads(cache.read_text()) if cache.exists() else None
  if cached and cached['textSha256']==identity and cached['speechSeconds']<row['duration']-.05 and wave.exists():
   assert hashlib.sha256(wave.read_bytes()).hexdigest()==cached['waveSha256']
   audio,rate = sf.read(wave,dtype='float32'); seconds=cached['speechSeconds'];audio=audio[:round(seconds*rate)]
  else:
   audio, rate = voice.create(row['speech'], voice='bf_emma', speed=1.06, lang='en-gb')
   if len(audio)/rate > row['duration']-.15:
    audio, rate = voice.create(row['speech'], voice='bf_emma', speed=1.14, lang='en-gb')
   seconds = len(audio)/rate
  if seconds > row['duration']-.05:
   raise RuntimeError(f'{story}/{row["id"]}: speech {seconds:.2f}s exceeds actual action {row["duration"]:.2f}s. Shorten copy, never stretch the action.')
  row['speechSeconds'] = seconds
  audio = np.pad(audio, (0, round(row['duration']*rate)-len(audio)))
  sf.write(wave, audio, rate, subtype='PCM_16'); joined.append(audio)
  cache.write_text(json.dumps(dict(textSha256=identity,duration=row['duration'],speechSeconds=seconds,waveSha256=hashlib.sha256(wave.read_bytes()).hexdigest()))+'\n')
  print(f'{story}: narration complete — {row["id"]}',flush=True)
  heading={'product':'BUILD A\nPRODUCT REVEAL','transition':'BUILD A\nCONNECTED WIPE','logo':'MAKE THE\nLOGO ASSEMBLE'}.get(story) if row['id']=='hook' else row['title']
  layers.append(title_layer(row['id']+'-heading', heading, clock, row['duration'], 20, .62))
  if row['instruction']:
   layers.append(title_layer(row['id']+'-instruction', 'Make your version' if row['id']=='payoff' else row['instruction'], clock, row['duration'], 75 if row['id']=='payoff' else 70, .43))
  clock += row['duration']
 # Static masks isolate the actual recorded inspector from unrelated workspace chrome.
 control_start = rows[1]['start']; control_end = rows[-1]['start']
 mattes = []
 for name, y, height in [('Upper camera matte',10,22), ('Lower camera matte',85,36)]:
  mattes.append(dict(id=name.replace(' ','-'), name=name, type='artwork',
   svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="720" height="{round(1280*height/100)}"><rect width="720" height="{round(1280*height/100)}" fill="#15151E"/></svg>',
   x=50, y=y, width=100, height=height, scale=1, rotation=0, opacity=1,
   startTime=control_start, duration=control_end-control_start, keys=[]))
 layers = mattes + layers
 layers.append(title_layer('Narration disclosure', 'Synthetic preset narration', clock-5, 5, 80, .27))
 sf.write(out/'narration-24k.wav', np.concatenate(joined), rate, subtype='PCM_16')
 subprocess.run(['ffmpeg','-v','error','-y','-i',str(out/'narration-24k.wav'),'-af','loudnorm=I=-17:TP=-2:LRA=7','-ar','48000','-ac','2',str(out/'narration.wav')],check=True)
 subprocess.run(['ffmpeg','-v','error','-y','-i',str(out/'narration.wav'),'-c:a','libmp3lame','-q:a','2',str(out/'narration.mp3')],check=True)
 subprocess.run(['ffmpeg','-v','error','-y','-f','lavfi','-i',f'color=c=0x15151E:s=720x1280:r=24:d={clock}', '-an','-c:v','libx264','-preset','fast','-crf','26','-pix_fmt','yuv420p','-movflags','+faststart',str(out/'blank-stage.mp4')],check=True)
 (out/'lesson-labels.graphics.json').write_text(json.dumps(dict(format='autopromote-graphics',version=1,name=hooks[story][0].replace('\n',' '),width=720,height=1280,duration=clock,layers=layers,groups=[]),indent=2)+'\n')
 plan = dict(story=story, name=hooks[story][0].replace('\n',' ')+' / narrated native tutorial / 20261029',
  duration=clock, rows=rows, narrationSha256=hashlib.sha256((out/'narration.wav').read_bytes()).hexdigest(),
  narration=dict(model='cached Kokoro int8',voice='bf_emma',syntheticPreset=True,cloned=False,musicBed=False,paidExecution=False),
  finalComposition='Native Studio only', ownerApproved=False, requiresOwnerWatchBeforeScheduling=True)
 (out/'lesson-plan.json').write_text(json.dumps(plan,indent=2)+'\n')
 print(json.dumps(dict(story=story,seconds=clock,steps=len(rows),voice='bf_emma')),flush=True)
