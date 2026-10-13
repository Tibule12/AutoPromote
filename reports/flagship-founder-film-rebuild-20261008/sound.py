#!/usr/bin/env python3
"""Original editable narrative score and synchronized physical sound cues (CPU)."""
from pathlib import Path
import numpy as np,json,hashlib,subprocess
R=Path('/home/tibule12/Projects/AutoPromte/AutoPromote-staging-browser-20261004');O=R/'reports/flagship-founder-film-rebuild-20261008/assets/sound';O.mkdir(parents=True,exist_ok=True)
SR=48000;D=56.25;t=np.arange(round(SR*D))/SR;score=np.zeros((len(t),2),dtype=np.float64);fx=np.zeros_like(score);rng=np.random.default_rng(20261008)
notes=[];cues=[]
def env(tt,d,a=.02,r=.35):return np.minimum(1,tt/a)*np.minimum(1,np.maximum(0,(d-tt)/r))
def add(buf,at,data,pan=0):
 start=round(at*SR);n=min(len(data),len(buf)-start)
 if n<=0:return
 angle=(pan+1)*np.pi/4;buf[start:start+n,0]+=data[:n]*np.cos(angle);buf[start:start+n,1]+=data[:n]*np.sin(angle)
def tone(at,midi,d,amp=.1,kind='keys',pan=0):
 tt=np.arange(round(d*SR))/SR;f=440*2**((midi-69)/12)
 if kind=='keys':data=sum(np.sin(2*np.pi*f*h*tt)*np.exp(-tt*(.8+h*.7))/(h*h) for h in [1,2,3,4,6]);data*=env(tt,d,.007,.7)
 else:data=sum(np.sin(2*np.pi*f*h*(tt+.00022*np.sin(tt*2*np.pi*4.1)))/h**1.9 for h in range(1,8));data*=env(tt,d,.9,1.2)
 add(score,at,data*amp,pan);notes.append({'at':at,'midi':midi,'duration':d,'amplitude':amp,'instrument':kind,'pan':pan})
# One fragile motif returns with a changed harmony after the zero-capacity setback.
for at,midi in [(0,60),(1.5,67),(3,63),(4.5,62),(6,60),(7.5,67),(9,63)]:tone(at,midi,2.8,.075,pan=-.12)
chords=[(8.25,[48,55,60,63]),(13.75,[46,53,58,62]),(19.5,[43,50,55,58]),(28.75,[48,55,60,64]),(33,[53,60,65,69]),(39.75,[55,62,67,71]),(46.25,[48,55,60,64]),(51.25,[48,55,60,64,67])]
for at,chord in chords:
 d=5.4 if at!=51.25 else 5
 for j,n in enumerate(chord):tone(at,n,d,.04 if at<28.75 else .045,'bowed',(-.5+j*.25))
for at in np.arange(8.25,19.5,.625):tone(float(at),[60,67,63,70][int((at-8.25)/.625)%4],1.6,.025,pan=.25)
for at in np.arange(30,46,.5):tone(float(at),[60,67,72,76,74,67,64,72][int((at-30)/.5)%8],1.8,.032,pan=.2*np.sin(at))
# Echo gives space while respecting the planned silence at quota zero.
for delay,gain in [(.22,.22),(.41,.12),(.71,.07)]:
 n=round(delay*SR);score[n:]+=score[:-n,::-1]*gain
mute=1-.98*np.clip((t-20)/.8,0,1)*np.clip((28.5-t)/.65,0,1);score*=mute[:,None]
# Lower score under the delayed reveal, leaving attention on the spoken sentence.
score*=np.where((t>=46.25)&(t<51.25),.50,1)[:,None]
def impact(at,power=.24):
 tt=np.arange(round(2.1*SR))/SR;phase=2*np.pi*(36*tt+36*.18*(1-np.exp(-tt/.18)));body=np.sin(phase)*np.exp(-tt*4);noise=rng.normal(size=len(tt));noise=np.convolve(noise,np.ones(10)/10,mode='same')*.25*np.exp(-tt*8);add(fx,at,(body+noise)*power);cues.append({'at':at,'type':'low impact','power':power})
def rise(at,d,power=.13):
 tt=np.arange(round(d*SR))/SR;noise=rng.normal(size=len(tt));noise=np.convolve(noise,np.ones(26)/26,mode='same');p=tt/d;data=noise*(p**2)*power+np.sin(2*np.pi*(72*tt+40*tt**2/d))*.018*p**2;add(fx,at,data);cues.append({'at':at,'duration':d,'type':'sound rise'})
for at in [0,8.6,19.7,30.9,43.2,54.45]:impact(at,.13 if at<28.75 else .24)
rise(27.1,3.8,.19);rise(51.6,2.85,.14)
# Quiet source/cut ticks, each tied to editorial developments, cease at the wall.
for at in [3.35,4.1,5.1,8.6,9.8,11.3,14.05,15.5,17.2,33.6,35.1,37.1]:
 tt=np.arange(round(.14*SR))/SR;add(fx,at,rng.normal(size=len(tt))*np.exp(-tt*45)*.033,pan=np.sin(at)*.4)
# Controlled fade and normalized float→PCM transport. No random music bed loop.
fade=np.minimum(1,np.maximum(0,(D-t)/.55));score*=fade[:,None];fx*=fade[:,None]
def save(name,data,peak):
 data*=peak/max(peak,float(np.max(np.abs(data))));raw=O/(name+'.f32');raw.write_bytes(data.astype('<f4').tobytes());target=O/(name+'.wav');subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar',str(SR),'-ac','2','-i',str(raw),'-c:a','pcm_s16le',str(target)],check=True);raw.unlink()
 return {'path':str(target.relative_to(R)),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'duration':D,'sampleRate':SR,'channels':2,'peak':float(np.max(np.abs(data)))}
records=[save('score',score,.30),save('cues',fx,.40)];(O/'sound-plan.json').write_text(json.dumps({'tool':'original deterministic audio synthesis / CPU','model':'authored synthesis, no inferred music','sourceBrief':'source-brief.txt','seed':20261008,'storyFunction':'unresolved conversation motif → obstruction silence → harmonic release → brand lockup impact','notes':notes,'cues':cues,'artifacts':records,'status':'GENERATED_PENDING_REVIEW','settings':{'sampleRate':SR,'channels':2,'duration':D}},indent=2));print(json.dumps(records))
