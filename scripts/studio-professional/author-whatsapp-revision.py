"""Reviewed native art direction, all motion in ordinary editable Studio layers."""
from pathlib import Path
import json
out=Path(__file__).resolve().parents[2]/'reports/studio-whatsapp-director-20261103/revision-2';out.mkdir(exist_ok=True)
PAPER,INK,ACID='#ece8dc','#15191a','#d7ff43';curve=[.16,1,.3,1]
def keys(prop,points,easing='bezier'):
 return [dict(property=prop,time=round(t,6),value=v,easing=easing,**({'curve':curve} if easing=='bezier' else {})) for t,v in points]
def channel(id,prop,points,easing='bezier'):return dict(type='keys',targetId=id,keys=keys(prop,points,easing))
def text(id,copy,a,b,x=50,y=50,size=1,color=INK,width=98,stroke=0):
 return dict(id=id,name=id,type='text',text=copy,startTime=a,duration=b-a,x=x,y=y,width=width,scale=size,rotation=0,opacity=1,color=color,fontWeight=900,textAlign='center',strokeWidth=stroke,strokeColor=INK,keys=[])
def art(id,body,a,b):return dict(id=id,name=id,type='artwork',svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">{body}</svg>',startTime=a,duration=b-a,x=50,y=50,width=100,height=100,scale=1,rotation=0,opacity=1,keys=[])
def media(id,src,a,b,start=0,x=50,y=50,scale=100/70,mask=None,fit='contain'):
 return dict(type='media_plane',id=id,name=id,sourceMediaId=src,sourceStart=start,startTime=a,duration=b-a,transform=dict(x=x,y=y,scale=scale,opacity=1),mediaFit=fit,**({'mask':mask} if mask else {}))
def polygon(path):return dict(enabled=True,shape='polygon',path=path,feather=0,inverted=False)
plans=[]
def write(name,layers,actions):
 assert 0<len(actions)<=64,(name,len(actions));v=dict(name=name,actions=actions)
 if layers:v['graphics']=dict(format='autopromote-graphics',version=1,name=name,width=1280,height=720,duration=24,layers=layers,groups=[])
 (out/(name+'.json')).write_text(json.dumps(v,separators=(',',':')));plans.append(name)
# Quiet print structure; giant moving type gets the screen, not floating cards.
base=art('R2 / paper',f'<rect width="1280" height="720" fill="{PAPER}"/><path d="M48 56H180M48 56V188M1232 664H1100M1232 664V532" stroke="{INK}" stroke-width="2" fill="none"/><path d="M48 684H1232" stroke="{INK}" stroke-opacity=".18"/>',0,24)
labels=[text('R2 / corner label','OFF SCRIPT / 01',0,24,x=17,y=7,size=.36,width=30),text('R2 / folio','A STUDY IN MOTION',0,24,x=80,y=94,size=.3,width=35)]
write('01 - Editorial stage',[base,*labels],[dict(type='remove_keys',targetId='main-video',property='opacity'),channel('main-video','opacity',[(0,0),(24,0)],'hold')])
# First and last performance: original colour pixels + source-bound alpha.
L=[];A=[]
for scene,a,b in [('intro',0,3),('closing',21,24)]:
 x=50 if scene=='intro' else 68;y=58 if scene=='intro' else 60;scale=1.65 if scene=='intro' else 1.62
 A += [media(f'R2 / {scene} silhouette','Portrait',a,b,.25,x,y,scale),media(f'R2 / {scene} source mask','Portrait mask',a,b,0,x,y,scale)]
 A += [channel(f'R2 / {scene} silhouette','scale',[(a,scale*.92),(a+.65,scale),(b,scale*1.04)]),channel(f'R2 / {scene} source mask','scale',[(a,scale*.92),(a+.65,scale),(b,scale*1.04)])]
# Eight individual letters split and settle behind the face, with a smaller signature.
for i,c in enumerate('OFF'):
 id=f'R2 / intro OFF {i}';l=text(id,c,0,3,x=25+i*25,y=33,size=5,color=INK)
 l['keys']=keys('y',[(0,85),(min(.7,.3+i*.09),33),(2.65,33),(3,15)])+keys('rotation',[(0,(-1)**i*24),(.5+i*.06,0),(3,0)])+keys('opacity',[(0,0),(.08+i*.04,1),(2.8,1),(3,0)])
 L.append(l)
l=text('R2 / intro script','SCRIPT',.28,3,y=66,size=3.1,color=ACID,stroke=1.2);l['keys']=keys('x',[(.28,30),(.9,50),(2.55,50),(3,68)])+keys('opacity',[(.28,0),(.45,1),(2.7,1),(3,0)]);L.append(l)
for word,y,a,size in [('OFF',31,21,3.7),('SCRIPT',60,21.15,2.95)]:
 l=text('R2 / closing '+word,word,21,24,x=32,y=y,size=size,color=INK,width=62);l['keys']=keys('x',[(21,5),(a+.55,32),(24,32)])+keys('rotation',[(21,-12),(a+.55,0),(24,0)])+keys('opacity',[(21,0),(a+.12,1),(23.8,1),(24,0)]);L.append(l)
l=text('R2 / final line','MAKE YOUR OWN WORLD',21,24,x=31,y=83,size=.5,width=58);l['keys']=keys('opacity',[(21,0),(21.7,1),(23.8,1),(24,0)]);L.append(l)
write('02 - Portrait in the typography',L,A)
# Slice the face into five independently displaced temporal bands, then reunite.
L=[art('R2 / chapter ink',f'<rect width="1280" height="720" fill="{INK}"/>',3,9)]
for copy,x,y,size,color in [('BREAK',25,28,2.9,PAPER),('THE',77,51,1.45,ACID),('FRAME',74,72,2.7,PAPER)]:
 l=text('R2 / '+copy,copy,3,9,x=x,y=y,size=size,color=color,width=48);l['keys']=keys('x',[(3,max(0,x-20)),(3.5,x),(8.5,x),(9,min(100,x+20))])+keys('opacity',[(3,0),(3.3,1),(8.7,1),(9,0)]);L.append(l)
A=[]
for i in range(5):
 id=f'R2 / portrait slice {i+1}';top=i*20;bottom=min(100,(i+1)*20+.3)
 A += [media(id,'Close',3,9,.12*i,x=50,y=50,scale=1.65,mask=polygon(f'polygon(0% {top}%,100% {top}%,100% {bottom}%,0% {bottom}%)'))]
 A += [channel(id,'x',[(3,10 if i%2 else 90),(3.55+i*.06,50),(5.4,50),(5.65,50+(-1)**i*7),(5.95,50),(8.5,50),(9,10 if i%2 else 90)]),channel(id,'rotation',[(3,(-1)**i*18),(3.65+i*.05,0),(8.55,0),(9,(-1)**i*13)]),channel(id,'opacity',[(3,0),(3.18+i*.05,1),(8.7,1),(9,0)])]
# Arrange text behind the moving image bands; live pixels remain the focal point.
for c in ['BREAK','THE','FRAME']:A += [dict(type='move_layer',targetId='R2 / '+c,beforeId='R2 / portrait slice 1')]
write('03 - Temporal face shutters',L,A)
# Code footage is a live type texture. A diagonal aperture turns it into the full shot.
L=[art('R2 / code paper',f'<rect width="1280" height="720" fill="{PAPER}"/>',9,14)]
l=text('R2 / BUILD matte','BUILD',9,14,y=52,size=5,color=INK)
l['textAnimator']=dict(version=1,unit='character',order='forward',stagger=65,fromX=-.2,fromY=1.2,fromScale=.8,fromRotation=-12,fromOpacity=0,tracking=.02,rangeStart=0,rangeEnd=100,easing='back_out');l['textProgress']=0
l['keys']=keys('textProgress',[(9,0),(9.9,100)])+keys('scale',[(9,4.5),(10,5),(11.1,5),(12.05,5)])+keys('opacity',[(9,0),(9.2,1),(11.6,1),(12.05,0)]);L.append(l)
l=text('R2 / code label','FROM THE FIRST LINE',9,12.1,y=15,size=.42);l['keys']=keys('opacity',[(9,0),(9.5,1),(11.7,1),(12.1,0)]);L.append(l)
A=[media('R2 / type code','Screen',9,12.05,2,scale=100/70,fit='cover'),dict(type='matte',targetId='R2 / type code',matteSourceId='R2 / BUILD matte',mode='alpha'),dict(type='move_layer',targetId='R2 / type code',beforeId='R2 / code label')]
mask=polygon('polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)');A+=[media('R2 / code aperture','Screen',11.5,14,4.5,scale=100/70,mask=mask)]
for i in range(4):
 startx=0 if i in [0,3] else 100;endx=0 if i in [0,3] else 100;starty=0 if i<2 else 100
 A += [channel('R2 / code aperture',f'maskPoint{i}X',[(11.5,49+(1 if i in [1,2] else 0)),(12.1,endx),(13.45,endx),(14,50)],'linear'),channel('R2 / code aperture',f'maskPoint{i}Y',[(11.5,starty),(14,starty)],'linear')]
A += [channel('R2 / code aperture','opacity',[(11.5,1),(13.7,1),(14,0)])]
write('04 - Code becomes the frame',L,A)
# Matte-bound seated performance is brought onto a full editorial stage.
L=[];A=[media('R2 / seated silhouette','Seated',14,21,7,x=64,y=62,scale=1.82),media('R2 / seated source mask','Seated mask',14,21,0,x=64,y=62,scale=1.82)]
for name in ['R2 / seated silhouette','R2 / seated source mask']:
 A += [channel(name,'x',[(14,80),(14.65,64),(16.2,64),(17.1,50),(20.5,50),(21,50)]),channel(name,'scale',[(14,1.65),(14.65,1.82),(16.2,1.82),(17.1,1.9),(21,1.9)])]
for word,y,a,size in [('YOUR',27,14,3.3),('OWN',57,14.35,3.9),('WORLD',51,17.05,4.6)]:
 b=17.05 if word!='WORLD' else 21;id='R2 / seated '+word;l=text(id,word,14 if word!='WORLD' else 17,b,x=30 if word!='WORLD' else 50,y=y,size=size,color=INK,width=96)
 if word!='WORLD':l['keys']=keys('x',[(14,7),(a+.55,30),(16.4,30),(17.05,10)])+keys('opacity',[(14,0),(a+.1,1),(16.7,1),(17.05,0)])
 else:
  l['textAnimator']=dict(version=1,unit='character',order='center_out',stagger=70,fromX=0,fromY=.8,fromScale=.35,fromRotation=-30,fromOpacity=0,tracking=.025,rangeStart=0,rangeEnd=100,easing='back_out');l['textProgress']=0;l['keys']=keys('textProgress',[(17,0),(17.9,100)])+keys('y',[(17,60),(18,44),(20.4,44),(21,22)])+keys('opacity',[(17,0),(17.25,1),(20.7,1),(21,0)])
 L.append(l)
# Actual vector geometry with native draw-on and rotation keys.
shape=dict(version=1,closed=False,nodes=[dict(x=4,y=88,**{'in':[0,0],'out':[0,-65]}),dict(x=48,y=7,**{'in':[-30,0],'out':[30,0]}),dict(x=94,y=85,**{'in':[0,-65],'out':[0,0]})],fill=dict(kind='none',color=ACID,endColor=ACID,start=[0,0],end=[100,100]),stroke=dict(color=ACID,width=.55))
ring=dict(id='R2 / open orbit',name='R2 / open orbit',type='artwork',vectorShape=shape,startTime=14,duration=7,x=52,y=58,width=72,height=100,scale=1,rotation=-14,opacity=1,keys=keys('rotation',[(14,-24),(21,18)]))
L.append(ring);A += [channel('R2 / open orbit','strokeEnd',[(14,0),(15.5,100),(20.5,100),(21,0)])]
for id in ['R2 / seated YOUR','R2 / seated OWN','R2 / seated WORLD','R2 / open orbit']:A+=[dict(type='move_layer',targetId=id,beforeId='R2 / seated silhouette')]
write('05 - World behind the performer',L,A)
# Deferred until the source masks have had ordinary shadow controls disabled.
write('06 - Source-bound depth',[],[dict(type='matte',targetId=f'R2 / {s} silhouette',matteSourceId=f'R2 / {s} source mask',mode='luma') for s in ['intro','seated','closing']])
(out/'direction.json').write_text(json.dumps(dict(name='OFF SCRIPT / Cut through',seconds=24,plans=plans,paidCalls=0,authoring='Reviewed numeric art direction, native Studio controls and shared graph only',sourceMasks='Cached CPU input alpha, not product-integrated inference'),indent=2))
print('Revision art direction:',len(plans),'plans')
