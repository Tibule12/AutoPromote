import numpy as np,wave
from pathlib import Path
sr=44100;duration=24;n=sr*duration;t=np.arange(n)/sr;audio=np.zeros((n,2));rng=np.random.default_rng(20261108)
def add(w,start,pan=0):
 i=round(start*sr);end=min(n,i+len(w));a=w[:end-i];audio[i:end,0]+=a*np.sqrt((1-pan)/2);audio[i:end,1]+=a*np.sqrt((1+pan)/2)
def note(freq,length,amp,kind='pad'):
 q=np.arange(round(sr*length))/sr
 if kind=='bell':env=(1-np.exp(-q/.008))*np.exp(-q/1.0);w=np.sin(2*np.pi*freq*q)+.2*np.sin(2*np.pi*freq*2.01*q)
 else:env=np.minimum(q/.6,1)*np.minimum((length-q)/1.5,1);w=np.sin(2*np.pi*freq*q)+.16*np.sin(2*np.pi*(freq*1.002)*q)+.08*np.sin(2*np.pi*freq*3*q)
 return amp*w*env
# A low pulse gives the walking cuts a shared tempo; the harmony opens with the landscape.
for b in range(36):
 at=b*.6; q=np.arange(round(sr*.6))/sr;f=52*np.exp(-q*9)+42;phase=2*np.pi*np.cumsum(f)/sr;k=np.sin(phase)*np.exp(-q*9);add(k*(.11 if b<21 else .075),at)
 if b%2==0:add(note(73.416 if b<20 else 87.307,1.25,.055),at)
for at,chord in [(0,[146.83,220,293.66]),(4.8,[174.61,220,261.63]),(12.6,[130.81,196,261.63]),(17.4,[174.61,220,349.23])]:
 for j,f in enumerate(chord):add(note(f, min(7,24-at),.025),at,(j-1)*.45)
for k,(at,f)in enumerate([(1.2,440),(3.6,523.25),(6,587.33),(8.4,659.25),(10.8,587.33),(12.6,698.46),(15,880),(17.4,1046.5),(19.8,880),(21.6,698.46)]):
 a=note(f,2.8,.025,'bell');add(a,at,(-1 if k%2 else 1)*.35);add(a*.22,at+.3,.5)
# Soft broadband air swells at the trail and mountain reveals; not replacement location sound.
for at,length,amp in [(7.8,1.2,.012),(12,1.4,.018),(16.8,1.4,.014)]:
 q=np.arange(round(sr*length))/sr;noise=rng.normal(0,1,len(q));noise=np.convolve(noise,np.ones(32)/32,mode='same');add(noise*np.sin(np.pi*q/length)**2*amp*4,at)
fade=np.minimum(t/1.2,1)*np.minimum((24-t)/2.2,1);audio*=fade[:,None];peak=np.max(np.abs(audio));audio*=.75/max(peak,1e-9);dest=Path(__file__).parent/'Open Country - original score.wav'
with wave.open(str(dest),'wb')as f:f.setnchannels(2);f.setsampwidth(2);f.setframerate(sr);f.writeframes((audio*32767).astype('<i2').tobytes())
print({'seconds':duration,'sampleRate':sr,'peak':float(np.max(np.abs(audio))),'originalProceduralScore':True,'sourceAudioIsSilent':True})
