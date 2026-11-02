#!/usr/bin/env python3
"""Static source assets and native Studio interchange; never a video compositor."""
import json
from pathlib import Path
import subprocess

import numpy as np

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / 'edit-assets'
ASSETS.mkdir(exist_ok=True)
PROOF = ROOT.parent / 'proof/recovery-continuity'
layers = []
WHITE = '#eeeef4'
PURPLE = '#b4a7e0'
GREY = '#9b9daf'


def key(prop, t, value, easing='ease_in_out'):
    return dict(property=prop, time=t, value=value, easing=easing)


def fade(a, b, duration=.25):
    return [key('opacity', a, 0), key('opacity', a+duration, 1),
            key('opacity', b-duration, 1), key('opacity', b-.001, 0)]


def text(name, copy, a, b, x, y, width, scale, color=WHITE, weight=600, animate=False, align='left'):
    if scale < .7:
        width = 90
    item = dict(id=f'opening-{len(layers):02}',name=name,type='text',text=copy,
                startTime=a,duration=b-a,x=x,y=y,width=width,scale=scale,
                rotation=0,opacity=1,fontWeight=weight,color=color,textAlign=align,
                keys=fade(a,b))
    if animate:
        item.update(textProgress=0,textAnimator=dict(version=1,unit='word',order='forward',
            stagger=24,fromX=0,fromY=.4,fromScale=1,fromRotation=0,fromOpacity=0,
            tracking=.02,rangeStart=0,rangeEnd=100,easing='ease_out'))
        item['keys'] += [key('textProgress',a,0,'linear'),key('textProgress',a+.42,100,'linear')]
    layers.append(item)
    return item


def art(name, body, a, b, x, y, w, h, keys=None):
    item=dict(id=f'opening-{len(layers):02}',name=name,type='artwork',
        svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="{1920*w/100:g}" height="{1080*h/100:g}" viewBox="0 0 1280 720" preserveAspectRatio="none">{body}</svg>',
        startTime=a,duration=b-a,x=x,y=y,width=w,height=h,scale=1,rotation=0,opacity=1,
        keys=fade(a,b)if keys is None else keys)
    layers.append(item);return item


# Sparse disclosure and one source-time stamp, never continuous captions.
text('Fiction disclosure','FICTIONAL DRAMATIZATION',0,16,18,96,31,.29,GREY,400)
text('Discovery time','08:42',.22,2.35,11,86,14,.65,WHITE,600)
text('Discovery annotation','THIS MORNING',.43,2.35,13,91,18,.27,PURPLE,400)

# The primary picture is moved by native main-video keys. This matte only
# occupies its otherwise empty left margin; no precomposited picture is used.
art('Evidence margin', '<defs><linearGradient id="ink"><stop stop-color="#080a11"/><stop offset=".86" stop-color="#080a11"/><stop offset="1" stop-color="#080a11" stop-opacity="0"/></linearGradient></defs><rect width="1280" height="720" fill="url(#ink)"/>',
    2.5,14.9,16,50,34,100)
art('Recording frame', '<rect x="2" y="2" width="1276" height="716" fill="none" stroke="#77798d" stroke-opacity=".65" stroke-width="2"/><path d="M0 29V0H29M1251 0H1280V29M1280 691V720H1251M29 720H0V691" fill="none" stroke="#d0c9e5" stroke-width="5"/>',
    3.5,14.5,64,45,66.2,66.2)
text('Recording source label','THE RECORDING',3.55,14.45,47,9.5,31,.29,GREY,600)
text('Recording time label','TAKE 01 / 24 FPS',3.55,7.5,83,9.5,29,.29,PURPLE,400,align='right')

# The denial lands precisely on the measured 5.62s phrase.
text('Meaningful phrase one','NEVER',5.62,7.5,16,37,26,1.4,WHITE,800,True)
text('Meaningful phrase two','SAID.',5.88,7.5,16,49,26,1.4,WHITE,800,True)
text('Clue rather than conclusion','THE VOICE. THE FACE.',6.42,7.5,17,65,27,.3,PURPLE,400)

# Second take: callouts are timed from its actual measured word clock (+8s).
for copy,a,b,y,number in [('FACE',8.36,9.65,33,'01'),('VOICE',10.34,11.72,47,'02'),('ROOM',12.68,14.5,61,'03')]:
    text(f'{copy} index',number,a,b,6,y,7,.34,PURPLE,400)
    text(f'{copy} evidence',copy,a,b,19,y,25,1.12,WHITE,800,True)
    text(f'{copy} ownership','MINE'if copy!='ROOM'else'EXACTLY RIGHT',a+.42,b,18,y+9,25,.32,GREY,400)

# A real amplitude envelope from take 2, plotted as static raw-source evidence.
# Studio animates its programme-time cursor. This is not claimed audio-reactivity.
pcm=np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-i',str(PROOF/'take-2.mp4'),
    '-vn','-ac','1','-ar','48000','-f','f32le','-']),dtype=np.float32)
bins=np.array_split(pcm,192)
values=np.array([np.sqrt(np.mean(x*x)) for x in bins]);values/=max(float(np.max(values)),1e-9)
bars=''.join(f'<line x1="{i*6.5+16:.2f}" y1="{360-v*190:.2f}" x2="{i*6.5+16:.2f}" y2="{360+v*190:.2f}" stroke="#b4a7e0" stroke-width="2"/>'for i,v in enumerate(values))
art('Measured source waveform',bars,10.34,14.5,64,87,64,8)
text('Waveform source label','SOURCE AUDIO / TAKE 02',10.34,14.5,49,80.5,35,.26,GREY,400)
cursor=art('Source-time cursor','<rect x="600" y="40" width="80" height="640" fill="#eeeef4"/>',10.34,14.5,41.2,87,1,8,
    fade(10.34,14.5)+[key('x',10.34,50.72,'linear'),key('x',14.5,84,'linear')])

# End the excerpt on his face, not another graphic slate.
text('End annotation','THE VIDEO I NEVER RECORDED',15.15,16,30,86,53,.48,WHITE,600)

package=dict(format='autopromote-graphics',version=1,name='The Video I Never Recorded — native opening',
    width=1920,height=1080,duration=16,layers=layers,groups=[])
(ASSETS/'native-opening.graphics.json').write_text(json.dumps(package,indent=2)+'\n')
poses=[[0,50,50,1,0],[2.5,50,50,1.025,0],[3.5,64,45,.66,0],
       [7.5,64,45,.66,0],[8,64,45,.66,0],[14.5,64,45,.66,0],[15.15,50,50,1,0],[15.99,50,50,1.02,0]]
(ASSETS/'native-main-poses.json').write_text(json.dumps(poses,indent=2)+'\n')
(ASSETS/'edit-direction.json').write_text(json.dumps({'durationSeconds':16,'source':'Untrimmed approved source tests joined without effects; native programme trims encoder tail to16s.','anchors':{'video':2.5,'never':5.62,'said':5.88,'face':8.36,'voice':10.34,'room':12.68},'clockGraphics':False,'externalCompositedPicture':False,'perspectiveClaimed':False,'reason':'The two spoken takes precede the clock observation. All graphic motion is native Studio; this excerpt uses supported 2D framing and typography, not a false 3D claim.'},indent=2)+'\n')
print(json.dumps({'layers':len(layers),'keys':sum(len(x['keys'])for x in layers),'nativeMainPoses':len(poses)}))
