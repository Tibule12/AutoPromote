#!/usr/bin/env python3
"""Review native output; external assembly here is comparison packaging only."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

import numpy as np
from PIL import Image, ImageDraw
from scipy.signal import correlate, correlation_lags

ROOT = Path(__file__).resolve().parent
PROOF = Path(os.environ['AUTOPROMOTE_EDIT_PROOF_DIR']).resolve() if os.environ.get('AUTOPROMOTE_EDIT_PROOF_DIR') else ROOT.parent / 'proof/recovery-edit'
SOURCE = ROOT / 'edit-assets/presenter-source-proxy.mp4'
FINAL = PROOF / 'final.mp4'
OUT = Path(os.environ.get('AUTOPROMOTE_REVIEW_DIR','/home/tibule12/Videos/The Video I Never Recorded - Motion Edit'))
OUT.mkdir(exist_ok=True)


def run(args):
    return subprocess.check_output(args)


def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def pcm(file):
    return np.frombuffer(run(['ffmpeg','-v','error','-i',str(file),'-vn','-ac','1',
                             '-ar','16000','-f','f32le','-']),dtype=np.float32)


info = json.loads(run(['ffprobe','-v','error','-count_frames','-show_streams',
                      '-show_format','-of','json',str(FINAL)]))
video = next(s for s in info['streams'] if s['codec_type']=='video')
audio = next(s for s in info['streams'] if s['codec_type']=='audio')
assert video['r_frame_rate']=='24/1'
assert int(video['nb_read_frames'])==384
assert abs(float(video['duration'])-16)<.001
assert (video['width'],video['height'])==(1280,720)
subprocess.run(['ffmpeg','-v','error','-xerror','-i',str(FINAL),'-f','null','-'],check=True)
originals={
    'take-1.mp4':'7011e9e110f31ba82211ecdafc9f6391e28261431429463614409f31bed2b864',
    'take-2.mp4':'739f1e2239b6105a9527d113e5a197946128bb7786eb556ecbc238928f5723bb',
}
for name,expected in originals.items():
    assert sha(ROOT.parent/'proof/recovery-continuity'/name)==expected
decoded = run(['ffmpeg','-v','error','-i',str(FINAL),'-an','-vf','scale=160:90',
               '-pix_fmt','gray','-f','rawvideo','-'])
pictures=np.frombuffer(decoded,dtype=np.uint8).reshape(-1,90,160)
assert len(pictures)==384
changes=np.mean(np.abs(np.diff(pictures.astype(np.float32),axis=0)),axis=(1,2))
motion_checks=dict(decodedFrames=len(pictures),exactRepeatedAdjacentFrames=int(np.sum(changes==0)),
                   largestMeanLumaChange=float(np.max(changes)),
                   largestChangeFrame=int(np.argmax(changes)+1),
                   scope='Encoded picture continuity measurements, not perceptual playback approval.')

raw,edited = pcm(SOURCE),pcm(FINAL)
correlation = correlate(edited,raw,mode='full',method='fft')
lags = correlation_lags(len(edited),len(raw))
mask = np.abs(lags)<=1600
lag = int(lags[mask][np.argmax(correlation[mask])])
if lag>=0:
    a,b = raw[:min(len(raw),len(edited)-lag)],edited[lag:lag+len(raw)]
else:
    a,b = raw[-lag:-lag+len(edited)],edited[:min(len(edited),len(raw)+lag)]
a,b=a[:min(len(a),len(b))],b[:min(len(a),len(b))]
audio_check = dict(lagSeconds=lag/16000,correlation=float(np.corrcoef(a,b)[0,1]),
                  measuredGain=float(np.dot(a,b)/np.dot(a,a)),
                  scope='Signal timing and preservation, not a listening/lip-sync verdict.')
assert abs(audio_check['lagSeconds'])<.03
assert audio_check['correlation']>.98

stills=PROOF/'export-frames';stills.mkdir(exist_ok=True)
parity=[]
for t in ([0,2.5,2.95,3.5,6.4,9.2,13.1,15.7] if 'perspective' in str(PROOF) else [0,2.6,3.5,6.4,8.7,10.8,13.1,15.7]):
    n=int(t*24)
    frame=stills/f'frame-{n:04}.png'
    subprocess.run(['ffmpeg','-v','error','-i',str(FINAL),'-vf',f'select=eq(n\\,{n})',
                    '-frames:v','1','-y',str(frame)],check=True)
    live=Image.open(PROOF/f'live-{t}.png').convert('RGB')
    exported=Image.open(frame).convert('RGB')
    scaled=live.resize(exported.size,Image.Resampling.LANCZOS)
    picture=np.asarray(exported,dtype=np.float32)
    display=np.asarray(scaled,dtype=np.float32)
    pair=Image.new('RGB',(1280,760),'#101018')
    pair.paste(scaled.resize((640,360)),(0,40))
    pair.paste(exported.resize((640,360)),(640,40))
    ImageDraw.Draw(pair).text((16,12),f'LIVE STUDIO {t}s / NATIVE EXPORT frame {n} ({n/24:.4f}s)',fill='white')
    # Lower half shows pixel differences, amplified for inspection, not a grade.
    delta=Image.fromarray(np.uint8(np.clip(np.abs(picture-display)*3,0,255)))
    pair.paste(delta.resize((640,360)),(320,400))
    pair.save(stills/f'pair-{n:04}.png')
    parity.append(dict(programmeTime=t,exportFrame=n,exportTime=n/24,
                       liveDecoder=json.loads((PROOF/f'live-{t}-clock.json').read_text()),
                       meanAbsoluteRgbDifference=float(np.mean(np.abs(picture-display))),
                       scope='Actual live screenshot versus selected native output frame; fractional live seek is within one output frame, not exact decoded-PTS qualification.'))

contact=Image.new('RGB',(1280,4*390),'#101018')
draw=ImageDraw.Draw(contact)
for i,item in enumerate(parity):
    x,y=(i%2)*640,(i//2)*390
    contact.paste(Image.open(stills/f"frame-{item['exportFrame']:04}.png").resize((640,360)),(x,y+30))
    draw.text((x+12,y+10),f"{item['exportTime']:.3f}s",fill='white')
contact.save(PROOF/'edited-contact-sheet.png')

comparison=PROOF/'raw-vs-native-edit.mp4'
font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
graph=(f'[0:v]trim=duration=16,setpts=PTS-STARTPTS,scale=960:540,setsar=1[l];'
       f'[1:v]trim=duration=16,setpts=PTS-STARTPTS,scale=960:540,setsar=1[r];'
       f'[l][r]hstack=inputs=2,pad=1920:640:0:70:black,'
       f"drawtext=fontfile={font}:text='RAW SOURCE':x=24:y=22:fontsize=25:fontcolor=white,"
       f"drawtext=fontfile={font}:text='AUTOPROMOTE NATIVE EDIT':x=984:y=22:fontsize=25:fontcolor=white[v]")
subprocess.run(['ffmpeg','-v','error','-y','-i',str(SOURCE),'-i',str(FINAL),
                '-filter_complex',graph,'-map','[v]','-map','1:a:0','-t','16','-r','24',
                '-c:v','libx264','-preset','fast','-crf','20','-c:a','aac','-b:a','192k',
                '-pix_fmt','yuv420p','-movflags','+faststart',str(comparison)],check=True)

deliveries={
    '01 - AutoPromote Native Motion Edit.mp4':FINAL,
    '02 - Raw Source Assembly.mp4':SOURCE,
    '03 - Raw vs Native Edit.mp4':comparison,
    '04 - Editing in Studio.mp4':PROOF/'editing-in-studio.mp4',
    '05 - Complete Studio Playback.mp4':PROOF/'opening/edited-in-studio.mp4',
    'Editable Project.autopromote.json':PROOF/('NATIVE-OPENING-SEAMLESS.autopromote.json' if (PROOF/'NATIVE-OPENING-SEAMLESS.autopromote.json').exists() else ('NATIVE-OPENING-BOUNDED.autopromote.json' if (PROOF/'NATIVE-OPENING-BOUNDED.autopromote.json').exists() else 'NATIVE-OPENING.autopromote.json')),
    'Export-linked Project.autopromote.json':PROOF/'NATIVE-OPENING-FINAL.autopromote.json',
    'Raw Project.autopromote.json':PROOF/'RAW-EDITABLE.autopromote.json',
    'Original Take 1.mp4':ROOT.parent/'proof/recovery-continuity/take-1.mp4',
    'Original Take 2.mp4':ROOT.parent/'proof/recovery-continuity/take-2.mp4',
    'Frames.png':PROOF/'edited-contact-sheet.png',
}
for name,source in deliveries.items():
    target=OUT/name
    if target.exists() and sha(target)!=sha(source):
        raise RuntimeError(f'Preserve existing review file: {target}')
    shutil.copy2(source,target)
result=dict(video=video,audio=audio,format=info['format'],audioPreservation=audio_check,pictureContinuity=motion_checks,
            pairedLiveFrames=parity,comparisonPackagingOnly=True,externalEvaluatedEffects=False,
            originalsUnchanged=originals,deliveries={name:dict(path=str(OUT/name),sha256=sha(OUT/name))for name in deliveries})
(PROOF/'verification.json').write_text(json.dumps(result,indent=2)+'\n')
(OUT/'Manifest.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'frames':video['nb_read_frames'],'fps':video['r_frame_rate'],
                  'dimensions':[video['width'],video['height']],'audio':audio_check,
                  'videosFolder':str(OUT)},indent=2))
