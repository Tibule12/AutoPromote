"""Prepare original recordings and preset speech, not an externally edited final."""
from pathlib import Path
import json,sys,subprocess,hashlib,os
import numpy as np
import soundfile as sf
import onnxruntime as ort
ROOT=Path(__file__).resolve().parent
BASE=Path('/home/tibule12/Projects/AutoPromte/AutoPromote-main-integration-20261013/reports/daily-studio')
sys.path.insert(0,str(BASE/'voice-runtime'))
from kokoro_onnx import Kokoro
out=ROOT/'proof'/os.environ.get('STUDIO_LESSON_TAKE','lesson-r2');out.mkdir(exist_ok=True)
core=ROOT/'proof/product/whole-studio-r1'
steps={s['id']:s for s in json.loads((core/'teaching-actions.json').read_text())['steps']}
speech_only='--speech-only' in sys.argv
export=json.loads((core/'actual-export-screen.json').read_text()) if not speech_only else dict(completedAt=1)
rows=[]
def result(id,duration,heading,caption,speech):
 rows.append(dict(id=id,duration=duration,source=str(core/'result/final.mp4'),sourceStart=0,kind='result',heading=heading,caption=caption,speech=speech))
def action(id,sid,duration,heading,speech,offset=0):
 step=steps[sid];assert duration+offset<=step['end']-step['start']-.1
 rows.append(dict(id=id,duration=duration,source=str(core/'authoring-editing-in-studio.mp4'),sourceStart=step['start']+.1+offset,kind='workspace',heading=heading,speech=speech))
result('hook',8,'MAKE IT\nMOVE.','A complete Studio walkthrough','Build this animated product ad in AutoPromote. Here is the whole Studio, the actual edit, and the finished result.')
action('artwork','source-import',11,'01 / START WITH SEPARATE ARTWORK','This starts with separate illustrated artwork. Open Graphics and import the composition. The can, fruit, leaf and shadow become independent layers in the timeline.')
action('can','motion-0',20,'02 / GIVE THE PRODUCT WEIGHT','Open Motion, then Transform keyframes, and target the can. At the start, make it small, low and tilted, with zero opacity. Add a keyframe. Move forward for an oversized landing, then add its normal size a few frames later. These are the start, overshoot and settled poses.')
result('landing',7,'START.\nLAND.\nSETTLE.','Three poses make the landing.','Watch the landing. The can rises, passes its final size, and settles back. That small overshoot gives the movement weight.')
action('rear','motion-1',12,'03 / OFFSET THE ARRIVALS','Target the rear lime as a separate layer. Bring it in from the left, a little after the can. Continue its rotation after the landing.')
action('leaf','motion-2',10,'04 / ANSWER FROM THE OTHER SIDE','The leaf enters from the other side and lands above the can. Separate directions and start times keep the objects from moving as one flat picture.')
action('front','motion-3',12,'05 / BUILD FOREGROUND DEPTH','Bring the front lime in later. Give it its own overshoot and slow counter rotation. Keep the label visible as the objects overlap.')
result('depth',8,'LAYER IT.\nOFFSET IT.','Rear slice. Product. Front slice.','Now watch the order: product, rear slice, leaf, then foreground. Overlap creates the depth; the different timing creates the rhythm.')
action('shadow','motion-4',8,'06 / GROUND THE LANDING','Animate the shadow from small and transparent to wider and visible as the product lands. It anchors the can to the composition.')
action('field','motion-5',7,'07 / SUPPORT THE FOCAL POINT','The lime coloured field scales in behind everything. Its slow pulse supports the composition while the product stays the focus.')
action('type','editable-type',20,'08 / CHOREOGRAPH EDITABLE WORDS','In Graphics, select the headline and animate the title. Choose Words, forward order, and Ease out. Set a short vertical travel, a stagger, and zero starting opacity. Rebuild the entrance keys. This stays one editable title, so you can still change the words. Check the entrance and then let the complete phrase hold.')
result('headline',8,'MAKE THE\nWORDS LAND.','Motion first. A clear reading hold after.','The words arrive in sequence, then stop. Keep the message still long enough to read while the smaller supporting objects continue moving.')
action('timeline','timeline-review',10,'09 / REVIEW THE WHOLE EDIT','Fit the entire timeline. Check the layer order and scrub the beginning, landing and final hold. Then play the complete edit, including the moments between your keys.')
rows.append(dict(id='export',kind='workspace',duration=8,source=str(core/'export-editing-in-studio.mp4'),sourceStart=0,heading='10 / EXPORT THE ACTUAL PROJECT',speech='Open Export, choose your frame rate and render the actual project. This demonstration uses the CPU renderer.'))
assert export['completedAt']>0
rows.append(dict(id='complete',kind='workspace',duration=2.5,source=str(core/'export-editing-in-studio.mp4'),sourceStart=export['completedAt']+.5,heading='RENDER WAIT REMOVED / ACTUAL COMPLETED EXPORT',speech='Download the completed movie.'))
result('final',10,'MAKE YOUR\nVERSION.','AutoPromote Studio / separate artwork, editable motion','Use your artwork, build three landing poses, offset the supporting layers, and choreograph the headline. Make your version in AutoPromote Studio.')
settings=ort.SessionOptions();settings.intra_op_num_threads=2;settings.inter_op_num_threads=1
model=BASE/'models/kokoro-onnx'
voice=Kokoro.from_session(ort.InferenceSession(str(model/'kokoro-v1.0.int8.onnx'),sess_options=settings,providers=['CPUExecutionProvider']),str(model/'voices-v1.0.bin'))
clock=0;audio_parts=[];layers=[];sources=[]
def title(id,text,start,duration,x,y,width,scale,color,align='center'):
 return dict(id=id,name=id,type='text',text=text,startTime=start,duration=duration,x=x,y=y,width=width,scale=scale,rotation=0,opacity=1,color=color,fontWeight=800,textAlign=align,strokeWidth=0,keys=[])
for i,row in enumerate(rows):
 cache=out/(row['id']+'.speech.json');wav=out/(row['id']+'.wav');identity=hashlib.sha256(row['speech'].encode()).hexdigest()
 cached=json.loads(cache.read_text()) if cache.exists() else None
 if cached and cached['textSha256']==identity and wav.exists():
  assert hashlib.sha256(wav.read_bytes()).hexdigest()==cached['waveSha256'];audio,rate=sf.read(wav,dtype='float32')
 else:
  audio,rate=voice.create(row['speech'],voice='bf_emma',speed=1.05,lang='en-gb');sf.write(wav,audio,rate,subtype='PCM_16');audio,rate=sf.read(wav,dtype='float32')
  cache.write_text(json.dumps(dict(textSha256=identity,waveSha256=hashlib.sha256(wav.read_bytes()).hexdigest()))+'\n')
 seconds=len(audio)/rate
 if speech_only:
  print(f"{row['id']}: speech {seconds:.2f}s / planned {row['duration']:.2f}s",flush=True)
  continue
 # A long explanation may use more original recording, never slowed/stretched footage.
 if seconds+.1>row['duration']:
  if row['kind']=='result':raise RuntimeError(f"Shorten {row['id']} speech ({seconds}) rather than extend repeated motion.")
  if row['id'] in ['export','complete']:raise RuntimeError(f"Shorten {row['id']} speech: {seconds}")
  available=next(s['end']-row['sourceStart'] for s in steps.values() if s['start']<=row['sourceStart']<s['end'])
  row['duration']=np.ceil((seconds+.25)*24)/24
  assert row['duration']<=available, f"Shorten {row['id']} speech ({seconds}) beyond actual source."
 row['duration']=round(row['duration']*24)/24;row['start']=clock;row['speechSeconds']=seconds
 audio_parts.append(np.pad(audio,(0,round(row['duration']*rate)-len(audio))))
 filename=out/f"{i+1:02d}-{row['id']}.mp4";row['file']=str(filename)
 if row['kind']=='workspace':
  vf='setpts=PTS-STARTPTS,scale=1400:788,pad=1600:900:100:100:color=0x0B0E17,setsar=1,fps=24'
  layers.append(title(row['id']+'-chapter',row['heading'],clock,row['duration'],50,5,94,.46,'#F5F1E6'))
 else:
  vf='setpts=PTS-STARTPTS,scale=-2:900,pad=1600:900:1000:0:color=0xF4F0DD,setsar=1,fps=24'
  layers.append(title(row['id']+'-heading',row['heading'],clock,row['duration'],30,41,48,1.0,'#173B29'))
  layers.append(title(row['id']+'-caption',row['caption'],clock,row['duration'],30,72,48,.33,'#173B29'))
 if not filename.exists():
  subprocess.run(['ffmpeg','-v','error','-y','-ss',str(row['sourceStart']),'-i',row['source'],'-t',str(row['duration']),'-an','-vf',vf,'-c:v','libx264','-preset','fast','-crf','22','-pix_fmt','yuv420p','-movflags','+faststart',str(filename)],check=True)
 probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','stream=nb_frames,start_time','-of','json',str(filename)]))['streams'][0]
 assert int(probe['nb_frames'])==round(row['duration']*24) and float(probe['start_time'])==0, f"Source clock mismatch: {row['id']} {probe}"
 sources.append(dict(id=row['id'],source=row['source'],sourceStart=row['sourceStart'],duration=row['duration'],filter=vf,sha256=hashlib.sha256(filename.read_bytes()).hexdigest(),screenCropping=False))
 print(f"Prepared whole Studio source {row['id']}: {row['duration']:.2f}s; speech {seconds:.2f}s",flush=True);clock+=row['duration']
if speech_only:sys.exit(0)
layers.append(title('Synthetic narration disclosure','Synthetic preset narration · Illustrated demo product',clock-6,6,30,84,48,.24,'#173B29'))
sf.write(out/'narration-24k.wav',np.concatenate(audio_parts),rate,subtype='PCM_16')
subprocess.run(['ffmpeg','-v','error','-y','-i',str(out/'narration-24k.wav'),'-af','loudnorm=I=-17:TP=-2:LRA=7','-ar','48000','-ac','2','-c:a','libmp3lame','-q:a','2',str(out/'narration.mp3')],check=True)
(out/'lesson-labels.graphics.json').write_text(json.dumps(dict(format='autopromote-graphics',version=1,name='Whole Studio chapter labels',width=1600,height=900,duration=clock,layers=layers,groups=[]),indent=2)+'\n')
(out/'source-preparation.json').write_text(json.dumps(dict(sources=sources,externalFinalCompositing=False,nativeFinalAssemblyRequired=True,sourceScreenCropping=False),indent=2)+'\n')
(out/'lesson-plan.json').write_text(json.dumps(dict(name='MAKE IT MOVE / complete Studio walkthrough / 20261029',duration=clock,rows=rows,wholeWorkspace=True,narration=dict(cachedKokoroPreset='bf_emma',synthetic=True,cloned=False,musicBed=False,paidExecution=False),ownerApproved=False,scheduled=False),indent=2)+'\n')
print(f"Whole Studio lesson: {clock:.2f}s",flush=True)
