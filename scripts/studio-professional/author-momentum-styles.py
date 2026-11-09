"""Versioned ordinary Studio motion recipes; no media or external compositing."""
import copy
import json
from pathlib import Path

root = Path(__file__).resolve().parents[2]
out = root / 'reports/studio-motion-styles-20261104'
out.mkdir(exist_ok=True)
base = json.loads((root / 'frontend/src/templates/creator_identity_v1.json').read_text())
slots = {'Portrait': 'hookFootage', 'Close': 'detailFootage', 'Seated': 'productFootage', 'Screen': 'screenFootage'}
names = {'WhatsApp Video 2026-11-03 at 04.58.10 (1).mp4': 'hookFootage',
         'WhatsApp Video 2026-11-03 at 04.58.10 (2).mp4': 'detailFootage',
         'WhatsApp Video 2026-11-03 at 04.58.10.mp4': 'productFootage',
         'WhatsApp Video 2026-11-03 at 04.58.11.mp4': 'screenFootage'}

def shape(points, colour, stroke=0, closed=True):
    return dict(version=1, closed=closed, nodes=[dict(x=x, y=y, **{'in': [0, 0], 'out': [0, 0]}) for x, y in points],
                fill=dict(kind='solid' if not stroke else 'none', color=colour, endColor=colour, start=[0, 0], end=[100, 100]),
                stroke=dict(color=colour, width=stroke))

def template(identity, label, ordinary):
    t = copy.deepcopy(base)
    t.update(templateId=identity, label=label)
    t['inputSlots'] = [s for s in t['inputSlots'] if s['id'] in ['hookFootage', 'productFootage', 'detailFootage', 'screenFootage', 'music']]
    e = t['executionDefinition']
    e.update(titles=[], logo={}, sceneActions=[], sourceKeyframes=[], defaultCopy={}, muteOriginalAudio=True,
             ordinaryMotion=ordinary, directorDescription=label + ': a wordless authored motion style using your four saved clips. All layers, masks, groups and motion stay editable. No model job.')
    e['music'].update(volume=60, fadeIn=.1, fadeOut=.8)
    f = root / f'frontend/src/templates/{identity}.json'
    f.write_text(json.dumps(t, indent=2) + '\n')
    return t

# Capture the delivered native geometry and group motion without any private media reference.
backup = json.loads(Path('/home/tibule12/Videos/WhatsApp Studio - 2026-11-04 - Prism cuts/Editable Project.autopromote.json').read_text())
s = backup['snapshot']
idmap = {l['id']: f'plane-{i}' for i, l in enumerate(s['overlays'])}
idmap.update({g['id']: f'group-{i}' for i, g in enumerate(s['compoundClips'])})
media = {m['id']: names.get(m['name']) for m in s['projectMedia']}
excluded = ['src', 'file', 'sourceStoragePath', 'storagePath', 'sourceMediaId', 'contentHash', 'sourceDuration', 'isLocal']
layers = []
for row in s['overlays']:
    layer = {k: v for k, v in row.items() if k not in excluded}
    layer['id'] = idmap[row['id']]
    if row['type'] == 'video': layer['sourceSlot'] = media[row['sourceMediaId']]
    else:
        layer['vectorShape'] = shape([(0, 0), (100, 0), (100, 100), (0, 100)], '#1636c9')
        layer['mediaFit'] = 'stretch'
    layers.append(layer)
groups = [{**g, 'id': idmap[g['id']], 'name': 'Prism', 'layerIds': [idmap[x] for x in g['layerIds']]} for g in s['compoundClips']]
keys = [{**{k: v for k, v in row.items() if k != 'id'}, 'targetId': idmap.get(row['targetId'], row['targetId'])} for row in s['motionKeyframes']]
prism = template('prism_cuts_v1', 'Prism cuts — wordless', dict(version=1, layers=layers, keys=keys, groups=groups, order=[idmap[x] for x in s['compositionOrder']]))

L, K = [], []
def key(target, prop, points, ease='bezier'):
    K.extend(dict(targetId=target, property=prop, time=round(t, 6), value=round(v, 7), easing=ease,
                  **({'curve': [.2, .88, .25, 1]} if ease == 'bezier' else {})) for t, v in points)

def vector(name, points, colour, a, b, x=50, y=50, width=100, height=100, stroke=0, closed=True):
    L.append(dict(id=name, name=name, type='image', vectorShape=shape(points, colour, stroke, closed),
                  startTime=a, duration=b-a, x=x, y=y, width=width, height=height, scale=1, rotation=0,
                  opacity=1, anchorX=50, anchorY=50, mediaFit='stretch', bRollMode='pip', frameShape='edge', borderRadius=0,
                  shadow='none', layerShadow=dict(enabled=False), motionBlur=dict(enabled=False), animation=dict(enter='none', exit='none')))

def video(name, source, a, b, start=0, x=50, y=50, width=100, height=100, fit='cover', **extra):
    L.append(dict(id=name, name=name, type='video', sourceSlot=slots[source], sourceStartTime=start,
                  startTime=a, duration=b-a, x=x, y=y, width=width, height=height, scale=1, rotation=0, opacity=1,
                  anchorX=50, anchorY=50, mediaFit=fit, bRollMode='pip', frameShape='edge', borderRadius=0,
                  shadow='none', layerShadow=dict(enabled=False), motionBlur=dict(enabled=False), animation=dict(enter='none', exit='none'), **extra))

def mask(points):
    return dict(enabled=True, shape='polygon', path='polygon('+','.join(f'{x}% {y}%' for x, y in points)+')', feather=0, inverted=False)

vector('M / paper', [(0, 0), (100, 0), (100, 100), (0, 100)], '#eee9df', 0, 24)
key('main-video', 'opacity', [(0, 0), (24, 0)], 'hold')
# Three independently moving video cards turn through different oblique poses.
for i, (source, offset, corners) in enumerate([
    ('Seated', 0, [[6, 29], [28, 17], [28, 83], [6, 72]]),
    ('Close', 3, [[72, 17], [94, 29], [94, 72], [72, 83]]),
    ('Close', 0, [[34, 9], [66, 13], [66, 91], [34, 87]])]):
    name = f'M / orbit card {i}'
    video(name, source, 0, 8, offset, perspective=dict(version=1, corners=corners, sourceRect=[0, 0, 100, 100]), fit='contain')
    key(name, 'y', [(0, 125+i*12), (.7+i*.16, 50), (2.6, 50), (4.6, 45+5*i), (7.45, 50), (8, -75-i*10)])
    key(name, 'rotation', [(0, -14+14*i), (1.1, 0), (3.7, (-1)**i*5), (6.8, 0), (8, 12-12*i)])
    for c, (x, y) in enumerate(corners):
        key(name, f'planeCorner{c}X', [(0, x), (2, x), (4.3, x+(-1 if c in [0, 3] else 1)*5), (6.5, x)], 'linear')
    key(name, 'opacity', [(0, 0), (.5+i*.14, 1), (7.8, 1), (8, 0)])
# A bold native vector sweeps behind the cards; stroke controls stay editable.
vector('M / red sweep', [(4, 62), (50, 6), (96, 62)], '#e53b33', 0, 8, y=55, height=73, stroke=1.3, closed=False)
for node, handles in zip(L[-1]['vectorShape']['nodes'], [([0, 0], [0, -65]), ([-35, 0], [35, 0]), ([0, -65], [0, 0])]):
    node['in'], node['out'] = handles
L.insert(1, L.pop())
key('M / red sweep', 'strokeEnd', [(0, 0), (1.3, 100), (6.5, 100), (8, 0)])
key('M / red sweep', 'strokeOffset', [(0, 0), (8, 45)], 'linear')
# Six separate programme-synchronous source slits, with real offset source moments.
for i in range(6):
    name = f'M / time slit {i}'
    left, right = i*100/6-.06, (i+1)*100/6+.06
    video(name, 'Screen', 8, 15, .25*i, mask=mask([(left, 0), (right, 0), (right, 100), (left, 100)]))
    sign = (-1)**i
    key(name, 'y', [(8, 50+sign*110), (8.65+i*.09, 50), (10.1, 50), (11.3+i*.07, 50+sign*7), (12.6, 50), (14.8, 50), (15, 50-sign*110)])
    key(name, 'x', [(8, 50), (10.1, 50), (11.3+i*.07, 50+sign*2.4), (12.6, 50), (15, 50)])
# Two moving circular time windows over a held wider shot.
video('M / seated field', 'Seated', 15, 21, 8, fit='contain')
for i, source in enumerate(['Close', 'Screen']):
    name = f'M / temporal lens {i}'; x, y, w = (28, 36, 28) if i == 0 else (74, 63, 24)
    video(name, source, 15, 21, 10 if i == 0 else 3, x=x, y=y, width=w, height=w*1280/720,
          mask=dict(enabled=True, shape='ellipse', feather=0, inverted=False))
    key(name, 'x', [(15, x-12), (15.8, x), (17.7, 100-x), (19.4, x+5), (21, x+5)])
    key(name, 'y', [(15, y+15), (15.8, y), (17.7, 100-y), (19.4, y-4), (21, y-4)])
    key(name, 'scale', [(15, .1), (15.8, 1), (19.4, 1), (21, .1)])
    # Four cubic nodes describe an editable circular frame.
    vector(name+' ring', [(50, 1), (99, 50), (50, 99), (1, 50)], '#e53b33', 15, 21, x=x, y=y, width=w, height=w*1280/720, stroke=1.4)
    nodes = L[-1]['vectorShape']['nodes']
    for n, (inc, outc) in zip(nodes, [([-27.06, 0], [27.06, 0]), ([0, -27.06], [0, 27.06]), ([27.06, 0], [-27.06, 0]), ([0, 27.06], [0, -27.06])]): n['in'], n['out'] = inc, outc
    for prop in ['x', 'y', 'scale']:
        K.extend({**k, 'targetId': name+' ring'} for k in list(K) if k['targetId'] == name and k['property'] == prop)
    key(name+' ring', 'strokeEnd', [(15, 0), (15.8, 100), (20, 100), (21, 0)])
# All four inputs form a timed contact wall and fall away in alternate directions.
for i, (source, start) in enumerate([('Portrait', .25), ('Close', 7), ('Seated', 7), ('Screen', 6)]):
    name = f'M / contact {i}'; x, y = (25 if i%2 == 0 else 75), (25 if i < 2 else 75)
    video(name, source, 21, 24, start, x=x, y=y, width=48, height=47, fit='cover')
    key(name, 'scale', [(21, .05), (21.4+i*.12, 1), (22.8, 1), (23.4, 1), (24, .1)])
    key(name, 'rotation', [(21, (-1)**i*25), (21.8, 0), (23.2, 0), (24, (-1)**i*35)])
    key(name, 'opacity', [(21, 0), (21.3+i*.12, 1), (23.5, 1), (24, 0)])
ordinary = dict(version=1, layers=L, keys=K, groups=[], order=[l['id'] for l in L])
initial = root/'frontend/src/templates/momentum_v1.0.0.json'
current = root/'frontend/src/templates/momentum_v1.json'
if not initial.exists() and current.exists(): initial.write_bytes(current.read_bytes())
momentum = template('momentum_v1', 'Momentum — orbit, slits & lenses', ordinary)
momentum['version'] = '1.0.1'
current.write_text(json.dumps(momentum, indent=2)+'\n')
registry = json.loads((root/'config/creative-templates/registry.v1.json').read_text())
registry['templates'] = [t for t in registry['templates'] if t['templateId'] not in [prism['templateId'], momentum['templateId']]] + [prism, json.loads(initial.read_text()), momentum]
(root/'config/creative-templates/registry.v1.json').write_text(json.dumps(registry, indent=2)+'\n')
(out/'direction.json').write_text(json.dumps(dict(treatment=momentum['label'], layers=len(L), keys=len(K), seconds=24, modelCalls=0, sourceSpeechMuted=True, addedWords=0), indent=2))
print('Registered Prism cuts and Momentum:', len(L), 'new native layers,', len(K), 'keys')
