#!/usr/bin/env python3
"""Static artwork and native graphics interchange, never composited video."""
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'assets'
OUT.mkdir(exist_ok=True)
layers = []


def key(prop, t, value, easing='ease_in_out'):
    return dict(property=prop, time=t, value=value, easing=easing)


def art(name, svg, a, b, x, y, w, h, keys=()):
    layers.append(dict(id=f'clue-{len(layers):02}', name=name, type='artwork',
                       svg=svg, startTime=a, duration=b-a, x=x, y=y, width=w,
                       height=h, scale=1, rotation=0, opacity=1, keys=list(keys)))


def text(name, copy, a, b, x, y, w, scale, color='#eff0f4', keys=(), weight=600, align='center'):
    layers.append(dict(id=f'clue-{len(layers):02}', name=name, type='text', text=copy,
                       startTime=a, duration=b-a, x=x, y=y, width=w, scale=scale,
                       rotation=0, opacity=1, color=color, fontWeight=weight,
                       textAlign=align, keys=list(keys)))


def fade(a, b, entry=.3):
    return [key('opacity', a, 0), key('opacity', a+entry, 1),
            key('opacity', b-.25, 1), key('opacity', b-.02, 0)]


def svg(body):
    return '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">'+body+'</svg>'


# A low-key source disclosure; never subtitles baked into Google footage.
text('Fictional dramatization', 'FICTIONAL DRAMATIZATION', 0, 16, 16, 7, 27, .3,
     color='#d5d8e2', weight=400)
text('Private excerpt label', 'THE VIDEO I NEVER RECORDED', .3, 3, 20, 92, 35, .45,
     keys=fade(.3, 3), align='left')

# The source remains moving beneath native artwork. Every moving part is an
# ordinary editable layer with the same supported transform keys as final.
a, b = 8.05, 15.1
art('Evidence background', svg('<rect width="400" height="400" fill="#090b14"/>'),
    a, b, 76, 50, 48, 100, fade(a, b))
text('Reconstruction disclosure', 'CLOCK RECONSTRUCTION', a+.16, b, 76, 16, 40, .42,
     color='#a6a9bf', keys=fade(a+.16,b))

ticks = ''
for i in range(60):
    angle = math.radians(i*6)
    radius = 167 if i % 5 == 0 else 176
    ticks += ('<line x1="%.3f" y1="%.3f" x2="%.3f" y2="%.3f" stroke="%s" stroke-width="%s"/>' %
              (200+radius*math.sin(angle),200-radius*math.cos(angle),
               200+185*math.sin(angle),200-185*math.cos(angle),
               '#d5d7e0' if i%5==0 else '#4c5268', '3' if i%5==0 else '1'))
face = svg('<circle cx="200" cy="200" r="192" fill="#101321" stroke="#585575" stroke-width="2"/>'+ticks)
art('Clock dial', face, a+.35, b, 76, 47, 24, 42.666667,
    fade(a+.35,b))
for name, length, color, width, start, end in [
    ('Hour hand',96,'#e3e6ef',8,68.8,68.8),
    ('Minute hand',146,'#e3e6ef',5,102,102),
    ('Second hand — stopped at 36','#unused','#b4a2ff',3,168,216),
]:
    length=160 if isinstance(length,str) else length
    hand=svg(f'<line x1="200" y1="213" x2="200" y2="{200-length}" stroke="{color}" stroke-width="{width}" stroke-linecap="round"/><circle cx="200" cy="200" r="6" fill="{color}"/>')
    t=a+.65
    keys=fade(t,b)+[key('rotation',t,start,'linear'),key('rotation',11.75,end,'linear'),key('rotation',14.75,end,'hold')]
    art(name,hand,t,b,76,47,24,42.666667,keys)

text('Clock reading', '02:17:36', 10.4, b, 76, 75, 35, 1.25,
     keys=fade(10.4,b),weight=800)
text('Chronology clue', 'SEVEN MONTHS EARLIER', 12.35, b, 76, 84, 40, .4,
     color='#b4a2ff',keys=fade(12.35,b))
text('Second hand clue', 'SECOND HAND / NO CHANGE', 12.05, b, 76, 91, 40, .3,
     color='#a6a9bf',keys=fade(12.05,b))
text('Evidence limitation', 'CLUE 01', 9, 12.2, 43, 77, 14, .35,
     color='#b4a2ff',keys=fade(9,12.2))

clock_ids=[x['id'] for x in layers if x['name'] in ['Clock dial','Hour hand','Minute hand','Second hand — stopped at 36']]
groups=[dict(id='clock-assembly',name='Clock assembly — shared native push',layerIds=clock_ids,
             startTime=a+.35,duration=b-(a+.35),keys=[
                 key('scale',a+.35,.84),key('scale',10.4,1),
                 key('x',a+.35,4.16),key('x',10.4,0),
                 key('y',a+.35,-.48),key('y',10.4,0)])]
package=dict(format='autopromote-graphics',version=1,name='The impossible clock — native 16s excerpt',
             width=1920,height=1080,duration=16,layers=layers,groups=groups)
# The reference take was blocked by the provider. Keep the actual eight-second
# performance and make this an explicitly condensed clock-motion study. Never
# pad or loop a presenter and claim additional generated performance.
def pilot_time(t):
    return round(2.65+(t-8.05)*(4.9/7.05),6)
layers[0]['duration']=8
for item in layers[2:]+groups:
    start=item['startTime'];end=start+item['duration']
    item['startTime']=pilot_time(start)
    item['duration']=round(pilot_time(end)-item['startTime'],6)
    for k in item['keys']:k['time']=pilot_time(k['time'])
package.update(name='The impossible clock — condensed native 8s study',duration=8)
(OUT/'opening-clock.graphics.json').write_text(json.dumps(package,indent=2)+'\n')
print(json.dumps({'nativeLayers':len(layers),'nativeKeys':sum(len(x['keys'])for x in layers),
                  'seconds':8,'externalCompositedVideo':False}))
