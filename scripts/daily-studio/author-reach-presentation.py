#!/usr/bin/env python3
"""Compose editable layers around real UI, a native film and its actual timeline."""
from pathlib import Path
import base64
import hashlib
import json
import os
import subprocess
import numpy as np
import soundfile as sf
from PIL import Image

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'reports/studio-creator-film-20261018'
ASSETS=OUT/'assets';ASSETS.mkdir(exist_ok=True)
CAP=OUT/'dashboard/current-diamond'
native=json.loads((CAP/'native-scenes.json').read_text())
core=OUT/'type/proof/reach'
playback=json.loads((core/'studio-playback.json').read_text())
assert not (OUT/'presentation-final/native-edit.json').exists()
INK,PAPER,CYAN,PURPLE,MUTED='#0b0c19','#f7f2e9','#55e6ef','#a38bff','#a4abc2'
EASE=[.19,1,.22,1];layers=[];sources=[]
def layer(name,a,b,**kw):
    item=dict(id=f'reach-story-{len(layers):03}',name=name,startTime=round(a*30)/30,duration=round(b*30)/30-round(a*30)/30,x=50,y=50,width=100,scale=1,rotation=0,opacity=1,keys=[])
    item.update(kw);layers.append(item);return item
def key(item,prop,points):
    for t,v in points:item['keys'].append(dict(property=prop,time=round(t*30)/30,value=v,easing='bezier',curve=EASE))
def text(name,copy,a,b,x=50,y=50,size=1.4,color=PAPER):
    return layer(name,a,b,type='text',text=copy,x=x,y=y,width=95,scale=size,color=color,fontWeight=900,textAlign='center')
def art(name,markup,a,b,width=100,height=100,**kw):return layer(name,a,b,type='artwork',svg=markup,width=width,height=height,**kw)
def rect(name,a,b,color=INK,width=100,height=100,**kw):
    w,h=round(width*16),round(height*10)
    return art(name,f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}"><rect width="{w}" height="{h}" fill="{color}"/></svg>',a,b,width,height,**kw)
def image(name,file,a,b,x,y,width):
    source=CAP/file;im=Image.open(source);w,h=im.size;codec=ASSETS/(source.stem+'.jpg');im.convert('RGB').save(codec,quality=68,optimize=True)
    data=codec.read_bytes();sources.append(dict(file=str(source.relative_to(ROOT)),sha256=hashlib.sha256(source.read_bytes()).hexdigest(),nativeUi=True,codecOnly=True))
    markup=f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}"><image width="{w}" height="{h}" href="data:image/jpeg;base64,{base64.b64encode(data).decode()}"/></svg>'
    return art(name,markup,a,b,width,width*1.6*h/w,x=x,y=y)
def fade(item,a,b,attack=.15,release=.2):key(item,'opacity',[(a,0),(a+attack,1),(b-release,1),(b,0)])

panel=rect('Opening / question panel',.6,7.8,width=90,height=19,y=85);panel['opacity']=.95
line=text('Opening / repetitive work','SIX UPLOADS. ONE VIDEO.',.7,4.1,y=84,size=1.55,color=CYAN)
key(line,'y',[(.7,93),(1.2,84),(3.65,84),(4.1,76)]);fade(line,.7,4.1)
line=text('Opening / time back','YOUR TIME BELONGS IN THE EDIT.',3.9,7.8,y=84,size=1.25)
key(line,'x',[(3.9,60),(4.5,50),(7.8,50)]);fade(line,3.9,7.8)
# The native B-roll is imported after these layers. This matte supplies clean
# letterboxing behind its full 16:9 picture during the pop-out.
matte=rect('Result / clean stage',30.1,35.4)
fade(matte,30.1,35.4,.4,.6)
# Brief focused labels only; the actual source/timeline is never fabricated.
label=text('Craft / proof label','THE SAME EDIT. EVERY PIECE EDITABLE.',24.3,27.0,y=93,size=.7,color=CYAN);fade(label,24.3,27)
rect('Plan / editorial field',36,60)
# All current calendar cards appear together; then the six destination cards
# take the foreground. Dates, actual platform marks and status are unchanged.
for i,row in enumerate(native['allCalendarCards']):
    a=36+(i%8)*.0333333333;x=6.5+(i%8)*12.4;y=18+(i//8)*12.2
    item=image(f'Plan / current scheduled card {i+1}',row['file'],a,40,x,y,11.5)
    key(item,'x',[(a,50),(a+.6,x),(39.55,x),(40,50)])
    key(item,'y',[(a,52),(a+.6,y),(39.55,y),(40,52)])
    key(item,'scale',[(a,.1),(a+.6,1),(39.55,1),(40,.15)]);fade(item,a,40,.1,.25)
head=text('Plan / all content','ONE PLAN. EVERY DESTINATION.',36,44,y=6,size=1.2,color=CYAN);fade(head,36,44)
for i,scene in enumerate(native['scenes']):
    a=39.7+i*.067;x=19+(i%3)*31;y=35+(i//3)*35
    item=image(f'Plan / {scene["label"]} actual time',scene['card'],a,44,x,y,28)
    key(item,'x',[(a,50),(a+.5,x),(43.65,x),(44,50)])
    key(item,'y',[(a,52),(a+.5,y),(43.65,y),(44,52)])
    key(item,'scale',[(a,.1),(a+.5,1),(43.65,1),(44,.2)]);fade(item,a,44,.1,.25)
stamp=text('Plan / actual capture','ACTUAL SCHEDULE · 18 OCTOBER · SAST',40.4,43.8,y=94,size=.52,color=MUTED);fade(stamp,40.4,43.8)
for i,platform in enumerate(['linkedin','instagram','reddit']):
    scene=next(s for s in native['scenes'] if s['platform']==platform);a=44+i*8/3;b=44+(i+1)*8/3
    item=image('Versions / '+scene['label']+' actual caption',scene['detail'],a,b,30,55,49)
    key(item,'x',[(a,40),(a+.4,30),(b-.2,30),(b,25)]);fade(item,a,b,.15,.15)
for i,scene in enumerate(native['scenes']):
    a=44+i*.1;x=67+(i%2)*21;y=30+(i//2)*24
    item=image('Versions / '+scene['label']+' destination',scene['card'],a,52,x,y,19)
    key(item,'x',[(a,98),(a+.5,x),(51.6,x),(52,50)]);fade(item,a,52,.15,.2)
head=text('Versions / independent copy and time','YOUR CAPTION. YOUR TIME. EACH PLATFORM.',44,52,y=7,size=1.0);fade(head,44,52)
for i,(copy,y,size,color) in enumerate([('WHICH PLATFORM',30,1.8,PAPER),('COSTS YOU TIME?',46,2.2,CYAN),('PLATFORM + TASK. TELL US BELOW.',65,.8,MUTED)]):
    a=52+i*.13;item=text('Question / '+str(i),copy,a,60,y=y,size=size,color=color)
    key(item,'y',[(a,y+12),(a+.6,y),(60,y)]);fade(item,a,60,.2,.15)
logo=(ROOT/'frontend/public/brand/autopromote-gradient.svg').read_text()
item=art('Brand / original Gradient Tech identity',logo,54,60,width=28,height=28*1.6*269/1200,y=84)
key(item,'scale',[(54,.5),(54.7,1),(60,1)]);fade(item,54,60,.3,.15)
spec=dict(format='autopromote-graphics',version=1,name='Your ideas deserve more reach — one-minute story',width=1600,height=1000,duration=60,layers=layers,groups=[])
assert len(layers)<128
assert sum(len(l.get('svg','')) for l in layers)<=2*1024**2, 'Keep the normal native graphics import budget'
(OUT/'graphics.json').write_text(json.dumps(spec,indent=2)+'\n')
(OUT/'native-ui-sources.json').write_text(json.dumps(dict(capturedAt=native['capturedAt'],sources=sources,cardCount=len(native['allCalendarCards']),captionsInvented=False),indent=2)+'\n')
# A native recording's preview rectangle supplies the actual inset geometry.
# Its compositor time is preserved, not guessed from the movie's length.
geo=playback['captureGeometry'];v=geo['video'];viewport=geo['viewport']
# Finished-file mode can hide the predictive source decoder. The visible
# frame is then the actual contained 16:9 movie surface in the recording.
if not v['width'] or not v['height']:
    v=geo['frame']
assert v['width']>0 and abs(v['width']/v['height']-16/9)<.003
# CDP captures the complete viewport, later scaled to width 1600.
x=(v['x']+v['width']/2)/viewport['width']*100
y=(v['y']+v['height']/2)/viewport['height']*100
scale=v['width']/viewport['width']
offset=round(playback['audioOffset']*30)/30
start=24+offset
config=dict(folder=str((OUT/'presentation').relative_to(ROOT)),source=str((OUT/'dashboard/dashboard-opening.mp4').relative_to(ROOT)),sourceStart=0,sourceDuration=8,duration=60,width=1600,height=1000,projectName='Your ideas deserve more reach — one-minute Studio film 20261018',output='creator-film',graphics=str((OUT/'graphics.json').relative_to(ROOT)),movie=str((core/'final.mp4').relative_to(ROOT)),appendClips=[dict(file=str((core/'final.mp4').relative_to(ROOT)),duration=16),dict(file=str((core/'edited-in-studio.mp4').relative_to(ROOT)),duration=12),dict(file=str((OUT/'dashboard/dashboard-opening.mp4').relative_to(ROOT)),duration=8),dict(file=str((OUT/'dashboard/dashboard-opening.mp4').relative_to(ROOT)),duration=8),dict(file=str((OUT/'dashboard/dashboard-opening.mp4').relative_to(ROOT)),duration=8)],camera=[dict(time=t,x=px,y=py,scale=s) for t,px,py,s in [(0,50,50,1),(27,50,50,1),(27.6,54,12.4,1.6),(29.2,54,12.4,1.6),(29.8,50,50,1),(60,50,50,1)]],resultStart=start,resultDuration=36,result=[dict(time=t,x=px,y=py,scale=s,opacity=o) for t,px,py,s,o in [(start,x,y,scale,1),(26.8,x,y,scale,1),(27.2,x,y,scale,0),(29.6,x,y,scale,0),(29.9,x,y,scale,1),(30.5,50,50,1,1),(34.5,50,50,1,1),(35.5,x,y,scale,1),(36,x,y,scale,1)]],voiceSource=str((OUT/'narration/narration.wav').relative_to(ROOT)),soundSource=str((OUT/'score-60.mp3').relative_to(ROOT)),musicVolume=50,musicDucking=False,poses=[0,1.8,5.5,9.2,12.8,15.4,18.5,22.0,25.6,28.4,32.4,35.7,37.5,41.5,45.2,49,56.5])
config['voiceRepair']=False
config['folder']=str((OUT/'presentation-final').relative_to(ROOT))
config['projectName']='Your ideas deserve more reach — creator minute'
working_voice=OUT/'narration/narration.mp3'
if not working_voice.exists():
    subprocess.run(['ffmpeg','-nostdin','-v','error','-i',str(OUT/'narration/narration.wav'),'-c:a','libmp3lame','-b:a','256k',str(working_voice)],check=True)
config['voiceSource']=str(working_voice.relative_to(ROOT))
for index,clip in enumerate(config['appendClips'][2:],1):
    clock=ASSETS/f'Plan-clock-{index}.mp4'
    if not clock.exists():os.link(OUT/'dashboard/dashboard-opening.mp4',clock)
    clip['file']=str(clock.relative_to(ROOT))
(OUT/'config.json').write_text(json.dumps(config,indent=2)+'\n')
# Sound sources are mixed as an original score, then imported through Sound;
# voice remains a separate ordinary Studio voiceover track.
rate=48000;audio=np.zeros((60*rate,2));rng=np.random.default_rng(181028)
score,sr=sf.read(OUT/'type/assets/score.wav');assert sr==rate
for at,gain,length in [(8,.85,16),(24+offset,.35,12-offset)]:
    idx=round(at*rate);n=min(round(length*rate),len(audio)-idx,len(score));audio[idx:idx+n]+=score[:n]*gain
for j,at in enumerate(np.arange(0,60,.5)):
    if 8<=at<36:continue
    t=np.arange(round(.3*rate))/rate
    signal=.1*np.sin(2*np.pi*(50*t+1.4*(1-np.exp(-23*t))))*np.exp(-17*t)
    idx=round(at*rate);audio[idx:idx+len(t)]+=signal[:,None]
    if j%2:
        note=(np.sin(2*np.pi*[146.832,220,293.664,329.628][j%4]*t))*np.exp(-14*t)*.025
        audio[idx:idx+len(t),j%2]+=note
for at in [36,39.7,44,46.67,49.33,52,54]:
    t=np.arange(round(.4*rate))/rate;noise=rng.normal(0,1,len(t));noise=np.convolve(noise,np.ones(18)/18,mode='same')*.16*np.sin(np.pi*t/.4)**2
    idx=round(at*rate);audio[idx:idx+len(t)]+=noise[:,None]
audio[-24000:]*=np.linspace(1,0,24000)[:,None]
sf.write(OUT/'score-60-original.wav',audio,rate,subtype='PCM_16')
subprocess.run(['ffmpeg','-nostdin','-v','error','-y','-i',str(OUT/'score-60-original.wav'),'-af','highpass=f=65,loudnorm=I=-18:TP=-2:LRA=8','-ar','48000','-ac','2','-c:a','libmp3lame','-b:a','192k',str(OUT/'score-60.mp3')],check=True)
print(json.dumps(dict(seconds=60,layers=len(layers),keys=sum(len(i['keys']) for i in layers),realCards=len(native['allCalendarCards']),actualPreviewGeometry=dict(x=x,y=y,scale=scale),clockOffset=offset)))
