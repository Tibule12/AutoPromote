#!/usr/bin/env python3
"""Editable source artwork and original sound; Studio owns animation/rendering."""
from pathlib import Path
import json
import math
import random
import re
import struct
import wave

ROOT = Path(__file__).resolve().parents[2]
FOLDER = ROOT / 'reports/daily-studio/2026-10-17/schedule-tour/creative-v1'
ASSETS = FOLDER / 'assets'
ASSETS.mkdir(parents=True, exist_ok=True)
assert not (FOLDER / 'proof/native-edit.json').exists(), 'Preserve completed creative edit'
WIDTH, HEIGHT, DURATION = 1600, 1000, 31.7
INK, WHITE, TEAL, MUTED = '#07101d', '#f5f6f2', '#35e4c2', '#9daec4'
CURVE = [.16, 1, .3, 1]
layers = []


def keys(layer, prop, points):
    for time, value, *ease in points:
        easing = ease[0] if ease else 'bezier'
        layer['keys'].append(dict(property=prop, time=round(time * 90000) / 90000,
                                  value=value, easing=easing,
                                  **({'curve': CURVE} if easing == 'bezier' else {})))
    return layer


def layer(name, start, end, x=50, y=50, **values):
    item = dict(id=f'layer-{len(layers):02}', name=name, startTime=start,
                duration=end-start, x=x, y=y, scale=1, rotation=0, opacity=1,
                width=100, keys=[])
    item.update(values)
    layers.append(item)
    return item


def text(name, copy, start, end, x=50, y=50, size=1, color=WHITE, width=90):
    return layer(name, start, end, x, y, type='text', text=copy, scale=size,
                 color=color, fontWeight=900, textAlign='center', width=width)


def artwork(name, svg, start, end, x=50, y=50, width=100, height=100, opacity=1):
    return layer(name, start, end, x, y, type='artwork', svg=svg,
                 width=width, height=height, opacity=opacity)


def rect(name, start, end, x=50, y=50, width=100, height=100, fill=INK,
         stroke=None, radius=0, opacity=1):
    # Native artwork boxes are at least 1%; center thin rules inside that box.
    box_height = max(1, height)
    w, h = max(2, round(width * 16)), max(2, round(box_height * 10))
    content_height = max(1, height * 10 - (2 if stroke else 0))
    top = (h-content_height)/2
    border = f' stroke="{stroke}" stroke-width="2"' if stroke else ''
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}"><rect x="1" y="{top}" width="{w-2}" height="{content_height}" rx="{radius}" fill="{fill}"{border}/></svg>'
    return artwork(name, svg, start, end, x, y, width, box_height, opacity)


def appear(item, start, end, delay=0, dy=6, exit_at=None):
    a = start + delay
    assert a < end-.3
    keys(item, 'opacity', [(start, 0), (a, 0)] if a > start else [(start, 0)])
    keys(item, 'opacity', [(a+.24, 1), (exit_at or end-.2, 1), (end, 0)])
    keys(item, 'y', [(start, min(100, item['y']+dy)), (a+.46, item['y']), (end, item['y'])])
    return item


# Opening: asymmetric type, six real marks and staggered distribution paths.
plate = rect('Opening / ink field', 0, 4.468)
keys(plate, 'opacity', [(0, .98), (3.95, .98), (4.468, 0)])
svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000">'
for x in [720, 920, 1120, 1320, 1520]:
    svg += f'<path d="M{x} 90V850" fill="none" stroke="#183044" stroke-width="1"/>'
for y in [190, 390, 590, 790]:
    svg += f'<path d="M690 {y}H1550" fill="none" stroke="#183044" stroke-width="1"/>'
svg += '</svg>'
grid = artwork('Opening / architectural grid', svg, 0, 4.25, opacity=.7)
keys(grid, 'opacity', [(0, .2), (.6, .7), (3.8, .7), (4.25, 0)])
one = text('Opening / UPLOAD', 'UPLOAD', 0, 4.25, 25, 30, 2.9, width=43)
keys(one, 'x', [(0, 17), (.55, 25), (3.85, 25), (4.25, 19)])
keys(one, 'scale', [(0, 3.2), (.6, 2.9), (4.25, 2.9)])
keys(one, 'opacity', [(0, 1), (3.8, 1), (4.25, 0)])
edit = text('Opening / AGAIN', 'AGAIN?', .16, 4.25, 25, 47, 3, TEAL, 43)
appear(edit, .16, 4.25, dy=9)
sub = text('Opening / creator pain', "THE EDIT'S DONE. THE POSTING ISN'T.", .55, 4.15, 25, 66, .57, MUTED, 44)
appear(sub, .55, 4.15, dy=2)
six = text('Opening / SIX', '6', .75, 4.25, 77, 16, 2.3, TEAL, 26)
appear(six, .75, 4.25, dy=4)
label = text('Opening / platforms', 'PLATFORMS', .95, 4.25, 77, 25, .72, WHITE, 40)
appear(label, .95, 4.25, dy=3)
platforms = ['youtube', 'tiktok', 'instagram', 'linkedin', 'facebook', 'reddit']
for i, platform in enumerate(platforms):
    x, y, t = [64, 77, 90][i % 3], [43, 65][i // 3], .7 + i*.12
    card = rect(f'Opening / {platform} card', t, 4.22, x, y, 11.2, 16.5,
                fill='#101f30', stroke='#294358', radius=20)
    appear(card, t, 4.22, dy=6)
    svg = (ROOT / f'frontend/src/assets/platforms/{platform}.svg').read_text()
    svg = re.sub(r'fill="[^"]*"', '', svg)
    svg = svg.replace('<path ', '<path fill="#f5f6f2" ')
    mark = artwork(f'Opening / {platform} actual brand mark', svg, t+.07, 4.22,
                   x, y, 5.6, 8.96)
    appear(mark, t+.07, 4.22, dy=6)
    keys(mark, 'scale', [(t+.07, .45), (t+.45, 1.08), (t+.68, 1), (4.22, 1)])
caption = text('Opening / manual loop', 'THE MANUAL PUBLISHING LOOP', 2.1, 4.25, 77, 82, .57, MUTED, 42)
appear(caption, 2.1, 4.25, dy=2)


def chapter(number, copy, start, end):
    bg = rect(f'{number} / chapter backing', start, end, 50, 6, 100, 12, opacity=.97)
    keys(bg, 'opacity', [(start, 0), (start+.18, .97), (end-.2, .97), (end, 0)])
    t = text(f'{number} / chapter title', copy, start, end, 50, 6, 1.05, WHITE, 85)
    appear(t, start, end, dy=3)
    bar = rect(f'{number} / reveal rule', start, end, 50, 12, 90, .3, fill=TEAL)
    keys(bar, 'scale', [(start, .1), (start+.65, 1), (end-.25, 1), (end, .1)])
    keys(bar, 'opacity', [(start, 0), (start+.18, 1), (end-.2, 1), (end, 0)])


chapter('01', 'ONE PLAN. FOR ALL SIX.', 4.468, 10.899)
chapter('02', 'UPLOAD ONCE. PREVIEW FIRST.', 10.899, 14.47)
chapter('03', 'YOUR CAPTION. YOUR SCHEDULE.', 14.47, 20.859)
chapter('04', 'LET YOUR QUEUE HANDLE SENDING.', 20.859, 28.804)

# Future workflow illustration sits in the Queue's clear gap, not over cards.
tag = text('Delivery / future workflow label', 'AT YOUR CHOSEN PUBLISHING TIME', 23.6, 28.7,
           53, 49, .59, MUTED, 70)
appear(tag, 23.6, 28.7, dy=2)
for i, copy in enumerate(['SCHEDULED', 'PUBLISHING', 'CONFIRMED']):
    x, start = 33+i*20, 23.8+i*.38
    pill = rect(f'Delivery / {copy} pill', start, 28.7, x, 54, 17, 5.3,
                fill='#0a1b29', stroke=TEAL, radius=22)
    appear(pill, start, 28.7, dy=2)
    word = text(f'Delivery / {copy} label', copy, start+.06, 28.7, x, 54,
                .59, TEAL if i == 0 else WHITE, 17)
    appear(word, start+.06, 28.7, dy=2)
    if i < 2:
        arrow = text(f'Delivery / connector {i}', '→', start+.2, 28.7, x+10, 54,
                     .8, MUTED, 4)
        appear(arrow, start+.2, 28.7, dy=0)

# Three-beat payoff, changing hierarchy rather than another caption block.
bg = rect('Payoff / ink field', 28.804, DURATION)
keys(bg, 'opacity', [(28.804, 0), (29.03, .98), (DURATION, .98)])
for i, (copy, y) in enumerate([('LESS POSTING.', 38), ('MORE CREATING.', 57)]):
    start = 28.87 + i*.16
    t = text(f'Payoff / {copy}', copy, start, DURATION, 50, y, 2.05,
             TEAL if i == 1 else WHITE, 90)
    keys(t, 'opacity', [(start, 0), (start+.22, 1), (DURATION, 1)])
    keys(t, 'y', [(start, y+18), (start+.6, y), (DURATION, y)])
    keys(t, 'rotation', [(start, -7+i*4), (start+.55, 0), (DURATION, 0)])
    keys(t, 'scale', [(start, 1.25), (start+.45, 2.14), (start+.7, 2.05), (DURATION, 2.05)])
sub = text('Payoff / next action', 'PLAN YOUR NEXT POST.', 29.55, DURATION, 50, 77, .8, MUTED, 90)
keys(sub, 'opacity', [(29.55, 0), (30, 1), (DURATION, 1)])
keys(sub, 'y', [(29.55, 81), (30.05, 77), (DURATION, 77)])
rule = rect('Payoff / final rule', 29.1, DURATION, 50, 85, 85, .3, fill=TEAL)
keys(rule, 'scale', [(29.1, .1), (30.2, 1), (DURATION, 1)])
url = text('Payoff / product destination', 'autopromote.org', 29.85, DURATION, 50, 91, .7, WHITE, 80)
keys(url, 'opacity', [(29.85, 0), (30.2, 1), (DURATION, 1)])
progress = rect('Programme / progress', 0, DURATION, 50, 99.75, 98, .4, fill=TEAL)
keys(progress, 'scale', [(0, .1, 'linear'), (DURATION, 1, 'linear')])
keys(progress, 'x', [(0, 5.9, 'linear'), (DURATION, 50, 'linear')])

camera = [[0, 50, 50, 1], [4.333333, 50, 50, 1], [12.166667, 50, 50, 1],
          [12.833333, 57.5, 80, 1.3], [13.958333, 57.5, 80, 1.3],
          [14.458333, 50, 50, 1], [14.875, 59.5, 56, 1.38],
          [16.333333, 59.5, 56, 1.38], [17, 50, 50, 1],
          [28.75, 50, 50, 1], [31.666667, 50, 50, 1]]
spec = dict(format='autopromote-graphics', version=1, name='In control — schedule motion treatment',
            width=WIDTH, height=HEIGHT, duration=DURATION, layers=layers, groups=[])
for item in layers:
    stamps = set()
    for key in item['keys']:
        stamp = (key['property'], key['time'])
        assert stamp not in stamps, (item['name'], stamp)
        stamps.add(stamp)
        assert round(item['startTime']*90000) <= round(key['time']*90000) <= round((item['startTime']+item['duration'])*90000)
(ASSETS / 'graphics.json').write_text(json.dumps(spec, ensure_ascii=False, indent=2)+'\n')

# Original quiet pulse and small transition accents, below the existing voice.
rate = 48000
left, right = [0.] * int(DURATION*rate), [0.] * int(DURATION*rate)
rng = random.Random('in-control-schedule-tour')
for at in [0, .7, .82, .94, 1.06, 1.18, 1.3, 4.468, 10.899, 14.47, 20.859, 28.87, 29.03, 29.19]:
    for i in range(int(.24*rate)):
        p = int(at*rate)+i
        if p >= len(left): break
        t = i/rate
        signal = .08*math.sin(2*math.pi*110*t)*math.exp(-28*t) + rng.uniform(-1,1)*.014*math.exp(-36*t)
        left[p] += signal
        right[p] += signal*.9
for i in range(len(left)):
    t = i/rate
    env = min(1, t/.5, (DURATION-t)/.7)
    bed = .006*(math.sin(2*math.pi*110*t)+.45*math.sin(2*math.pi*164.8138*t))
    left[i] = (left[i]+bed)*env
    right[i] = (right[i]+bed*.95)*env
with wave.open(str(ASSETS / 'Original-schedule-motion.wav'), 'wb') as wav:
    wav.setnchannels(2); wav.setsampwidth(2); wav.setframerate(rate)
    wav.writeframes(b''.join(struct.pack('<hh', round(a*32767), round(b*32767)) for a,b in zip(left,right)))
design = dict(projectName='In control — schedule tour · motion edit r1', output='in-control',
              seconds=DURATION, width=WIDTH, height=HEIGHT, layers=len(layers),
              graphicKeys=sum(len(layer['keys']) for layer in layers), camera=camera,
              publicDeliverable='standalone movie, no published Studio/timeline recording',
              source='reports/daily-studio/2026-10-17/schedule-tour/proof-v3/SCHEDULE-WALKTHROUGH.autopromote.json',
              actualScheduleWrites=0, copiedOrInventedSchedules=False,
              workflowDiagram='Future publishing sequence illustration, not a claim of provider confirmation')
(FOLDER / 'design.json').write_text(json.dumps(design, ensure_ascii=False, indent=2)+'\n')
narration = dict(voice='af_heart', speed=1.04, lang='en-us',
    segments=[
        ['overview', 'Finished the edit? Now upload it six times.'],
        ['calendar', "Six tabs. Different captions. Another reminder, so you don't miss your posting time."],
        ['preview', 'Bring your video into Auto Promote once.'],
        ['destination', 'Give every platform its own caption and time. Change just one post when your plans change.'],
        ['delivery', 'See your whole plan in one place. At the chosen times, your queue sends to connected accounts. Check back for confirmation.'],
        ['closing', 'Less time posting. More time creating.'],
    ], budgets=dict(overview=4.468, calendar=6.431, preview=3.571,
                    destination=6.389, delivery=7.945, closing=2.896))
(FOLDER / 'narration-script.json').write_text(json.dumps(narration, indent=2)+'\n')
print(json.dumps({'layers':design['layers'], 'graphicKeys':design['graphicKeys'], 'cameraPoses':len(camera)}))
