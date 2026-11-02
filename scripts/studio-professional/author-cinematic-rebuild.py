"""Reviewed creative directions, consumed by the ordinary Studio scene importer.

No rendered masks, motion movies, alternate compositor or model requests.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'reports/studio-cinematic-episode-20261101/creative-rebuild-v2'
OUT.mkdir(exist_ok=True)
C = [.22, 1, .36, 1]
INK, PAPER, LILAC = '#080b14', '#f2eee7', '#d1b9ff'


def keys(prop, pairs, easing='bezier'):
    pairs = sorted(dict(pairs).items())
    return [dict(property=prop, time=round(t, 6), value=v, easing=easing,
                 **({'curve': C} if easing == 'bezier' else {})) for t, v in pairs]


def channel(id, prop, pairs, easing='bezier'):
    return dict(type='keys', targetId=id, keys=keys(prop, pairs, easing))


def art(id, content, a, b):
    return dict(id=id, name=id, type='artwork', x=50, y=50, width=100,
                height=100, scale=1, rotation=0, opacity=1, startTime=a,
                duration=b-a, svg='<svg xmlns="http://www.w3.org/2000/svg" '
                'width="1280" height="720">'+content+'</svg>', keys=[])


def text(id, copy, a, b, x=50, y=15, scale=.46):
    return dict(id=id, name=id, type='text', text=copy, x=x, y=y, width=95,
                scale=scale, rotation=0, opacity=1, startTime=a, duration=b-a,
                color=PAPER, fontWeight=600, textAlign='center', keys=[])


def plane(id, source, a, b, source_start=0, mask=None, quad=None):
    return dict(type='media_plane', id=id, name=id, sourceMediaId=source,
                sourceStart=source_start, startTime=a, duration=b-a,
                transform=dict(x=50, y=50, scale=100/70, opacity=1),
                **({'mask': mask} if mask else {}),
                **({'perspective': dict(version=1, corners=quad)} if quad else {}))


def write(name, layers, actions):
    assert len(actions) <= 64
    value=dict(name=name,actions=actions)
    if layers:
        value['graphics']=dict(format='autopromote-graphics', version=1, name=name,
                               width=1280, height=720, duration=36, layers=layers, groups=[])
    (OUT/(name+'.json')).write_text(json.dumps(value, separators=(',', ':')))


# The city image recedes while its source-bound person remains in the foreground.
track = json.loads((OUT/'city-contour-directions.json').read_text())['poses']
stage = art('Rebuild / spatial stage', '<defs><radialGradient id="s">'
            '<stop stop-color="#25213c"/><stop offset="1" stop-color="#080b14"/>'
            '</radialGradient></defs><rect width="1280" height="720" fill="url(#s)"/>', 6, 10)
stage['keys'] = keys('opacity', [(6, 0), (6.5, 1), (9.6, 1), (10, 0)])
shadow = art('Rebuild / ground contact', '<defs><radialGradient id="g">'
             '<stop stop-color="#000000" stop-opacity=".85"/>'
             '<stop offset="1" stop-color="#000000" stop-opacity="0"/>'
             '</radialGradient></defs><ellipse cx="640" cy="566" rx="145" ry="24" fill="url(#g)"/>', 6, 10)
shadow['keys'] = keys('x', [(6, 50), (6.9, 35), (9.35, 33), (10, 33)]) + keys('opacity', [(6, 0), (6.6, .8), (9.6, .8), (10, 0)])
caption = text('Rebuild / step outside', 'THE FRAME IS ONLY THE START.', 7.15, 9.5, 31, 18, .5)
caption['keys'] = keys('opacity', [(7.15, 0), (7.6, 1), (9.2, 1), (9.5, 0)])
quad = [[0, 10], [94, 0], [94, 100], [0, 90]]
actions = []
for id, source, a, b, source_start in [
    ('Rebuild / departing city', 'City', 6, 7.2, 4),
    ('Rebuild / new world', 'Autumn', 6.5, 10, .5),
]:
    actions.append(plane(id, source, a, b, source_start, quad=quad))
    actions += [channel(id, 'x', [(a, 50 if a == 6 else 66), (7.2, 72), (b, 72)]),
                channel(id, 'y', [(a, 50), (7.2, 48), (b, 48)]),
                channel(id, 'scale', [(a, 100/70 if a == 6 else .95), (7.2, .91), (b, .91)]),
                channel(id, 'perspectiveProgress', [(a, 0 if a == 6 else 85), (7.2, 100), (b, 100)])]
    actions.append(channel(id, 'opacity', [(a, 1), (6.85, 1), (b, 0)] if source == 'City'
                           else [(a, 0), (7.05, 1), (9.6, 1), (b, 0)]))
path = 'polygon('+', '.join(f'{x}% {y}%' for x, y in track[0]['points'])+')'
body = 'Rebuild / person outside the image'
actions.append(plane(body, 'City', 6, 10, 4, mask=dict(enabled=True, shape='polygon', path=path,
                                                    feather=.75, inverted=False)))
rows = [dict(property=f'maskPoint{i}{axis}', time=round(6+p['sourceTime']-4, 6),
             value=point[j], easing='linear') for p in track for i, point in enumerate(p['points'])
        for j, axis in enumerate(['X', 'Y'])]
subject_keys = len(rows)
actions += [dict(type='keys', targetId=body, keys=rows[i:i+128]) for i in range(0, len(rows), 128)]
actions += [channel(body, 'x', [(6, 50), (6.9, 35), (9.35, 33), (10, 33)]),
            channel(body, 'y', [(6, 50), (6.8, 75), (10, 75)]),
            channel(body, 'scale', [(6, 100/70), (6.8, 2.1), (9.6, 2.1), (10, 2.1)]),
            channel(body, 'opacity', [(6, 0), (6.35, 0), (6.65, 1), (9.6, 1), (10, 0)])]
write('01 - Step outside the image', [stage], actions)

# Four independent moving strips recompose the landscape around the walker.
# The centre stays the actual trail shot, rather than covering the subject with copy.
caption = text('Rebuild / open possibilities', 'ONE SHOT. OPEN POSSIBILITIES.', 10.6, 13.8)
caption['keys'] = keys('opacity', [(10.6, 0), (11.1, 1), (13.1, 1), (13.8, 0)])
actions = []
for i, (source, left, right) in enumerate([('Autumn', 0, 19), ('Coast', 19, 40),
                                         ('Summit', 70, 85), ('Autumn', 85, 100)]):
    id=f'Rebuild / moving world strip {i+1}'
    mask=dict(enabled=True, shape='polygon', path=f'polygon({left}% 0%, {right}% 0%, '
              f'{right}% 100%, {left}% 100%)', feather=.4, inverted=False)
    actions.append(plane(id, source, 10, 16, 0, mask=mask))
    sign = -1 if i < 2 else 1
    delay = (i % 2)*.16
    actions += [channel(id, 'x', [(10, 50+sign*50), (10.8+delay, 50),
                                (14.5-delay, 50), (16, 50+sign*50)]),
                channel(id, 'opacity', [(10, 0), (10.55+delay, 1), (14.8, 1), (16, 0)]),
                dict(type='parent', targetId=id, parentId='main-video')]
write('02 - Recompose the landscape', [], actions)

# A shared vanishing point joins three continuously moving projective portals.
# These are ordinary video layers and measured 2D homographies, not a 3D-camera claim.
caption = text('Rebuild / look closer', 'LOOK CLOSER.', 20.3, 22, 50, 12)
caption['keys'] = keys('opacity', [(20.3, 0), (20.7, 1), (21.6, 1), (22, 0)])
actions=[]
for id, source, a, source_start, trajectory in [
    ('Rebuild / portal one - water', 'Coast', 20.25, .25,
     [(20.25, .12), (21.2, .45), (22.5, 1.44), (23, 1.48), (28, 1.48)]),
    ('Rebuild / portal two - mountains', 'Summit', 21.1, 0,
     [(21.1, .08), (22, .2), (23.1, .6), (24.3, 1.44), (25, 1.48), (28, 1.48)]),
    ('Rebuild / portal three - city', 'City', 23.1, 0,
     [(23.1, .1), (24, .3), (25.2, .8), (26.3, 1.44), (27, 1.48), (28, 1.48)]),
]:
    quad=[[0,0],[100,20],[100,80],[0,100]] if source=='Summit' else [[0,20],[100,0],[100,100],[0,80]]
    actions.append(plane(id, source, a, 28, source_start, quad=quad))
    actions += [channel(id, 'scale', trajectory, 'linear'),
                channel(id, 'x', [(a, 45), (a+1, 48), (trajectory[-3][0], 50), (28, 50)], 'linear'),
                channel(id, 'y', [(a, 54), (trajectory[-3][0], 50), (28, 50)], 'linear'),
                channel(id, 'perspectiveProgress', [(a, 100), (trajectory[-3][0], 0), (28, 0)], 'linear'),
                channel(id, 'opacity', [(a, 0), (a+.2, 1), (27.4, 1), (28, 0)])]
write('03 - Through moving worlds', [], actions)

# Preserve the selected identity; let the mountain shot breathe before the final card.
rows=[]
for name, prop, pairs in [
    ('08 / paper resolve', 'opacity', [(28.2, 0), (31, 0), (31.7, 1), (36, 1)]),
    ('08 / paper resolve', 'y', [(28.2, 100), (31, 100), (32, 50), (36, 50)]),
    ('08 / Approved AutoPromote identity', 'opacity', [(29, 0), (31.6, 0), (32.3, 1), (36, 1)]),
    ('08 / Approved AutoPromote identity', 'y', [(29, 53), (31.6, 53), (32.4, 46), (36, 46)]),
    ('08 / brand promise', 'textProgress', [(30.1, 0), (32.4, 0), (33.15, 100), (36, 100)]),
    ('08 / product name', 'opacity', [(31.2, 0), (33.1, 0), (33.6, 1), (36, 1)]),
    ('08 / signature line', 'strokeEnd', [(29.5, 0), (31.9, 0), (33, 100), (36, 100)]),
]:
    rows += [dict(type='remove_keys', targetId=name, property=prop), channel(name, prop, pairs)]
(OUT/'04 - Closing timing.json').write_text(json.dumps(dict(name='Closing timing', actions=rows)))
print(json.dumps({'nativeScenePlans':4, 'newSubjectPointKeys':subject_keys, 'duration':36}))
