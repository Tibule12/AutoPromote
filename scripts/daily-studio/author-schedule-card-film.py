#!/usr/bin/env python3
"""Actual native UI captures become ordinary editable graphic layers in Studio."""
from pathlib import Path
import base64
import hashlib
import json
import struct
import math
import random
import wave
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'reports/daily-studio/2026-10-17/schedule-tour/creative-v2'
ASSETS = OUT / 'assets'
native = json.loads((ASSETS / 'native-scenes.json').read_text())
assert not (OUT/'proof/native-edit.json').exists(), 'Preserve the reviewed project'
W,H,D = 1600,1000,31.7
INK,WHITE,TEAL,MUTED = '#07101d','#f7f5ef','#35e4c2','#9eafc4'
EASE=[.16,1,.3,1]
layers=[]
sources=[]


def key(item, prop, points):
    for time,value,*style in points:
        easing=style[0] if style else 'bezier'
        item['keys'].append(dict(property=prop,time=round(time*90000)/90000,
            value=value,easing=easing,**({'curve':EASE} if easing=='bezier' else {})))
    return item


def layer(name,start,end,x=50,y=50,**options):
    item=dict(id=f'card-film-{len(layers):02}',name=name,startTime=start,duration=end-start,
        x=x,y=y,width=100,scale=1,rotation=0,opacity=1,keys=[])
    item.update(options);layers.append(item);return item


def text(name,copy,start,end,x=50,y=50,size=1,color=WHITE,width=90):
    return layer(name,start,end,x,y,type='text',text=copy,scale=size,color=color,
        fontWeight=900,textAlign='center',width=width)


def svg(name,markup,start,end,x=50,y=50,width=100,height=100):
    assert len(markup)<200000,name
    return layer(name,start,end,x,y,type='artwork',svg=markup,width=width,height=height)


def rect(name,start,end,x=50,y=50,width=100,height=100,fill=INK):
    w,h=round(width*16),max(10,round(height*10))
    return svg(name,f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}"><rect width="{w}" height="{h}" fill="{fill}"/></svg>',start,end,x,y,width,max(1,height))


def png(name,file,start,end,x,y,width):
    path=ASSETS/file;original=path.read_bytes()
    # Codec-only conversion of the native screenshot keeps the import within
    # its existing artwork-byte budget. No UI copy, geometry or date is edited.
    codec_path=path.with_suffix('.jpg')
    image=Image.open(path);w,h=image.size
    image.convert('RGB').save(codec_path,quality=91,optimize=True)
    data=codec_path.read_bytes()
    markup=f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}"><image width="{w}" height="{h}" href="data:image/jpeg;base64,{base64.b64encode(data).decode()}"/></svg>'
    sources.append(dict(layer=name,file=str(path.relative_to(ROOT)),sha256=hashlib.sha256(original).hexdigest(),nativeUi=True,codecFile=str(codec_path.relative_to(ROOT)),codecSha256=hashlib.sha256(data).hexdigest(),codecOnlyNoCopyOrGeometryChange=True))
    return svg(name,markup,start,end,x,y,width,width*16*h/w/10)


def fade(item,start,end,inset=.25,outset=.25):
    key(item,'opacity',[(start,0),(start+inset,1),(end-outset,1),(end,0)])


# Independent native cards are the visual subject, not decoration behind text.
rect('Programme / clean dark stage',0,D)
line=svg('Programme / architectural routes',
    '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><path d="M800 120V850M100 500H1500M140 160L1460 840M140 840L1460 160" fill="none" stroke="#142c3d" stroke-width="2"/></svg>',0,4.468)
key(line,'opacity',[(0,0),(.8,.8),(3.9,.8),(4.468,0)])
for i,scene in enumerate(native['scenes']):
    x,y=[20,50,80][i%3],[40,69][i//3]
    start=i*.075
    item=png('Pain / actual '+scene['label']+' post',scene['card'],start,4.468,x,y,27)
    key(item,'x',[(start,50),(start+.6,x),(3.75,x),(4.468,50)])
    key(item,'y',[(start,54),(start+.6,y),(3.75,y),(4.468,52)])
    key(item,'rotation',[(start,(i-2.5)*6),(start+.7,(-1 if i%2 else 1)*2),(3.75,0),(4.468,0)])
    key(item,'scale',[(start,.2),(start+.55,1.04),(start+.85,1),(3.75,1),(4.468,.38)])
    fade(item,start,4.468,.16,.35)
title=text('Pain / one video repeated','ONE VIDEO.',0,4.3,50,12,1.85)
key(title,'y',[(0,20),(.48,12),(3.8,12),(4.3,7)])
fade(title,0,4.3,.12,.25)
sub=text('Pain / repeated uploading','SIX UPLOADS?',.45,4.3,50,24,1.35,TEAL)
key(sub,'scale',[(.45,.6),(.95,1.42),(1.15,1.35),(4.3,1.35)])
fade(sub,.45,4.3,.2,.25)
note=text('Pain / manual work','REWRITE. SWITCH TABS. REMEMBER THE TIME.',1.8,4.3,50,91,.68,MUTED)
fade(note,1.8,4.3,.2,.2)

# Entire actual current calendar: all 23 independently fly into their real grid.
top=17; calendar_width=92
for i,row in enumerate(native['allCalendarCards']):
    r=row['geometry'];cal=native['calendar'];width=calendar_width*r['width']/cal['width']
    x=4+calendar_width*(r['x']+r['width']/2)/cal['width']
    y=top+calendar_width*16*(r['y']+r['height']/2)/cal['width']/10
    start=4.34+i*.026
    item=png(f'Plan / actual calendar entry {i:02}',row['file'],start,10.9,x,y,width)
    key(item,'x',[(start,50),(start+.55,x),(10.45,x),(10.9,50)])
    key(item,'y',[(start,48),(start+.65,y),(10.45,y),(10.9,48)])
    key(item,'scale',[(start,.2),(start+.55,1),(10.45,1),(10.9,.3)])
    key(item,'rotation',[(start,(-1 if i%2 else 1)*8),(start+.6,0),(10.9,0)])
    fade(item,start,10.9,.15,.3)
header=text('Plan / useful result','ONE PLACE. THE WHOLE PLAN.',4.468,10.85,50,9,1.25)
fade(header,4.468,10.85,.2,.25)
stamp=text('Plan / documentary date','ACTUAL SCHEDULE · 17 OCTOBER · SAST',5,10.7,50,94,.57,MUTED)
fade(stamp,5,10.7,.15,.2)

# Actual owned video, independently imported as a muted native B-roll layer.
# Its layer sits above this stage and below the subsequent actual UI cutouts.
video_title=text('Video / one source','UPLOAD ONCE.',10.9,14.47,50,10,1.5,TEAL)
fade(video_title,10.9,14.47,.15,.18)
for i,scene in enumerate([native['scenes'][0],native['scenes'][4]]):
    item=png('Video / '+scene['label']+' actual destination',scene['card'],11.0,14.47,
        15 if i==0 else 85,58,24)
    key(item,'x',[(11,50),(11.65,15 if i==0 else 85),(14,15 if i==0 else 85),(14.47,50)])
    key(item,'scale',[(11,.1),(11.65,1),(14.47,.6)])
    fade(item,11,14.47,.2,.2)

# Caption panels change as a carousel. These are unmodified native screenshots.
for i,platform in enumerate(['linkedin','instagram','youtube']):
    scene=next(s for s in native['scenes'] if s['platform']==platform)
    start,end=[14.47,16.6,18.73][i],[16.6,18.73,20.86][i]
    item=png('Copy / actual '+scene['label']+' panel',scene['detail'],start,end,26,55,45)
    key(item,'x',[(start,31),(start+.38,26),(end-.25,26),(end,21)])
    key(item,'scale',[(start,.86),(start+.4,1),(end,1)])
    fade(item,start,end,.2,.18)
for i,scene in enumerate(native['scenes']):
    x,y=[62,86][i%2],28+(i//2)*24
    item=png('Times / actual '+scene['label']+' card',scene['card'],14.5+i*.08,20.86,
        x,y,22)
    key(item,'x',[(14.5+i*.08,96),(15+i*.08,x),(20.45,x),(20.86,50)])
    fade(item,14.5+i*.08,20.86,.2,.2)
copy=text('Copy / individual versions','DIFFERENT CAPTIONS. DIFFERENT TIMES.',14.47,20.86,50,8,1.05)
fade(copy,14.47,20.86,.2,.18)

# Native cards stream along a day, then return to a unified deck.
track=rect('Timing / line',20.86,28.804,50,57,92,1,TEAL)
key(track,'scale',[(20.86,.1),(21.5,1),(28.45,1),(28.804,.1)])
fade(track,20.86,28.804,.2,.25)
for i,scene in enumerate(native['scenes']):
    start=21+i*.13
    item=png('Delivery / actual '+scene['label']+' scheduled time',scene['card'],start,28.804,
        12+i*15.2,40 if i%2==0 else 75,23)
    key(item,'x',[(start,50),(start+.65,12+i*15.2),(26.5,12+i*15.2),(28.45,50),(28.804,50)])
    key(item,'y',[(start,57),(start+.65,40 if i%2==0 else 75),(26.5,40 if i%2==0 else 75),(28.45,55),(28.804,55)])
    key(item,'rotation',[(start,-10+i*3),(start+.8,0),(26.5,0),(28.45,(i-2.5)*3),(28.804,0)])
    key(item,'scale',[(start,.2),(start+.7,1),(26.5,1),(28.804,.2)])
    fade(item,start,28.804,.15,.2)
header=text('Delivery / useful relief','YOUR TIMES. YOUR QUEUE.',20.86,28.804,50,12,1.5,TEAL)
fade(header,20.86,28.804,.2,.25)
check=text('Delivery / truthful confirmation','SCHEDULED → SENDING → CHECK CONFIRMATION',23.0,28.65,50,91,.65,MUTED)
fade(check,23,28.65,.3,.2)

for i,(copy,y,color) in enumerate([('LESS POSTING.',38,WHITE),('MORE CREATING.',58,TEAL)]):
    start=28.804+i*.15;t=text('Payoff / '+copy,copy,start,D,50,y,2.15,color)
    key(t,'y',[(start,y+18),(start+.5,y),(D,y)])
    key(t,'scale',[(start,1.4),(start+.4,2.22),(start+.65,2.15),(D,2.15)])
    key(t,'opacity',[(start,0),(start+.2,1),(D,1)])
cta=text('Payoff / next action','PLAN YOUR NEXT POST · autopromote.org',29.7,D,50,79,.8,MUTED)
key(cta,'opacity',[(29.7,0),(30.1,1),(D,1)])

for item in layers:
    stamps=set()
    for k in item['keys']:
        stamp=(k['property'],k['time']);assert stamp not in stamps,(item['name'],stamp);stamps.add(stamp)
        assert round(item['startTime']*90000)<=round(k['time']*90000)<=round((item['startTime']+item['duration'])*90000)
assert sum(len(i.get('svg','')) for i in layers)<=2*1024*1024
spec=dict(format='autopromote-graphics',version=1,name='Your real posts, in motion',width=W,height=H,duration=D,layers=layers,groups=[])
(ASSETS/'graphics.json').write_text(json.dumps(spec,ensure_ascii=False,indent=2)+'\n')
(ASSETS/'captured-source-hashes.json').write_text(json.dumps(sources,indent=2)+'\n')
design=dict(projectName='Your real posts, in motion — schedule tour r2',output='real-posts-in-motion',seconds=D,width=W,height=H,layers=len(layers),graphicKeys=sum(len(i['keys']) for i in layers),camera=[],
    source='reports/daily-studio/2026-10-17/schedule-tour/proof-v3/SCHEDULE-WALKTHROUGH.autopromote.json',
    publicDeliverable='standalone movie; matching Studio recording stays private',nativeCalendarEntries=len(native['allCalendarCards']),actualCardsAndCaptions=True,
    videoInsert=dict(file='reports/daily-studio/2026-10-17/sound-alignment/proof/sound-alignment/final.mp4',start=10.9,duration=3.57,sourceStart=3.6,name='One actual edit — six real scheduled versions',x=50,y=52,width=48,height=43.2),
    voiceSource='reports/daily-studio/2026-10-17/schedule-tour/creative-v1/narration/narration.wav',soundSource='reports/daily-studio/2026-10-17/schedule-tour/creative-v1/assets/Original-schedule-motion.wav',
    poses=[.4,1.5,3.2,5.3,7.4,9.7,11.8,13.7,15.4,17.5,19.5,22.4,24.8,27.6,30.6])
(OUT/'design.json').write_text(json.dumps(design,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'layers':design['layers'],'keys':design['graphicKeys'],'realCalendarEntries':design['nativeCalendarEntries'],'artworkBytes':sum(len(i.get('svg','')) for i in layers)}))
