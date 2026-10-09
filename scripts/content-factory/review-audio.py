#!/usr/bin/env python3
import argparse,json,wave
import numpy as np
p=argparse.ArgumentParser();p.add_argument("--input",required=True);a=p.parse_args()
with wave.open(a.input,"rb") as f:
    if f.getsampwidth()!=2:raise ValueError("Expected generated 16-bit audio")
    channels=f.getnchannels();sr=f.getframerate();frames=f.getnframes();x=np.frombuffer(f.readframes(frames),dtype="<i2").astype(float)/32768
peak=float(np.max(np.abs(x)));rms=float(np.sqrt(np.mean(x*x)));clip=float(np.mean(np.abs(x)>=.995))
accepted=peak>.015 and rms>.003 and clip==0 and channels==2 and sr==48000
print(json.dumps({"accepted":accepted,"reason":f"Measured original stereo audio: peak {peak:.3f}, RMS {rms:.3f}, clipped samples {clip:.6f}. Technical check only; emotional effectiveness requires review in the final film.","peak":peak,"rms":rms,"clippedFraction":clip,"channels":channels,"sampleRate":sr,"duration":frames/sr}))
