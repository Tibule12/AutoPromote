#!/usr/bin/env python3
"""Public Graphics v1 authoring input; never a raster/video compositor."""
import json,pathlib,re
root=pathlib.Path(__file__).resolve().parents[2]
out=root/'reports/welcome-studio-reel-20261021/assets'
out.mkdir(parents=True,exist_ok=True)
layers=[]
def key(p,t,v,e='ease_out'):
 return dict(property=p,time=t,value=v,easing=e)
def text(name,copy,start,end,x,y,scale=1,color='#f5f4fa',width=88,align='left',animate=True):
 d=dict(id=name,name=name,type='text',text=copy,startTime=start,duration=round(end-start,4),x=x,y=y,width=width,scale=scale,rotation=0,opacity=1,fontWeight=800,textAlign=align,color=color,keys=[])
 if animate:
  d.update(textAnimator=dict(version=1,unit='character',order='forward',stagger=24,fromX=-.2,fromY=1.25,fromScale=.7,fromRotation=-9,fromOpacity=0,tracking=.04,rangeStart=0,rangeEnd=100,easing='back_out'),textProgress=100)
  d['keys']=[key('textProgress',start,0),key('textProgress',start+.72,100)]
 layers.append(d)
 return d
def artwork(name,svg,start,end,x,y,w,h,keys=[]):
 d=dict(id=name,name=name,type='artwork',svg=svg,startTime=start,duration=round(end-start,4),x=x,y=y,width=w,height=h,scale=1,rotation=0,opacity=1,keys=keys)
 layers.append(d); return d
# Native artwork, authored shapes and actual existing brand SVGs.
artwork('opening-gradient', '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="240" viewBox="0 0 1280 240"><defs><linearGradient id="shade" x2="0" y2="1"><stop stop-color="#080b12" stop-opacity="0"/><stop offset="1" stop-color="#080b12" stop-opacity=".95"/></linearGradient></defs><rect width="1280" height="240" fill="url(#shade)"/></svg>',0,3.7,50,84,100,33.333)
text('open-label','A LITTLE FOOTAGE. A DIFFERENT FEEL.',.35,3.7,50,88,.78,'#ffffff',92,'center')
text('editable-heading','Every detail.\nStill editable.',6.6,9.7,50,91,1.0,'#c2a6ff',85,'center')
text('adapt-heading','Same story.\nNew conversation.',10.15,15.5,29,30,1.55,'#f5f4fa',43)
text('adapt-sub','Your video. Each channel’s own post.',11.05,15.5,28,58,.53,'#a5b1cb',42,animate=False)
text('adapt-foot','Titles / Captions / Individual times',11.55,15.5,28,69,.49,'#77e7df',42,animate=False)
# A thin line draws from the copy to the actual vertical result.
artwork('copy-thread','<svg xmlns="http://www.w3.org/2000/svg" width="600" height="80"><path d="M8 40H540l35-27M540 40l35 27" fill="none" stroke="#a990f8" stroke-width="2"/></svg>',11,15.5,46,80,39,9, [key('scale',11,.1),key('scale',11.8,1)])
text('platform-heading','Six channels. Six conversations.',15.55,21.4,50,9,1.0,'#f5f4fa',92,'center')
platforms=[('linkedin','14:35','#0a66c2'),('youtube','15:10','#ff0033'),('instagram','18:15','#db2785'),('tiktok','19:10','#36d8db'),('facebook','20:10','#1877f2'),('reddit','21:05','#ff4500')]
for i,(p,time,c) in enumerate(platforms):
 x=[19,50,81][i%3]; y=28 if i<3 else 65; s=15.65+i*.13
 svg=(root/f'frontend/src/assets/platforms/{p}.svg').read_text(); svg=re.sub(r'<!--.*?-->','',svg,flags=re.S); svg=svg.replace('<path ',f'<path fill="{c}" ',1)
 artwork(f'{p}-mark',svg,s,21.4,x-11.5,y-6,2.4,4.27,[key('scale',s,.1),key('scale',s+.5,1)])
 text(f'{p}-time',time+' SAST',s+.05,21.4,x+2,y-6,.43,'#b7c7de',22,'left',False)
text('platform-date','ACTUAL QUEUE / CAPTURED 21 OCT 2026',16.6,21.4,50,98,.35,'#8b97ad',90,'center',False)
text('queue-heading','The next move. Already in view.',21.4,25.5,50,6,.75,'#c2a6ff',94,'center')
text('queue-date','RECORDED WORKSPACE / 21 OCT 2026',21.8,25.5,50,96,.32,'#8e9bb4',94,'center',False)
text('endline','Make it. Make it yours.',25.65,28,50,8,1.0,'#f5f4fa',92,'center')
text('made-in','The film, motion and sound were edited in Studio.',26.4,28,50,94,.46,'#a4b4cc',92,'center',False)
pkg=dict(format='autopromote-graphics',version=1,name='From the frame to the next six posts',width=1280,height=720,duration=28,layers=layers,groups=[])
(out/'story.graphics.json').write_text(json.dumps(pkg,indent=2)+'\n')
print(f'{len(layers)} ordinary graphic layers, {sum(len(l["keys"]) for l in layers)} keys')
