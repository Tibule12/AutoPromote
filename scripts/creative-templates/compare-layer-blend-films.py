#!/usr/bin/env python3
"""Compare actual decoded exports; never substitutes for native preview parity."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

import numpy as np

p=argparse.ArgumentParser()
p.add_argument('before',type=Path);p.add_argument('after',type=Path);p.add_argument('output',type=Path)
a=p.parse_args();a.output.mkdir(parents=True,exist_ok=True)
def ffmpeg(file,*args):
    return subprocess.run(['ffmpeg','-v','error','-threads','1','-i',str(file),*args],
                          capture_output=True,check=True,timeout=120).stdout
def hashes(file):
    text=ffmpeg(file,'-map','0:v:0','-pix_fmt','rgb24','-f','framemd5','-').decode()
    return [line.split(',')[-1].strip() for line in text.splitlines() if not line.startswith('#')]
def pcm(file):
    return ffmpeg(file,'-vn','-ar','48000','-ac','2','-f','f32le','-')
def frame(file,time):
    return np.frombuffer(ffmpeg(file,'-ss',str(time),'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','-'),np.uint8).reshape(1280,720,3)
bh,ah=hashes(a.before),hashes(a.after)
assert len(bh)==len(ah)==465
changed=[i for i,(b,c) in enumerate(zip(bh,ah)) if b!=c]
bpcm,apcm=pcm(a.before),pcm(a.after)
assert len(bpcm)==len(apcm)
samples=[]
for time in [.25,.75,1.25,2,8,15,19]:
    b,c=frame(a.before,time),frame(a.after,time)
    d=np.abs(b.astype(np.int16)-c.astype(np.int16));mask=d.max(axis=2)>8
    samples.append({'outputSeconds':time,'identical':bool(np.array_equal(b,c)),
        'meanAbsoluteChannelDifference':float(d.mean()),'maximumChannelDifference':int(d.max()),
        'pixelsDifferentOver8':int(mask.sum())})
for file,label in [(a.before,'normal'),(a.after,'difference')]:
    ffmpeg(file,'-ss','0.75','-frames:v','1','-y',str(a.output/(label+'.png')))
result={'scope':'Decoded final-to-final isolated native blend edit. Not live preview parity or creative approval.',
    'beforeSha256':hashlib.sha256(a.before.read_bytes()).hexdigest(),
    'afterSha256':hashlib.sha256(a.after.read_bytes()).hexdigest(),
    'frames':len(ah),'changedDecodedFrames':len(changed),'firstChangedFrame':min(changed) if changed else None,
    'lastChangedFrame':max(changed) if changed else None,'sampledPictureDifferences':samples,
    'decodedAudioBytes':len(apcm),'decodedAudioIdentical':bpcm==apcm,
    'decodedAudioSha256':hashlib.sha256(apcm).hexdigest(),'gpuJobs':0,'humanListening':False}
(a.output/'decoded-blend-comparison.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result,indent=2))
