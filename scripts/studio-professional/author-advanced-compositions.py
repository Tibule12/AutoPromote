"""Native editable scene directions. No motion is rendered here."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'reports/studio-cinematic-episode-20261101'
TRACK=json.loads((OUT/'subject-point-directions.json').read_text())['frames']
INK,PAPER,LILAC='#080b14','#f2eee7','#d1b9ff'
C=[.22,1,.36,1]
def key(prop,points,easing='bezier'):
    return [dict(property=prop,time=round(t,6),value=v,easing=easing,**({'curve':C} if easing=='bezier' else {})) for t,v in points]
def layer(id,a,b,x=50,y=50,scale=1):
    return dict(id=id,name=id,startTime=a,duration=b-a,x=x,y=y,scale=scale,rotation=0,opacity=1,width=100,keys=[])
def title(id,text,a,b,x=50,y=50,scale=1,color=PAPER):
    return dict(**layer(id,a,b,x,y,scale),type='text',text=text,color=color,fontWeight=900,textAlign='center')
def art(id,content,a,b,width=100,height=100):
    return dict(**layer(id,a,b),type='artwork',svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">{content}</svg>',height=height)
def field(id,a,b,color=INK):return art(id,f'<rect width="1280" height="720" fill="{color}"/>',a,b)
def plane(id,source,a,d,source_start=0,mask=None):
    return dict(type='media_plane',id=id,name=id,sourceMediaId=source,sourceStart=source_start,startTime=a,duration=d,
        transform=dict(x=50,y=50,scale=100/70,opacity=1),**({'mask':mask} if mask else {}))
def keys(id,rows):return dict(type='keys',targetId=id,keys=rows)
def vector(id,a,b,nodes,color=LILAC,stroke=.18):
    return dict(**layer(id,a,b),type='artwork',height=100,vectorShape=dict(version=1,closed=False,
        nodes=[dict(x=x,y=y,**{'in':[0,0],'out':[0,0]}) for x,y in nodes],fill=dict(kind='none',color=color,endColor=color,start=[0,0],end=[100,100]),stroke=dict(color=color,width=stroke)))
def graphics(name,d,layers):return dict(format='autopromote-graphics',version=1,name=name,width=1280,height=720,duration=d,layers=layers,groups=[])
def roto(id,a=0):
    path='polygon('+', '.join(f'{x}% {y}%' for x,y in TRACK[0]['points'])+')'
    actions=[plane(id,'Coast',a,4,mask=dict(enabled=True,shape='polygon',path=path,feather=1,inverted=False))]
    # Source-bound authored contours become ordinary coordinate keys. Include the
    # last frame; no fixed poster, generated alpha movie or alternate compositor.
    poses=TRACK[::2]+[TRACK[-1]]
    rows=[dict(property=f'maskPoint{i}{axis}',time=round(a+frame['sourceTime'],6),value=point[j],easing='linear')
        for frame in poses for i,point in enumerate(frame['points']) for j,axis in enumerate(['X','Y'])]
    actions += [keys(id,rows[i:i+128]) for i in range(0,len(rows),128)]
    return actions

def letter_apertures(source,a=0,d=3.65,prefix='Letters'):
    letters=[];actions=[]
    for index,(character,x) in enumerate(zip('FRAME',[21,35,49,65,81])):
        id=f'{prefix} / {character}'
        text=title(id,character,a,a+d,x,54,4.15,'#ffffff')
        delay=index*.075
        text['keys']=key('y',[(a,73),(a+.6+delay,54),(a+2.65,54),(a+d,48)])+key('rotation',[(a,(-1)**index*9),(a+.8+delay,0),(a+d,0)])+key('scale',[(a,2.6),(a+.8+delay,4.15),(a+2.65,4.15),(a+d,5)])
        letters.append(text)
        picture=f'{prefix} / moving {character}'
        actions += [plane(picture,source,a,d),dict(type='matte',targetId=picture,matteSourceId=id,mode='alpha'),keys(picture,key('opacity',[(a,1),(a+2.75,1),(a+d,0)]))]
    return letters,actions

# 1: five independent letter apertures + source-bound animated foreground.
layers=[field('Ink stage',0,4)]
layers[0]['keys']=key('opacity',[(0,1),(2.9,1),(4,0)])
letters,actions=letter_apertures('Coast');layers+=letters
copy=title('Opening / small type','THINK OUTSIDE THE',.15,3.5,50,24,.6,LILAC);layers.append(copy)
layers.append(title('Full image / payoff','BEYOND THE FRAME.',4.3,7.7,43,25,1.15))
actions+=roto('Foreground / animated torso')
actions += [keys('main-video',key('scale',[(0,1),(4,1),(8,1.06)]))]
plan=dict(name='Outside the frame',graphics=graphics('Outside the frame',8,layers),actions=actions)
(OUT/'advanced-typography-plan.json').write_text(json.dumps(plan))

# 2: authored source-bound tracking, parenting and a continuous projected shot.
layers=[]
ring=art('Tracked / locator','<circle cx="640" cy="360" r="36" fill="none" stroke="#f2eee7" stroke-width="2"/><path d="M590 360h18m64 0h18M640 310v18m0 64v18" stroke="#d1b9ff" stroke-width="2"/>',0,4)
ring['width']=12;ring['height']=12;ring['x']=50;ring['y']=50;layers.append(ring)
callout=title('Tracked / label','FOLLOW THE MOMENT',.45,3.8,29,33,.68);layers.append(callout)
line=vector('Tracked / callout',.4,3.8,[(30,37),(47,37),(50,50)]);layers.append(line)
line['keys']=[]
stage=field('Depth / dark stage',4,8);stage['keys']=key('opacity',[(4,0),(4.55,1),(7.5,1),(8,0)]);layers.append(stage)
layers += [title('Depth / LIFE','LIFE',4.7,7.35,22,42,2.15),title('Depth / IN MOTION','IN MOTION.',4.85,7.35,22,57,.87,LILAC)]
actions=[dict(type='null',id='subject-track',name='Source-bound tracking rig',startTime=0,duration=4,transform=dict(x=50,y=50,scale=1,opacity=1)),
    dict(type='parent',targetId='subject-track',parentId='main-video')]
# The null's initial 50,50 is its bind pose. These measured keys drive the
# locator to the actual head; children are authored relative to that origin.
centres=[(f['sourceTime'],sum(p[0] for p in f['points'][:3])/3,min(p[1] for p in f['points'])) for f in TRACK[::4]]
actions += [keys('subject-track',key('x',[(t,x) for t,x,y in centres],'linear')+key('y',[(t,y) for t,x,y in centres],'linear'))]
for id in ['Tracked / locator','Tracked / label','Tracked / callout']:
    actions.append(dict(type='parent',targetId=id,parentId='subject-track'))
actions.append(plane('Depth / projected moving shot','Coast',4,4,4))
actions[-1]['perspective']=dict(version=1,corners=[[0,12],[94,0],[94,100],[0,88]])
actions += [keys('Depth / projected moving shot',key('x',[(4,50),(4.9,65),(7.2,63),(8,50)])+key('scale',[(4,100/70),(4.9,.95),(7.2,.99),(8,100/70)])+key('perspectiveProgress',[(4,0),(4.9,100),(7.2,60),(8,0)])),
    dict(type='move_layer',targetId='Depth / projected moving shot',beforeId='Depth / LIFE'),
    keys('main-video',key('scale',[(0,1),(3.9,1.12),(4,1),(8,1)])+key('x',[(0,50),(3.9,47),(4,50),(8,50)]))]
(OUT/'advanced-tracked-plan.json').write_text(json.dumps(dict(name='Life in motion',graphics=graphics('Life in motion',8,layers),actions=actions)))

# 3: an animated diagonal media mask intersects light, vectors and kinetic type.
layers=[]
falloff=art('Finish / falloff','<defs><linearGradient id="g" x2="0" y2="1"><stop stop-color="#080b14" stop-opacity="0"/><stop offset="1" stop-color="#080b14" stop-opacity=".8"/></linearGradient></defs><rect width="1280" height="720" fill="url(#g)"/>',0,8);layers.append(falloff)
for i,col in enumerate(['#ffd29c','#b393ff','#f2eee7']):
    light=art(f'Light / sweep {i+1}',f'<defs><radialGradient id="g"><stop stop-color="{col}" stop-opacity=".6"/><stop offset="1" stop-color="{col}" stop-opacity="0"/></radialGradient></defs><ellipse cx="640" cy="360" rx="600" ry="100" fill="url(#g)"/>',1.5,7)
    light['rotation']=-28+i*16
    light['keys']=key('x',[(1.5,5+i*10),(3.8,70-i*15),(7,100)])+key('y',[(1.5,80),(4,35+i*15),(7,10)])+key('opacity',[(1.5,0),(2.4,.65),(5.7,.45),(7,0)])
    layers.append(light)
for i,(copy,y) in enumerate([('MAKE',34),('SOMETHING',50),('IMPOSSIBLE.',66)]):
    text=title(f'Type / line {i+1}',copy,2.1+i*.18,7.65,50,y,1.65 if i==1 else 1.9)
    text['textAnimator']=dict(version=1,unit='character',order='forward',stagger=22,fromX=.3,fromY=1,fromScale=.7,fromRotation=-12,fromOpacity=0,tracking=-.02,rangeStart=0,rangeEnd=100,easing='ease_out')
    text['textProgress']=0;text['keys']=key('textProgress',[(2.1+i*.18,0),(3.15+i*.18,100)])+key('opacity',[(2.1+i*.18,0),(2.5+i*.18,1),(6.8,1),(7.65,0)])
    layers.append(text)
line=vector('Vector / rising energy',1.75,7.65,[(7,84),(30,84),(40,76),(72,76),(84,66),(93,66)],color='#ffd29c',stroke=.2);layers.append(line)
actions=[plane('Reveal / second moving world','Autumn',1.5,6.5,1.5,mask=dict(enabled=True,shape='polygon',path='polygon(0% 100%, 0% 100%, 0% 100%, 0% 100%)',feather=2,inverted=False))]
rows=[]
for i,(x,y) in enumerate([(0,0),(100,0),(100,100),(0,100)]):
    rows += key(f'maskPoint{i}X',[(1.5,0),(3.4,x),(6.8,x),(8,x)])+key(f'maskPoint{i}Y',[(1.5,100),(3.4,y),(6.8,y),(8,y)])
actions += [keys('Reveal / second moving world',rows),dict(type='move_layer',targetId='Reveal / second moving world',beforeId='Finish / falloff'),keys('Vector / rising energy',key('strokeEnd',[(1.75,0),(3.8,100),(6.5,100),(7.65,0)])),
    keys('main-video',key('scale',[(0,1),(1.5,1.05),(8,1.05)])),dict(type='adjustment',id='finish-grade',name='Warm source finish',startTime=0,duration=8,grade=dict(contrast=1.08,saturation=.9,brightness=.98))]
(OUT/'advanced-composite-plan.json').write_text(json.dumps(dict(name='Make something impossible',graphics=graphics('Make something impossible',8,layers),actions=actions)))

# Separate reviewed refinement for the existing episode, preserving prior cuts.
letters,actions=letter_apertures('City',prefix='01 / independent')
(OUT/'episode-letter-refinement.json').write_text(json.dumps(dict(name='Independent letter apertures',graphics=graphics('Independent letter apertures',36,letters),actions=actions)))
layers=[title('05 / BEYOND','BEYOND',16.1,19.6,50,53,3.2),title('05 / foreground promise','GIVE YOUR IDEAS DIMENSION.',16.5,19.5,39,79,.65,LILAC)]
for l in layers:l['keys']=key('opacity',[(l['startTime'],0),(l['startTime']+.4,1),(19.25,1),(l['startTime']+l['duration'],0)])
actions=roto('05 / Foreground point animation',16)
(OUT/'episode-occlusion-refinement.json').write_text(json.dumps(dict(name='Beyond the flat frame',graphics=graphics('Beyond the flat frame',36,layers),actions=actions)))
print('Prepared three native compositions and two episode refinements.')
