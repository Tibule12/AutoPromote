"""Creative R&D intentions; these files do not claim native Studio authoring."""
import copy,json,sys
from pathlib import Path
ROOT=Path('/dev/shm/autopromote-abstract-20261030')
REPO=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(REPO/'studio_3d_renderer'))
from objects import RIBBON_DEFAULTS
from spec import validate_spec
BASE=json.loads((REPO/'studio_3d_renderer/tests/objects.json').read_text())
POSE=dict(x=0,y=0,z=0,scaleX=1,scaleY=1,scaleZ=1,rotationX=0,rotationY=0,rotationZ=0)
def obj(name,color,material,ribbon=None,shape=None,**pose):
    value=dict(id=name.lower().replace(' ','-'),name=name,shape=shape or ('ribbon' if ribbon is not None else 'sphere'),color=color,material=material,keyframes=[],**{**POSE,**pose})
    if ribbon is not None:value['ribbon']={**RIBBON_DEFAULTS,**ribbon}
    return value
def designs():
    metal=[obj('Flowing platinum','#bfc9d2','brushed',dict(path='knot',wave=.95,width=.5,thickness=.075,lobes=3,twists=1,speed=.38),rotationX=26,rotationY=-18,rotationZ=-15)]
    metal[0]['roughness']=.17
    metal.extend([obj('Satellite '+str(i),'#d4b388','chrome',x=x,y=y,z=z,scaleX=r,scaleY=r,scaleZ=r) for i,(x,y,z,r) in enumerate([(-2,.9,.5,.22),(2.1,-.65,.25,.12),(.7,1.5,-.5,.16)])])
    glass=[obj('Amber optical loop','#ffe4ba','glass',dict(path='loop',width=.85,thickness=.16,wave=.62,lobes=3,twists=1,speed=.27),rotationX=35,rotationY=-30,rotationZ=-20),obj('Azure optical loop','#bde9ed','glass',dict(path='loop',width=.6,thickness=.13,wave=.5,lobes=2,twists=-1,speed=-.22,phase=120),rotationX=-40,rotationY=25,rotationZ=30,scaleX=.86,scaleY=.86,scaleZ=.86)]
    glass.extend([obj('Optical droplet '+str(i),'#e5eef4','glass',x=x,y=y,z=z,scaleX=r,scaleY=r,scaleZ=r) for i,(x,y,z,r) in enumerate([(-1.8,-1.1,.7,.28),(1.8,1.15,.5,.18),(.5,-1.8,-.7,.12)])])
    glass.extend([obj('Optical backdrop','#63717c','matte',shape='plane',z=-3.5,scaleX=2,scaleY=2),obj('Bright refraction band','#dae3e8','matte',shape='box',x=-1.15,z=-3.4,scaleX=.4,scaleY=4,scaleZ=.05),obj('Dark refraction band','#101b26','matte',shape='box',x=1.5,z=-3.4,scaleX=.55,scaleY=4,scaleZ=.05)])
    folds=[obj('Champagne fold','#b8a28b','silk',dict(path='wave',width=1.2,thickness=.02,wave=.8,lobes=1,twists=0,speed=.24,phase=35),y=.9,z=-.6,rotationX=12,rotationZ=-8),obj('Pearl fold','#dfd8cf','silk',dict(path='wave',width=1.2,thickness=.02,wave=.8,lobes=1,twists=0,speed=.24,phase=70),y=0,z=.2,rotationX=8,rotationZ=-8),obj('Copper fold','#ba855c','brushed',dict(path='wave',width=1.2,thickness=.035,wave=.75,lobes=1,twists=0,speed=.24,phase=105),y=-.9,z=1,rotationX=4,rotationZ=-8)]
    for item in folds:item['ribbon']['twists']=1
    return [('current','CURRENT / liquid metal',metal,1.15,58),('prism','PRISM / optical motion',glass,1.15,58),('fold','FOLD / material in motion',folds,1.05,58)]
def make():
    for identity,title,objects,scale,focal in designs():
        value=copy.deepcopy(BASE);value.update(width=1280,height=720,fps=24,duration=10)
        scene=value['scene'];scene.update(id='abstract-'+identity,name=title,duration=10,endTime=10,objects=objects,scale=scale,rotationX=0,rotationY=0,rotationZ=0,lightingRig='sculpture',lightIntensity=2.2,lightColor='#ffffff',focalLength=focal,keyframes=[])
        validate_spec(value);folder=ROOT/identity;folder.mkdir(parents=True,exist_ok=True,mode=0o700)
        (folder/'study-spec.json').write_text(json.dumps(value,indent=2)+'\n')
        print(identity,len(objects),'objects, creative study only')
if __name__=='__main__':make()
