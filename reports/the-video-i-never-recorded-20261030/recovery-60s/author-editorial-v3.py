"""Editable native graphic decisions and static artwork, no video effects."""
from pathlib import Path
import json
assets=Path(__file__).parent/'edit-assets'
white='#F1EDE4';muted='#A2A6AB';amber='#D5AA68';ink='#101318'
def key(p,t,v,e='bezier'):
 d=dict(property=p,time=t,value=v,easing=e)
 if e=='bezier':d['curve']=[.18,.78,.2,1]
 return d
def fade(a,b,d=.22):return[key('opacity',a,0),key('opacity',a+d,1),key('opacity',b-d,1),key('opacity',b-1/24,0)]
def title(name,text,a,b,x,y,scale=1,color=white,weight=600,animated=False):
 layer=dict(id=name,name=name,type='text',text=text,startTime=a,duration=b-a,x=x,y=y,width=90,scale=scale,rotation=0,opacity=1,fontWeight=weight,color=color,textAlign='center',keys=fade(a,b))
 if animated:
  layer.update(textProgress=0,textAnimator=dict(version=1,unit='character',order='forward',stagger=48,fromX=0,fromY=.8,fromScale=1,fromRotation=0,fromOpacity=0,tracking=.1,rangeStart=0,rangeEnd=100,easing='ease_out'))
  layer['keys']+=[key('textProgress',a,0,'linear'),key('textProgress',a+.58,100,'linear')]
 return layer
def artwork(name,body,a,b,x,y,w,h,keys=None):
 return dict(id=name,name=name,type='artwork',svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">{body}</svg>',startTime=a,duration=b-a,x=x,y=y,width=w,height=h,scale=1,rotation=0,opacity=1,keys=keys or [])
def write(file,layers):
 (assets/file).write_text(json.dumps(dict(format='autopromote-graphics',version=1,name='The Video I Never Recorded / Editorial V3',width=1920,height=1080,duration=16,layers=layers,groups=[]),indent=2)+'\n')
write('editorial-v3-background.graphics.json',[
 artwork('Recording-stage','<rect width="1920" height="1080" fill="#101318"/>',2.5,7.5,50,50,100,100),
 artwork('Identity-stage','<rect width="1920" height="1080" fill="#101318"/>',8.25,14.65,50,50,100,100),
])
layers=[
 title('Discovery-time','08:42',.3,2.3,13,82,1.15,white,600,True),
 title('Discovery-context','THIS MORNING',.75,2.3,14,89,.4,amber,400),
 title('Scene-index','01 / THE RECORDING',3.05,7.4,21,20,.4,amber,400),
 title('Unspoken-one','NEVER',5.62,7.4,20,43,2.35,white,800,True),
 title('Unspoken-two','SAID.',5.88,7.4,18,59,2.35,white,800,True),
 title('Recording-caption','A VIDEO OF MYSELF',3.05,5.6,20,43,.84,white,600,True),
 title('Recording-evidence','FICTIONAL RECONSTRUCTION',3.25,7.4,69,81,.34,muted,400),
 title('Identity-index','02 / THE RECONSTRUCTION',8.5,14.55,25,15,.4,amber,400),
 title('Face-label','FACE',8.36,14.55,18,33,1.65,white,800,True),
 title('Face-mine','MINE',8.92,14.55,18,41,.4,amber,600),
 title('Voice-label','VOICE',10.34,14.55,20,52,1.65,white,800,True),
 title('Voice-mine','MINE',10.9,14.55,18,60,.4,amber,600),
 title('Room-label','ROOM',12.68,14.55,20,71,1.65,white,800,True),
 title('Room-match','EXACTLY RIGHT',13.65,14.55,20,79,.4,amber,600),
 title('Recording-id','THE SAME PERSON. THE SAME ROOM.',9,14.55,69,86,.34,muted,400),
 title('Film-name','THE VIDEO I NEVER RECORDED',15.12,16,50,84,.72,white,600),
 title('Disclosure','FICTIONAL DRAMATIZATION',0,16,50,97,.29,muted,400),
]
# Native alpha/position keys draw short measured editorial rules; the static
# SVG contains no finished frames, motion or generated effects.
for i,(a,y) in enumerate([(8.9,43.5),(10.9,62.5),(13.2,81.5)]):
 layers.append(artwork(f'Evidence-rule-{i}','<path d="M0 540H1920" stroke="#D5AA68" stroke-width="14"/>',a,14.55,20,y,25,1,
  [key('opacity',a,0),key('opacity',a+.3,.55),key('opacity',14.3,.55),key('opacity',14.55-1/24,0),key('scale',a,.1),key('scale',a+.48,1)]))
 layers[-1]['svg']='<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="24" viewBox="0 0 1920 24"><path d="M0 12H1920" stroke="#D5AA68" stroke-width="4"/></svg>'
write('editorial-v3-titles.graphics.json',layers)
(assets/'editorial-v3-direction.json').write_text(json.dumps({'seconds':16,'nativeGraphics':len(layers)+2,'clock':False,'sourceTriggers':{'video':2.5,'never':5.62,'said':5.88,'face':8.36,'voice':10.34,'room':12.68},'palette':[ink,white,amber],'design':'Editorial reconstruction with restrained amber evidence typography and actual perspective video. Original speech unchanged.'},indent=2)+'\n')
print(json.dumps({'graphicLayers':len(layers)+2,'keys':sum(len(x['keys']) for x in layers)}))
