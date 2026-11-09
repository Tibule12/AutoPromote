"""Native scene data only. This is explicit assistant art direction, not local-model output."""
from pathlib import Path
import json,math
r=Path(__file__).resolve().parent
S=10/7;curve=[.65,0,.35,1]
def keys(p,points):return [dict(property=p,time=t,value=v,easing='bezier',curve=curve)for t,v in points]
def channel(id,rows):return dict(type='keys',targetId=id,keys=rows)
def art(id,name,a,b,content,rows=[]):return dict(id=id,name=name,type='artwork',svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">{content}</svg>',startTime=a,duration=b-a,x=50,y=50,width=100,height=100,scale=1,rotation=0,opacity=1,keys=rows)
def plane(id,name,src,a,b,offset=0,mask=None):return dict(type='media_plane',id=id,name=name,sourceMediaId=src,sourceStart=offset,startTime=a,duration=b-a,transform=dict(x=50,y=50,scale=S,rotation=0,opacity=1),mask=mask or dict(enabled=False,shape='rectangle',feather=0,inverted=False))
graphics=[art('paper','01 / Warm paper',0,12,'<rect width="1280" height="720" fill="#eee8da"/>'),art('blue','03 / Cobalt world opens',2,6.1,'<circle cx="640" cy="360" r="360" fill="#224de5"/>',keys('scale',[(2,.1),(3.2,2.2),(6.1,2.2)])),art('red','06 / Vermilion print echo',2,6,'<rect width="1280" height="720" fill="#f44b35"/>',keys('opacity',[(2,0),(2.65,.9),(4.6,.9),(5.8,0),(6,0)]))]
actions=[plane('city','02 / Real city, continuous source','CITY',0,8,2),channel('city',keys('opacity',[(0,1),(2.5,1),(3.2,0),(8,0)]))]
# A true geometric iris: only clip points move, while the ocean remains at the
# same full-frame source transform/time as the water inside the person.
def points(radius):return [[50+radius*.5625*math.cos(i*math.tau/64),50+radius*math.sin(i*math.tau/64)]for i in range(64)]
initial=points(.05);mask=dict(enabled=True,shape='polygon',path='polygon('+','.join(f'{x:.8f}% {y:.8f}%'for x,y in initial)+')',feather=0,inverted=False)
actions.append(plane('iris','04 / Ocean iris, source stays still','COAST',2,12,0,mask))
rows=[]
for i in range(64):
 for axis in range(2):rows+=keys(f'maskPoint{i}{"X"if axis==0 else"Y"}',[(t,points(radius)[i][axis])for t,radius in[(2,.05),(4.7,.05),(5.35,38),(6,115)]])
for offset in range(0,len(rows),128):actions.append(channel('iris',rows[offset:offset+128]))
actions +=[plane('echo-matte','05 / Echo source matte','MATTE',2,6),channel('echo-matte',keys('x',[(2,50),(2.8,58),(3.8,54),(5.6,51.5),(6,51.5)])),dict(type='matte',targetId='red',matteSourceId='echo-matte',mode='luma'),plane('person-matte','07 / Source-bound walking silhouette','MATTE',2,6),plane('person','08 / Recognisable foreground becomes water','CITY',2,6,4),dict(type='matte',targetId='person',matteSourceId='person-matte',mode='luma'),channel('person',keys('opacity',[(2,1),(2.9,1),(3.45,0),(6,0)])),plane('body-sea','09 / The same ocean inside the figure','COAST',2,6),dict(type='matte',targetId='body-sea',matteSourceId='person-matte',mode='luma'),channel('body-sea',keys('opacity',[(2,0),(2.9,0),(3.45,1),(6,1)]))]
order=['paper','city','blue','iris','echo-matte','red','person-matte','person','body-sea']
for i in range(len(order)-2,-1,-1):actions.append(dict(type='move_layer',targetId=order[i],beforeId=order[i+1]))
plan=dict(name='CITY INTO SEA / explicit native art direction',actions=actions,graphics=dict(format='autopromote-graphics',version=1,name='City into sea',width=1280,height=720,duration=12,layers=graphics,groups=[]))
# Tight eight-second editorial timing and one shared 2D camera rig. All
# sources preserve normal speed; only programme placement and framing change.
def clock(t):return 8 if t==12 else (round(t-.5,8)if t>=2 else t)
for layer in plan['graphics']['layers']:
 end=clock(layer['startTime']+layer['duration']);layer['startTime']=clock(layer['startTime']);layer['duration']=round(end-layer['startTime'],8)
 for k in layer['keys']:k['time']=clock(k['time'])
for action in plan['actions']:
 if 'startTime'in action:
  end=clock(action['startTime']+action['duration']);action['startTime']=clock(action['startTime']);action['duration']=round(end-action['startTime'],8)
 for k in action.get('keys',[]):k['time']=clock(k['time'])
 if action.get('id')=='city':action['sourceStart']=2.5
plan['graphics']['duration']=8
plan['actions'].insert(0,dict(type='null',id='world-rig',name='00 / Shared cinematic camera',startTime=0,duration=8,transform=dict(x=50,y=50,scale=1,rotation=0,opacity=1)))
plan['actions'].append(channel('world-rig',keys('scale',[(0,1),(1.5,1),(2.7,1.25),(4.2,1.25),(5.5,1),(8,1)])))
for id in ['city','iris','echo-matte','red','person-matte','person','body-sea']:plan['actions'].append(dict(type='parent',targetId=id,parentId='world-rig'))
(r/'native-art-direction-template.json').write_text(json.dumps(plan,indent=2));print('10 ordinary layers including shared camera; eight seconds; exact matte 4–8 / 0–4; geometric iris preserves source framing.')
