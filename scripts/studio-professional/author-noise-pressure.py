#!/usr/bin/env python3
"""Source choreography and original sound design; ordinary Studio owns playback."""
import json,math,random,struct,wave
from pathlib import Path
from PIL import ImageFont
ROOT=Path('reports/studio-noise-pressure-20261016');ASSETS=ROOT/'assets';ASSETS.mkdir(parents=True,exist_ok=True)
INK,WHITE,ORANGE='#111113','#f4efe7','#ff4b24'
FONT=ImageFont.truetype('python_media_worker/assets/fonts/Inter-Black.ttf',36)
layers=[];groups=[];curve=[.16,1,.3,1];snap=[.18,1.2,.3,1]
def key(layer,prop,points):
    for point in points:
        t,v=point[:2];e=point[2] if len(point)>2 else 'bezier'
        layer['keys'].append(dict(property=prop,time=round(t*90000)/90000,value=v,easing=e,**({'curve':point[3] if len(point)>3 else curve} if e=='bezier' else {})))
def text(id,copy,start,end,x=50,y=50,scale=4.8,color=WHITE,**extra):
    l=dict(id=id,name=id,type='text',text=copy,startTime=start,duration=round((end-start)*90000)/90000,x=x,y=y,scale=scale,color=color,rotation=0,opacity=1,width=95,fontWeight=900,textAlign='center',keys=[]);l.update(extra);layers.append(l);return l
def art(id,svg,start,end,x=50,y=50,width=100,height=100):
    l=dict(id=id,name=id,type='artwork',svg=svg,startTime=start,duration=round((end-start)*90000)/90000,x=x,y=y,width=width,height=height,scale=1,rotation=0,opacity=1,keys=[]);layers.append(l);return l
def rect(color,w=1280,h=720):return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}"><rect width="{w}" height="{h}" fill="{color}"/></svg>'
def circle(color,outline=False):return f'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><circle cx="200" cy="200" r="194" fill="{"none" if outline else color}" stroke="{color}" stroke-width="3"/></svg>'
def mask(top,bottom):return dict(enabled=True,shape='polygon',path=f'polygon(0% {top}%, 100% {top}%, 100% {bottom}%, 0% {bottom}%)',feather=0,inverted=False)
def group(id,children,start,end,zoom=1,**extra):
    l=dict(id=id,name=id,layerIds=[c['id'] for c in children],startTime=start,duration=end-start,keys=[]);l.update(extra);groups.append(l)
    key(l,'scale',[(start,zoom),(end,zoom,'hold')]);return l
def centers(word,size):return [50+(FONT.getlength(word[:i])+FONT.getlength(c)/2-FONT.getlength(word)/2)*size/1280*100 for i,c in enumerate(word)]

art('00 · Ink field',rect(INK),0,14)
l=text('01 · SILENCE.','SILENCE.',0,1.35,y=47,scale=.75,fontWeight=600)
key(l,'opacity',[(0,0,'linear'),(.3,.8,'linear'),(.85,.8,'hold'),(1.35,0,'linear')])
l=art('01 · Signal line',rect(WHITE,1280,3),0,1.6,y=54,width=80,height=1)
key(l,'scale',[(0,.1),(.6,1),(1.1,.1),(1.6,.1,'hold')]);key(l,'opacity',[(0,0,'linear'),(.3,.5,'linear'),(1.2,.5,'hold'),(1.6,0,'linear')])
l=art('01 · Signal seed',circle(ORANGE),0,1.75,y=54,width=1.8,height=3.2)
key(l,'scale',[(0,.25),(.7,.25,'hold'),(1.15,1),(1.65,4)]);key(l,'opacity',[(0,1,'hold'),(1.4,1,'hold'),(1.75,0,'linear')])

# The same editable word rises through a fixed local group aperture. Its exit
# becomes a deliberate whip into the next word, rather than another pop-in.
make=[]
for i,(c,x) in enumerate(zip('MAKE',centers('MAKE',4.6))):
    start=1.25+i*.065;l=text(f'02 · MAKE {i+1} / {c}',c,start,3.85,x=x,scale=4.6)
    key(l,'y',[(start,92),(1.75+i*.065,50,'bezier',snap),(2.5,50,'hold'),(2.7+i*.035,47),(3.0,50),(3.85,50,'hold')])
    key(l,'rotation',[(start,(i-1.5)*8),(1.75+i*.065,0),(3.85,0,'hold')]);make.append(l)
g=group('02 · MAKE / shutter',make,1.25,3.85,1.65,mask=mask(32,68));g['keys']=[]
key(g,'scale',[(1.25,1.65),(3,1.65,'hold'),(3.85,2,'ease_in')]);key(g,'rotation',[(1.25,0),(3,0,'hold'),(3.85,-90,'ease_in')]);key(g,'x',[(1.25,0),(3,0,'hold'),(3.85,-40,'ease_in')])
l=art('02 · Reveal rail',rect(ORANGE,1280,4),1.25,3.4,y=72,width=68,height=1)
key(l,'scale',[(1.25,.1),(1.8,1),(2.9,1,'hold'),(3.4,.1,'ease_in')]);key(l,'opacity',[(1.25,0,'linear'),(1.55,1,'linear'),(3.1,1,'hold'),(3.4,0,'linear')])

l=art('03 · Orbit guide',circle(ORANGE,True),3.55,4.65,width=26,height=46.2222)
key(l,'scale',[(3.55,.2),(3.95,1.2),(4.65,1.4)]);key(l,'opacity',[(3.55,0,'linear'),(3.8,.65,'linear'),(4.3,.3,'linear'),(4.65,0,'linear')])
some=[]
for i,(c,x) in enumerate(zip('SOME',centers('SOME',4.3))):
    start=3.55+i*.035;angle=math.radians(225-i*90);mid=angle+math.radians(80)
    l=text(f'03 · SOME {i+1} / {c}',c,start,5.65,x=x,scale=4.3)
    key(l,'x',[(start,50+32*math.cos(angle)),(3.95+i*.035,50+15*math.cos(mid)),(4.4,x),(5.65,x,'hold')])
    key(l,'y',[(start,50+40*math.sin(angle)),(3.95+i*.035,50+20*math.sin(mid)),(4.4,50),(5.65,50,'hold')])
    key(l,'rotation',[(start,((225-i*90+90+180)%360)-180),(3.95+i*.035,30-i*15),(4.4,0),(5.65,0,'hold')]);some.append(l)
g=group('03 · SOME / compression',some,3.55,5.65,1.5);g['keys']=[]
key(g,'scale',[(3.55,1.5),(4.6,1.5,'hold'),(5.65,.1,'ease_in')]);key(g,'rotation',[(3.55,0),(4.6,0,'hold'),(5.65,120,'ease_in')])
for i in range(2):
    l=art(f'03 · Pressure rail {i+1}',rect(ORANGE,1280,4),3.7,5.65,y=15 if i==0 else 85,width=78,height=1)
    key(l,'y',[(3.7,15 if i==0 else 85),(4.5,28 if i==0 else 72),(5.2,48 if i==0 else 52),(5.65,50)])
    key(l,'scale',[(3.7,1),(5.2,1,'hold'),(5.65,.1,'ease_in')]);key(l,'opacity',[(3.7,0,'linear'),(4,1,'linear'),(5.4,1,'hold'),(5.65,0,'linear')])
l=art('03 · Pressure core',circle(ORANGE),5.2,5.95,width=2,height=3.5556)
key(l,'scale',[(5.2,.1),(5.55,1),(5.95,3)]);key(l,'opacity',[(5.2,0,'linear'),(5.5,1,'linear'),(5.7,1,'hold'),(5.95,0,'linear')])

for i in range(3):
    start=5.5+i*.13;end=6.6+i*.13;l=art(f'04 · Shock ring {i+1}',circle(ORANGE,True),start,end,width=25,height=44.4444)
    key(l,'scale',[(start,.1),(end,2.9,'ease_out')]);key(l,'opacity',[(start,0,'linear'),(start+.1,.8-i*.15,'linear'),(end,0,'linear')])
noise=[]
for i,(top,bottom,offset,dy) in enumerate([(0,38.5,-8,-2),(38,55.5,12,0),(55,100,-4,2)]):
    l=text(f'04 · NOISE / band {i+1}','NOISE',5.5,8.7,color=ORANGE if i==1 else WHITE,mask=mask(top,bottom))
    key(l,'x',[(5.5,50),(6.15,50,'hold'),(6.3,50+offset,'ease_in'),(6.5,50-offset*.7),(6.68,50+offset*.4),(6.9,50),(7.2,50,'hold'),(7.45,50+offset*1.3,'ease_in'),(7.8,50),(8.2,50,'hold'),(8.7,50+offset*3,'ease_in')])
    key(l,'y',[(5.5,50),(6.15,50,'hold'),(6.3,50+dy),(6.9,50),(7.2,50,'hold'),(7.45,50+dy),(7.8,50),(8.2,50,'hold'),(8.7,50+dy*4,'ease_in')])
    key(l,'rotation',[(5.5,0),(7.2,0,'hold'),(7.45,[-6,3,8][i]),(7.8,0),(8.2,0,'hold'),(8.7,[-24,12,32][i],'ease_in')]);noise.append(l)
g=group('04 · NOISE / fracture',noise,5.5,8.7,1.65);g['keys']=[]
key(g,'scale',[(5.5,.1),(5.85,1.8,'bezier',snap),(6.05,1.65),(8.7,1.65,'hold')])

# The O's counter becomes the expanding iris; the resulting orange field
# reveals an echo wall before its typography resolves into the hero line.
o=50+(centers('NOISE',4.8)[1]-50)*1.65
l=art('05 · Orange iris',circle(ORANGE),8,9,x=o,width=32,height=56.8889)
key(l,'scale',[(8,.1),(8.25,.1,'hold'),(9,5,'ease_in')])
art('05 · Orange field',rect(ORANGE),8.95,14)
wall=[]
for i,y in enumerate([12,31,50,69,88]):
    l=text(f'05 · Echo wall row {i+1}','NOISE NOISE',8.65,10.1,y=y,scale=3.8,color=INK if i%2==0 else ORANGE,
        **({} if i%2==0 else {'strokeWidth':1.5,'strokeColor':INK}))
    key(l,'x',[(8.65,40 if i%2 else 60),(9.2,50),(10.1,50,'hold')]);wall.append(l)
g=group('05 · Echo wall / pullback',wall,8.65,10.1,1);g['keys']=[]
key(g,'scale',[(8.65,2),(9.2,1),(9.55,1,'hold'),(10.1,.55,'ease_in')]);key(g,'rotation',[(8.65,-15),(9.2,0),(10.1,0,'hold')]);key(g,'opacity',[(8.65,1),(9.55,1,'hold'),(10.1,0,'ease_in')])

hero=[]
for i,(c,x) in enumerate(zip('NOISE',centers('NOISE',4.8))):
    start=9.8+i*.05;l=text(f'06 · NOISE {i+1} / {c}',c,start,13.55,x=x,y=52,color=INK)
    key(l,'x',[(start,50),(10.3+i*.03,x),(12.8,x,'hold'),(13.55,50,'ease_in')])
    key(l,'y',[(start,70),(10.3+i*.03,52),(12.8,52,'hold'),(13.55,50,'ease_in')])
    key(l,'rotation',[(start,(i-2)*30),(10.3+i*.03,0),(12.8,0,'hold'),(13.55,(i-2)*45,'ease_in')])
    key(l,'scale',[(start,.1),(10.3+i*.03,4.8,'bezier',snap),(12.8,4.8,'hold'),(13.55,.1,'ease_in')]);hero.append(l)
group('06 · NOISE / resolve',hero,9.8,13.55,1.65)
l=text('06 · MAKE SOME','MAKE SOME',9.9,13.1,y=29,scale=1.7,color=INK)
key(l,'y',[(9.9,40),(10.5,29),(12.8,29,'hold'),(13.1,36,'ease_in')]);key(l,'opacity',[(9.9,0,'linear'),(10.25,1,'linear'),(12.8,1,'hold'),(13.1,0,'linear')])
l=text('06 · YOUR VOICE. YOUR RULES.','YOUR VOICE. YOUR RULES.',10.7,13.1,y=81,scale=.7,color=INK,fontWeight=600)
key(l,'opacity',[(10.7,0,'linear'),(11,1,'linear'),(12.8,1,'hold'),(13.1,0,'linear')])
l=art('06 · Hero period',circle(INK),10.2,13.5,x=86,y=62,width=1.8,height=3.2)
key(l,'scale',[(10.2,.1),(10.5,1,'bezier',snap),(13,1,'hold'),(13.5,1,'hold')]);key(l,'x',[(10.2,86),(13,86,'hold'),(13.5,50,'ease_in')]);key(l,'y',[(10.2,62),(13,62,'hold'),(13.5,50,'ease_in')])
l=art('07 · Closing ink iris',circle(INK),13.35,14,x=86,y=62,width=32,height=56.8889)
key(l,'scale',[(13.35,.1),(14,5,'ease_in')]);key(l,'x',[(13.35,86),(14,50,'ease_in')]);key(l,'y',[(13.35,62),(14,50,'ease_in')]);key(l,'opacity',[(13.35,0,'linear'),(13.42,1,'linear')])
l=art('07 · Signal returns',circle(ORANGE),13.85,14,y=54,width=1.8,height=3.2)
key(l,'scale',[(13.85,.1),(14,.25)]);key(l,'opacity',[(13.85,0,'linear'),(14,1,'linear')])

spec=dict(format='autopromote-graphics',version=1,name='MAKE SOME NOISE — pressure cut',width=1280,height=720,duration=14,layers=layers,groups=groups)
ids=[l['id'] for l in layers]
for g in groups:
    indices=[ids.index(i) for i in g['layerIds']];assert indices==list(range(min(indices),max(indices)+1)),g['name']
    for l in layers:
        for k in l['keys']:assert l['startTime']-1e-5<=k['time']<=l['startTime']+l['duration']+1e-5,(l['id'],k)
(ASSETS/'noise-pressure.graphics.json').write_text(json.dumps(spec,indent=2)+'\n')
(ROOT/'design.json').write_text(json.dumps(dict(name=spec['name'],duration=14,layers=len(layers),groups=len(groups),keys=sum(len(l['keys']) for l in layers+groups),maskedTextBands=3,maskedRevealGroups=1,concept='Silence becomes pressure. The word rises through a shutter, compresses into a core, fractures into three editable text bands, expands into an echo wall, then resolves and returns to the opening signal.',palette=[INK,WHITE,ORANGE],nativeImportRequired=True),indent=2)+'\n')

rate=48000;count=rate*14;left=[0.0]*count;right=[0.0]*count;rng=random.Random(1610262)
def sound(at,duration,fn,level=1,pan=0):
    start=round(at*rate)
    for j in range(round(duration*rate)):
        if 0<=start+j<count:
            v=fn(j/rate)*level;left[start+j]+=v*(1-.3*max(0,pan));right[start+j]+=v*(1+.3*min(0,pan))
def impact(at,level=1):
    sound(at,1.15,lambda s:(math.sin(2*math.pi*(38*s+2.8*(1-math.exp(-20*s))))*.7+math.sin(2*math.pi*76*s)*.12)*math.exp(-7*s),level)
    sound(at,.22,lambda s:rng.uniform(-1,1)*math.exp(-30*s),level*.25)
def whoosh(at,duration,level=1,pan=0):
    sound(at,duration,lambda s:rng.uniform(-1,1)*math.sin(math.pi*s/duration)**2*.17+math.sin(2*math.pi*(160*s+500*s*s/duration))*math.sin(math.pi*s/duration)**2*.04,level,pan)
sound(0,14,lambda s:.006*math.sin(2*math.pi*48*s))
sound(.12,.05,lambda s:math.sin(2*math.pi*1300*s)*math.exp(-100*s),.07)
impact(1.25,.75);whoosh(3.1,.65,.8,-.6)
for i,t in enumerate([4,4.35,4.65,4.9,5.1,5.25,5.36,5.43]):
    sound(t,.06,lambda s:math.sin(2*math.pi*700*s)*math.exp(-70*s)+rng.uniform(-1,1)*math.exp(-100*s),.035+i*.009,(-1)**i*.6)
sound(4.4,1.1,lambda s:math.sin(2*math.pi*(45*s+70*s*s))*s/1.1*.12)
impact(5.5,1.2)
for t,pan in [(6.3,-.8),(6.5,.8),(6.68,-.3),(7.45,.8)]:
    sound(t,.085,lambda s:(rng.uniform(-1,1)*.6+math.sin(2*math.pi*1500*s)*.25)*math.exp(-50*s),.2,pan)
whoosh(7.95,1,.9,.5)
for i in range(7):sound(8.7+i*.14,.09,lambda s:math.sin(2*math.pi*520*s)*math.exp(-45*s),.055,(-1)**i*.7)
impact(9.8,1)
for t in [10.3,10.8,11.3,11.8,12.3]:
    sound(t,.3,lambda s:(math.sin(2*math.pi*146.83*s)+.35*math.sin(2*math.pi*220*s))*math.exp(-10*s),.12)
    sound(t,.035,lambda s:rng.uniform(-1,1)*math.exp(-100*s),.07)
whoosh(13.15,.75,.65,-.5)
peak=max(max(abs(v) for v in left),max(abs(v) for v in right))
with wave.open(str(ASSETS/'pressure-score-source.wav'),'wb') as f:
    f.setnchannels(2);f.setsampwidth(2);f.setframerate(rate)
    for i,(a,b) in enumerate(zip(left,right)):
        fade=min(1,i/(rate*.015),(count-i)/(rate*.04));f.writeframesraw(struct.pack('<hh',round(a/peak*.85*fade*32767),round(b/peak*.85*fade*32767)))
print(f'Authored {len(layers)} layers, {len(groups)} groups and {sum(len(l["keys"]) for l in layers+groups)} native keys.')
