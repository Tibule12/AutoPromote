from pathlib import Path
import numpy as np,wave
sr=44100;duration=18;n=sr*duration;t=np.arange(n)/sr;audio=np.zeros((n,2));rng=np.random.default_rng(81126)
def add(w,at,pan=0):
 i=round(at*sr);m=min(len(w),n-i)
 if m<=0:return
 audio[i:i+m,0]+=w[:m]*np.sqrt((1-pan)/2);audio[i:i+m,1]+=w[:m]*np.sqrt((1+pan)/2)
def tone(f,length,amp,decay):
 q=np.arange(round(length*sr))/sr;return amp*(np.sin(2*np.pi*f*q)+.17*np.sin(2*np.pi*f*2*q))*np.exp(-q*decay)*(1-np.exp(-q*100))
# 120 BPM. Sparse first phrase, hard blue-scene downbeat, final half-time release.
for i in range(34):
 at=i*.5;q=np.arange(round(.45*sr))/sr;phase=2*np.pi*np.cumsum(45+95*np.exp(-q*24))/sr;add(np.sin(phase)*np.exp(-q*11)*(.19 if i%4==0 else .11),at)
 if i%2:noise=rng.normal(0,1,len(q));noise=np.convolve(noise,[1,-1],mode='same');add(noise*np.exp(-q*25)*.03,at,.12)
 if i>=6 and i<29:
  h=rng.normal(0,1,round(.07*sr));h=np.convolve(h,[1,-1],mode='same');add(h*np.exp(-np.arange(len(h))/sr*65)*.012,at+.25,(-1 if i%2 else 1)*.6)
 f=[55,55,65.406,49][(i//4)%4];add(tone(f,.42,.08,6),at)
for at,f in [(0,220),(3,261.626),(6,293.665),(9,261.626),(11.5,220),(14.5,196)]:
 q=np.arange(round(min(4,18-at)*sr))/sr;env=np.minimum(q/.3,1)*np.minimum((q[-1]-q)/1.3,1);w=(np.sin(2*np.pi*f*q)+np.sin(2*np.pi*f*1.5*q)*.3)*env*.023;add(w,at,-.25);add(w*.4,at+.375,.4)
for at in [2.65,5.65,11.15,14.15]:
 q=np.arange(round(.35*sr))/sr;noise=rng.normal(0,1,len(q));noise=np.convolve(noise,np.ones(12)/12,mode='same');add(noise*np.sin(np.pi*q/.35)**2*.045,at)
fade=np.minimum(t/.18,1)*np.minimum((18-t)/.7,1);audio*=fade[:,None];audio*=.78/np.max(np.abs(audio));dest=Path(__file__).parent/'Afterimage - original score.wav'
with wave.open(str(dest),'wb')as f:f.setnchannels(2);f.setsampwidth(2);f.setframerate(sr);f.writeframes((audio*32767).astype('<i2').tobytes())
print('Original sample-free stereo score:18s,120BPM,peak '+str(np.max(np.abs(audio))))
