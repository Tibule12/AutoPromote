#!/usr/bin/env python3
"""Original ten-second sonic identity; ordinary source audio for Studio Sound."""
import json
import argparse
import wave
from pathlib import Path
import numpy as np

root = Path(__file__).resolve().parents[2]
folder = root / 'reports/studio-logo-motion-20261017/assets'
folder.mkdir(parents=True, exist_ok=True)
parser=argparse.ArgumentParser();parser.add_argument('--variant',choices=['bands','symbol'],default='bands');args=parser.parse_args()
stem='identity-symbol' if args.variant=='symbol' else 'identity-score'
assert not (folder / (stem+'-original.wav')).exists(), 'Preserve the authored score'
rate, seconds = 48000, 10
mix = np.zeros((rate*seconds, 2))
rng = np.random.default_rng(20261017)
events = []

def add(at, signal, pan=0, label='accent'):
    start = round(at*rate)
    count = min(len(signal), len(mix)-start)
    mix[start:start+count, 0] += signal[:count]*np.sqrt((1-pan)/2)
    mix[start:start+count, 1] += signal[:count]*np.sqrt((1+pan)/2)
    events.append(dict(time=at, label=label, pan=pan))

def clock(length):
    return np.arange(round(length*rate))/rate

for at in ([0,.65,1.35,1.8,3.85,5.55,6.05] if args.variant=='symbol' else [0,.82,.98,1.14,1.9,4.45,5.7]):
    t = clock(.5)
    phase = 2*np.pi*(48*t+42*(1-np.exp(-28*t))/28)
    bass = np.sin(phase)*np.exp(-13*t)
    snap = rng.normal(0, 1, len(t))*np.exp(-95*t)*.07
    add(at, .38*bass+snap, -.2 if at<1 else .2, 'assembly impact')
for i in range(8):
    t = clock(.32)
    pitch = [293.665,369.994,440,587.33][i%4]
    pluck = (np.sin(2*np.pi*pitch*t)+.18*np.sin(4*np.pi*pitch*t))*np.exp(-18*t)*(1-np.exp(-250*t))
    add(1.9+i*.06, .12*pluck, np.sin(i*np.pi/4)*.65, 'broadcast pulse')
for i in range(11):
    t = clock(.18)
    tap = np.sin(2*np.pi*(880+55*i)*t)*np.exp(-38*t)*(1-np.exp(-300*t))
    add(5.05+i*.065, .035*tap, -.55+i*.11, 'lockup settle')
for at, length in [(.07,.7),(3.85,1.15)]:
    t = clock(length)
    noise = rng.normal(0,1,len(t))
    noise = np.convolve(noise,np.ones(19)/19,mode='same')
    sweep = .25*noise*np.sin(np.pi*t/length)**2
    add(at,sweep,-.6,'sweep');add(at+.025,sweep,.6,'sweep reflection')
t=clock(3.85)
chord=sum(np.sin(2*np.pi*f*t) for f in [146.832,184.997,220,293.665])/4
envelope=(1-np.exp(-t*12))*np.exp(-t*.75)*np.minimum(1,(t[-1]-t)/.7)
add(6.15,.19*chord*envelope,0,'resolved signature')
mix*=.88/max(.88,float(np.abs(mix).max()))
mix[:480]*=np.linspace(0,1,480)[:,None]
mix[-7200:]*=np.linspace(1,0,7200)[:,None]
with wave.open(str(folder/(stem+'-original.wav')),'wb') as wav:
    wav.setnchannels(2)
    wav.setsampwidth(2)
    wav.setframerate(rate)
    wav.writeframes((mix*32767).astype('<i2').tobytes())
(folder/(stem+'-design.json')).write_text(json.dumps(dict(seconds=seconds,rate=rate,originalLocallySynthesised=True,
    outsideAudioSamples=False,events=events),indent=2)+'\n')
print('Original sonic identity prepared: assembly, spatial pulse, sweep and resolved signature.')
