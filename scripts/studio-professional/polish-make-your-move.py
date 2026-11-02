"""Reviewed choreography revision; loaded through Studio's scene UI."""
from pathlib import Path
import json
root=Path(__file__).resolve().parents[2]/'reports/studio-make-your-move-20261102'
project=json.loads((root/'Editable Project.autopromote.json').read_text())['snapshot']
layers={l['name']:l for l in project['overlays']}
curve=[.16,1,.3,1]
def channel(target,p,points):return dict(type='keys',targetId=target,keys=[dict(property=p,time=round(t,6),value=v,easing='bezier',curve=curve) for t,v in points])
def null(name,a,b):return dict(type='null',id=name,name=name,startTime=a,duration=b-a,transform=dict(x=50,y=50,scale=1,opacity=1))
def write(name,actions):
    assert 0<len(actions)<=64
    (root/(name+'.json')).write_text(json.dumps(dict(name=name,actions=actions),separators=(',',':')))
actions=[null('01 / aperture rig',0,4)]
for l in layers.values():
    if l['name'].startswith('01 / MOVE /'):actions.append(dict(type='parent',targetId=l['name'],parentId='01 / aperture rig'))
actions += [channel('01 / aperture rig','scale',[(0,1),(2.65,1),(3.85,3.8),(4,3.8)]),channel('01 / aperture rig','x',[(0,50),(2.65,50),(3.85,86.1),(4,86.1)]),channel('01 / aperture rig','y',[(0,50),(2.65,50),(3.85,-29.8),(4,-29.8)])]
for name,size,start in [('02 / BREAK',5.7,4),('02 / THE GRID',4.6,4.15),('03 / FEEL',4.7,8.1),('03 / THE',2.7,8.25),('03 / RHYTHM',5.2,8.4)]:
    end=layers[name]['startTime']+layers[name]['duration']
    actions.append(channel(name,'scale',[(start,.8),(start+.65,size),(end-.25,size),(end,size*.94)]))
for i,l in enumerate(l for l in layers.values() if l['name'].startswith('04 / FEARLESS /')):
    name=l['name'];x=50+(i-3.5)*6.7
    actions += [dict(type='remove_keys',targetId=name,property='scale'),channel(name,'scale',[(14,.4),(14.65+i*.055,2.65),(15.4,2.65),(17.3,4.4),(18,4.4)]),channel(name,'x',[(14,l['x']),(15.4,l['x']),(17.3,x),(18,x)])]
write('06 - Aperture and scale',actions)
actions=[null('05 / kinetic poster rig',18.4,24)]
for l in layers.values():
    if not any(l['name'].startswith('05 / '+w+' /') for w in ['MAKE','YOUR','MOVE']):continue
    name=l['name'];i=int(name.split(' / ')[-1].split()[0])-1;a=l['startTime'];x=50+(i-1.5)*11.7
    actions += [dict(type='parent',targetId=name,parentId='05 / kinetic poster rig'),dict(type='remove_keys',targetId=name,property='scale'),channel(name,'scale',[(a,.4),(a+.55,3.55),(20.3,3.55),(21.4,4.7),(24,4.7)]),channel(name,'x',[(a,l['x']),(20.3,l['x']),(21.4,x),(24,x)])]
actions += [channel('05 / kinetic poster rig','rotation',[(18.4,-9),(19.7,0),(20.3,0),(21.4,2),(22,0),(24,0)]),channel('05 / kinetic poster rig','scale',[(18.4,.8),(19.7,1),(20.3,1),(21.4,1.28),(24,1.28)])]
write('07 - Kinetic poster rig',actions)
print({'nativeRevisionActions':len(actions)})
