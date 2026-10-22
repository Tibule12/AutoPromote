#!/usr/bin/env python3
"""Author interchange assets. Normal Studio import/edit/export owns the film."""
import copy, json, math, random, struct, wave
from pathlib import Path
from PIL import ImageFont

ROOT=Path('reports/studio-five-words-20261016');A=ROOT/'assets';A.mkdir(parents=True,exist_ok=True)
PAPER,INK,BLUE,LIME='#f6f0e5','#10161b','#234eff','#bafb4e'
font=ImageFont.truetype('python_media_worker/assets/fonts/Inter-Black.ttf',36)
layers=[];curve=[.16,1,.3,1];spring=[.2,1.16,.32,1]
def key(l,p,points):
    for t,v,*extra in points:
        easing=extra[0] if extra else 'bezier'
        l['keys'].append(dict(property=p,time=round(t*90000)/90000,value=v,easing=easing,**({'curve':extra[1] if len(extra)>1 else curve} if easing=='bezier' else {})))
def text(name,copy,start,end,x=50,y=50,scale=4.8,color=PAPER,**more):
    l=dict(id=name,name=name,type='text',text=copy,startTime=start,duration=round((end-start)*90000)/90000,x=x,y=y,scale=scale,color=color,rotation=0,opacity=1,width=95,fontWeight=900,textAlign='center',keys=[]);l.update(more);layers.append(l);return l
def art(name,svg,start,end,x=50,y=50,width=100,height=100):
    l=dict(id=name,name=name,type='artwork',svg=svg,startTime=start,duration=round((end-start)*90000)/90000,x=x,y=y,width=width,height=height,scale=1,rotation=0,opacity=1,keys=[]);layers.append(l);return l
def rect(c,w=1280,h=720):return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}"><rect width="{w}" height="{h}" fill="{c}"/></svg>'
def centers(word,s):return [50+(font.getlength(word[:i])+font.getlength(c)/2-font.getlength(word)/2)*s/1280*100 for i,c in enumerate(word)]
def poster(prefix,start,end,animated):
    for i,(words,x,y,s) in enumerate([('MAKE',40,31,3.1),('EVERY FRAME',50,50,2.1),('FEEL ALIVE',53,69,2.5)]):
        l=text(f'{prefix} / row {i+1}',words,start,end,x=x,y=y,scale=s,color=INK)
        if animated:
            key(l,'x',[(start,x-12 if i%2 else x+12),(start+.45+i*.07,x,'bezier',spring),(end,x,'hold')])
            key(l,'opacity',[(start,0,'linear'),(start+.22+i*.06,1,'linear'),(end,1,'hold')])
        else:
            key(l,'scale',[(start,s),(start+.6,s*1.035),(end,s,'ease_in')])

art('00 / paper',rect(PAPER),0,16)
# One shared parent enlarges the native type. The stages animate ordinary
# independent children, avoiding several huge simultaneous group canvases.
poster('01 / opening promise',0,1.15,False)
l=art('01 / blue wipe',rect(BLUE),.8,5.9,width=100,height=100)
key(l,'x',[(.8,0),(1.3,50,'ease_in'),(5.65,50,'hold'),(5.9,100,'ease_in')])
key(l,'scale',[(.8,.1),(1.3,1),(5.9,1,'hold')])

for i,(c,x) in enumerate(zip('MAKE',centers('MAKE',4.8))):
    t=1.05+i*.055;l=text(f'02 / MAKE {i+1}',c,t,3.75,x=x)
    key(l,'x',[(t,50),(1.65+i*.045,x,'bezier',spring),(3.05,x,'hold'),(3.75,max(5,x-25),'ease_in')])
    key(l,'y',[(t,10 if i%2 else 90),(1.65+i*.045,50,'bezier',spring),(3.05,50,'hold'),(3.75,10 if i%2 else 90,'ease_in')])
    key(l,'rotation',[(t,(-1)**i*70),(1.65+i*.045,0),(3.05,0,'hold'),(3.75,(-1)**i*65,'ease_in')])
    key(l,'scale',[(t,.1),(1.65+i*.045,4.8,'bezier',spring),(3.75,4.8,'hold')])
l=art('02 / tracking bar',rect(LIME,1280,6),1.2,3.45,y=66,width=42,height=1)
key(l,'scale',[(1.2,.1),(1.7,1),(2.9,1,'hold'),(3.45,.1,'ease_in')])

for i,y in enumerate([32,68]):
    l=text(f'03 / EVERY outline {i+1}','EVERY',3.55,5.65,y=y,scale=4,color=BLUE,strokeWidth=2,strokeColor=PAPER)
    key(l,'x',[(3.55,40 if i==0 else 60),(4.1,50),(5.1,50,'hold'),(5.65,60 if i==0 else 40,'ease_in')])
    key(l,'opacity',[(3.55,0,'linear'),(3.85,.6,'linear'),(5.1,.6,'hold'),(5.65,0,'linear')])
for i,(c,x) in enumerate(zip('EVERY',centers('EVERY',4.5))):
    t=3.3+i*.045;l=text(f'03 / EVERY {i+1}',c,t,6.05,x=x,scale=4.5)
    key(l,'x',[(t,50+(i-2)*5),(3.95+i*.04,x),(5.4,x,'hold'),(6.05,50,'ease_in')])
    key(l,'y',[(t,50+(i-2)*18),(3.95+i*.04,50),(4.45+i*.035,43),(4.85+i*.035,50),(5.4,50,'hold'),(6.05,50,'ease_in')])
    key(l,'rotation',[(t,-90),(3.95+i*.04,0),(5.4,0,'hold'),(6.05,90,'ease_in')])
    key(l,'scale',[(t,.1),(3.95+i*.04,4.5,'bezier',spring),(5.4,4.5,'hold'),(6.05,.1,'ease_in')])

# A frame builds around the word, then opens like a film gate into FEEL.
l=art('04 / frame gate',f'<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect x="30" y="30" width="1220" height="660" fill="none" stroke="{INK}" stroke-width="6"/></svg>',5.6,9.35,width=47,height=47)
key(l,'scale',[(5.6,.1),(6.35,1,'bezier',spring),(8.55,1,'hold'),(9.35,2.4,'ease_in')])
key(l,'opacity',[(5.6,0,'linear'),(5.95,1,'linear'),(8.65,1,'hold'),(9.35,0,'linear')])
for i,(c,x) in enumerate(zip('FRAME',centers('FRAME',4.6))):
    t=5.8+i*.05;l=text(f'04 / FRAME {i+1}',c,t,9.2,x=x,scale=4.6,color=INK)
    key(l,'y',[(t,26 if i%2 else 74),(6.55+i*.03,50,'bezier',spring),(8.5,50,'hold'),(9.2,50)])
    key(l,'rotation',[(t,(-1)**i*90),(6.55+i*.03,0),(8.5,0,'hold'),(9.2,(-1)**i*25,'ease_in')])
    key(l,'scale',[(t,.1),(6.55+i*.03,4.6),(8.5,4.6,'hold'),(9.2,.1,'ease_in')])
l=art('05 / lime field',rect(LIME),8.9,12.35)
key(l,'scale',[(8.9,.1),(9.25,1,'ease_in'),(12.35,1,'hold')])
key(l,'rotation',[(8.9,45),(9.25,0),(12.35,0,'hold')])
feel_start=len(layers)
for i,(c,x) in enumerate(zip('FEEL',centers('FEEL',4.8))):
    t=9+i*.045;l=text(f'05 / FEEL {i+1}',c,t,12.5,x=x,color=INK)
    key(l,'x',[(t,50),(9.65+i*.04,x),(11.85,x,'hold'),(12.5,50)])
    key(l,'y',[(t,80),(9.65+i*.04,50,'bezier',spring),(10.05+i*.06,37),(10.4+i*.06,50),(10.8+i*.06,60),(11.15+i*.06,50),(11.85,50,'hold'),(12.5,50)])
    key(l,'rotation',[(t,(-1)**i*45),(9.65+i*.04,0),(10.05+i*.06,(-1)**i*14),(10.4+i*.06,0),(11.85,0,'hold'),(12.5,(-1)**i*80,'ease_in')])
    key(l,'scale',[(t,.1),(9.65+i*.04,4.8),(11.85,4.8,'hold'),(12.5,.1,'ease_in')])
trails=[]
for l in layers[feel_start:]:
    trail=copy.deepcopy(l);trail['id']+=' / offset ink';trail['name']=trail['id'];trail['color']=BLUE;trail['opacity']=.7;trail['x']+=1.1;trail['y']+=1.6
    for k in trail['keys']:
        if k['property']=='x':k['value']+=1.1
        if k['property']=='y':k['value']+=1.6
    trails.append(trail)
layers[feel_start:feel_start]=trails
for i,(c,x) in enumerate(zip('ALIVE',centers('ALIVE',4.6))):
    t=12.1+i*.045;l=text(f'06 / ALIVE {i+1}',c,t,14.05,x=x,scale=4.6,color=BLUE)
    key(l,'x',[(t,50),(12.75+i*.03,x,'bezier',spring),(13.55,x,'hold'),(14.05,x)])
    key(l,'y',[(t,90 if i%2 else 10),(12.75+i*.03,50,'bezier',spring),(13.55,50,'hold'),(14.05,70 if i%2 else 30)])
    key(l,'rotation',[(t,(-1)**i*120),(12.75+i*.03,0),(13.55,0,'hold'),(14.05,(-1)**i*15)])
    key(l,'opacity',[(t,0,'linear'),(t+.15,1,'linear'),(13.65,1,'hold'),(14.05,0,'linear')])
poster('07 / final resolve',13.65,16,True)
l=art('07 / blue underline',rect(BLUE,1280,7),13.85,16,y=74.5,width=45,height=1)
key(l,'scale',[(13.85,.1),(14.5,1,'bezier',spring),(16,1,'hold')])

group=dict(id='Words and frame details',name='Words and frame details',layerIds=[l['id'] for l in layers[1:]],startTime=0,duration=16,
    keys=[dict(property='scale',time=0,value=1.8,easing='hold'),dict(property='scale',time=16,value=1.8,easing='hold')])
spec=dict(format='autopromote-graphics',version=1,name='MAKE EVERY FRAME FEEL ALIVE',width=1280,height=720,duration=16,layers=layers,groups=[group])
(A/'five-words.graphics.json').write_text(json.dumps(spec,indent=2)+'\n')
summary=dict(name=spec['name'],words=5,seconds=16,layers=len(layers),groups=1,keys=sum(len(l['keys']) for l in layers)+2,
    concept='Promise poster, constructed MAKE, elastic EVERY, a literal film gate for FRAME, a travelling FEEL wave and leaping ALIVE letters resolving into the complete five-word message.',nativeImportRequired=True)
(ROOT/'design.json').write_text(json.dumps(summary,indent=2)+'\n')

rate=48000;n=16*rate;left=[0.0]*n;right=[0.0]*n;rng=random.Random(5161026)
def sound(at,duration,fn,level=1,pan=0):
    for j in range(round(duration*rate)):
        i=round(at*rate)+j
        if 0<=i<n:
            v=fn(j/rate)*level;left[i]+=v*(1-.25*max(pan,0));right[i]+=v*(1+.25*min(pan,0))
def hit(t,level=1):
    sound(t,.65,lambda s:math.sin(2*math.pi*(48*s+2.3*(1-math.exp(-25*s))))*math.exp(-8*s),.55*level)
    sound(t,.11,lambda s:rng.uniform(-1,1)*math.exp(-45*s),.17*level)
def sweep(t,d=.4,pan=0):sound(t,d,lambda s:(rng.uniform(-1,1)*.15+math.sin(2*math.pi*(170*s+500*s*s/d))*.035)*math.sin(math.pi*s/d)**2,.7,pan)
for t,g in [(0,.75),(1.2,1),(3.45,.9),(5.9,1),(9.15,1),(12.2,1.1),(13.95,.9)]:hit(t,g)
for t in [.85,3.05,5.35,8.65,11.75,13.5]:sweep(t,.5)
for base in [1.55,3.85,6.4,9.5,12.65]:
    for i in range(5):
        f=[146.83,220,293.66,329.63,440][i]
        sound(base+i*.07,.22,lambda s,f=f:(math.sin(2*math.pi*f*s)+.25*math.sin(2*math.pi*2*f*s))*math.exp(-16*s),.065,(-1)**i*.7)
for i in range(8):
    f=[146.83,220,293.66,440][i%4];sound(14+i*.22,.4,lambda s,f=f:math.sin(2*math.pi*f*s)*math.exp(-8*s),.09,(-1)**i*.5)
peak=max(max(map(abs,left)),max(map(abs,right)))
with wave.open(str(A/'five-words-source.wav'),'wb') as out:
    out.setnchannels(2);out.setsampwidth(2);out.setframerate(rate)
    for i,(a,b) in enumerate(zip(left,right)):
        gain=.82/peak*min(1,i/(rate*.008),(n-i)/(rate*.12));out.writeframesraw(struct.pack('<hh',round(a*gain*32767),round(b*gain*32767)))
print(json.dumps(summary))
