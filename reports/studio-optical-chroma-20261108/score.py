from pathlib import Path
import numpy as np,wave
sr=44100;duration=16;n=sr*duration;t=np.arange(n)/sr;audio=np.zeros((n,2));rng=np.random.default_rng(809117)
def add(w,at,pan=0):
 i=round(at*sr);m=min(len(w),n-i)
 if m>0:audio[i:i+m,0]+=w[:m]*np.sqrt((1-pan)/2);audio[i:i+m,1]+=w[:m]*np.sqrt((1+pan)/2)
def bell(f,d=.9):
 q=np.arange(round(d*sr))/sr
 return (np.sin(2*np.pi*f*q)*np.exp(-q*4)+.16*np.sin(2*np.pi*f*2.76*q)*np.exp(-q*9))*(1-np.exp(-q*180))
# An original 120 BPM glass/minimal-electronic cue, including transition sounds.
for bar in range(8):
 for b in range(4):
  at=bar*2+b*.5;q=np.arange(round(.32*sr))/sr
  add(.18*np.sin(2*np.pi*np.cumsum(44+82*np.exp(-q*28))/sr)*np.exp(-q*13),at)
  if b in [1,3]:
   z=rng.normal(0,1,len(q));add(np.convolve(z,[1,-1],mode='same')*.022*np.exp(-q*45),at,.2)
  if bar>0:
   add(bell([440,554.365,659.255,830.609][(bar+b)%4])*.035,at+.25,.65 if b%2 else -.65)
  if bar>=4:
   z=rng.normal(0,1,round(.08*sr));add(np.convolve(z,[1,-1],mode='same')*.009*np.exp(-np.arange(len(z))/sr*75),at+.25,-.6)
 for f in [[110,164.814,220],[123.471,185,246.942]][(bar//2)%2]:
  q=np.arange(round(2.4*sr))/sr;add(.014*np.sin(2*np.pi*f*q)*(1-np.exp(-q*4))*np.exp(-q*1.3),bar*2,-.15)
for at in [1.5,7.5,11.5]:
 q=np.arange(round(.5*sr))/sr;z=np.convolve(rng.normal(0,1,len(q)),np.ones(14)/14,mode='same');add(z*.075*np.sin(np.pi*q/.5)**2,at,-.3);add(bell(1046.502,.8)*.05,at+.5,.2)
for at in [3,5]:
 q=np.arange(round(.16*sr))/sr;add(.16*np.sin(2*np.pi*72*q)*np.exp(-q*30),at);add(bell(1567.98,.8)*.045,at,-.3)
 for j in range(9):add(bell([783.991,1046.502,1318.510,1760][j%4],.6)*.018,at+.045*j,(-1 if j%2 else 1)*.65)
audio*=np.minimum(t/.15,1)[:,None]*np.minimum((16-t)/.7,1)[:,None];audio*=.74/np.max(np.abs(audio))
with wave.open(str(Path(__file__).parent/'Glass Current - original score.wav'),'wb')as f:f.setnchannels(2);f.setsampwidth(2);f.setframerate(sr);f.writeframes((audio*32767).astype('<i2').tobytes())
print('Original sample-free 16s stereo score created.')
