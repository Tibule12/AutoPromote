"""Prepare editable native graphics, never externally rendered motion."""
import json, subprocess
from pathlib import Path
import numpy as np
root=Path(__file__).resolve().parents[2]
folder=root/'reports/studio-motion-flow-takeover-20261031/dialogue'
folder.mkdir(exist_ok=True)
curve=[.22,1,.36,1]
def key(prop,t,v):return dict(property=prop,time=round(t,6),value=v,easing='bezier',curve=curve)
def keys(prop,rows):return [key(prop,t,v) for t,v in rows]
def identity(id,start,end,x=50,y=50,width=90,scale=1):
 return dict(id=id,name=id,startTime=start,duration=round(end-start,6),x=x,y=y,width=width,scale=scale,rotation=0,opacity=1,keys=[])
def fade(layer,start,end):
 layer['keys']+=keys('opacity',[(start,0),(start+.2,1),(end-.25,1),(end,0)])
def artwork(id,start,end,svg,x=50,y=50,width=100,height=100):
 layer=identity(id,start,end,x,y,width);layer.update(type='artwork',svg=svg,height=height);return layer
def title(id,copy,start,end,x,y,scale=1,color='#f1ede4',weight=800,animate=True):
 layer=identity(id,start,end,x,y,90,scale);layer.update(type='text',text=copy,color=color,fontWeight=weight,textAlign='center');fade(layer,start,end)
 if animate:
  layer['textAnimator']=dict(version=1,unit='character',order='forward',stagger=22,fromX=0,fromY=.85,fromScale=1,fromRotation=0,fromOpacity=0,tracking=-.015,rangeStart=0,rangeEnd=100,easing='ease_out');layer['textProgress']=0
  layer['keys']+=keys('textProgress',[(start,0),(start+.38,100)])
 return layer
layers=[]
# Full field changes into a physical recording plane at the spoken word video.
bg=artwork('Recording space',2.5,7.4,'<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#090d14"/></svg>')
bg['keys']=keys('opacity',[(2.5,0),(2.9,1),(7.05,1),(7.4,0)]);layers.append(bg)
# A shaped falloff opens typography space while retaining the actual room.
shade=artwork('Room light falloff',8.08,14.7,'<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><defs><linearGradient id="fall"><stop offset="0" stop-color="#050910" stop-opacity="0.94"/><stop offset="0.38" stop-color="#050910" stop-opacity="0.78"/><stop offset="0.59" stop-color="#050910" stop-opacity="0"/></linearGradient></defs><rect width="1280" height="720" fill="url(#fall)"/></svg>');fade(shade,8.08,14.7);layers.append(shade)
layers+=[
 title('Time observed','08:42',2.94,6.95,15.5,21,1.5,'#ddb983'),
 title('Morning marker','THIS MORNING',3.2,6.95,15.5,29,.5,animate=False),
 title('Never phrase','NEVER',5.62,7.05,20,65,2.05),
 title('Said phrase','SAID.',5.88,7.05,20,77,2.05,'#ddb983'),
 title('Source disclosure','FICTIONAL PERFORMANCE',.25,15.45,80,94,.51,'#b7bfcc',600,False),
]
# Cue programme times account for the third occurrence source-in of .2576667.
base=8.009-.2576666666666667
for name,word,cue,y in [('Face cue','FACE.',.36,31),('Voice cue','VOICE.',2.34,45),('Room cue','ROOM.',4.68,59)]:
 layer=title(name,word,round(base+cue,6),14.55,20,y,1.58)
 layer['keys']=keys('opacity',[(base+cue,0),(base+cue+.18,1),(14.3,1),(14.55,0)])+keys('textProgress',[(base+cue,0),(base+cue+.36,100)])
 layers.append(layer)
layers.append(title('Identity phrase','WAS MINE.',base+.9,base+3.7,20,76,.66,'#ddb983',600,False))
layers.append(title('Room phrase','EXACTLY RIGHT.',base+5.68,14.55,20,76,.66,'#ddb983',600,False))
# Measured amplitude contour from the actual second source, not synthetic noise.
raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(folder.parent/'media/presenter-2.mp4'),'-vn','-f','f32le','-ar','16000','-ac','1','-'])
a=np.frombuffer(raw,dtype='<f4');start=1.7;end=3.32;bins=np.array_split(a[int(start*16000):int(end*16000)],48);rms=np.array([float(np.sqrt(np.mean(b*b))) for b in bins]);rms=rms/max(float(rms.max()),1e-8)
nodes=[]
for i,amp in enumerate(rms):
 nodes.append(dict(x=round(2+96*i/47,5),y=round(50+(-1 if i%2 else 1)*amp*43,5),**{'in':[0,0],'out':[0,0]}))
wave=identity('Original voice amplitude',base+1.7,base+3.9,20,66,28);wave.update(type='artwork',height=7,vectorShape=dict(version=1,closed=False,nodes=nodes,fill=dict(kind='none',color='#ddb983',endColor='#ddb983',start=[0,0],end=[100,100]),stroke=dict(color='#ddb983',width=.65)));fade(wave,base+1.7,base+3.9);layers.append(wave)
groups=[]
for id in ['Never phrase','Said phrase','Face cue','Voice cue','Room cue']:
 layer=next(x for x in layers if x['id']==id)
 groups.append(dict(id=id+' mask',name=id+' masked reveal',layerIds=[id],startTime=layer['startTime'],duration=layer['duration'],mask=dict(enabled=True,shape='rectangle',radius=0,feather=0,inverted=False),keys=[]))
(folder/'dialogue.graphics.json').write_text(json.dumps(dict(format='autopromote-graphics',version=1,name='Dialogue-led opening revision',width=1280,height=720,duration=15.75,layers=layers,groups=groups),indent=2)+'\n')
(folder/'cue-review.json').write_text(json.dumps(dict(status='LOCAL_RECOGNITION_ESTIMATES',sourceWordTimes='source-word-times.json',clockGraphics=0,voiceContour=dict(source='presenter-2.mp4',start=start,end=end,bins=48,measurement='RMS amplitude per equal time bin, normalized; not voice identification'),programmeSourceOffset=base,limits=['Word estimates have not received human listening approval','Not the missing spoken-minute source']),indent=2)+'\n')
print('Prepared',len(layers),'native layers; waveform is an editable contour from source PCM.')
