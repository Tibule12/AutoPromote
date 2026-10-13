#!/usr/bin/env python3
"""Original reusable launch soundtrack and fictional QA brand assets, CPU only.

This prepares ordinary source assets. Studio owns all film composition, text,
timing, transitions and animation. These brands represent no actual customers.
"""
import argparse
from pathlib import Path
import wave
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]


def prepare(folder):
    folder.mkdir(parents=True, exist_ok=True)
    rate, duration = 48000, 20
    mix = np.zeros((rate * duration, 2), dtype=np.float64)
    rng = np.random.default_rng(20261009)

    def add(signal, onset, gain=1, pan=0):
        start = round(onset * rate)
        count = min(len(signal), len(mix) - start)
        if count <= 0:
            return
        mix[start:start+count, 0] += signal[:count] * gain * np.sqrt((1-pan)/2)
        mix[start:start+count, 1] += signal[:count] * gain * np.sqrt((1+pan)/2)

    def clock(seconds):
        return np.arange(round(seconds * rate))/rate

    # Forty beats at 120 BPM: restrained intro, tactile pulse, escalation,
    # half-beat pre-reveal silence and a resolving chord under the brand.
    roots = [65.406, 51.913, 77.782, 58.270]
    for beat in range(31):
        onset = beat * .5
        if onset < 2 or onset >= 14.5:
            continue
        t = clock(.36)
        phase = 2*np.pi*(44*t+68*(1-np.exp(-28*t))/28)
        kick = np.sin(phase)*np.exp(-12*t) + rng.normal(0, 1, len(t))*np.exp(-160*t)*.15
        add(kick, onset, .43)
        t = clock(.42)
        root = roots[min(3, int((onset-2)/4))]
        bass = (np.sin(2*np.pi*root*t)+.2*np.sin(4*np.pi*root*t)+.1*np.sin(6*np.pi*root*t))
        bass *= (1-np.exp(-80*t))*np.exp(-8*t)
        add(bass, onset+.035, .20)
        if beat % 2:
            t = clock(.19)
            noise = rng.normal(0, 1, len(t))
            high = noise-np.convolve(noise, np.ones(7)/7, mode='same')
            clap = high * (np.exp(-28*t)+.35*np.exp(-180*np.abs(t-.025)))
            add(clap, onset, .08, -.15)
    for step in range(8, 58):
        onset = step*.25
        t = clock(.065)
        noise = rng.normal(0, 1, len(t))
        hat = (noise-np.convolve(noise, np.ones(11)/11, mode='same')) * np.exp(-80*t)
        add(hat, onset, .032 if step % 2 else .047, .45 if step % 2 else -.45)
        if step % 2 or onset > 8:
            t = clock(.45)
            note = [261.626, 311.127, 391.995, 466.164][step % 4]
            pluck = (np.sin(2*np.pi*note*t)+.32*np.sin(4*np.pi*note*t))
            pluck *= (1-np.exp(-180*t))*np.exp(-14*t)
            add(pluck, onset, .048, -.25 if step % 2 else .25)
            add(pluck, onset+.1875, .013, .45)
    for onset, chord in [(0, [130.813,155.563,195.998]), (8, [103.826,130.813,155.563]),
                         (15.25, [130.813,195.998,261.626,311.127])]:
        t = clock(min(5,20-onset))
        envelope = np.minimum(1,t/.18)*np.exp(-.5*t)*np.minimum(1,(t[-1]-t)/.65)
        pad = sum((np.sin(2*np.pi*n*t)+.13*np.sin(2*np.pi*n*1.002*t)) for n in chord)/len(chord)
        add(pad*envelope, onset, .105)
    # A stereo widening filtered rise gives the edit a deliberate arrival.
    t = clock(1)
    noise = rng.normal(0,1,len(t))
    rise = np.convolve(noise,np.ones(31)/31,mode='same') * t**2
    add(rise,14,.12,-.6); add(rise,14.045,.10,.6)
    fade = np.minimum(1,np.arange(len(mix))/rate/.02)*np.minimum(1,(len(mix)-1-np.arange(len(mix)))/rate/.65)
    mix *= fade[:,None]
    mix *= .78/max(.78, np.max(np.abs(mix)))
    with wave.open(str(folder/'launch-pulse-original.wav'),'wb') as wav:
        wav.setnchannels(2); wav.setsampwidth(2); wav.setframerate(rate)
        wav.writeframes((mix*32767).astype('<i2').tobytes())
    font = ImageFont.truetype(str(ROOT/'python_media_worker/assets/fonts/Inter-Black.ttf'),125)
    for name, colour, symbol in [('EMBER','#ffb15a','flame'),('VELO','#baff38','chevron'),('ONDA','#bc80ff','wave')]:
        image = Image.new('RGBA',(1000,230)); draw = ImageDraw.Draw(image)
        if symbol == 'flame':
            draw.polygon([(70,172),(28,125),(62,72),(86,12),(112,79),(152,115),(135,169),(103,194)],fill=colour)
            draw.polygon([(82,173),(70,127),(97,94),(117,133),(109,171)],fill='#101010')
        elif symbol == 'chevron':
            for x in [28,89]: draw.polygon([(x,43),(x+36,43),(x+76,115),(x+36,187),(x,187),(x+40,115)],fill=colour)
        else:
            for i,h in enumerate([48,91,149,186,149,91,48]):
                x=24+i*22;draw.rounded_rectangle((x,115-h/2,x+13,115+h/2),radius=6,fill=colour)
        draw.text((212,116),name,font=font,anchor='lm',fill='#ffffff')
        # Trim irrelevant transparent right space; contain keeps tall/wide marks
        # in the same authored logo box without stretching.
        image.crop(image.getbbox()).save(folder/(name.lower()+'-logo.png'))


if __name__ == '__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',required=True,type=Path)
    prepare(parser.parse_args().output)
