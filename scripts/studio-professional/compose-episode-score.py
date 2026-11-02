"""Original stereo source score, imported as ordinary Studio music."""
import wave
from pathlib import Path
import numpy as np

rate=48000
t=np.arange(36*rate)/rate
rng=np.random.default_rng(20261101)
left=np.zeros_like(t)
right=np.zeros_like(t)
for start,root in [(0,55),(8,65.406),(16,73.416),(24,82.407),(28,55)]:
    span=8 if start<24 else 4 if start==24 else 8
    local=t-start
    env=np.clip(local/1.8,0,1)*np.clip((span-local)/2,0,1)
    for i,ratio in enumerate([1,1.5,2,3]):
        gain=.045/(1+i*.6)
        slow=.7+.3*np.sin(local*.9+i)
        left+=gain*env*slow*np.sin(2*np.pi*root*ratio*(1-.0007)*t+i*.7)
        right+=gain*env*slow*np.sin(2*np.pi*root*ratio*(1+.0007)*t+i*.7)
# Restrained forward pulse, leaving space for native editorial sound cues.
for beat in np.arange(0,28,.6):
    local=t-beat
    env=np.where(local>=0,np.exp(-np.maximum(0,local)*12),0)
    strength=.12 if round(beat/.6)%4==0 else .045
    pulse=np.sin(2*np.pi*(48*local+2.2*(1-np.exp(-np.maximum(local,0)*20))))*env*strength
    left+=pulse;right+=pulse
for index,at in enumerate([1.2,4.8,8.4,12,16.8,20.4,24.6,29.7,30.9,32.1]):
    local=t-at
    env=np.where(local>=0,np.minimum(1,np.maximum(0,local)*180)*np.exp(-np.maximum(local,0)*2),0)
    note=[440,659.255,880,587.33][index%4]
    bell=(np.sin(2*np.pi*note*local)+.25*np.sin(2*np.pi*note*2.003*local))*env*.035
    left+=bell*(.7 if index%2 else 1);right+=bell*(1 if index%2 else .7)
    for delay,gain in [(.27,.25),(.54,.12)]:
        shift=round(delay*rate)
        right[shift:]+=bell[:-shift]*gain
# Air rise is source music; effect accents remain native Studio sound cues.
noise=rng.normal(0,1,len(t))
noise=np.convolve(noise,np.ones(16)/16,mode='same')
air=(np.clip((t-24)/4,0,1)*(1-np.clip((t-28)/.7,0,1)))*.026
left+=noise*air;right+=np.roll(noise,193)*air
fade=np.clip(t/.15,0,1)*np.clip((36-t)/2,0,1)
audio=np.stack([left,right],axis=1)*fade[:,None]
audio=np.tanh(audio*1.8)
audio*=.78/max(np.max(np.abs(audio)),1e-9)
out=Path(__file__).resolve().parents[2]/'reports/studio-cinematic-episode-20261101/Episode original score-master.wav'
with wave.open(str(out),'wb') as w:
    w.setnchannels(2);w.setsampwidth(2);w.setframerate(rate);w.writeframes((audio*32767).astype('<i2').tobytes())
print(out)
