#!/usr/bin/env python3
"""Original, deterministic instrumental score and separate tactile SFX stems."""
import argparse
import hashlib
import json
from pathlib import Path
import wave
import numpy as np

SR=48000
def write(path, samples):
    samples=np.clip(samples,-.92,.92)
    if samples.ndim==1: samples=np.stack((samples,samples),axis=1)
    with wave.open(str(path),"wb") as f:
        f.setnchannels(2);f.setsampwidth(2);f.setframerate(SR);f.writeframes((samples*32767).astype("<i2").tobytes())
    return {"path":str(path),"sha256":hashlib.sha256(path.read_bytes()).hexdigest(),"duration":len(samples)/SR,
        "fps":24,"container":"wav","codec":"pcm_s16le","sampleRate":SR,"channels":2,
        "peak":float(np.max(np.abs(samples))),"rms":float(np.sqrt(np.mean(samples*samples)))}
def generate(out,duration,seed,payoff_at=None):
    out.mkdir(parents=True,exist_ok=True);rng=np.random.default_rng(seed)
    n=int(duration*SR);t=np.arange(n)/SR
    payoff_at=duration*.72 if payoff_at is None else payoff_at
    if not .4<=payoff_at<duration-.4:raise ValueError("Score payoff must fit the output story clock")
    score=np.zeros((n,2));paper=np.zeros(n);ocean=np.zeros(n)
    def note(at,midi,length,level=.1,pan=0,tense=False):
        start=int(at*SR);count=min(int(length*SR),n-start)
        if count<=0:return
        q=np.arange(count)/SR;freq=440*2**((midi-69)/12)
        tone=sum((1/k**1.9)*np.sin(2*np.pi*freq*k*q+(.003*k*k if tense else 0))*np.exp(-q*(1.2+k*.22)) for k in range(1,6))
        env=np.minimum(q/.018,1)*np.minimum((length-q)/.12,1)
        tone*=env*level
        score[start:start+count,0]+=tone*np.sqrt((1-pan)/2)
        score[start:start+count,1]+=tone*np.sqrt((1+pan)/2)
    # A restrained motif becomes unstable through the middle, resolves warm.
    beat=60/96;total_beats=int(duration/beat)
    for i in range(total_beats):
        at=i*beat;phase=at/payoff_at*.72
        roots=[50,46,43,45] if phase<.72 else [53,48,50,53]
        root=roots[(i//4)%4]
        note(at,root,2.1,.11 if i%4==0 else .045, -.15)
        note(at,root+([12,19,24,19][i%4]),2.3,.055, .35 if i%2 else -.35, .35<phase<.7)
        if i%4==0:
            for interval in ([0,3,7] if phase<.72 else [0,4,7]):note(at,root+12+interval,3.0,.025,(interval-3)/10)
    # Purposeful near-silence before the reveal, then open harmonic resonance.
    hush=1-.82*np.exp(-((t-(payoff_at-.35))/.3)**2)
    score*=hush[:,None]
    for at in (0.15,0.5,0.82):
        start=int(at*SR);count=int(.12*SR);q=np.arange(count)/SR
        raw=rng.normal(0,1,count);raw=raw-np.convolve(raw,np.ones(11)/11,mode="same")
        paper[start:start+count]+=raw*np.sin(np.pi*q/.12)**2*.025
    noise=rng.normal(0,1,n)
    smooth=np.convolve(noise,np.ones(90)/90,mode="same")
    ocean=smooth*(.04+.035*(1+np.sin(2*np.pi*.22*t)))*np.minimum(t/3,1)
    for c in range(2):score[:,c]+=ocean*.32+paper*.7
    fade=np.minimum(t/.4,1)*np.minimum((duration-t)/1.1,1);score*=fade[:,None]
    # Fixed headroom, no clipping and no automatic 'creative acceptance'.
    peak=np.max(np.abs(score));score*=min(1,.72/max(peak,1e-8))
    stems=[("score",score),("paper",paper),("ocean",ocean)]
    receipts=[]
    for name,samples in stems:
        artifact=write(out/(name+".wav"),samples)
        receipt={"status":"GENERATED_PENDING_REVIEW","artifact":artifact,"model":"original-procedural-composition",
            "modelRevision":"paper-voyage-score-v1","tool":"AutoPromote Content Factory original audio",
            "settings":{"sampleRate":SR,"tempo":96,"duration":duration,"payoffAt":payoff_at,"motif":"minor tension to warm resolution","stereo":True},"seed":seed}
        (out/(name+"-receipt.json")).write_text(json.dumps(receipt,indent=2));receipts.append(receipt)
    print(json.dumps(receipts,indent=2))
if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("--output",type=Path,required=True);p.add_argument("--duration",type=float,default=36)
    p.add_argument("--seed",type=int,default=20261007);p.add_argument("--payoff-at",type=float);a=p.parse_args()
    if not .5<=a.duration<=120:raise ValueError("Audio duration outside factory bounds")
    generate(a.output,a.duration,a.seed,a.payoff_at)
