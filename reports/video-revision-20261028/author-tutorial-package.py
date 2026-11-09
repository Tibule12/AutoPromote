from pathlib import Path
import json,subprocess
P=Path(__file__).resolve().parent/'proof/reading-lesson';T=P/'tutorial';T.mkdir(exist_ok=True)
D=60;layers=[]
def text(name,copy,a,b,y=22,scale=.65,color='#F7E8CC'):
 layers.append(dict(id=f'lesson-{len(layers)}',name=name,type='text',text=copy,startTime=a,duration=b-a,x=46,y=y,width=70,scale=scale,rotation=0,opacity=1,color=color,fontWeight=800,textAlign='center',strokeWidth=0,keys=[]))
for name,y,h in [('Control close-up top matte',14,28),('Control close-up bottom matte',85,30)]:
 layers.append(dict(id=f'matte-{len(layers)}',name=name,type='artwork',svg='<svg xmlns="http://www.w3.org/2000/svg" width="720" height="400"><rect width="720" height="400" fill="#14131F"/></svg>',startTime=10,duration=34.8,x=50,y=y,width=100,height=h,scale=1,rotation=0,opacity=1,keys=[]))
text('Hook / problem','STOP RUSHING\nYOUR TEXT.',0,5,y=20.5,scale=.82)
text('How to / title','1 / ADD YOUR TITLE',10,18,scale=.63)
text('How to / safe position','2 / PLACE IT FOR A PHONE',18,27,scale=.58)
text('How to / entrance','3 / RISE + LETTERS\n0.5s entrance / 0.065s stagger',27,36,scale=.48)
text('How to / reading hold','KEEP THE READING HOLD',36,44,scale=.62)
text('How to / watch check','WATCH IT WITHOUT PAUSING',44,52,scale=.56)
text('Useful final takeaway','FAST ENTRANCE.\nCALM HOLD.',52,60,scale=.82)
text('Preset narration disclosure','Preset synthetic narration',57,60,y=63,scale=.23)
pkg=dict(format='autopromote-graphics',version=1,name='Reading beat / narrated mobile tutorial',width=720,height=1280,duration=D,layers=layers,groups=[])
(T/'lesson-labels.graphics.json').write_text(json.dumps(pkg,indent=2)+'\n')
subprocess.run(['ffmpeg','-v','error','-y','-f','lavfi','-i','color=c=0x14131F:s=720x1280:r=24:d=60','-an','-c:v','libx264','-preset','fast','-crf','26','-pix_fmt','yuv420p','-movflags','+faststart',str(T/'blank-stage.mp4')],check=True)
print('Native tutorial caption source and blank sixty-second stage prepared.')
