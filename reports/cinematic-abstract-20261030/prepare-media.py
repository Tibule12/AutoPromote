"""Source preparation and original audio; final edits are assembled in Studio."""
import sys,json,hashlib,subprocess,time
from pathlib import Path
import numpy as np
import soundfile as sf
import onnxruntime as ort
BASE=Path('/home/tibule12/Projects/AutoPromte/AutoPromote-main-integration-20261013/reports/daily-studio')
ROOT=Path('/dev/shm/autopromote-abstract-20261030')
sys.path.insert(0,str(BASE/'voice-runtime'))
from kokoro_onnx import Kokoro
IDENTITIES={'current':('CURRENT','liquid metal'),'prism':('PRISM','optical motion'),'fold':('FOLD','material in motion')}
VOICE={
 'current':[
  'A continuous metal surface bends through light. Build the form, shape its flow, and let the reflections reveal its depth.',
  'In Motion, open Three D Motion and choose Object Composition. Add a ribbon, then choose the knot path. Wave controls how far the centre line bends. Width changes the band. Thickness gives its edge a physical surface.',
  'Follow the highlight around the solid edge.',
  'Ribbon speed controls the continuous deformation. At zero, the surface holds its shape while the object can still turn on its pose keys. Restore the flow speed and play again. Form movement and object movement work together.',
  'The surface flows while the small spheres drift around it.',
  'Choose brushed metal for the ribbon. Compare it with matte, then return to metal. Surface roughness spreads the reflection: a higher value softens the light, while a lower value draws a tighter highlight along the bend.',
  'In Advanced, compare the softbox and sculpture lighting rigs. The sculpture rig uses narrow studio strips. The bright lines describe the surface; the darker areas give those lines their shape.',
  'Light reveals the curve as it changes.',
  'Fit the whole timeline and play the move. Check the silhouette from beginning to end. Save the scene before requesting the high quality render. Keep that accepted job for status recovery instead of submitting it twice.',
  'The final film uses the native Blender render and the Studio timeline.',
  'Continuous geometry. Controlled light. A cinematic abstract study, with its editable Studio scene preserved.'
 ],
 'prism':[
  'Glass bends the world behind it. Two optical surfaces flow across bright and dark bands. Build that refraction in Studio.',
  'Choose Object Composition and add a ribbon with the loop path. Give it width and thickness, then turn it in three dimensions. Add the second loop with a different phase and orientation, so each surface catches a separate reflection.',
  'The bands behind the glass bend through its thickness.',
  'Use flow speed and phase to offset the two loops. Speed controls how fast the shape changes. Phase changes where the flow begins. Seek through the timeline and check their relationship before you add the smaller glass spheres.',
  'Different phases keep the two optical forms moving independently.',
  'Choose glass, then compare it with matte. The backdrop is essential: without something behind it, clear glass can read as a dark shape. The light and dark bands make the refraction visible as the loops bend.',
  'Compare the lighting rigs in Advanced. Look for a bright reflection on the edge and a readable view through the centre. Give the glass enough space from its backdrop for the optical distortion to show.',
  'A reflection on the edge; refraction through the centre.',
  'Fit the timeline and watch the whole move. Check the overlapping surfaces and their edges. Save the editable scene, then request its high quality preview. Review that rendered result before using it in the final edit.',
  'The finished film keeps the native glass render in the Studio timeline.',
  'Build the glass. Give it something to bend. Shape the light, and keep the complete editable scene.'
 ],
 'fold':[
  'Pearl, champagne and copper move in layers. Broad surfaces twist through light. Build their rhythm in Studio.',
  'In Object Composition, add a ribbon and choose the wave path. Give it a broad width, a thin edge and one lobe. Add twist to turn the surface. The rounded profile catches a highlight along each moving edge.',
  'Broad curves and a thin edge give the material its weight.',
  'Duplicate the idea across separate ribbons. Give them different positions and phase values while keeping a shared flow speed. Their motion stays connected, but their bends arrive at different moments. Pose keys add a slow turn to each surface.',
  'Shared timing connects the layers. Different phases separate their movement.',
  'Use silk for the light surfaces and brushed metal for the copper. Compare the first ribbon with matte, then restore silk. The different materials should respond to the same light in visibly different ways.',
  'Compare the softbox and sculpture rigs in Advanced. Watch the copper highlight travel around the fold. Keep the light surfaces readable, with enough contrast between them to show which layer sits in front.',
  'The moving highlight describes the copper fold.',
  'Fit the timeline and play every frame of the move. Look for crossings that flatten the layers or hide their edges. Save the editable scene and review its high quality render before assembling the final film.',
  'The final edit combines the native render with original sound in Studio.',
  'Form, phase, material and light. Three layers, moving together. Keep the whole Studio scene editable.'
 ]}
ROWS=[('hook',6,'CINEMATIC ABSTRACT / STUDIO',None),('form',18,'01 / SCULPT THE FORM','form'),('detail',4,'SURFACE / DEPTH / LIGHT',None),('flow',18,'02 / CHOREOGRAPH THE FLOW','flow'),('movement',6,'CONTINUOUS FORM / DELIBERATE MOTION',None),('surface',18,'03 / GIVE THE SURFACE CHARACTER','surface'),('light',16,'04 / SHAPE THE LIGHT','light'),('hero',4,'THE RENDERED RESULT',None),('timeline',16,'05 / WATCH THE COMPLETE MOVE','timeline'),('delivery',5,'06 / FINISH IN THE STUDIO TIMELINE',None),('closing',6,'MADE IN STUDIO',None)]
def run(args):subprocess.run(args,check=True)
def score(seconds,identity):
 sr=24000;t=np.arange(round(seconds*sr))/sr;output=np.zeros((len(t),2),dtype=np.float64);rng=np.random.default_rng({'current':73,'prism':89,'fold':101}[identity])
 notes={'current':[55,82.4069,110,130.813,164.814],'prism':[65.406,98,130.813,164.814,196],'fold':[58.27,87.307,116.54,146.832,174.614]}[identity]
 for index,freq in enumerate(notes):
  for channel in range(2):
   flutter=1+.0015*np.sin(2*np.pi*(.09+index*.02)*t+channel*.6)
   tone=np.sin(2*np.pi*freq*t*flutter*.5+index*.7+channel*.04)+.23*np.sin(2*np.pi*freq*t+channel*.13)
   breathing=.5+.5*np.sin(2*np.pi*t/(8+index*2)+index)
   output[:,channel]+=.012*tone*breathing
 for index,start in enumerate(np.arange(0,seconds,.75)):
  offset=round(start*sr);n=np.arange(min(round(1.6*sr),len(t)-offset));u=n/sr;freq=notes[(index*3)%len(notes)]*4
  bell=(np.sin(2*np.pi*freq*u)+.18*np.sin(2*np.pi*freq*2.01*u))*np.exp(-u*4.5)*(1-np.exp(-u*80))*.024
  pan=.5+.4*np.sin(index*.8);output[offset:offset+len(n),0]+=bell*(1-pan);output[offset:offset+len(n),1]+=bell*pan
 # Soft rising texture tied to the edit, no stock or location sound claim.
 for start in np.arange(2,seconds,6):
  offset=round(start*sr);n=np.arange(min(2*sr,len(t)-offset));u=n/sr
  noise=rng.standard_normal(len(n));noise=np.convolve(noise,np.ones(25)/25,mode='same');envelope=np.sin(np.pi*np.minimum(u/2,1))**2
  output[offset:offset+len(n)]+=np.column_stack((noise,np.roll(noise,71)))*envelope[:,None]*.027
 fade=np.minimum(1,t/.8)*np.minimum(1,(seconds-t)/1.4);output*=fade[:,None]
 return output,sr
def clip(source,target,start,input_duration,output_duration,crop=False,workspace=False,fade=False):
 if target.exists():
  probe=subprocess.run(['ffprobe','-v','error','-show_entries','stream=nb_frames','-of','json',str(target)],capture_output=True,text=True)
  if probe.returncode==0 and int(json.loads(probe.stdout)['streams'][0].get('nb_frames',0))==round(output_duration*24):return
  target.rename(target.with_name(target.stem+'-failed-'+str(time.time_ns())+target.suffix))
 factor=output_duration/input_duration
 vf=f'trim=duration={input_duration},setpts=(PTS-STARTPTS)*{factor:.10f},'
 if workspace:vf+='scale=1496:936,pad=1600:1000:52:64:color=0x0c1020,'
 else:
  if crop:vf+='crop=960:540:(iw-960)/2:(ih-540)/2,'
  vf+='scale=1280:720,'
  if target.parent.name=='episode':vf+='scale=1600:900,pad=1600:1000:0:50:color=0x0c1020,'
 vf+=f'setsar=1,fps=24,tpad=stop_mode=clone:stop_duration=0.2,trim=duration={output_duration}'
 if fade:vf+=f',fade=t=out:st={output_duration-.6}:d=0.6'
 run(['ffmpeg','-v','error','-y','-ss',str(start),'-i',str(source),'-an','-vf',vf,'-frames:v',str(round(output_duration*24)),'-c:v','libx264','-preset','veryfast','-crf','17','-pix_fmt','yuv420p','-movflags','+faststart',str(target)])
def prepare_cinema(identity):
 root=ROOT/identity;out=root/'cinema';out.mkdir(exist_ok=True);source=root/'native-core-final.mp4'
 duration=float(json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','json',str(source)]))['format']['duration'])
 if not(out/'original-score.mp3').exists():
  sound,sr=score(24,identity);sf.write(out/'original-score.wav',sound,sr)
  run(['ffmpeg','-v','error','-y','-i',str(out/'original-score.wav'),'-af','loudnorm=I=-18:TP=-2:LRA=7','-ar','48000','-ac','2','-c:a','libmp3lame','-q:a','2',str(out/'original-score.mp3')])
 shots=[('opening',.75,3,3,False),('macro',1.4,3,4,True),('flow',.75,duration-1.5,8,False),('edge',max(.5,duration-4.2),3,3,True),('resolve',duration*.35,min(3,duration*.5),6,False)]
 rows=[];clock=0
 for index,(name,start,span,length,crop) in enumerate(shots):
  target=out/f'{index+1:02d}-{name}.mp4';clip(source,target,start,span,length,crop=crop,fade=name=='resolve');rows.append(dict(id=name,start=clock,duration=length,file=str(target),sourceStart=start,sourceDuration=span,detailCrop=crop));clock+=length
 (out/'lesson-plan.json').write_text(json.dumps(dict(name=IDENTITIES[identity][0]+' / cinematic abstract /20261030',duration=24,width=1280,height=720,rows=rows,narration=False,musicVolume=100,labels=False,syntheticScore=True,ownerApproved=False,scheduled=False),indent=2))
 print(identity,'cinema source shots and original soundtrack ready',flush=True)
def prepare(identity,sources):
 root=ROOT/identity;episode=root/'episode';cinema=root/'cinema';episode.mkdir(exist_ok=True);cinema.mkdir(exist_ok=True)
 model=BASE/'models/kokoro-onnx';options=ort.SessionOptions();options.intra_op_num_threads=1;options.inter_op_num_threads=1
 voice=Kokoro.from_session(ort.InferenceSession(str(model/'kokoro-v1.0.int8.onnx'),sess_options=options,providers=['CPUExecutionProvider']),str(model/'voices-v1.0.bin'))
 rows=[];clock=0;speech=[];layers=[]
 for index,((name,budget,heading,step),text) in enumerate(zip(ROWS,VOICE[identity])):
  digest=hashlib.sha256(text.encode()).hexdigest();wav=episode/(name+'.wav');cache=episode/(name+'.speech.json')
  if cache.exists()and json.loads(cache.read_text())['sha256']==digest:samples,sr=sf.read(wav)
  else:samples,sr=voice.create(text,voice='bm_george',speed=1.08,lang='en-gb');sf.write(wav,samples,sr);cache.write_text(json.dumps(dict(sha256=digest,synthetic=True,preset='bm_george',cloned=False)))
  if len(samples)/sr>budget-.1:budget=np.ceil((len(samples)/sr+.3)*24)/24
  if step is None and budget>10:raise ValueError('Shorten result narration '+name)
  row=dict(id=name,start=clock,duration=float(budget),heading=IDENTITIES[identity][0]+' / '+heading if name in ['hook','closing']else heading,speech=text,step=step,kind='workspace'if step else'result',file=str(episode/f'{index+1:02d}-{name}.mp4'))
  speech.append(np.pad(samples,(0,round(budget*sr)-len(samples))));rows.append(row)
  layers.append(dict(id=identity+'-'+name,name=name,type='text',text=row['heading'],startTime=clock,duration=budget,x=50,y=3.4,width=94,scale=.4,rotation=0,opacity=1,color='#ebe9e2',fontWeight=600,textAlign='left',strokeWidth=0,keys=[]));clock+=budget
  print(identity,name,f'{len(samples)/sr:.2f}s /{budget:.2f}s',flush=True)
 layers.append({**layers[-1], 'id':identity+'-disclosure','text':'Original abstract 3D · synthetic preset narration · original synthesized score','y':96.8,'scale':.23,'textAlign':'center'})
 if not (episode/'narration.mp3').exists():
  sf.write(episode/'narration-24k.wav',np.concatenate(speech),sr)
  run(['ffmpeg','-v','error','-y','-i',str(episode/'narration-24k.wav'),'-af','loudnorm=I=-18:TP=-3:LRA=7','-ar','48000','-ac','2','-c:a','libmp3lame','-q:a','2',str(episode/'narration.mp3')])
 for out,seconds in [(episode,clock),(cinema,24)]:
  if not(out/'original-score.mp3').exists():
   sound,sr=score(seconds,identity);sf.write(out/'original-score.wav',sound,sr)
   run(['ffmpeg','-v','error','-y','-i',str(out/'original-score.wav'),'-af','loudnorm=I=-18:TP=-2:LRA=7','-ar','48000','-ac','2','-c:a','libmp3lame','-q:a','2',str(out/'original-score.mp3')])
 if sources:
  source=root/'native-core-final.mp4';duration=float(json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','json',str(source)]))['format']['duration'])
  clocks=json.loads((root/'teaching/clocks.json').read_text());steps={row['id']:row for row in clocks['steps']}
  for row in rows:
   if row['kind']=='workspace':
    step=steps[row['step']];start=step['start'];available=step['end']-start
    clip(root/'teaching/editing-in-studio.mp4',Path(row['file']),start,min(available,row['duration']),row['duration'],workspace=True)
    row['observationTimingScale']=row['duration']/min(available,row['duration'])
   else:
    start=.75 if row['id'] in ['hook','movement']else duration*.4;available=min(duration-start-.3,row['duration']);clip(source,Path(row['file']),start,available,row['duration'],crop=row['id']=='detail')
   row['sourceScreenCropping']=False
  shots=[('opening',.75,3,3,False),('macro',1.4,3,4,True),('flow',.75,duration-1.5,8,False),('edge',max(.5,duration-4.2),3,3,True),('resolve',duration*.35,min(3,duration*.5),6,False)]
  cinema_rows=[];at=0
  for index,(name,start,span,length,crop) in enumerate(shots):
   target=cinema/f'{index+1:02d}-{name}.mp4';clip(source,target,start,span,length,crop=crop,fade=name=='resolve');cinema_rows.append(dict(id=name,start=at,duration=length,file=str(target),sourceStart=start,sourceDuration=span,detailCrop=crop));at+=length
  (cinema/'lesson-plan.json').write_text(json.dumps(dict(name=IDENTITIES[identity][0]+' / cinematic abstract /20261030',duration=24,width=1280,height=720,rows=cinema_rows,narration=False,musicVolume=100,labels=False,syntheticScore=True,ownerApproved=False,scheduled=False),indent=2))
 (episode/'labels.graphics.json').write_text(json.dumps(dict(format='autopromote-graphics',version=1,name=identity+' / walkthrough labels',width=1600,height=1000,duration=clock,layers=layers,groups=[]),indent=2))
 (episode/'lesson-plan.json').write_text(json.dumps(dict(name=IDENTITIES[identity][0]+' / complete Studio walkthrough /20261030',duration=clock,width=1600,height=1000,rows=rows,narration=True,musicVolume=14,labels=True,sourceScreenCropping=False,syntheticPresetNarration=True,ownerApproved=False,scheduled=False),indent=2))
 print(identity,'walkthrough duration',clock,'native cinema24s',flush=True)
if __name__=='__main__':
 if '--cinema-only'in sys.argv:prepare_cinema(sys.argv[1])
 else:prepare(sys.argv[1],'--sources'in sys.argv)
