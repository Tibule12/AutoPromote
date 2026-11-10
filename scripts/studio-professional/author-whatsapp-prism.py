"""Native live-video fragments, rotating alpha wedges and shared geometric wipes."""
from pathlib import Path
import json
import math

out = Path(__file__).resolve().parents[2] / 'reports/studio-whatsapp-prism-20261104'
out.mkdir(exist_ok=True)
S = 100 / 70
BLUE, PAPER = '#1636c9', '#f4eddf'
plans = []

def keys(prop, points, ease='bezier'):
    return [dict(property=prop, time=round(t, 6), value=round(v, 7), easing=ease,
                 **({'curve': [.18, .85, .24, 1]} if ease == 'bezier' else {})) for t, v in points]

def channel(target, prop, points, ease='bezier'):
    return dict(type='keys', targetId=target, keys=keys(prop, points, ease))

def polygon(points):
    return dict(enabled=True, shape='polygon', path='polygon('+','.join(f'{x}% {y}%' for x, y in points)+')', feather=0, inverted=False)

def media(name, source, a, b, start=0, scale=S, fit='contain', **extra):
    return dict(type='media_plane', id=name, name=name, sourceMediaId=source, sourceStart=start,
                startTime=a, duration=b-a, mediaFit=fit, transform=dict(x=50, y=50, scale=scale, opacity=1), **extra)

def art(name, body, a, b, **extra):
    return dict(id=name, name=name, type='artwork', svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">{body}</svg>',
                startTime=a, duration=b-a, x=50, y=50, width=100, height=100, scale=1, rotation=0, opacity=1, keys=[], **extra)

def write(name, actions, layers=None):
    assert 0 < len(actions) <= 64, (name, len(actions))
    value = dict(name=name, actions=actions)
    if layers:
        value['graphics'] = dict(format='autopromote-graphics', version=1, name=name, width=1280, height=720,
                                 duration=24, layers=layers, groups=[])
    (out/(name+'.json')).write_text(json.dumps(value, separators=(',', ':')))
    plans.append(name)

write('01 - Cobalt ground', [dict(type='remove_keys', targetId='main-video', property='opacity'),
                            channel('main-video', 'opacity', [(0, 0), (24, 0)], 'hold')],
      [art('P / cobalt', f'<rect width="1280" height="720" fill="{BLUE}"/>', 0, 24)])

# Twelve live pieces join exactly at their source clock. No frozen image or external composite.
actions = [media('P / portrait bridge', 'Portrait', 0, 3, .25),
           channel('P / portrait bridge', 'opacity', [(0, 1), (.25, 1), (.6, 0), (2.4, 0), (2.8, 1), (3, 1)])]
write('02 - Portrait bridge', actions)
xs = [34.25, 44.75, 55.25, 65.75]
for row in range(4):
    actions = []
    for col in range(3):
        name = f'P / live fragment {row}-{col}'
        left, right, top, bottom = xs[col], xs[col+1], row*25, (row+1)*25
        mask = polygon([(left-.08, top-.08), (right+.08, top-.08), (right+.08, bottom+.08), (left-.08, bottom+.08)])
        actions.append(media(name, 'Portrait', 0, 3, .25, mask=mask))
        cx, cy = (left+right)/2, (top+bottom)/2
        angle = (col-1)*15 + (row-1.5)*7
        rad = math.radians(angle)
        dx, dy = (cx-50)*12.8, (cy-50)*7.2
        rx, ry = dx*math.cos(rad)-dy*math.sin(rad), dx*math.sin(rad)+dy*math.cos(rad)
        spread_x, spread_y = (col-1)*17 + (-1)**row*3, (row-1.5)*10
        px, py = cx+spread_x-rx/12.8, cy+spread_y-ry/7.2
        t = .7+row*.08+col*.06
        actions += [channel(name, 'x', [(0, 50), (.22, 50), (t, px), (1.65, px), (2.65+col*.05, 50), (3, 50)]),
                    channel(name, 'y', [(0, 50), (.22, 50), (t, py), (1.65, py), (2.65+col*.05, 50), (3, 50)]),
                    channel(name, 'rotation', [(0, 0), (.22, 0), (t, angle), (1.65, angle), (2.65+col*.05, 0), (3, 0)])]
    write(f'03 - Live fragments row {row+1}', actions)

# Square source crop is projected first; ordinary image alpha wedges clip the rotating result.
# The fill receives a matte. It does not combine the unsupported plane+geometric-mask fields.
square = dict(version=1, corners=[[21.875, 0], [78.125, 0], [78.125, 100], [21.875, 100]], sourceRect=[0, 22.1, 100, 77.9])
layers, actions = [], [media('P / prism ground', 'Close', 3, 9, 0, fit='cover'),
                      channel('P / prism ground', 'opacity', [(3, 1), (3.5, .28), (7.6, .28), (8.6, 1), (9, 1)])]
for i in range(4):
    fill, matte = f'P / prism image {i}', f'P / prism alpha {i}'
    layer = art(matte, '<path d="M280 0H1000L640 360Z" fill="#ffffff"/>', 3, 9)
    layer['rotation'] = i*90
    layers.append(layer)
    actions.append(media(fill, 'Close', 3, 9, 0, perspective=square))
    for target, scale in [(fill, S), (matte, 1)]:
        actions += [channel(target, 'rotation', [(3, i*90+38), (3.8, i*90), (5.6, i*90+22), (7.3, i*90-16), (8.6, 0), (9, 0)]),
                    channel(target, 'scale', [(3, scale*.45), (3.8, scale), (6.2, scale*1.1), (7.3, scale), (8.6, scale*1.65), (9, scale*1.65)])]
    actions.append(channel(fill, 'opacity', [(3, 0), (3.5, 1), (7.5, 1), (8.65, 0), (9, 0)]))
write('04 - Rotating prism', actions, layers)

# One slanted frontier cuts both the replacement picture and its ground consistently.
mask = polygon([(-100, -10), (0, -10), (-35, 110), (-100, 110)])
layers = [art('P / wipe blue', f'<rect width="1280" height="720" fill="{BLUE}"/>', 9, 14, mask=mask)]
actions = [media('P / code ground', 'Screen', 9, 14, 2, fit='cover'),
           media('P / diagonal performer', 'Seated', 9, 14, 2, mask=mask),
           dict(type='move_layer', targetId='P / wipe blue', beforeId='P / diagonal performer')]
for target in ['P / wipe blue', 'P / diagonal performer']:
    actions += [channel(target, 'maskPoint1X', [(9, -5), (9.5, -5), (11.9, 140), (14, 140)], 'linear'),
                channel(target, 'maskPoint2X', [(9, -40), (9.5, -40), (11.9, 105), (14, 105)], 'linear')]
write('05 - Diagonal cut', actions, layers)

# Two different original moments share one full-height photographic composition.
actions = []
for name, source, start, rectangle, region, sign in [
    ('P / medium panel', 'Seated', 7, [[4, 4], [48, 4], [48, 96], [4, 96]], [0, 4, 100, 70], -1),
    ('P / detail panel', 'Close', 7, [[52, 4], [96, 4], [96, 96], [52, 96]], [0, 5, 100, 70], 1)]:
    actions.append(media(name, source, 14, 21, start, perspective=dict(version=1, corners=rectangle, sourceRect=region)))
    actions += [channel(name, 'y', [(14, 50+sign*65), (14.65, 50), (17, 50), (17.3, 50+sign*4), (17.7, 50), (20.55, 50), (21, 50-sign*65)]),
                channel(name, 'opacity', [(14, 0), (14.35, 1), (20.65, 1), (21, 0)])]
write('06 - Two moving moments', actions)

# The last live portrait closes through an authored eight-point iris centred on the face.
full = [(0, 0), (50, 0), (100, 0), (100, 50), (100, 100), (50, 100), (0, 100), (0, 50)]
actions = [media('P / closing iris', 'Portrait', 21, 24, .25, mask=polygon(full))]
for i, (x, y) in enumerate(full):
    angle = math.radians(-135+i*45)
    ex, ey = 50+16*math.cos(angle), 38+28.4444*math.sin(angle)
    actions += [channel('P / closing iris', f'maskPoint{i}X', [(21, x), (21.35, x), (22.4, ex), (22.9, ex), (24, 50)], 'linear'),
                channel('P / closing iris', f'maskPoint{i}Y', [(21, y), (21.35, y), (22.4, ey), (22.9, ey), (24, 38)], 'linear')]
actions.append(channel('P / closing iris', 'opacity', [(21, 0), (21.25, 1), (23.75, 1), (24, 0)]))
write('07 - Closing iris', actions)

write('08 - Prism alpha bindings', [dict(type='matte', targetId=f'P / prism image {i}', matteSourceId=f'P / prism alpha {i}', mode='alpha') for i in range(4)])
(out/'direction.json').write_text(json.dumps(dict(seconds=24, plans=plans, addedTextLayers=0, sourceSpeechMuted=True,
                                                  treatment='Live fragments, rotating video prism, diagonal cut, moving photographic diptych, polygon iris',
                                                  providerCalls=0, externalEffectsComposites=0), indent=2))
print('Native prism art direction saved:', len(plans), 'plans')
