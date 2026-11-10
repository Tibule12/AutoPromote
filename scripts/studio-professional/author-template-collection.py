"""Six distinct eight-second native looks; all source slots remain replaceable."""
from pathlib import Path
import copy,json,math
root=Path(__file__).resolve().parents[2];out=root/'reports/studio-template-collection-20261104';base=json.loads((root/'frontend/src/templates/momentum_v1.json').read_text());templates=[];cases=[]
def begin():return [],[]
def key(K,target,prop,points,ease='bezier'):
    K.extend(dict(targetId=target,property=prop,time=round(t,6),value=round(v,7),easing=ease,**({'curve':[.18,.86,.25,1]} if ease=='bezier' else {})) for t,v in points)
def polygon(points):return dict(enabled=True,shape='polygon',path='polygon('+','.join(f'{x}% {y}%' for x,y in points)+')',feather=0,inverted=False)
def video(L,name,a=0,b=8,start=0,**kwargs):
    L.append({**dict(id=name,name=name,type='video',sourceSlot='footage',sourceStartTime=start,startTime=a,duration=b-a,x=50,y=50,width=100,height=100,scale=1,rotation=0,opacity=1,anchorX=50,anchorY=50,mediaFit='cover',bRollMode='pip',frameShape='edge',borderRadius=0,shadow='none',layerShadow=dict(enabled=False),animation=dict(enter='none',exit='none')),**kwargs})
def vector(L,name,points,color,a=0,b=8,width=100,height=100,x=50,y=50,stroke=0,closed=True):
    shape=dict(version=1,closed=closed,nodes=[dict(x=x,y=y,**{'in':[0,0],'out':[0,0]}) for x,y in points],fill=dict(kind='none' if stroke else 'solid',color=color,endColor=color,start=[0,0],end=[100,100]),stroke=dict(color=color,width=stroke))
    L.append(dict(id=name,name=name,type='image',vectorShape=shape,startTime=a,duration=b-a,x=x,y=y,width=width,height=height,scale=1,rotation=0,opacity=1,anchorX=50,anchorY=50,mediaFit='stretch',bRollMode='pip',frameShape='edge',borderRadius=0,shadow='none',layerShadow=dict(enabled=False),animation=dict(enter='none',exit='none')))
def bg(L,color):vector(L,'Backdrop',[(0,0),(100,0),(100,100),(0,100)],color)
def circle(L,name,color,width=43,x=50,y=50,stroke=.6):
    vector(L,name,[(50,1),(99,50),(50,99),(1,50)],color,width=width,height=width*1280/720,x=x,y=y,stroke=stroke)
    for n,(a,b) in zip(L[-1]['vectorShape']['nodes'],[([-27,0],[27,0]),([0,-27],[0,27]),([27,0],[-27,0]),([0,27],[0,-27])]):n['in'],n['out']=a,b
def finish(identity,label,source,L,K,description):
    key(K,'main-video','opacity',[(0,0),(8,0)],'hold');t=copy.deepcopy(base);t.update(templateId=identity,version='1.0.0',label=label,durationTicks=720000,inputSlots=[dict(id='footage',type='video',required=True),dict(id='music',type='audio',required=False)])
    e=t['executionDefinition'];e.update(sequence=[dict(slot='footage',offset=0,duration=8,transitionIn='clean_cut',transitionOut='clean_cut',transitionDuration=.04)],ordinaryMotion=dict(version=1,layers=L,keys=K,groups=[],order=[l['id'] for l in L]),sourceKeyframes=[],sceneActions=[],titles=[],defaultCopy={},directorDescription=description+' Uses one saved source and ordinary editable Studio layers. No model job.',soundCues=[dict(tone='airy_whoosh',time=0,duration=.6,volume=.2),dict(tone='airy_whoosh',time=3.3,duration=.5,volume=.16),dict(tone='airy_whoosh',time=6.4,duration=.6,volume=.18)])
    e['music'].update(volume=55,fadeIn=.1,fadeOut=.5)
    if identity=='living_infinity_v1':
        old=root/'frontend/src/templates/living_infinity_v1.0.0.json'
        if not old.exists():old.write_bytes((root/f'frontend/src/templates/{identity}.json').read_bytes())
        templates.append(json.loads(old.read_text()));t['version']='1.0.1'
    if identity=='editorial_fan_v1':
        old=root/'frontend/src/templates/editorial_fan_v1.0.0.json'
        if not old.exists():old.write_bytes((root/f'frontend/src/templates/{identity}.json').read_bytes())
        templates.append(json.loads(old.read_text()));t['version']='1.0.1'
    (root/f'frontend/src/templates/{identity}.json').write_text(json.dumps(t,indent=2)+'\n');templates.append(t);cases.append(dict(id=identity,version=t['version'],label=label,source=source,layers=len(L),keys=len(K),seconds=8,description=description))

# Mechanical product aperture: live macro watch, concentric traces and a travelling detail lens.
L,K=begin();bg(L,'#090d12');video(L,'Watch atmosphere');L[-1]['opacity']=.2
video(L,'Mechanical aperture',mask=dict(enabled=True,shape='ellipse',feather=0,inverted=False));L[-1].update(width=44,height=78.2222)
key(K,'Mechanical aperture','scale',[(0,.04),(.9,1),(2.8,1),(4.4,1.34),(5.5,1.34),(6.8,2.8),(8,3.4)])
key(K,'Mechanical aperture','rotation',[(0,-32),(1.5,0),(5.5,0),(8,15)])
for i,(width,color) in enumerate([(47,'#b8d6df'),(53,'#334b5b')]):
    name=f'Calibration trace {i}';circle(L,name,color,width=width,stroke=.35 if i else .65);key(K,name,'strokeEnd',[(0,0),(.9+i*.2,100),(5.5,100),(6.8,0)]);key(K,name,'rotation',[(0,-80+i*90),(6.8,100+i*90)],'linear');key(K,name,'opacity',[(0,0),(.6,1),(5.5,1),(6.8,0)])
finish('aperture_product_v1','Aperture — mechanical product','watch',L,K,'A mechanical live-video aperture, calibrated vector traces and a full-frame macro payoff.')

# A portrait editorial fan folds into three tall panels, then a moving sheet peels through.
L,K=begin();bg(L,'#eee6d8')
for i,(x,angle) in enumerate([(24,-11),(50,3),(76,12)]):
    paper=f'Editorial sheet {i}';vector(L,paper,[(0,0),(100,0),(100,100),(0,100)],'#fffcf5',width=29,height=86,x=x)
    clip=f'Editorial live {i}';video(L,clip,x=x,width=27,height=79,start=0)
    for name in [paper,clip]:
        L[-1 if name==clip else -2]['rotation']=angle
        key(K,name,'y',[(0,150),(.65+i*.15,50),(2.7,50),(3.8,49+3*i),(5.3,50),(6.4,50),(7.4,-110)])
        key(K,name,'rotation',[(0,angle+30),(.9+i*.15,angle),(2.7,angle),(4.4,0),(6.3,0),(7.4,-angle)])
        key(K,name,'x',[(0,x),(3,x),(4.4,18+i*32),(6.3,18+i*32),(7.4,18+i*32)])
video(L,'Editorial final',a=6.4,start=0,mediaFit='contain',mask=polygon([(0,0),(0,0),(0,100),(0,100)]))
for i in [1,2]:key(K,'Editorial final',f'maskPoint{i}X',[(6.4,0),(7.2,100),(8,100)])
finish('editorial_fan_v1','Editorial fan — fashion collage','fashion-camaro',L,K,'Three paper-mounted live portraits fan out, reform into an editorial grid and peel into the final shot.')

# Split action across time, with an actual shaped seam and vector trajectories.
L,K=begin();bg(L,'#d9fc32');video(L,'Action base');key(K,'Action base','scale',[(0,1.2),(1,1),(2.9,1),(3.5,1.1),(5.3,1.1),(6.1,1),(8,1)])
video(L,'Delayed strike',mask=polygon([(52,0),(100,0),(100,100),(30,100)]),start=2)
key(K,'Delayed strike','maskPoint0X',[(0,105),(.8,52),(2.8,52),(3.5,35),(5.2,35),(6.5,105),(8,105)])
key(K,'Delayed strike','maskPoint3X',[(0,105),(.8,30),(2.8,30),(3.5,13),(5.2,13),(6.5,105),(8,105)])
key(K,'Delayed strike','opacity',[(0,0),(.7,1),(6.4,1),(6.6,0)])
for i in range(3):
    name=f'Strike slash {i}';vector(L,name,[(5,93),(95,7)],'#d9fc32',width=16+i*3,height=35+i*5,x=33+i*19,stroke=1.8,closed=False)
    key(K,name,'strokeEnd',[(0,0),(1.1+i*.1,100),(2.1,100),(2.5,0),(4.4,0),(4.8,100),(5.8,100),(6.3,0)])
    key(K,name,'x',[(0,25+i*16),(2.5,42+i*16),(4.4,42+i*16),(6.3,60+i*16)])
finish('split_impact_v1','Split impact — sports motion','sports',L,K,'Two genuine action moments split across a travelling diagonal with timed vector strike trajectories.')

# A real moving portrait coastline becomes a fan of six wide graphic postcards.
L,K=begin();bg(L,'#d8eee7')
for i in range(3):
    name=f'Coastal postcard {i}';corners=[[7+i*31,20],[30+i*31,15],[30+i*31,84],[7+i*31,89]]
    video(L,name,start=i*.7,perspective=dict(version=1,corners=corners,sourceRect=[0,0,100,100]))
    key(K,name,'x',[(0,150),(.9+i*.22,50),(3,50),(4.5,50),(6.7,50),(8,-80)])
    key(K,name,'rotation',[(0,20-i*15),(1.4,0),(4.5,(-1)**i*6),(6.7,0),(8,-18)])
    for c,(x,y) in enumerate(corners):
        target=[[0,0],[100,0],[100,100],[0,100]][c]
        key(K,name,f'planeCorner{c}X',[(0,x),(3,x),(5,target[0] if i==1 else x),(6.7,target[0] if i==1 else x)],'linear')
        key(K,name,f'planeCorner{c}Y',[(0,y),(3,y),(5,target[1] if i==1 else y),(6.7,target[1] if i==1 else y)],'linear')
    key(K,name,'opacity',[(0,0),(.5+i*.2,1),(3.2,1),(4.6,1 if i==1 else 0),(8,0)])
finish('coastal_postcards_v1','Coastal postcards — travel','coast',L,K,'Live coastal postcards travel through shared perspective before one opens across the canvas.')

# A vinyl-disc crop carries moving music footage; orbiting vector waves trade foreground/background.
L,K=begin();bg(L,'#060514');video(L,'Concert haze');L[-1]['opacity']=.32
video(L,'Live disc',mask=dict(enabled=True,shape='ellipse',feather=0,inverted=False));L[-1].update(width=43,height=76.4444)
key(K,'Live disc','scale',[(0,.05),(.9,1),(2.4,1.12),(3.4,.9),(4.4,1.15),(5.5,1),(7.1,1),(8,.05)])
key(K,'Live disc','rotation',[(0,-15),(3.5,14),(5,-12),(7.2,0),(8,45)])
for i in range(3):
    name=f'Sound orbit {i}';circle(L,name,['#b6ff33','#7c38ef','#ff53a2'][i],width=48+i*8,stroke=.6)
    key(K,name,'scale',[(0,.2),(.8+i*.14,1),(3,1.06),(4,1),(5,1.08),(6,1),(7.3,1),(8,.1)])
    key(K,name,'strokeStart',[(0,0),(8,25+i*15)],'linear');key(K,name,'strokeEnd',[(0,0),(1.2,80-i*10),(6.8,80-i*10),(8,0)])
    key(K,name,'strokeOffset',[(0,i*25),(8,180+i*25)],'linear');key(K,name,'rotation',[(0,i*60),(8,i*60+120)],'linear')
finish('vinyl_pulse_v1','Vinyl pulse — music artwork','music',L,K,'Moving footage becomes a live vinyl disc, with independent coloured vector orbits and timed scale pulses.')

# No added words: one infinity glyph is an editable native type matte.
L,K=begin();bg(L,'#09090c');video(L,'Scarlet atmosphere');L[-1]['opacity']=.18
L.append(dict(id='Infinity glyph',name='Cross glyph',type='text',text='X',x=50,y=50,width=96,fontFamily='Inter',fontWeight=900,textAlign='center',color='#ffffff',bg='transparent',shadow='none',scale=8.2,rotation=0,opacity=1,anchorX=50,anchorY=50,startTime=0,duration=8,animation=dict(enter='none',exit='none')))
video(L,'Living infinity',trackMatte=dict(mode='alpha',sourceLayerId='Infinity glyph'))
for name in ['Infinity glyph','Living infinity']:
    key(K,name,'rotation',[(0,-35),(1.4,0),(3.5,0),(5,15),(6.5,0),(8,-15)])
key(K,'Infinity glyph','scale',[(0,1.8),(1.2,8.2),(3.8,8.2),(5.5,13),(7,20),(8,26)])
key(K,'Living infinity','opacity',[(0,0),(.45,1),(7.3,1),(8,0)])
finish('living_infinity_v1','Living type — cinematic X','cinema',L,K,'A live dancer fills an editable X glyph; the glyph opens into a cinematic full-frame finish without added words.')

registry=json.loads((root/'config/creative-templates/registry.v1.json').read_text());ids={t['templateId'] for t in templates};registry['templates']=[t for t in registry['templates'] if t['templateId'] not in ids]+templates;(root/'config/creative-templates/registry.v1.json').write_text(json.dumps(registry,indent=2)+'\n');(out/'collection.json').write_text(json.dumps(cases,indent=2)+'\n');print('Registered six native looks:',[(c['id'],c['layers'],c['keys']) for c in cases])
