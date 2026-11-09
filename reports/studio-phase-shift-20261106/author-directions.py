"""Author editable native directions only; no visual rendering."""
from pathlib import Path
import json,hashlib
root=Path(__file__).resolve().parents[2];out=root/'reports/studio-phase-shift-20261106';older=root.parent/'AutoPromote-ae-fusion-20261031';out.mkdir(exist_ok=True)
S=100/70;curve=[.22,1,.36,1]
def keys(p,points):return [dict(property=p,time=round(t,6),value=v,easing='bezier',curve=curve)for t,v in points]
def art(id,a,b,svg):return dict(id=id,name=id,type='artwork',svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">{svg}</svg>',startTime=a,duration=b-a,x=50,y=50,width=100,height=100,scale=1,rotation=0,opacity=1,keys=[])
def media(id,source,a,b,sourceStart=0,mask=None):return dict(type='media_plane',id=id,name=id,sourceMediaId=source,sourceStart=sourceStart,startTime=a,duration=b-a,transform=dict(x=50,y=50,scale=S,opacity=1),**({'mask':mask}if mask else {}))
def channel(id,ks):return dict(type='keys',targetId=id,keys=ks)
def mask(path):return dict(enabled=True,shape='polygon',path=path,feather=0,inverted=False)
def plan(name,layers,actions):
 d=dict(name=name,actions=actions)
 if layers:d['graphics']=dict(format='autopromote-graphics',version=1,name=name,width=1280,height=720,duration=15,layers=layers,groups=[])
 assert len(actions)<=64;(out/(name+'.json')).write_text(json.dumps(d,separators=(',',':')))

layers=[art('Phase / midnight stage',0,15,'<rect width="1280" height="720" fill="#0b0c13"/>')];actions=[channel('main-video',keys('opacity',[(0,0),(15,0)]))]
for i in range(8):
 a=i*12.5;b=(i+1)*12.5;id=f'Weave / time strip {i+1}'
 actions +=[media(id,'cinema',0,5,i*.18,mask(f'polygon(0% {a}%,100% {a}%,100% {b}%,0% {b}%)')),channel(id,keys('x',[(0,-15 if i%2==0 else 115),(.65+i*.045,50),(2,46 if i%2==0 else 54),(3.15,54 if i%2==0 else 46),(4.35,50),(5,50)])+keys('opacity',[(0,0),(.25,1),(4.8,1),(5,0)]))]
plan('01 - Time weave',layers,actions)

prior=json.loads((older/'reports/studio-make-your-move-20261102/02 - Person crosses the type.json').read_text());body=prior['actions'][0];geometry=art('World / editable walking silhouette',5,9,'<rect width="1280" height="720" fill="#ffffff"/>');geometry['mask']=body['mask']
paper=art('World / warm paper',5,9,'<rect width="1280" height="720" fill="#f2eee5"/>');circle=art('World / vermilion disc',5,9,'<circle cx="640" cy="350" r="204" fill="#ed4537"/>');circle['keys']=keys('scale',[(5,.1),(5.65,1),(8.6,1),(9,1.2)])
layers=[paper,circle,geometry];actions=[]
allkeys=[{**k,'time':round(k['time']+1,6)}for a in prior['actions'][1:]for k in a.get('keys',[]) if k['property'].startswith('maskPoint')]
for start in range(0,len(allkeys),128):actions.append(channel(geometry['id'],allkeys[start:start+128]))
actions +=[channel(geometry['id'],keys('opacity',[(5,0),(5.25,1),(8.75,1),(9,0)])),media('World / moving ocean inside the person','Coast',5,9,0),dict(type='matte',targetId='World / moving ocean inside the person',matteSourceId=geometry['id'],mode='alpha')]
plan('02 - A world inside a person',layers,actions)

perimeter=[(0,0),(50,0),(100,0),(100,50),(100,100),(50,100),(0,100),(0,50)];actions=[]
for i,(x,y)in enumerate(perimeter):
 x2,y2=perimeter[(i+1)%8];id=f'Portal / temporal wedge {i+1}'
 actions +=[media(id,'Coast',9,14.25,i*.2,mask(f'polygon(50% 50%,{x}% {y}%,{x2}% {y2}%)')),channel(id,keys('scale',[(9,.08),(10.2+i*.05,S),(11.3,S*.75),(12.3,S),(13.3,S),(14.25,.04)])+keys('rotation',[(9,(-1)**i*55),(10.4,0),(11.5,12),(12.8,0),(14.25,(-1)**i*60)]))]
actions +=[media('Portal / uninterrupted final horizon','Coast',13.5,15,6),channel('Portal / uninterrupted final horizon',keys('opacity',[(13.5,0),(14.2,1),(15,1)]))]
plan('03 - Temporal iris',[],actions)
sources={'cinema':older/'reports/studio-template-collection-20261104/sources/cinema.mp4','Coast':older/'reports/studio-motion-flow-takeover-20261031/video-texture/open-world-sources/Coast.mp4','City':older/'reports/studio-motion-flow-takeover-20261031/video-texture/open-world-sources/City.mp4'}
(out/'sources.json').write_text(json.dumps([dict(name=k,path=str(v),sha256=hashlib.sha256(v.read_bytes()).hexdigest(),bytes=v.stat().st_size)for k,v in sources.items()],indent=2));print('Three native plans; source-bound cached contour geometry, no new inference, no rendered effects.')
