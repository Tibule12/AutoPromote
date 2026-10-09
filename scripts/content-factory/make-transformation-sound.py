"""Editable CPU sound-design stems tied to the transformation clock.

No library recording, person's voice or song is used. This supplements the
generated music, preserving it as a separate reusable source.
"""
import argparse,hashlib,json,wave
from pathlib import Path
import numpy as np
p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);p.add_argument('--duration',type=float,required=True);p.add_argument('--payoff',type=float,required=True);p.add_argument('--seed',type=int,default=20261007138);a=p.parse_args()
if not 5<=a.duration<=30 or not 2<=a.payoff<=a.duration-1:raise ValueError('Invalid transformation sound clock')
a.output.mkdir(parents=True,exist_ok=True);sr=48000;n=round(a.duration*sr);t=np.arange(n)/sr;rng=np.random.default_rng(a.seed)
noise=rng.normal(0,1,n);low=np.convolve(noise,np.ones(48)/48,mode='same');high=noise-np.convolve(noise,np.ones(9)/9,mode='same')
rise=np.clip((t-1.25)/max(.1,a.payoff-1.65),0,1)
pitch=48+180*rise**2;phase=2*np.pi*np.cumsum(pitch)/sr
envelope=rise**2*np.minimum(np.maximum((a.payoff-t)/.18,0),1)
breath=1-.96*np.exp(-((t-(a.payoff-.16))/.15)**2)
riser=(.045*np.sin(phase)+.024*high)*envelope*breath
q=np.maximum(t-a.payoff,0);impact=np.where(t>=a.payoff,np.sin(2*np.pi*(40*q+26*(1-np.exp(-q*4))/4))*np.exp(-q*3.2)*.2,0)
impact+=np.where((q<.45)&(t>=a.payoff),high*.07*np.exp(-q*12),0)
water=low*(.01+.065*np.clip((t-1.2)/max(1,a.payoff-1.2),0,1))*(.55+.45*np.sin(t*.91)**2)
folds=np.zeros(n)
fold_times=[a.payoff*fraction for fraction in [.24,.37,.53,.68,.84]]
for moment in fold_times:
 env=np.exp(-((t-moment)/.045)**2);folds+=high*env*.035
left=riser+impact+water+folds;right=riser+impact+np.roll(water,480)+np.roll(folds,150)
fade=np.minimum(t/.08,1)*np.minimum((a.duration-t)/.6,1)
samples=np.stack((left,right),axis=1)*fade[:,None];samples*=min(1,.72/max(1e-8,float(np.max(np.abs(samples)))))
file=a.output/'sound.wav'
with wave.open(str(file),'wb') as f:f.setnchannels(2);f.setsampwidth(2);f.setframerate(sr);f.writeframes((samples*32767).astype('<i2').tobytes())
record={'status':'GENERATED_PENDING_LISTENING_REVIEW','model':'original-transformation-sound-design','modelRevision':'fold-water-rise-impact-v2','tool':'AutoPromote CPU sound design','seed':a.seed,'settings':{'duration':a.duration,'payoffAt':a.payoff,'foldTimes':fold_times,'sampleRate':sr,'channels':2,'components':['fold transients','continuous water bed','material riser','pre-reveal breath','pitched reveal impact']},'artifact':{'path':str(file),'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'duration':a.duration},'limitation':'Measured sound design; listening judgment belongs to the final edit and founder review.'}
(a.output/'receipt.json').write_text(json.dumps(record,indent=2));print(json.dumps(record))
