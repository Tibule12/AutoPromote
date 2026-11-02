"""Numeric scene directions for editable native video surfaces; no raster renderer."""
from pathlib import Path
import json,math

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'reports/studio-folded-space-20261101/flowing-ribbon';OUT.mkdir(exist_ok=True)


def smooth(a,b,t):
    u=max(0,min(1,(t-a)/(b-a)));return u*u*(3-2*u)


def boundary(u,t):
    amount=smooth(.55,2.4,t)*(1-smooth(5.4,7.6,t))
    phase=(t-1.3)*.85
    angle=(u-.5)*math.pi*2-phase
    cx=(u-.5)*6.8;cy=.68*math.sin(angle)*amount;cz=1.1*math.cos(angle)*amount
    twist=.38*math.sin(angle+.7)*amount
    yaw=.22*math.sin((t-1.5)*.65)*amount
    result=[]
    for side in [1,-1]:
        yy=cy+side*(6.8/(16/9)/2)*math.cos(twist)
        zz=cz+side*(6.8/(16/9)/2)*math.sin(twist)
        xx=cx*math.cos(yaw)+zz*math.sin(yaw);zz=-cx*math.sin(yaw)+zz*math.cos(yaw)
        f=10/(10-zz);zoom=1-.41*amount
        result.append([50+xx*(100/6.8)*f*zoom,50-yy*(100/(6.8/(16/9)))*f*zoom])
    return [[max(0,min(100,v)) for v in p] for p in result]


def bounds(i):return max(0,i/10-.0007),min(1,(i+1)/10+.0007)


def quad(i,t):
    u,v=bounds(i);a,b=boundary(u,t),boundary(v,t)
    return [a[0],b[0],b[1],a[1]]


def keys(prop,points):
    return [dict(property=prop,time=round(t,6),value=round(v,6),easing='linear') for t,v in points]


def channel(id,prop,points):return dict(type='keys',targetId=id,keys=keys(prop,points))


stage=dict(id='Fold / negative space',name='Fold / negative space',type='artwork',x=50,y=50,width=100,height=100,
           startTime=0,duration=8,scale=1,rotation=0,opacity=1,
           svg='<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><defs><radialGradient id="g"><stop stop-color="#232633"/><stop offset="1" stop-color="#080b14"/></radialGradient></defs><rect width="1280" height="720" fill="url(#g)"/></svg>',keys=[])
plans=[];actions=[]
for source in ['Autumn','Summit']:
    for i in range(10):
        id=f'Fold / {source} / surface {i+1}'
        actions.append(dict(type='media_plane',id=id,name=id,sourceMediaId=source,sourceStart=0,startTime=4 if source=='Summit' else 0,duration=4 if source=='Summit' else 8,
                            perspective=dict(version=1,corners=quad(i,0),sourceRect=[bounds(i)[0]*100,0,bounds(i)[1]*100,100]),
                            transform=dict(x=50,y=50,scale=100/70,opacity=1)))
        rows=[dict(property=f'planeCorner{j}{axis}',time=round(t,6),value=round(p[k],6),easing='linear')
              for t in [n/6 for n in range(49)] for j,p in enumerate(quad(i,t)) for k,axis in enumerate(['X','Y'])]
        actions += [dict(type='keys',targetId=id,keys=rows[n:n+128]) for n in range(0,len(rows),128)]
        if source=='Summit':actions.append(channel(id,'opacity',[(4,0),(4.8,1),(8,1)]))
        # Shadow-free shared edges: neighbouring pieces map to the exact same
        # projected boundary. No decorative borders or independently drifting cards.
        if len(actions)>45:
            plans.append(dict(name=f'Folded moving world {len(plans)+1}',actions=actions));actions=[]
if actions:plans.append(dict(name=f'Folded moving world {len(plans)+1}',actions=actions))
plans[0]['graphics']=dict(format='autopromote-graphics',version=1,name='Folded moving space',width=1280,height=720,
                         duration=8,layers=[stage],groups=[])
for i,plan in enumerate(plans):(OUT/f'fold-plan-{i+1}.json').write_text(json.dumps(plan,separators=(',',':')))
(OUT/'direction-summary.json').write_text(json.dumps(dict(seconds=8,facets=10,worlds=2,plans=len(plans),
    method='Native source UV regions and eight independent linear corner channels. Continuous joined moving picture; two source worlds. No rendered effect assets.',
    paidCalls=0,productionWrites=False),indent=2)+'\n')
print(json.dumps(dict(plans=len(plans),cornerKeys=20*8*49)))
