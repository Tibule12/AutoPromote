#!/usr/bin/env python3
"""First daily source package. Studio import, native controls and export own the edit.

Four deliberately different compositions; this is not a renderer or a daily
random-word/palette generator. Later runs must author new reviewed concepts.
"""
import json, math, random, struct, wave
from pathlib import Path

ROOT = Path('reports/daily-studio/2026-10-17')
EASE = [.16, 1, .3, 1]

def build(slug, title, problem, hook, payoff, concept, palette, author, accents):
    out = ROOT / slug
    assert not (out / 'proof/native-design.json').exists(), 'Preserve the native project'
    (out / 'assets').mkdir(parents=True, exist_ok=True)
    layers, groups = [], []
    bg, ink, accent = palette
    def keys(layer, prop, points):
        for time, value, *extra in points:
            easing = extra[0] if extra else 'bezier'
            layer['keys'].append(dict(property=prop, time=round(time*90000)/90000, value=value, easing=easing,
                **({'curve': EASE} if easing == 'bezier' else {})))
        return layer
    def text(name, words, start=0, end=10, x=50, y=50, scale=3, color=ink, **extra):
        layer = dict(id=name, name=name, type='text', text=words, startTime=start, duration=end-start,
            x=x, y=y, scale=scale, color=color, rotation=0, opacity=1, width=95, fontWeight=900, textAlign='center', keys=[])
        layer.update(extra); layers.append(layer); return layer
    def rect(name, color, start=0, end=10, x=50, y=50, width=100, height=100, outline=False):
        # Match intrinsic artwork aspect to its native layer box. A 16:9 SVG
        # inside a narrow rail otherwise letterboxes into a dot under contain.
        sw, sh = max(2, round(max(1,width)*12.8)), max(2, round(max(1,height)*7.2))
        stroke = min(5, max(1, min(sw,sh)/8))
        inset = stroke/2
        svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{sw}" height="{sh}"><rect x="{inset}" y="{inset}" width="{sw-stroke}" height="{sh-stroke}" fill="{"none" if outline else color}" stroke="{color}" stroke-width="{stroke}"/></svg>'
        layer = dict(id=name, name=name, type='artwork', svg=svg, startTime=start, duration=end-start,
            x=x, y=y, width=max(1,width), height=max(1,height), scale=1, rotation=0, opacity=1, keys=[])
        layers.append(layer); return layer
    rect('00 / background', bg)
    author(text, rect, keys, bg, ink, accent)
    # Respect the existing Studio transform limits before import. Keep each
    # title's relative motion while sizing it inside the native 0.1–5 range.
    for layer in layers:
        for key in layer['keys']:
            if key['property'] in ('x', 'y'):
                key['value'] = max(0, min(100, key['value']))
        if layer['type'] != 'text':
            continue
        maximum = max([layer['scale']] + [key['value'] for key in layer['keys'] if key['property'] == 'scale'])
        if maximum > 5:
            ratio = 4.9 / maximum
            layer['scale'] *= ratio
            for key in layer['keys']:
                if key['property'] == 'scale':
                    key['value'] = max(.1, key['value'] * ratio)
    spec = dict(format='autopromote-graphics', version=1, name=title, width=1280, height=720, duration=10, layers=layers, groups=groups)
    for layer in layers:
        for key in layer['keys']:
            assert layer['startTime']-1e-5 <= key['time'] <= layer['startTime']+layer['duration']+1e-5
    (out / 'assets/graphics.json').write_text(json.dumps(spec, indent=2)+'\n')
    (out / 'design.json').write_text(json.dumps(dict(name=title, seconds=10, layers=len(layers), groups=0,
        keys=sum(len(l['keys']) for l in layers), concept=concept, problem=problem, hook=hook, payoff=payoff), indent=2)+'\n')
    config = dict(projectName=f'{title} — daily 2026-10-17', output=slug,
        baseProject='MAKE EVERY FRAME FEEL ALIVE — studio cut', graphics='assets/graphics.json', score='assets/score.wav',
        backupName=f'{slug}.autopromote.json', poses=[.15,.7,1.6,2.5,3.4,4.4,5.4,6.4,7.5,8.5,9.7])
    (out / 'config.json').write_text(json.dumps(config, indent=2)+'\n')
    rate=48000; n=10*rate; left=[0.0]*n; right=[0.0]*n; rng=random.Random(slug)
    for j, at in enumerate(accents):
        for i in range(int(.32*rate)):
            p=round(at*rate)+i
            if p>=n: break
            t=i/rate; pitch=[110,146.83,220,293.66][j%4]
            v=(.16*math.sin(2*math.pi*pitch*t)*math.exp(-13*t)+.2*math.sin(2*math.pi*(45*t+1.4*(1-math.exp(-28*t))))*math.exp(-15*t)+rng.uniform(-1,1)*.04*math.exp(-50*t))
            left[p]+=v*(.85 if j%2 else 1); right[p]+=v*(1 if j%2 else .85)
    peak=max(max(map(abs,left)),max(map(abs,right)),.01)
    with wave.open(str(out/'assets/score.wav'),'wb') as wav:
        wav.setnchannels(2);wav.setsampwidth(2);wav.setframerate(rate)
        wav.writeframes(b''.join(struct.pack('<hh',round(a/peak*.8*32767),round(b/peak*.8*32767)) for a,b in zip(left,right)))
    print(json.dumps(dict(story=slug,layers=len(layers),keys=sum(len(l['keys']) for l in layers))))

def breathing(t,r,k,bg,ink,a):
    # Held hero, escalating cropped echoes, a decisive quiet resolve.
    for row,y in enumerate([32,64]):
        l=t(f'01 / hero {row}', ['SLOW','DOWN.'][row],0,1.6,y=y,scale=5,color=ink)
        k(l,'scale',[(0,5.2),(1.1,5),(1.6,5,'hold')])
    for i in range(7):
        start=1.3+i*.18;l=t(f'02 / rushing echo {i}','FASTER',start,3.4,x=30+(i%3)*20,y=17+i*11,scale=2.4,color=a)
        k(l,'x',[(start,100),(start+.22,50),(3.4,-25,'ease_in')]);k(l,'rotation',[(start,-10),(3.4,8)])
    wipe=r('03 / calm field',a,3.25,10);k(wipe,'y',[(3.25,120),(3.7,50),(10,50,'hold')])
    for i,(words,y,size) in enumerate([('TO',30,1.8),('STAND',46,4.8),('OUT.',70,5.4)]):
        start=3.65+i*.12;l=t(f'04 / resolve {i}',words,start,10,y=y,scale=size,color=bg)
        k(l,'y',[(start,y+15),(start+.7,y),(10,y,'hold')]);k(l,'opacity',[(start,0,'linear'),(start+.35,1,'linear'),(10,1,'hold')])
    l=r('05 / breathing underline',bg,4.5,10,y=83,width=38,height=.7);k(l,'scale',[(4.5,.1),(5.4,1),(10,1,'hold')])

def mask_reveal(t,r,k,bg,ink,a):
    # Static native masks with independent moving title layers; no prerendered text.
    for i,(top,bottom) in enumerate([(0,44),(43,57),(56,100)]):
        mask=dict(enabled=True,shape='polygon',path=f'polygon(0% {top}%, 100% {top}%, 100% {bottom}%, 0% {bottom}%)',feather=0,inverted=False)
        l=t(f'01 / REVEAL band {i+1}','REVEAL',0,5.5,scale=5,color=a if i==1 else ink,mask=mask)
        offset=[-9,10,-5][i];k(l,'x',[(0,50+offset),(.65,50),(1.4,50,'hold'),(2.0,50+offset),(2.5,50),(3.8,50,'hold'),(5.5,50+offset*6,'ease_in')])
    for i,x in enumerate([16,84]):
        l=r(f'02 / shutter rail {i}',a,.1,5.5,x=x,width=.5,height=34)
        k(l,'y',[(.1,90),(.7,50),(4.7,50,'hold'),(5.5,10,'ease_in')])
    l=t('03 / keep it editable','KEEP IT EDITABLE.',.8,4.7,y=76,scale=1.2,color=ink)
    k(l,'opacity',[(.8,0,'linear'),(1.1,1,'linear'),(4.4,1,'hold'),(4.7,0,'linear')])
    for i,(words,y,size) in enumerate([('THREE BANDS.',34,3.2),('ONE WORD.',59,4.2)]):
        start=5.35+i*.18;l=t(f'04 / final {i}',words,start,10,y=y,scale=size,color=ink)
        k(l,'scale',[(start,.5),(start+.65,size),(10,size,'hold')]);k(l,'opacity',[(start,0,'linear'),(start+.25,1,'linear'),(10,1,'hold')])
    l=r('05 / final frame',a,5.2,10,width=84,height=67,outline=True);k(l,'scale',[(5.2,.7),(5.9,1),(10,1,'hold')])

def hierarchy(t,r,k,bg,ink,a):
    # A dense moving grid collapses into whitespace and one dominant word.
    t('01 / opening line','LESS,',0,1.4,y=36,scale=5,color=ink)
    t('01 / opening answer','BUT LOUDER.',0,1.4,y=67,scale=3.7,color=a)
    for i in range(9):
        x=22+(i%3)*28;y=25+(i//3)*25;start=1.15+i*.035
        l=t(f'02 / competing voice {i}','LOOK',start,4.65,x=x,y=y,scale=1.7,color=a if i==4 else ink)
        k(l,'scale',[(start,.1),(start+.35,1.7),(3.25,1.7,'hold'),(4.65,.1 if i!=4 else 6,'ease_in')])
        k(l,'opacity',[(start,0,'linear'),(start+.15,1,'linear'),(3.25,1,'hold'),(4.65,0,'linear')])
    l=t('03 / singular focus','FOCUS.',4.05,10,scale=5.9,color=ink)
    k(l,'scale',[(4.05,.1),(4.85,5.9),(10,5.9,'hold')]);k(l,'rotation',[(4.05,-12),(4.85,0),(10,0,'hold')])
    l=r('04 / focus mark',a,4.4,10,y=72,width=50,height=1);k(l,'scale',[(4.4,.1),(5.1,1),(10,1,'hold')])
    t('05 / whitespace payoff','GIVE THE MESSAGE ROOM.',5.2,10,y=81,scale=1.25,color=ink)

def sound_hits(t,r,k,bg,ink,a):
    # A bouncing playhead, impacts and a changing word show precise accents.
    t('01 / hook','MAKE IT',0,2.1,y=31,scale=3,color=ink)
    l=t('01 / first impact','LAND.',0,2.1,y=62,scale=6,color=a)
    k(l,'scale',[(0,6.35),(.35,6),(1.65,6,'hold'),(2.1,.1,'ease_in')])
    for i,at in enumerate([2.0,2.6,3.2,3.8,4.4]):
        l=r(f'02 / impact bar {i}',a,at,6.2,x=20+i*15,y=50,width=7,height=10+i*7)
        k(l,'scale',[(at,.1),(at+.12,1.3),(at+.35,1),(5.6,1,'hold'),(6.2,.1,'ease_in')])
    for i,(at,word) in enumerate([(2,'CUT.'),(3.2,'TYPE.'),(4.4,'SOUND.')]):
        l=t(f'03 / timed word {i}',word,at,at+1.2,y=76,scale=2.0,color=ink)
        k(l,'y',[(at,85),(at+.16,76),(at+1.0,76,'hold'),(at+1.2,70)]);k(l,'opacity',[(at,0,'linear'),(at+.12,1,'linear'),(at+1,1,'hold'),(at+1.2,0,'linear')])
    for i,(word,y,scale) in enumerate([('ONE',29,2.8),('SHARED',48,4.0),('MOMENT.',70,4.7)]):
        start=6.0+i*.12;l=t(f'04 / resolution {i}',word,start,10,y=y,scale=scale,color=a if i==2 else ink)
        k(l,'scale',[(start,.1),(start+.45,scale),(10,scale,'hold')])

if __name__ == '__main__':
    build('pacing-contrast','Slow down to stand out','A fast edit loses emphasis when every moment is equally busy.','Large SLOW DOWN fills the opening, before rushing echoes contrast with a held resolve.','Show why a held beat can make the result more legible.','Escalating echo field collapses into a calm three-line poster.',['#eee8dc','#17191b','#d73636'],breathing,[0,.4,1.3,1.48,1.66,1.84,2.02,2.2,2.38,3.65,3.77,3.89,4.5])
    build('editable-reveal','A reveal you can revise','Flattened split-type movies are difficult to change later.','Displaced REVEAL bands align in the first second beside their actual native layers.','Show independent editable title masks and a clean final reading.','Three precise horizontal masks and moving rails lead to a framed two-line resolve.',['#181b23','#f6f1e7','#c0e75d'],mask_reveal,[0,.65,2,2.5,5.35,5.53,5.9])
    build('visual-hierarchy','Less, but louder','Competing moving type removes the focal point from a message.','A bold two-line promise leads into a dense grid, then one dominant focus.','Show how removing simultaneous movement makes a single message readable.','Nine competing title cards contract into negative space and a single focus word.',['#e7edf1','#142530','#2768d0'],hierarchy,[0,.35,1.15,1.45,3.25,4.05,4.85,5.2])
    build('sound-alignment','Make the moment land','Independent picture, type and sound timing weakens a short promo.','LAND hits immediately with the first original sound accent.','Make the relationship between visual impact and separate sound timing visible.','Stepped impact bars and CUT/TYPE/SOUND accents resolve into one shared moment.',['#171a20','#f1eadf','#ee9f42'],sound_hits,[0,.35,2,2.6,3.2,3.8,4.4,6,6.12,6.24])
