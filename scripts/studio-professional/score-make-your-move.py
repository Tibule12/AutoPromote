"""Original 24-second music source; graphics remain in the native edit."""
from pathlib import Path
import wave,os
import numpy as np

seconds=30 if os.environ.get("STUDIO_MAKE_EPISODE")=="true" else 24
rate=48000
t=np.arange(seconds*rate)/rate
audio=np.zeros((len(t),2))
rng=np.random.default_rng(20261102)
def add(at,sound,pan=0):
    i=round(at*rate)
    count=min(len(sound),len(t)-i)
    if count>0:
        audio[i:i+count,0]+=sound[:count]*(1-.35*pan)
        audio[i:i+count,1]+=sound[:count]*(1+.35*pan)
for beat in np.arange(0,seconds,.5):
    u=np.arange(int(.42*rate))/rate
    kick=np.sin(2*np.pi*(44*u+4*(1-np.exp(-u*24))))*np.exp(-u*15)*.28
    if beat<20 or beat%2==0:add(beat,kick)
    u=np.arange(int(.11*rate))/rate
    noise=rng.normal(0,1,len(u));noise=np.r_[0,np.diff(noise)]
    add(beat+.25,noise*np.exp(-u*80)*.024,(-1)**round(beat*2)*.6)
    if round(beat*2)%2:
        u=np.arange(int(.22*rate))/rate
        noise=rng.normal(0,1,len(u))
        add(beat,(noise*.05+np.sin(2*np.pi*185*u)*.035)*np.exp(-u*26))
roots=[55,65.406,73.416,65.406,55,55]
for bar in range(seconds//2):
    root=roots[min(5,bar//2)]
    for eighth in [0,3,4,6]:
        u=np.arange(int(.4*rate))/rate
        bass=(np.sin(2*np.pi*root*u)+.25*np.sin(2*np.pi*root*2*u))*np.minimum(u*200,1)*np.exp(-u*8)*.13
        add(bar*2+eighth*.25,bass)
    for k,ratio in enumerate([4,6,8,9]):
        u=np.arange(int(.7*rate))/rate
        sound=np.sin(2*np.pi*root*ratio*u)*np.minimum(u*100,1)*np.exp(-u*7)*.036
        add(bar*2+k*.375,sound,(-1)**k*.6)
fade=np.clip(t/.08,0,1)*np.clip((seconds-t)/1.4,0,1)
audio=np.tanh(audio*1.6)*fade[:,None]
audio*=.8/max(np.max(np.abs(audio)),1e-9)
out=Path(__file__).resolve().parents[2]/'reports/studio-make-your-move-20261102'/('episode' if seconds==30 else '')/'Make your move - original score.wav'
with wave.open(str(out),'wb') as w:
    w.setnchannels(2);w.setsampwidth(2);w.setframerate(rate);w.writeframes((audio*32767).astype('<i2').tobytes())
print(out)
