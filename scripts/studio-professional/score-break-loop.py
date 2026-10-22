#!/usr/bin/env python3
"""Original local synth score; event times follow the authored visual actions."""
import json, math, wave
from pathlib import Path
import numpy as np
root=Path('reports/studio-break-the-loop-20261015/assets'); root.mkdir(parents=True,exist_ok=True)
rate=48000; seconds=20; audio=np.zeros((rate*seconds,2)); rng=np.random.default_rng(15); events=[]
def mix(at, signal, gain=.3, pan=0):
    start=round(at*rate); signal=np.asarray(signal); n=min(len(signal),len(audio)-start)
    if n<=0:return
    audio[start:start+n,0]+=signal[:n]*gain*math.sqrt((1-pan)/2)
    audio[start:start+n,1]+=signal[:n]*gain*math.sqrt((1+pan)/2)
def tick(at,gain=.2,pan=0):
    t=np.arange(round(.075*rate))/rate
    s=(np.sin(2*np.pi*2200*t)+rng.normal(0,.2,len(t)))*np.exp(-t*90)*np.minimum(1,t/.001)
    mix(at,s,gain,pan); events.append({'time':at,'event':'mechanical tick'})
def kick(at,gain=.65):
    t=np.arange(round(.6*rate))/rate
    phase=2*np.pi*(48*t+95*.022*(1-np.exp(-t/.022)))
    mix(at,np.sin(phase)*np.exp(-t*8)*np.minimum(1,t/.001),gain)
def hit(at,gain=.6,pan=0):
    t=np.arange(round(.22*rate))/rate; noise=rng.normal(0,1,len(t)); noise=np.r_[noise[0],np.diff(noise)]
    s=(noise*.4+np.sin(2*np.pi*180*t)*.3)*np.exp(-t*26)*np.minimum(1,t/.001)
    mix(at,s,gain,pan)
def note(at,freq,length=.5,gain=.15,pan=0):
    t=np.arange(round(length*rate))/rate
    env=np.minimum(1,t/.006)*np.exp(-t/(length*.3))*np.minimum(1,(length-t)/.04)
    s=(np.sin(2*np.pi*freq*t)+.23*np.sin(2*np.pi*freq*2.003*t)+.08*np.sin(2*np.pi*freq*3*t))*env
    mix(at,s,gain,pan)
    mix(at+.1875,s*.3,gain,-pan)
def sweep(at,length=.5,gain=.12,up=True):
    t=np.arange(round(length*rate))/rate; u=t/length
    noise=rng.normal(0,1,len(t)); noise=np.convolve(noise,np.ones(12)/12,mode='same')
    chirp=np.sin(2*np.pi*(140*t+900*t*t/length))
    env=np.sin(np.pi*u)**2*(u if up else 1-u)
    mix(at,(noise+chirp*.05)*env,gain,-.25)
    mix(at+.01,(noise-chirp*.05)*env,gain,.25)
# Repetition accelerates into the visual break; low tonal pulses avoid a wall
# of full-volume percussion before the first headline lands.
for i,at in enumerate([.15,.75,1.35,1.9,2.4,2.8,3.12,3.38,3.58,3.74]):
    tick(at,.12+i*.008,math.sin(i)*.55); note(at,130.81 if i%2==0 else 196,.3,.08)
sweep(3.25,.67,.6)
kick(3.91667,.95);hit(3.91667,.72);events.append({'time':3.91667,'event':'ring-break impact'})
for i in range(5):tick(4.1+i*.085,.12,(i-2)*.25)
# Sparse bass and tight drums hold the headline, then support the modular words.
for at in [4.67,5.42,6.17,6.92,7.67,8.42,9.17,9.92,10.67]:kick(at,.5)
for at in [5.045,5.795,6.545,7.295,8.795,9.545,10.295]:hit(at,.17)
for i,at in enumerate(np.arange(4.1,11.2,.375)):
    note(float(at),[65.406,65.406,77.782,97.999][i%4],.45,.2)
    if i%2:tick(float(at),.055,(-1 if i%4==1 else 1)*.6)
for at in [6,8.1,8.48,9,9.4]:sweep(at-.14,.32,.25);hit(at,.22)
# The rhythm section and the bar/letter wave share a 160 BPM pulse.
notes=[261.626,311.127,391.995,523.251,391.995,311.127]
for i,at in enumerate(np.arange(11.4,14.5,.1875)):
    if i%2==0:kick(float(at),.55)
    else:hit(float(at),.14,math.sin(i)*.4)
    note(float(at),notes[i%len(notes)],.4,.15,math.sin(i)*.6)
    if i%2==0:note(float(at),65.406,.5,.2)
sweep(14.65,1.8,.42)
# A restrained tonal landing follows the travelling dot; the tail decays into
# the held final typography rather than continuing unrelated percussion.
kick(16.45,.7);hit(16.45,.25)
for i,freq in enumerate([65.406,130.813,195.998,261.626,311.127]):note(16.45+i*.025,freq,3.3,.18,(i-2)*.25)
for at in [17.15,17.55]:tick(at,.06)
audio=np.tanh(audio*.9)
peak=float(np.max(np.abs(audio))); audio*=.84/max(peak,.84)
audio[:480]*=np.linspace(0,1,480)[:,None];audio[-4800:]*=np.linspace(1,0,4800)[:,None]
with wave.open(str(root/'break-the-loop-original-score.wav'),'wb') as f:
    f.setnchannels(2);f.setsampwidth(2);f.setframerate(rate);f.writeframes((audio*32767).astype('<i2').tobytes())
(root/'score-receipt.json').write_text(json.dumps({'originalProceduralAudio':True,'seconds':20,'sampleRate':rate,'channels':2,'peak':float(np.max(np.abs(audio))),'events':events},indent=2))
print('Original score: 20s stereo48kHz, no external samples.')
