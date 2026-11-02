"""Editable scene directions only. Studio creates every evaluated effect."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'reports/studio-cinematic-episode-20261101'
OUT.mkdir(exist_ok=True)
INK, PAPER, VIOLET, LILAC = '#080b14', '#f2eee7', '#935bff', '#d1b9ff'
curve = [.22, 1, .36, 1]
layers, groups, actions = [], [], []

def key(layer, prop, values):
    layer['keys'] += [dict(property=prop, time=round(t, 6), value=v, easing='bezier', curve=curve) for t, v in values]

def base(id, start, end, x=50, y=50, width=100, scale=1):
    return dict(id=id, name=id, startTime=start, duration=round(end-start, 6), x=x, y=y, width=width,
                scale=scale, rotation=0, opacity=1, keys=[])

def fade(layer, start, end, span=.25):
    key(layer, 'opacity', [(start, 0), (start+span, 1), (end-span, 1), (end, 0)])

def title(id, copy, a, b, x=50, y=50, size=1, color=PAPER, kinetic=False):
    layer=base(id,a,b,x,y,95,size)
    layer.update(type='text', text=copy, color=color, fontWeight=900, textAlign='center')
    if kinetic:
        layer['textAnimator']=dict(version=1,unit='character',order='forward',stagger=18,fromX=.1,
            fromY=1.15,fromScale=.75,fromRotation=14,fromOpacity=0,tracking=-.025,
            rangeStart=0,rangeEnd=100,easing='ease_out')
        layer['textProgress']=0
        key(layer,'textProgress',[(a,0),(a+.7,100)])
        groups.append(dict(id=id+'-reveal',name=id+' / reveal',layerIds=[id],startTime=a,duration=b-a,
            mask=dict(enabled=True,shape='rectangle',radius=0,feather=0,inverted=False),keys=[]))
    layers.append(layer)
    return layer

def art(id, svg, a, b, x=50, y=50, width=100, height=100):
    layer=base(id,a,b,x,y,width)
    layer.update(type='artwork',svg=svg,height=height)
    layers.append(layer)
    return layer

def fill(id, color, a, b, opacity=1):
    layer=art(id,f'<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="{color}"/></svg>',a,b)
    layer['opacity']=opacity
    return layer

def vector(id,a,b,nodes,x=50,y=50,width=100,height=100,color=LILAC,stroke=.25):
    layer=base(id,a,b,x,y,width)
    layer.update(type='artwork',height=height,vectorShape=dict(version=1,closed=False,
        nodes=[dict(x=p[0],y=p[1],**{'in':[0,0],'out':[0,0]}) for p in nodes],
        fill=dict(kind='none',color=color,endColor=color,start=[0,0],end=[100,100]),
        stroke=dict(color=color,width=stroke)))
    layers.append(layer)
    return layer

def channel(target, prop, points):
    actions.append(dict(type='keys',targetId=target,keys=[dict(property=prop,time=t,value=v,easing='bezier',curve=curve) for t,v in points]))

# 00–04: the picture is the type; a matching source emerges from the letter aperture.
opening=fill('01 / ink field',INK,0,3.5)
key(opening,'opacity',[(0,1),(2.3,1),(3.5,0)])
matte=title('01 / FRAME aperture','FRAME',0,3.5,50,51,5,'#ffffff')
key(matte,'scale',[(0,4.1),(1.2,5),(3.5,5)])
title('01 / opening whisper','IT STARTS WITH A',.2,2.65,50,25,.58,LILAC)
actions += [dict(type='media_plane',id='frame-picture',name='01 / Moving picture inside FRAME',sourceMediaId='City',
    sourceStart=0,startTime=0,duration=3.5,transform=dict(x=50,y=50,scale=100/70,opacity=1)),
    dict(type='matte',targetId='frame-picture',matteSourceId=matte['id'],mode='alpha')]
channel('frame-picture','opacity',[(0,1),(2.4,1),(3.5,0)])
title('01 / first thought','A MOMENT WORTH KEEPING.',2.5,3.9,50,83,.6,PAPER)

# 04–06: directional shutters follow the cut; each remains a separate ordinary layer.
for index in range(7):
    shutter=art(f'02 / shutter {index+1}',f'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="720"><rect width="200" height="720" fill="{INK}"/></svg>',4,4.75,
        x=(index+.5)*100/7,width=100/7+.2)
    key(shutter,'y',[(4,50),(4.32+index*.045,0)])
    key(shutter,'opacity',[(4,1),(4.22+index*.045,1),(4.6+index*.02,0)])
title('02 / movement','MOVE.',4.5,5.9,70,33,2.25,PAPER,True)

# 06–10: one continuous source folds into an actual moving projected plane.
space=fill('03 / depth space',INK,6,10)
key(space,'opacity',[(6,0),(6.45,.94),(9.35,.94),(10,0)])
actions.append(dict(type='media_plane',id='spatial-picture',name='03 / Perspective footage',sourceMediaId='City',sourceStart=4,
    startTime=6,duration=4,perspective=dict(version=1,corners=[[0,10],[91,0],[91,100],[0,90]]),
    transform=dict(x=50,y=50,scale=100/70,opacity=1)))
for prop,points in {
    'x':[(6,50),(6.85,64),(9.1,63),(10,50)],'y':[(6,50),(6.85,47),(9.1,46),(10,50)],
    'scale':[(6,100/70),(6.85,.95),(9.1,.98),(10,100/70)],
    'perspectiveProgress':[(6,0),(6.85,100),(9.1,78),(10,0)],
}.items():channel('spatial-picture',prop,points)
title('03 / shape','SHAPE',6.65,9.4,19,43,1.65,PAPER,True)
title('03 / intent','THE MOTION.',6.85,9.4,19,55,1.03,LILAC,True)
path=vector('03 / editable motion path',6.45,9.65,[(7,81),(27,81),(36,68),(65,68)],stroke=.3)
actions += [dict(type='move_layer',targetId='spatial-picture',beforeId='03 / shape')]
channel(path['id'],'strokeEnd',[(6.45,0),(7.8,100),(9.3,100),(9.65,0)])

# 10–16: two masks construct kinetic type while footage keeps moving behind it.
shade=art('04 / light falloff','<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><defs><linearGradient id="f" x2="0" y2="1"><stop stop-color="#080b14" stop-opacity="0"/><stop offset="1" stop-color="#080b14" stop-opacity=".9"/></linearGradient></defs><rect width="1280" height="720" fill="url(#f)"/></svg>',10,16)
fade(shade,10,16)
title('04 / every beat','EVERY BEAT.',10.35,12.75,25,31,1.3,LILAC,True)
motion=title('04 / MOTION kinetic','MOTION',10.75,15.65,50,70,4.2,PAPER,True)
key(motion,'y',[(10.75,75),(11.6,66),(14.85,66),(15.65,61)])
title('04 / precise','PRECISE. PERSONAL. ALIVE.',12.6,15.75,50,84,.52,PAPER)

# 16–20: moving sea through a feathered native ellipse. No external effect footage.
field=fill('05 / aperture space',INK,16,20)
key(field,'opacity',[(16,1),(19.2,1),(20,0)])
actions.append(dict(type='media_plane',id='sea-aperture',name='05 / Feathered moving sea',sourceMediaId='Coast',sourceStart=0,
    startTime=16,duration=4,mask=dict(enabled=True,shape='ellipse',radius=0,feather=4,inverted=False),
    transform=dict(x=61,y=48,scale=.2,opacity=1)))
channel('sea-aperture','scale',[(16,.2),(16.8,1.15),(18.8,1.2),(20,2.2)])
channel('sea-aperture','x',[(16,61),(18.8,61),(20,50)])
title('05 / feel','MAKE IT',16.4,18.9,21,41,1.25,PAPER,True)
title('05 / feel two','FEEL RIGHT.',16.55,18.9,23,54,1.25,LILAC,True)

# 20–28: the line becomes a rig, then resolves into a deliberately quiet image.
title('06 / own','OWN THE',20.3,23.8,50,38,2.1,PAPER,True)
title('06 / frame','FRAME.',20.55,23.8,50,59,3.6,PAPER,True)
arc=vector('06 / shaped curve',20,24,[(12,78),(32,56),(49,80),(70,36),(90,32)],color=LILAC,stroke=.34)
channel(arc['id'],'strokeEnd',[(20,0),(21.65,100),(23.6,100),(24,0)])
actions.append(dict(type='null',id='signature-rig',name='06 / Typography rig',startTime=20,duration=4,transform=dict(x=50,y=50,scale=1,opacity=1)))
for name in ['06 / own','06 / frame']:actions.append(dict(type='parent',targetId=name,parentId='signature-rig'))
channel('signature-rig','rotation',[(20,-3),(20.8,0),(23.25,0),(24,2)])
channel('signature-rig','scale',[(20,.94),(20.8,1),(23.25,1),(24,1.12)])
title('07 / resolve','NOT JUST AN EDIT.',24.4,26.3,50,32,.9,PAPER,True)
title('07 / resolve two','YOUR SIGNATURE.',25.85,28.4,50,69,1.35,PAPER,True)

# 28–36: a light sweep resolves into the approved identity on a paper field.
paper=fill('08 / paper resolve',PAPER,28.2,36)
key(paper,'y',[(28.2,100),(29.2,50),(36,50)])
key(paper,'opacity',[(28.2,0),(28.65,1),(36,1)])
logo=art('08 / Approved AutoPromote identity',(ROOT/'frontend/public/brand/autopromote-gradient.svg').read_text(),29,36,
    x=50,y=47,width=66,height=18)
key(logo,'opacity',[(29,0),(29.8,1),(36,1)])
key(logo,'y',[(29,53),(30.2,46),(36,46)])
key(logo,'scale',[(29,.92),(30.2,1),(36,1)])
end=title('08 / brand promise','MAKE EVERY FRAME INTENTIONAL.',30.1,36,50,66,.7,INK,True)
title('08 / product name','STUDIO  /  MOTION & FLOW',31.2,36,50,77,.45,'#706878')
signature=vector('08 / signature line',29.5,36,[(18,58),(34,58),(42,55),(58,55),(65,58),(82,58)],color=VIOLET,stroke=.25)
channel(signature['id'],'strokeEnd',[(29.5,0),(31.1,100),(36,100)])

# One ordinary source grade and restrained source camera moves. No retiming of speech.
actions.append(dict(type='adjustment',id='source-grade',name='Episode source finish',startTime=0,duration=28.2,
    grade=dict(contrast=1.06,saturation=.93,brightness=.97)))
channel('main-video','scale',[(0,1),(3.9,1.035),(4,1),(5.95,1.03),(6,1),(10,1),(15.95,1.04),(16,1),(20,1),(23.95,1.025),(24,1),(28,1.03),(36,1.03)])

graphics=dict(format='autopromote-graphics',version=1,name='Every frame, intentional',width=1280,height=720,duration=36,layers=layers,groups=groups)
(OUT/'episode-graphics.json').write_text(json.dumps(graphics,indent=2))
(OUT/'episode-plan-template.json').write_text(json.dumps(dict(name='Every frame, intentional / reviewed native scene',graphics=graphics,actions=actions),indent=2))
(OUT/'edit-decision-list.json').write_text(json.dumps([
    ['City',0,4],['Footsteps',0,2],['City',4,8],['Open trail',0,6],
    ['Coast',0,4],['Autumn',0,4],['Coast',4,8],['Summit',0,8]],indent=2))
print(json.dumps(dict(duration=36,layers=len(layers),groups=len(groups),actions=len(actions))))
