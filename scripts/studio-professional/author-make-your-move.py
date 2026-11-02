"""Author ordinary editable Studio layers/keys. No rendered visual effects."""
from pathlib import Path
import json,hashlib

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'reports/studio-make-your-move-20261102';OUT.mkdir(exist_ok=True)
INK,PAPER,ACID='#101114','#f5f2e9','#d7ff43'
CURVE=[.16,1,.3,1]
def keys(prop,points,curve=CURVE):
    return [dict(property=prop,time=round(t,6),value=v,easing='bezier',curve=curve) for t,v in points]
def base(id,a,b,x=50,y=50,width=100,scale=1):
    return dict(id=id,name=id,startTime=a,duration=round(b-a,6),x=x,y=y,width=width,scale=scale,rotation=0,opacity=1,keys=[])
def text(id,copy,a,b,x=50,y=50,size=1,color=PAPER):
    return dict(**base(id,a,b,x,y,95,size),type='text',text=copy,color=color,fontWeight=900,textAlign='center')
def art(id,svg,a,b,x=50,y=50,width=100,height=100):
    return dict(**base(id,a,b,x,y,width),type='artwork',height=height,svg='<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">'+svg+'</svg>')
def field(id,a,b,color=INK):return art(id,f'<rect width="1280" height="720" fill="{color}"/>',a,b)
def vector(id,a,b,points,color=ACID,stroke=.3):
    return dict(**base(id,a,b),type='artwork',height=100,vectorShape=dict(version=1,closed=False,
       nodes=[dict(x=x,y=y,**{'in':[0,0],'out':[0,0]}) for x,y in points],
       fill=dict(kind='none',color=color,endColor=color,start=[0,0],end=[100,100]),stroke=dict(color=color,width=stroke)))
def media(id,source,a,b,source_start=0,mask=None):
    return dict(type='media_plane',id=id,name=id,sourceMediaId=source,sourceStart=source_start,startTime=a,duration=b-a,
      transform=dict(x=50,y=50,scale=100/70,opacity=1),**({'mask':mask} if mask else {}))
def channel(id,prop,points,curve=CURVE):return dict(type='keys',targetId=id,keys=keys(prop,points,curve))
def write(name,layers,actions):
    assert len(actions)<=64
    plan=dict(name=name,actions=actions)
    if layers:plan['graphics']=dict(format='autopromote-graphics',version=1,name=name,width=1280,height=720,duration=24,layers=layers,groups=[])
    (OUT/(name+'.json')).write_text(json.dumps(plan,separators=(',',':')))
    return dict(name=name,layers=len(layers),actions=len(actions))
def letters(prefix,word,a,b,y,size=3.5,start=.15,spacing=16):
    result=[];centre=50-(len(word)-1)*spacing/2
    for i,c in enumerate(word):
        l=text(f'{prefix} / {i+1} {c}',c,a,b,centre+i*spacing,y,size)
        d=start+i*.055
        l['keys']=keys('y',[(a,min(96,y+36)),(a+d+.32,max(1,y-3)),(a+d+.57,y),(b-.25,y),(b,max(1,y-12))])+keys('rotation',[(a,(-1)**i*26),(a+d+.4,-2*(-1)**i),(a+d+.66,0),(b,0)])+keys('opacity',[(a,0),(a+d+.08,1),(b-.2,1),(b,0)])+keys('scale',[(a,.4),(a+d+.38,size*1.08),(a+d+.65,size),(b-.2,size),(b,size*.95)])
        result.append(l)
    return result

plans=[]
# Opening: designed type rhythm, then moving footage opens through MOVE.
layers=[field('01 / ink',0,4)]
layers[0]['keys']=keys('opacity',[(0,1),(3.15,1),(4,0)])
layers+=letters('01 / MAKE','MAKE',0,3.7,27,3.7,spacing=16)
it=text('01 / IT','IT',.25,3.6,50,48,.78,ACID);it['keys']=keys('scale',[(.25,.1),(.65,.95),(.9,.78),(3.6,.78)])+keys('opacity',[(.25,0),(.42,1),(3.45,1),(3.6,0)]);layers.append(it)
move=letters('01 / MOVE','MOVE',.25,4,71,4.2,start=.08,spacing=19)
layers+=move
actions=[]
for i,l in enumerate(move):
    id=f'01 / picture {i+1}'
    actions += [media(id,'City',.25,4,.25),dict(type='matte',targetId=id,matteSourceId=l['id'],mode='alpha')]
for i,(a,x) in enumerate([(.1,15),(.5,85)]):
    bar=art(f'01 / blur slash {i+1}',f'<rect x="610" y="110" width="24" height="500" fill="{ACID}"/>',a,3.65,x,50,100,100)
    bar['keys']=keys('rotation',[(a,-32),(a+.4,25),(3.65,25)])+keys('x',[(a,x),(a+.75,50),(3.65,50)])+keys('opacity',[(a,0),(a+.1,.9),(a+.8,0),(3.65,0)])
    layers.append(bar)
tick=text('01 / chapter','01  /  MAKE YOUR MOVE',0,3.5,50,94,.36,ACID);layers.append(tick)
plans.append(write('01 - Type opens the shot',layers,actions))

# The same moving person crosses real editable typography, no floating card.
layers=[]
for word,y,a in [('BREAK',31,4),('THE GRID',64,4.15)]:
    l=text('02 / '+word,word,a,8,50,y,3.4 if word=='BREAK' else 2.8)
    l['keys']=keys('x',[(a,20 if word=='BREAK' else 80),(a+.6,50),(7.5,50),(8,35 if word=='BREAK' else 65)])+keys('opacity',[(a,0),(a+.15,1),(7.7,1),(8,0)])
    layers.append(l)
city=json.loads((ROOT/'reports/studio-cinematic-episode-20261101/creative-rebuild-v2/city-contour-directions.json').read_text())
poses=city['poses'];first=poses[0]['points'];path='polygon('+', '.join(f'{x}% {y}%' for x,y in first)+')'
actions=[media('02 / moving foreground','City',4,8,4,dict(enabled=True,shape='polygon',path=path,feather=.5,inverted=False))]
rows=[dict(property=f'maskPoint{i}{axis}',time=p['sourceTime'],value=point[j],easing='linear') for p in poses for i,point in enumerate(p['points']) for j,axis in enumerate(['X','Y'])]
actions += [dict(type='keys',targetId='02 / moving foreground',keys=rows[i:i+128]) for i in range(0,len(rows),128)]
plans.append(write('02 - Person crosses the type',layers,actions))
label=text('02 / tracked MOMENTUM','MOMENTUM',4.4,7.7,70,29,.45,ACID)
label['keys']=keys('opacity',[(4.4,0),(4.65,1),(7.4,1),(7.7,0)])
line=vector('02 / wrist attachment',4.4,7.7,[(50,50),(60,33),(82,33)],stroke=.18)
wrist=[(4,361,119),(4.4,351,146),(4.8,358,155),(5.2,359,118),(5.6,360,140),(6,332,174),(6.4,351,155),(6.8,368,128),(7.2,366,145),(7.6,333,175),(8,351,153)]
actions=[dict(type='null',id='02 / wrist rig',name='02 / source-bound wrist rig',startTime=4,duration=4,transform=dict(x=50,y=50,scale=1,opacity=1)),
 dict(type='parent',targetId=label['id'],parentId='02 / wrist rig'),dict(type='parent',targetId=line['id'],parentId='02 / wrist rig'),
 channel('02 / wrist rig','x',[(t,x/640*100) for t,x,y in wrist]),channel('02 / wrist rig','y',[(t,y/360*100) for t,x,y in wrist]),
 channel(line['id'],'strokeEnd',[(4.4,0),(4.8,100),(7.5,100),(7.7,0)])]
plans.append(write('02a - Source-bound moving callout',[label,line],actions))

# Tight, staggered type works against the genuine cadence of the walking shot.
layers=[]
shade=art('03 / lower contrast','<defs><linearGradient id="s" x2="0" y2="1"><stop stop-color="#101114" stop-opacity="0"/><stop offset="1" stop-color="#101114" stop-opacity=".65"/></linearGradient></defs><rect width="1280" height="720" fill="url(#s)"/>',8,14);layers.append(shade)
for copy,y,a,b,size in [('FEEL',25,8.1,10.1,3.2),('THE',46,8.25,10.15,2),('RHYTHM',72,8.4,13.8,3.2)]:
    l=text('03 / '+copy,copy,a,b,50,y,size,ACID if copy=='THE' else PAPER)
    l['textAnimator']=dict(version=1,unit='character',order='forward',stagger=25,fromX=-.4,fromY=1.6,fromScale=.6,fromRotation=-18,fromOpacity=0,tracking=-.035,rangeStart=0,rangeEnd=100,easing='ease_out')
    l['textProgress']=0;l['keys']=keys('textProgress',[(a,0),(a+.75,100)])+keys('opacity',[(a,0),(a+.12,1),(b-.2,1),(b,0)])
    layers.append(l)
for i in range(5):
    a=8.5+i*.9
    v=vector(f'03 / step accent {i+1}',a,a+.7,[(10,88),(26,88),(30,82),(36,88),(48,88),(52,78),(58,88),(90,88)],stroke=.35)
    v['keys']=[];layers.append(v)
    actions=[channel(v['id'],'strokeEnd',[(a,0),(a+.3,100)]),channel(v['id'],'opacity',[(a,0),(a+.06,1),(a+.4,1),(a+.7,0)])]
    plans.append(write(f'03{chr(97+i)} - Step accent', [v],actions))
    layers.pop()
plans.append(write('03 - Rhythm typography',layers,[channel('03 / FEEL','rotation',[(8.1,0)])]))

# Coast: eight editable letters pass behind the actual upper body.
letters_coast=letters('04 / FEARLESS','FEARLESS',14,18,51,2.65,start=.05,spacing=10.8)
layers=letters_coast
small=text('04 / signed','BECAUSE AN IDEA SHOULD NEVER STAND STILL.',14.6,17.7,50,86,.41,ACID);layers.append(small)
track=json.loads((ROOT/'reports/studio-cinematic-episode-20261101/subject-point-directions.json').read_text())['frames']
path='polygon('+', '.join(f'{x}% {y}%' for x,y in track[0]['points'])+')'
actions=[media('04 / foreground occlusion','Coast',14,18,0,dict(enabled=True,shape='polygon',path=path,feather=.6,inverted=False))]
poses=track[::2]+[track[-1]]
rows=[dict(property=f'maskPoint{i}{axis}',time=round(14+p['sourceTime'],6),value=point[j],easing='linear') for p in poses for i,point in enumerate(p['points']) for j,axis in enumerate(['X','Y'])]
actions += [dict(type='keys',targetId='04 / foreground occlusion',keys=rows[i:i+128]) for i in range(0,len(rows),128)]
plans.append(write('04 - Live subject occlusion',layers,actions))

# Resolve into a single composed kinetic poster, retaining separate letters.
layers=[field('05 / final ink',18,24)]
layers[0]['keys']=keys('x',[(18,100),(18.55,50),(24,50)])
for row,(copy,y,a) in enumerate([('MAKE',24,18.4),('YOUR',49,18.6),('MOVE',75,18.8)]):
    ls=letters('05 / '+copy,copy,a,24,y,3.55,start=.05,spacing=17)
    if row==1:
        for l in ls:l['color']=ACID
    for l in ls:
        # Hold the resolved composition; the standard letter exits are removed.
        l['keys']=[k for k in l['keys'] if k['time']<23.7]
    layers+=ls
sub=text('05 / identity','AUTOPROMOTE  /  MOTION & FLOW',20.2,24,50,94,.32,PAPER);sub['keys']=keys('opacity',[(20.2,0),(20.7,1),(24,1)]);layers.append(sub)
slash=vector('05 / signature stroke',19.4,24,[(10,89),(87,89),(90,84)],stroke=.5);slash['keys']=[];layers.append(slash)
plans.append(write('05 - Make your move',layers,[channel(slash['id'],'strokeEnd',[(19.4,0),(20.3,100)])]))
(OUT/'edit-decision-list.json').write_text(json.dumps([['City',0,8],['Footsteps',0,6],['Coast',0,10]],indent=2))
(OUT/'direction.json').write_text(json.dumps({'name':'Make your move','seconds':24,'style':'Bold kinetic typography, moving picture mattes, source-bound occlusion and native drawn accents. No bending planes.','plans':plans,'retainedCitySourceHash':city['sourceSha256'],'paidCalls':0},indent=2))
print(json.dumps({'seconds':24,'plans':len(plans),'graphicLayers':sum(p['layers'] for p in plans),'actions':sum(p['actions'] for p in plans)}))
