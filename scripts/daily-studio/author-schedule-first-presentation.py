#!/usr/bin/env python3
"""Author ordinary Studio layers around actual captures and a new native edit."""
from pathlib import Path
import json
import base64
import hashlib
import shutil
import subprocess
import numpy as np
import soundfile as sf
from PIL import Image

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'reports/daily-studio/2026-10-17/schedule-first-v3'
ASSETS=OUT/'assets'; ASSETS.mkdir(exist_ok=True)
assert not (OUT/'proof/native-edit.json').exists(), 'Preserve the authored presentation'
CAP=OUT/'dashboard/assets'
native=json.loads((CAP/'native-scenes.json').read_text())
W,H,D=1600,1000,60
BG,WHITE,LIME,MUTED='#101311','#f2eedf','#d6fc52','#aab2a0'
layers=[];sources=[];EASE=[.16,1,.3,1]
def key(item,prop,points):
    for time,value in points:item['keys'].append(dict(property=prop,time=round(time*30)/30,
        value=value,easing='bezier',curve=EASE))
def layer(name,a,b,**kw):
    item=dict(id=f'schedule-first-{len(layers):02}',name=name,startTime=round(a*30)/30,
        duration=round(b*30)/30-round(a*30)/30,x=50,y=50,width=100,scale=1,rotation=0,opacity=1,keys=[])
    item.update(kw);layers.append(item);return item
def text(name,copy,a,b,x=50,y=50,size=1.4,color=WHITE):
    return layer(name,a,b,type='text',text=copy,x=x,y=y,width=95,scale=size,color=color,fontWeight=900,textAlign='center')
def svg(name,markup,a,b,x=50,y=50,width=100,height=100):
    return layer(name,a,b,type='artwork',svg=markup,x=x,y=y,width=width,height=height)
def rect(name,a,b,x=50,y=50,width=100,height=100,color=BG):
    width,height=max(1,width),max(1,height)
    w,h=max(2,round(width*16)),max(2,round(height*10))
    return svg(name,f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}"><rect width="{w}" height="{h}" fill="{color}"/></svg>',a,b,x,y,width,height)
def image(name,file,a,b,x,y,width):
    source=CAP/file; im=Image.open(source);w,h=im.size;codec=ASSETS/(source.stem+'.jpg')
    im.convert('RGB').save(codec,quality=87,optimize=True)
    data=codec.read_bytes()
    sources.append(dict(file=str(source.relative_to(ROOT)),sha256=hashlib.sha256(source.read_bytes()).hexdigest(),
        codecFile=str(codec.relative_to(ROOT)),codecSha256=hashlib.sha256(data).hexdigest(),nativeUi=True,codecOnly=True))
    markup=f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}"><image width="{w}" height="{h}" href="data:image/jpeg;base64,{base64.b64encode(data).decode()}"/></svg>'
    assert len(markup)<200000,name
    return svg(name,markup,a,b,x,y,width,width*16*h/w/10)
def fade(item,a,b,attack=.2,release=.2):
    key(item,'opacity',[(a,0),(a+attack,1),(b-release,1),(b,0)])
# First 32 seconds remain actual native dashboard/result/timeline footage.
# The following source clips supply only the clock under fully opaque layers.
rect('Plan / editorial stage',32,60)
for i,row in enumerate(native['allCalendarCards']):
    a=32+i*.0333333333;r=row['geometry'];cal=native['calendar'];cw=92
    width=cw*r['width']/cal['width'];x=4+cw*(r['x']+r['width']/2)/cal['width']
    y=15+cw*16*(r['y']+r['height']/2)/cal['width']/10
    item=image(f'Plan / actual calendar card {i+1}',row['file'],a,38,x,y,width)
    key(item,'x',[(a,50),(a+.6,x),(37.5,x),(38,50)])
    key(item,'y',[(a,52),(a+.6,y),(37.5,y),(38,50)])
    key(item,'scale',[(a,.1),(a+.6,1),(37.5,1),(38,.2)])
    fade(item,a,38,.12,.3)
head=text('Plan / whole actual queue','YOUR CONTENT. YOUR PLAN.',32,38,y=8,size=1.3)
fade(head,32,38)
stamp=text('Plan / capture date','ACTUAL QUEUE · 17 OCTOBER · SAST',32.8,37.8,y=91,size=.55,color=MUTED)
fade(stamp,32.8,37.8)
# Keep caption text real: move unmodified native destination panels as a carousel.
for i,platform in enumerate(['linkedin','instagram','youtube']):
    scene=next(s for s in native['scenes'] if s['platform']==platform)
    a,b=[38,40.333333,42.666667][i],[40.333333,42.666667,45][i]
    item=image('Versions / actual '+scene['label']+' caption',scene['detail'],a,b,27,55,46)
    key(item,'x',[(a,35),(a+.4,27),(b-.2,27),(b,22)])
    key(item,'scale',[(a,.86),(a+.4,1),(b,1)])
    fade(item,a,b,.15,.15)
for i,scene in enumerate(native['scenes']):
    a=38+i*.1;x=63+(i%2)*23;y=28+(i//2)*24
    item=image('Versions / actual '+scene['label']+' time',scene['card'],a,45,x,y,21)
    key(item,'x',[(a,97),(a+.5,x),(44.6,x),(45,50)])
    fade(item,a,45,.15,.2)
head=text('Versions / independent controls','DIFFERENT CAPTIONS. DIFFERENT TIMES.',38,45,y=8,size=1.0)
fade(head,38,45)
# Six independent real cards retain their recorded times and platform icons.
for i,scene in enumerate(native['scenes']):
    a=45+i*.1;x=19+(i%3)*31;y=35+(i//3)*33
    item=image('Sending / actual '+scene['label']+' schedule',scene['card'],a,52,x,y,28)
    key(item,'y',[(a,52),(a+.55,y),(51.4,y),(52,52)])
    key(item,'scale',[(a,.3),(a+.6,1),(51.4,1),(52,.25)])
    fade(item,a,52,.15,.25)
head=text('Sending / promised behaviour','YOUR TIMES. YOUR QUEUE.',45,52,y=10,size=1.3,color=LIME)
fade(head,45,52)
foot=text('Sending / truthful status','SCHEDULED → SENDING → CHECK CONFIRMATION',45.6,51.8,y=91,size=.57,color=MUTED)
fade(foot,45.6,51.8)
# A specific question, rather than another generic sign-up slide.
for i,(copy,y,size,color) in enumerate([('WHICH PLATFORM',36,1.8,WHITE),
    ('COSTS YOU TIME?',53,2.1,LIME),('PLATFORM + TASK. TELL US BELOW.',73,.78,MUTED)]):
    a=52+i*.13;item=text('Question / '+str(i),copy,a,60,y=y,size=size,color=color)
    key(item,'y',[(a,y+8),(a+.55,y),(60,y)])
    fade(item,a,60,.2,.1)
for x in [9,91]:
    item=rect('Question / quiet margin '+str(x),52,60,x=x,y=50,width=.6,height=40,color=LIME)
    key(item,'scale',[(52,.1),(53,1),(59.6,1),(60,.1)])
spec=dict(format='autopromote-graphics',version=1,name='Schedule first — actual content and a kinetic edit',
    width=W,height=H,duration=D,layers=layers,groups=[])
(OUT/'graphics.json').write_text(json.dumps(spec,indent=2)+'\n')
(OUT/'capture-sources.json').write_text(json.dumps({'capturedAt':native['capturedAt'],
    'actualCalendarCards':len(native['allCalendarCards']),'sources':sources},indent=2)+'\n')
# Preserve original source capture bytes under distinct normal Media filenames.
opening=OUT/'dashboard/dashboard-opening.mp4'
for i in range(1,5):shutil.copyfile(opening,ASSETS/f'Plan-background-{i}.mp4')
type_root=OUT/'type-revised';result=type_root/'proof/stop-posting/final.mp4'
recording=type_root/'proof/stop-posting/edited-in-studio.mp4'
config=dict(folder=str((OUT/'proof').relative_to(ROOT)),source=str(opening.relative_to(ROOT)),
    sourceStart=0,sourceDuration=8,duration=60,width=W,height=H,
    projectName='Stop posting. Start creating again. — schedule-first minute',output='schedule-first',
    graphics=str((OUT/'graphics.json').relative_to(ROOT)),movie=str(result.relative_to(ROOT)),
    appendClips=[{'file':str(result.relative_to(ROOT)),'duration':12},
        {'file':str(recording.relative_to(ROOT)),'duration':12}]+[
        {'file':str((ASSETS/f'Plan-background-{i}.mp4').relative_to(ROOT)),'duration':8 if i<4 else 4}
        for i in range(1,5)],
    camera=[{'time':t,'x':x,'y':y,'scale':scale} for t,x,y,scale in [
        (0,50,50,1),(23,50,50,1),(23.6,54,12.4,1.6),(26.4,54,12.4,1.6),
        (27,50,50,1),(60,50,50,1)]],
    resultStart=20.033333333333335,resultDuration=32,
    result=[{'time':t,'x':x,'y':y,'scale':scale,'opacity':opacity} for t,x,y,scale,opacity in [
        (20,43.5625,31.3,.4125,1),(22.8,43.5625,31.3,.4125,1),
        (23.2,43.5625,31.3,.4125,0),(26.7,43.5625,31.3,.4125,0),
        (27,43.5625,31.3,.4125,1),(27.6,50,50,1,1),(30.3,50,50,1,1),
        (31.3,43.5625,31.3,.4125,1),(32,43.5625,31.3,.4125,1)]],
    voiceSource=str((OUT/'narration/narration.wav').relative_to(ROOT)),
    soundSource=str((OUT/'score-60.mp3').relative_to(ROOT)),musicVolume=60,musicDucking=False,
    poses=[0,2.2,8.5,10,13.8,17.8,21.8,24.8,28.8,31.5,34.5,40,46.5,55])
(OUT/'config.json').write_text(json.dumps(config,indent=2)+'\n')
# An original, continuous soundtrack is an imported Sound source. The words
# get two same-clock performances: full result, then its matching real timeline.
rate=48000;audio=np.zeros((60*rate,2));rng=np.random.default_rng(171011)
# The standalone study retains its original mix. This presentation has its own
# deliberately mastered soundtrack, imported through the same native Sound UI.
# Reduce sub-bass dominance and bring the short motion accents forward.
mastered=OUT/'motion-score-mastered.wav'
subprocess.run(['ffmpeg','-nostdin','-v','error','-y','-i',str(type_root/'assets/score.wav'),
    '-af','highpass=f=60,acompressor=threshold=0.08:ratio=3:attack=4:release=90:makeup=2,loudnorm=I=-12:TP=-1.5:LRA=5',
    '-ar','48000','-ac','2',str(mastered)],check=True)
score,sr=sf.read(mastered);assert sr==rate and len(score)==12*rate
for start,gain in [(8,.85),(20,.4)]:audio[start*rate:(start+12)*rate]+=score*gain
for start in [0,32,38,45,52]:
    t=np.arange(int(.7*rate))/rate
    signal=.13*np.sin(2*np.pi*(54*t+1.3*(1-np.exp(-20*t))))*np.exp(-12*t)
    idx=start*rate;audio[idx:idx+len(t)]+=signal[:,None]
t=np.arange(60*rate)/rate
bed=(np.sin(2*np.pi*73.416*t)+.4*np.sin(2*np.pi*110*t))*.022
bed[(t>=8)&(t<32)]*=.25
audio+=bed[:,None]
for start in np.arange(0,60,.535714):
    if 7.8<start<32:continue
    n=4800;noise=rng.normal(0,1,n)*np.exp(-np.arange(n)/rate*55)*.012
    idx=round(start*rate);n=min(n,len(audio)-idx);audio[idx:idx+n,0]+=noise[:n];audio[idx:idx+n,1]+=noise[:n]
audio[:4800]*=np.linspace(0,1,4800)[:,None];audio[-14400:]*=np.linspace(1,0,14400)[:,None]
sf.write(OUT/'score-60-original.wav',audio,rate,subtype='PCM_16')
subprocess.run(['ffmpeg','-nostdin','-v','error','-y','-i',str(OUT/'score-60-original.wav'),
    '-c:a','libmp3lame','-b:a','192k',str(OUT/'score-60.mp3')],check=True)
print(json.dumps({'layers':len(layers),'keys':sum(len(l['keys']) for l in layers),
    'actualCards':len(native['allCalendarCards']),'firstEightSeconds':'actual dashboard capture','publicSeconds':60}))
