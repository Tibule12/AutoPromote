"""Expand the reviewed draft to a native thirty-second episode."""
from pathlib import Path
import json,copy
from math import ceil
base=Path(__file__).resolve().parents[2]/'reports/studio-make-your-move-20261102'
out=base/'episode';out.mkdir(exist_ok=True)
PAPER,INK,ACID='#f5f2e9','#101114','#d7ff43'
curve=[.16,1,.3,1]
def channel(id,p,points):return dict(type='keys',targetId=id,keys=[dict(property=p,time=round(t,6),value=v,easing='bezier',curve=curve) for t,v in points])
def text(id,copy,a,b,x=50,y=50,size=1,color=PAPER):return dict(id=id,name=id,type='text',text=copy,startTime=a,duration=b-a,x=x,y=y,width=95,scale=size,rotation=0,opacity=1,color=color,fontWeight=900,textAlign='center',keys=[])
def art(id,svg,a,b):return dict(id=id,name=id,type='artwork',svg='<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">'+svg+'</svg>',startTime=a,duration=b-a,x=50,y=50,width=100,height=100,scale=1,rotation=0,opacity=1,keys=[])
def media(id,src,a,b,start=0,mask=None):return dict(type='media_plane',id=id,name=id,sourceMediaId=src,sourceStart=start,startTime=a,duration=b-a,transform=dict(x=50,y=50,scale=100/70,opacity=1),**({'mask':mask} if mask else {}))
def write(name,layers,actions):
    assert 0<len(actions)<=64
    value=dict(name=name,actions=actions)
    if layers:value['graphics']=dict(format='autopromote-graphics',version=1,name=name,width=1280,height=720,duration=30,layers=layers,groups=[])
    (out/(name+'.json')).write_text(json.dumps(value,separators=(',',':')))
    return dict(name=name,layers=len(layers),actions=len(actions))
direction=json.loads((base/'direction.json').read_text());plans=[]
for name in [p['name'] for p in direction['plans']]+['06 - Aperture and scale','07 - Kinetic poster rig']:
    value=json.loads((base/(name+'.json')).read_text())
    if name.startswith('06'):
        for action in value['actions']:
            if action.get('targetId','').startswith('04 / FEARLESS') and action.get('keys',[{}])[0].get('property')=='x':
                i=int(action['targetId'].split(' / ')[-1].split()[0])-1
                for key in action['keys']:
                    if key['time']>=17.3:key['value']=50+(i-3.5)*9.2
    if name.startswith('07'):
        for action in value['actions']:
            for key in action.get('keys',[]):
                if key['property']=='scale' and key['value']==4.7:key['value']=4.2
                if action.get('targetId')=='05 / kinetic poster rig' and key['property']=='scale' and key['value']==1.28:key['value']=1.08
    if value.get('graphics'):
        value['graphics']['duration']=30
        for layer in value['graphics']['layers']:
            if layer['name'].startswith(('04 /','05 /')):
                layer['startTime']+=6
                for key in layer['keys']:key['time']+=6
    for action in value['actions']:
        if (action.get('name') or action.get('targetId','')).startswith(('04 /','05 /')):
            if 'startTime' in action:action['startTime']+=6
            for key in action.get('keys',[]):key['time']+=6
    (out/(name+'.json')).write_text(json.dumps(value,separators=(',',':')))
    plans.append(dict(name=name,layers=len(value.get('graphics',{}).get('layers',[])),actions=len(value['actions'])))

# Source-bound body leaves the picture matte; all colour outside it is removed.
name='08 - Emerging from the letters'
ink=art('02 / negative space',f'<rect width="1280" height="720" fill="{INK}"/>',4,8)
layers=[ink,text('02 / label','BREAK THE GRID',4.25,7.75,y=14,size=.58,color=ACID)]
actions=[dict(type='move_layer',targetId=ink['id'],beforeId='02 / BREAK')]
for word in ['BREAK','THE GRID']:
    id='02 / '+word
    actions += [dict(type='remove_keys',targetId=id,property='opacity'),channel(id,'opacity',[(4,0),(8,0)])]
for i,c in enumerate('MOTION'):
    id=f'02 / matte letter {i+1} {c}';a=4+i*.055
    layer=text(id,c,4,8,x=50+(i-2.5)*12.8,y=51,size=5)
    layer['keys']=channel(id,'y',[(4,83),(a+.55,49),(a+.75,51),(7.5,51),(8,43)])['keys']+channel(id,'rotation',[(4,(-1)**i*20),(a+.65,0),(8,0)])['keys']+channel(id,'opacity',[(4,0),(a+.1,1),(7.7,1),(8,0)])['keys']
    layers.append(layer);v=f'02 / emergence picture {i+1}'
    actions += [media(v,'City',4,8,4),dict(type='matte',targetId=v,matteSourceId=id,mode='alpha'),dict(type='move_layer',targetId=v,beforeId='02 / moving foreground')]
plans.append(write(name,layers,actions))

# Six moving source strips construct a whole moving landscape, then clear it.
name='09 - Cut through the frame'
ink=art('04b / transition ink',f'<rect width="1280" height="720" fill="{INK}"/>',14,16.7)
ink['keys']=channel(ink['id'],'opacity',[(14,1),(16.25,1),(16.7,0)])['keys']
layers=[ink];actions=[]
for i in range(6):
    id=f'04b / live strip {i+1}';a=14+i*.08
    left=max(0,i*100/6-.08);right=min(100,(i+1)*100/6+.08)
    mask=dict(enabled=True,shape='polygon',path=f'polygon({left}% 0%, {right}% 0%, {right}% 100%, {left}% 100%)',feather=0,inverted=False)
    actions += [media(id,'Summit',14,16.75,0,mask),channel(id,'y',[(14,130 if i%2 else -30),(a+.75,50),(16.75,50)]),channel(id,'rotation',[(14,(-1)**i*12),(a+.75,0),(16.75,0)]),channel(id,'opacity',[(14,0),(a+.1,1),(16.4,1),(16.75,0)])]
for copy,y,a,b,size,color in [('BEYOND',34,16.75,19.9,4.95,PAPER),('THE FRAME',66,17.05,19.9,3.8,ACID)]:
    l=text('04b / '+copy,copy,a,b,y=y,size=size,color=color)
    l['textAnimator']=dict(version=1,unit='character',order='center_out',stagger=55,fromX=0,fromY=1.8,fromScale=.5,fromRotation=-25,fromOpacity=0,tracking=.025,rangeStart=0,rangeEnd=100,easing='back_out');l['textProgress']=0
    l['keys']=channel(l['id'],'textProgress',[(a,0),(a+.8,100)])['keys']+channel(l['id'],'opacity',[(a,0),(a+.12,1),(b-.2,1),(b,0)])['keys'];layers.append(l)
plans.append(write(name,layers,actions))
direction.update(name='Make your move / Episode',seconds=30,plans=plans,notes='Thirty seconds. Added temporal strip construction and source-bound person emergence; full reusable native layer graph. No bending surface or paid provider call.')
(out/'direction.json').write_text(json.dumps(direction,indent=2))
(out/'edit-decision-list.json').write_text(json.dumps([['City',0,8],['Footsteps',0,6],['Summit',0,6],['Coast',0,10]],indent=2))
print({'seconds':30,'plans':len(plans),'graphicLayers':sum(p['layers'] for p in plans)})
