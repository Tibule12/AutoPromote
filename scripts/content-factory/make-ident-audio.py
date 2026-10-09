"""Original editable ident sound design timed to its actual 3D reveal."""
import argparse,hashlib,json,wave
from pathlib import Path
import numpy as np
p=argparse.ArgumentParser();p.add_argument('--receipt',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
r=json.loads(a.receipt.read_text());style=r['config']['style'];duration=r['frames']/r['fps'];impact=r['impactAt'];sr=48000
rng=np.random.default_rng(r['config']['seed']);t=np.arange(round(duration*sr))/sr;left=np.zeros(len(t));right=np.zeros(len(t))
noise=rng.normal(0,1,len(t));smooth=np.convolve(noise,np.ones(13)/13,mode='same')
rise=np.clip(t/impact,0,1)**3*np.exp(-np.maximum(t-impact,0)*20)
whoosh=smooth*rise*(.025 if style=='minimal' else .1)
q=np.maximum(t-impact,0);mask=t>=impact
thump=np.sin(2*np.pi*(48*q+35*(1-np.exp(-q*9))/9))*np.exp(-q*11)*mask*(.045 if style=='minimal' else .18)
air=noise*np.exp(-q*24)*mask*(.006 if style=='minimal' else .02)
for midi,pan in [(57,-.5),(64,.5),(69,-.2),(76,.2)]:
 f=440*2**((midi-69)/12);tone=(np.sin(2*np.pi*f*q)+.23*np.sin(2*np.pi*f*2.01*q))*mask*(1-np.exp(-q*45))*np.exp(-q*1.9)*.026
 left+=tone*np.sqrt((1-pan)/2);right+=tone*np.sqrt((1+pan)/2)
if style=='compute':
 for i in range(6):
  at=impact*.18+i*impact*.105;u=np.maximum(t-at,0);tick=np.sin(2*np.pi*(1100+i*120)*u)*np.exp(-u*90)*(t>=at)*.025;left+=tick;right+=tick
if style=='creator':
 for at in [impact-.5,impact-.25]:
  u=np.maximum(t-at,0);hit=np.sin(2*np.pi*105*u)*np.exp(-u*28)*(t>=at)*.045;left+=hit;right+=hit
left+=whoosh+thump+air;right+=whoosh*.9+thump+air*.8
x=np.stack((left,right),axis=1);x*=np.minimum(t/.04,1)[:,None]*np.minimum((duration-t)/.45,1)[:,None];x=np.clip(x,-.85,.85)
a.output.parent.mkdir(parents=True,exist_ok=True)
with wave.open(str(a.output),'wb') as f:f.setnchannels(2);f.setsampwidth(2);f.setframerate(sr);f.writeframes((x*32767).astype('<i2').tobytes())
receipt={'model':'original-procedural-ident-sound','modelRevision':'ident-score-v1','tool':'AutoPromote original ident sound design','seed':r['config']['seed'],
 'sourceBrief':r['config']['sourceBrief'],'settings':{'style':style,'duration':duration,'sampleRate':sr,'impactAt':impact,'stems':['rising air','impact','resolving four-note resonance']},
 'artifact':{'path':str(a.output),'sha256':hashlib.sha256(a.output.read_bytes()).hexdigest(),'duration':duration},'status':'GENERATED_PENDING_LISTENING_REVIEW'}
a.output.with_name('audio-receipt.json').write_text(json.dumps(receipt,indent=2));print(json.dumps({'style':style,'impactAt':impact,'audio':str(a.output)}))
