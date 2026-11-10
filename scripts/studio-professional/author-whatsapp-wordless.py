"""Wordless art direction for the ordinary Studio graph; no external RGB composite."""
from pathlib import Path
import json

out = Path(__file__).resolve().parents[2] / 'reports/studio-whatsapp-director-20261103/wordless'
out.mkdir(exist_ok=True)
INK, CYAN, CORAL = '#090c18', '#48f7e2', '#ff5f61'
plans = []

def keys(prop, points, ease='bezier'):
    return [dict(property=prop, time=t, value=v, easing=ease,
                 **({'curve': [.2, .9, .25, 1]} if ease == 'bezier' else {})) for t, v in points]

def channel(target, prop, points, ease='bezier'):
    return dict(type='keys', targetId=target, keys=keys(prop, points, ease))

def media(name, source, a, b, source_start=0, x=50, y=50, scale=1.43, fit='contain', **extra):
    return dict(type='media_plane', id=name, name=name, sourceMediaId=source, sourceStart=source_start,
                startTime=a, duration=b-a, transform=dict(x=x, y=y, scale=scale, opacity=1), mediaFit=fit, **extra)

def art(name, body, a, b, **extra):
    return dict(id=name, name=name, type='artwork', svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">{body}</svg>',
                startTime=a, duration=b-a, x=50, y=50, width=100, height=100, scale=1, rotation=0, opacity=1, keys=[], **extra)

def write(name, actions, layers=None):
    assert 0 < len(actions) <= 64
    value = dict(name=name, actions=actions)
    if layers:
        value['graphics'] = dict(format='autopromote-graphics', version=1, name=name, width=1280, height=720,
                                 duration=24, layers=layers, groups=[])
    (out / (name + '.json')).write_text(json.dumps(value, separators=(',', ':')))
    plans.append(name)

background = art('W / night', f'<rect width="1280" height="720" fill="{INK}"/>', 0, 24)
write('01 - Empty night', [dict(type='remove_keys', targetId='main-video', property='opacity'),
                           channel('main-video', 'opacity', [(0, 0), (24, 0)], 'hold')], [background])

# Code lives inside the actual moving silhouette, with the colour portrait surfacing through it.
for scene, a, b in [('opening', 0, 3), ('return', 21, 24)]:
    mask, colour, code = [f'W / {scene} {s}' for s in ['alpha', 'colour', 'code']]
    actions = [media(mask, 'Portrait mask', a, b, 0, y=56, scale=1.9),
               media(colour, 'Portrait', a, b, .25, y=56, scale=1.9),
               media(code, 'Screen', a, b, 2 if a == 0 else 7, scale=1.43, fit='cover')]
    code_alpha = [(a, .8), (a+.7, .55), (a+1.5, .78), (b, .05)] if a == 0 else [(a, .8), (a+.7, .55), (a+1.5, .78), (23.45, .9), (24, 0)]
    portrait_alpha = [(a, .4), (a+1.4, .7), (b, 1)] if a == 0 else [(a, .4), (a+1.4, .7), (23.45, .18), (24, 0)]
    actions += [channel(mask, 'scale', [(a, 1.76), (b, 2.02)]),
                channel(colour, 'scale', [(a, 1.76), (b, 2.02)]),
                channel(code, 'opacity', code_alpha),
                channel(colour, 'opacity', portrait_alpha)]
    write('02 - '+scene+' double exposure', actions)

# Concentric source windows use different moments. Their travelling crops pull us into the eyes.
actions = [media('W / tunnel base', 'Close', 3, 9, 0, scale=1.43, fit='cover')]
actions += [channel('W / tunnel base', 'opacity', [(3, 0), (3.3, 1), (8.75, 1), (9, 0)])]
for i in range(3):
    name = f'W / temporal window {i}'
    actions += [media(name, 'Close', 3, 9, .4*(i+1), scale=.87-i*.18, fit='cover')]
    actions += [channel(name, 'scale', [(3, .02), (3.8+i*.16, .87-i*.18), (5.25, .87-i*.18),
                                      (6.5, 1.15-i*.22), (7.5, 1.15-i*.22), (8.9, 2.7-i*.4)]),
                channel(name, 'rotation', [(3, (-1)**i*25), (4.2, 0), (6.3, (-1)**i*7), (8.8, 0)]),
                channel(name, 'opacity', [(3, 0), (3.5+i*.18, 1), (8.45, 1), (8.95, 0)]),
                channel(name, 'x', [(3, 50), (5.25, 50), (6.2, 50+(-1)**i*9), (7.1, 50), (9, 50)])]
write('03 - Through the eyes', actions)

# A moving video plane first occupies the photographed monitor, then opens to the programme canvas.
corners = [[12, 5], [96, 10], [94, 96], [10, 92]]
identity = [[0, 0], [100, 0], [100, 100], [0, 100]]
actions = [media('W / physical screen', 'Screen', 9, 14, 2, scale=1.43, fit='cover'),
           media('W / screen world', 'Seated', 9.7, 14, 2.7, scale=1.43, fit='cover',
                 perspective=dict(version=1, corners=corners))]
actions += [channel('W / screen world', 'opacity', [(9.7, 0), (10.25, 1), (14, 1)])]
for i in range(4):
    for axis, j in [('X', 0), ('Y', 1)]:
        actions.append(channel('W / screen world', f'planeCorner{i}{axis}',
                               [(9.7, corners[i][j]), (10.8, corners[i][j]), (12.4, identity[i][j]), (14, identity[i][j])], 'linear'))
actions += [channel('W / physical screen', 'opacity', [(9, 1), (11, 1), (12.4, 0), (14, 0)]),
            channel('W / screen world', 'scale', [(9.7, 1.43), (12.4, 1.43), (13.65, 1.7), (14, 1.82)])]
write('04 - Enter the screen', actions)

# Actual time-shifted isolated performances open out, follow different trajectories, then recombine.
actions = []
for i, offset, x, size, alpha in [(0, .65, 24, 1.12, .5), (1, .3, 76, 1.2, .7), (2, 0, 50, 1.82, 1)]:
    a, b = 14+offset, 21
    mask, colour = f'W / echo {i} alpha', f'W / echo {i} colour'
    actions += [media(mask, 'Seated mask', a, b, 0, x=x, y=61, scale=size),
                media(colour, 'Seated', a, b, 7, x=x, y=61, scale=size)]
    for target in [mask, colour]:
        actions += [channel(target, 'x', [(a, 50), (15.25+offset, x), (17.4, x), (19.2, 50), (21, 50)]),
                    channel(target, 'scale', [(a, 1.82), (15.25+offset, size), (17.4, size), (19.2, 1.82), (21, 1.9)])]
    actions += [channel(colour, 'opacity', [(a, 0 if i < 2 else 1), (15.3+offset, alpha), (17.4, alpha), (19.4, 0 if i < 2 else 1), (21, 0 if i < 2 else 1)])]
write('05 - Time echoes', actions)

# Native editable vector lines spiral in opposite directions behind the headphone movement.
layers, actions = [], []
for i, colour in enumerate([CYAN, CORAL]):
    shape = dict(version=1, closed=False,
                 nodes=[dict(x=7, y=70, **{'in':[0, 0], 'out':[0, -75]}),
                        dict(x=52, y=8, **{'in':[-42, 0], 'out':[42, 0]}),
                        dict(x=93, y=70, **{'in':[0, -75], 'out':[0, 0]})],
                 fill=dict(kind='none', color=colour, endColor=colour, start=[0, 0], end=[100, 100]),
                 stroke=dict(color=colour, width=.8))
    name=f'W / orbit {i}'
    layers.append(dict(id=name, name=name, type='artwork', vectorShape=shape, startTime=14, duration=7,
                       x=50, y=54, width=87, height=92, scale=1-i*.12, rotation=i*160, opacity=.8,
                       keys=keys('rotation', [(14, i*160-50), (21, i*160+75)])))
    actions += [channel(name, 'strokeEnd', [(14, 0), (15.3+i*.3, 100), (19.7, 100), (21, 0)]),
                channel(name, 'strokeOffset', [(14, 0), (21, 45)], 'linear'),
                dict(type='move_layer', targetId=name, beforeId='W / echo 0 colour')]
write('06 - Sound becomes movement', actions, layers)

# Bind only after ordinary video-source shadows have been switched off in the inspector.
bindings = []
for scene in ['opening', 'return']:
    for fill in ['colour', 'code']:
        bindings.append(dict(type='matte', targetId=f'W / {scene} {fill}', matteSourceId=f'W / {scene} alpha', mode='luma'))
for i in range(3):
    bindings.append(dict(type='matte', targetId=f'W / echo {i} colour', matteSourceId=f'W / echo {i} alpha', mode='luma'))
write('07 - Native alpha bindings', bindings)
(out/'direction.json').write_text(json.dumps(dict(seconds=24, plans=plans, addedWords=0,
                                                  sourceAudioMuted=True, sourceMasks='Reused exact cached CPU inputs'), indent=2))
print('Wordless native plans saved')
