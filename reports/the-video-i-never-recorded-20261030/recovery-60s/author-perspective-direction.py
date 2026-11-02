"""Static graphics interchange only; all picture motion is authored in Studio."""
import json
from pathlib import Path

assets=Path(__file__).parent/'edit-assets'

def fade(start,end):
    return [dict(property='opacity',time=t,value=v,easing='ease_in_out')
            for t,v in [(start,0),(start+.2,1),(end-.2,1),(end-.001,0)]]

def title(name,copy,start,end,x,y,scale,width=90,color='#f3efe7',weight=600):
    return dict(id=name,name=name,type='text',text=copy,startTime=start,duration=end-start,
                x=x,y=y,width=width,scale=scale,rotation=0,opacity=1,fontWeight=weight,
                color=color,textAlign='center',keys=fade(start,end))

def art(name,svg,start,end,x,y,width,height):
    return dict(id=name,name=name,type='artwork',svg=svg,startTime=start,duration=end-start,
                x=x,y=y,width=width,height=height,scale=1,rotation=0,opacity=1,keys=fade(start,end))

def write(name,layers):
    (assets/name).write_text(json.dumps(dict(format='autopromote-graphics',version=1,name=name,
        width=1920,height=1080,duration=16,layers=layers,groups=[]),indent=2)+'\n')

write('perspective-background.graphics.json',[
    art('Studio-depth-background','<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs><radialGradient id="light"><stop stop-color="#293341"/><stop offset="1" stop-color="#080b11"/></radialGradient></defs><rect width="1920" height="1080" fill="url(#light)"/></svg>',2.5,14.8,50,50,100,100)
])
write('perspective-titles.graphics.json',[
    title('Time-of-discovery','08:42',.3,2.3,13,85,.9,weight=600),
    title('Recorded-evidence-label','SOURCE VIDEO / RECONSTRUCTION',3,7.4,50,10,.42,color='#c8bdab'),
    title('Never-said','NEVER SAID.',5.62,7.4,31,81,1.9,weight=800),
    title('Face-clue','THE FACE',8.36,9.65,27,81,1.65,weight=800),
    title('Voice-clue','THE VOICE',10.34,11.72,30,81,1.65,weight=800),
    title('Room-clue','THE ROOM',12.68,14.5,30,81,1.65,weight=800),
    title('Second-evidence-label','THE SAME ROOM. THE SAME PERSON.',8.4,14.5,50,10,.42,color='#c8bdab'),
    title('Story-title','THE VIDEO I NEVER RECORDED',15.05,16,50,84,.8,weight=600),
    title('Fiction-disclosure','FICTIONAL DRAMATIZATION',0,16,50,96,.3,color='#b0a9a4',weight=400),
])
