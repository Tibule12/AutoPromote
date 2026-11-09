"""CPU-only story, owned asset inventory, editable score and render preparation."""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess
import sys
import numpy as np

repo=Path(__file__).resolve().parents[2]
root=repo/'reports/welcome-cinematic-20261009'
root.mkdir(exist_ok=True)
story={'version':1,'title':'One idea. An entire creative world.','duration':38,'fps':24,'aspect':'16:9',
 'sourceConcepts':{'exactImagesLocated':False,'search':['workspace assets','frontend/public','reports','attachments','Downloads/Pictures'],
  'equivalents':'Four native authored Blender environments with independent geometry, UI, lighting and camera animation; exported anchor PNGs are review frames, never slideshow inputs.'},
 'scenes':[
 {'id':'idea','at':0,'duration':8,'concept':'AutoPromote Creative Studio Workspace','line':'Every great story starts as an idea.','textAt':2.1,'textDuration':4.9,'transition':'The active timeline grows out of the first idea stroke; library cards rise from that same plane.'},
 {'id':'structure','at':8,'duration':7,'concept':'AutoPromote Motion Graphics / VFX Library','line':'But ideas need structure.','textAt':9.3,'textDuration':4.0,'transition':'The component grid folds into dimensional rails as its central line unfolds into a ribbon.'},
 {'id':'motion','at':15,'duration':10,'concept':'AutoPromote 3D Creative Dashboard','line':'Structure becomes motion.','textAt':15.8,'textDuration':3.7,'secondLine':'Motion becomes experience.','secondAt':20.2,'secondDuration':3.6,'transition':'The ribbon opens into a horizon; the rails become the contours of the story world.'},
 {'id':'impact','at':25,'duration':7,'concept':'AutoPromote Stories That Move Brands','line':'And experience becomes a story people remember.','textAt':26.0,'textDuration':4.8,'transition':'The horizon contracts into the final single luminous stroke while dimensional AP contours assemble.'},
 {'id':'autopromote','at':32,'duration':6,'concept':'AutoPromote brand lockup','line':'This is AutoPromote.','textAt':32.5,'textDuration':2.0,'secondLine':'Ideas into motion.','secondAt':35.0,'secondDuration':3.0,'transition':'Anticipation, rim-light travel, monogram assembly, brand hit and clean final hold.'}],
 'voiceover':'Not generated: the optional narration is retained verbatim as separately editable title layers with clean insertion windows.',
 'sound':'Original deterministic stereo score and separate ambient/UI/transition/brand cues; one motif develops harmonically, increases rhythm at the unfolding and resolves at 34.6 seconds.',
 'gpuPlan':{'job':'viral-studio-rtx-qualification','project':'autopromote-cc6d3','region':'us-central1','count':1,
  'stages':['Native Blender Cycles OptiX scene rendering','NVENC generated source encoding','Existing AutoPromote RenderViralRequest composition, titles, stereo mix and NVENC final export'],
  'previewBeforeDispatch':True,'newGpuInfrastructure':False,'warmInstances':0,'maxTaskSeconds':2400,'automaticRetries':0}}
(root/'story-plan.json').write_text(json.dumps(story,indent=2))
shutil.copy2(repo/'studio_3d_renderer/author_welcome_world.py',root/'assets/author_welcome_world.py')
sr=48000;duration=38;t=np.arange(sr*duration)/sr
score=np.zeros((len(t),2));fx=np.zeros_like(score);rng=np.random.default_rng(20261009);notes=[];cues=[]
def put(buf,at,wave,pan=0):
 start=round(at*sr);n=min(len(wave),len(buf)-start)
 if n<=0:return
 a=(pan+1)*np.pi/4;buf[start:start+n,0]+=wave[:n]*np.cos(a);buf[start:start+n,1]+=wave[:n]*np.sin(a)
def note(at,midi,d,amp=.04,pad=False,pan=0):
 tt=np.arange(round(d*sr))/sr;f=440*2**((midi-69)/12)
 env=np.minimum(1,tt/(.9 if pad else .01))*np.minimum(1,np.maximum(0,(d-tt)/(.9 if pad else .3)))
 data=sum(np.sin(2*np.pi*f*k*(tt+.00008*np.sin(tt*5)))/(k*k) for k in range(1,6))*env
 if not pad:data*=np.exp(-tt*2.3)
 put(score,at,data*amp,pan);notes.append({'at':float(at),'midi':midi,'duration':d,'pad':pad,'pan':float(pan)})
for at,chord in [(0,[48,55,60,63]),(8,[46,53,58,65]),(15,[43,50,55,62]),(21,[48,55,60,67]),(25,[53,60,65,69]),(32,[48,55,60,64,67])]:
 for j,n in enumerate(chord):note(at,n,7.8 if at<32 else 6,.018 if at<15 else .03,True,(j-1.5)*.26)
for at in [1.8,3.7,5.6,7.5]:note(at,[72,79,75,74][round((at-1.8)/1.9)],2.8,.055,pan=-.22)
for at in np.arange(8,25,.625):
 note(float(at),[72,79,75,82,79,74,72,79][int((at-8)/.625)%8],1.6,.027 if at<15 else .046,pan=.4*np.sin(at))
for at in [25.5,27,28.5,30,34.6]:note(at,79 if at<34 else 84,3,.055)
for delay,gain in [(.25,.18),(.49,.11),(.71,.07)]:
 n=round(delay*sr);score[n:]+=score[:-n,::-1]*gain
def impact(at,power):
 tt=np.arange(round(1.8*sr))/sr
 wave=np.sin(2*np.pi*(36*tt+40*.15*(1-np.exp(-tt/.15))))*np.exp(-tt*3.5)
 put(fx,at,wave*power);cues.append({'at':at,'kind':'low impact','power':power})
def rise(at,d,power):
 tt=np.arange(round(d*sr))/sr;p=tt/d;noise=np.convolve(rng.normal(size=len(tt)),np.ones(35)/35,mode='same')
 put(fx,at,(noise*p*p+np.sin(2*np.pi*(55*tt+28*tt*tt/d))*.12*p*p)*power,pan=.16)
 cues.append({'at':at,'duration':d,'kind':'motivated rise'})
for at in [3.05,3.65,4.2,4.7,5.3,9.5,10.3,11,11.6,12.3,13.0]:
 tt=np.arange(round(.15*sr))/sr;put(fx,at,np.sin(2*np.pi*1400*tt)*np.exp(-tt*55)*.018,pan=.32*np.sin(at))
rise(6.7,1.6,.12);rise(13.1,2.4,.20);impact(15.4,.26);rise(22.8,2.3,.12);impact(25.1,.13)
rise(32.1,2.5,.2);impact(34.6,.36)
# Restrained original atmosphere breathes with the lighting; no stock bed loop.
noise=rng.normal(size=len(t));noise=np.convolve(noise,np.ones(64)/64,mode='same')
fx[:,0]+=noise*.016*np.minimum(1,t/3);fx[:,1]+=np.roll(noise,240)*.016*np.minimum(1,t/3)
fade=np.minimum(1,t/1.5)*np.minimum(1,np.maximum(0,(duration-t)/.8));score*=fade[:,None];fx*=fade[:,None]
for name,data,peak in [('score',score,.32),('cues',fx,.42)]:
 data*=peak/max(peak,float(abs(data).max()));raw=root/'assets'/f'{name}.f32';raw.write_bytes(data.astype('<f4').tobytes())
 out=root/'assets'/f'{name}.wav'
 subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar',str(sr),'-ac','2','-i',str(raw),'-c:a','pcm_s16le',str(out)],check=True);raw.unlink()
 (root/'assets'/f'{name}-receipt.json').write_text(json.dumps({'provider':'AutoPromote authored CPU synthesis','seed':20261009,'sampleRate':sr,'channels':2,'duration':38,'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'notes':notes if name=='score' else cues},indent=2))
print(json.dumps({'storySeconds':38,'scenes':5,'audio':'two editable stereo stems','gpuStarted':False}))
