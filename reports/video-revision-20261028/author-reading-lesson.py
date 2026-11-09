"""Source artwork for a real native Studio text-timing tutorial. No video renderer."""
from pathlib import Path
import json,subprocess
R=Path(__file__).resolve().parent/'proof'/'reading-lesson';R.mkdir(parents=True,exist_ok=True)
W,H,D=720,1280,12
layers=[]
def artwork(name,body,a,b,x,y,w,h):
 l=dict(id=f'art-{len(layers)}',name=name,type='artwork',svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="{W*w/100}" height="{H*h/100}" viewBox="0 0 {W*w/100} {H*h/100}">{body}</svg>',startTime=a,duration=b-a,x=x,y=y,width=w,height=h,scale=1,rotation=0,opacity=1,keys=[]);layers.append(l);return l
def k(p,t,v):return dict(property=p,time=t,value=v,easing='bezier',curve=[.22,.8,.25,1])
artwork('Deep vermilion paper','<rect width="720" height="1280" fill="#BE3028"/>',0,12,50,50,100,100)
# A single original sun artwork keeps its related rays one editable object.
import math
rays=''
for i in range(12):
 rays+=f'<rect x="96" y="0" width="20" height="78" rx="10" transform="rotate({i*30} 106 106)" fill="#F5C65D"/>'
l=artwork('Cut-paper sun',f'<g transform="translate(2 2)">{rays}</g>',0,12,48,46,30,17)
l['svg']='<svg xmlns="http://www.w3.org/2000/svg" width="216" height="216" viewBox="0 0 216 216">'+f'<g transform="translate(2 2)">{rays}</g></svg>'
l['keys']=[k('rotation',0,-8),k('rotation',6,0),k('rotation',12,8)]
# Dimensional cup silhouette: the seam and liquid surface belong to the same graphic.
l=artwork('Coffee vessel','<ellipse cx="105" cy="164" rx="96" ry="13" fill="#7C201C" opacity=".36"/><path d="M164 49H184C221 49 222 110 186 114H164" fill="none" stroke="#F7E8CC" stroke-width="20"/><path d="M35 44H174L162 135C156 162 52 162 46 135Z" fill="#F7E8CC"/><path d="M105 45H174L162 135C158 148 136 155 105 155Z" fill="#D9BDA2"/><ellipse cx="105" cy="44" rx="70" ry="18" fill="#FFEFD8"/><ellipse cx="105" cy="44" rx="57" ry="11" fill="#512924"/><path d="M80 43C91 31 122 33 131 43C116 39 102 40 94 47" fill="#EBD6B9"/>',0,12,48,46,32,15)
l['keys']=[k('y',0,48),k('y',1.1,45),k('y',3.3,46),k('rotation',0,-5),k('rotation',1.1,2),k('rotation',3.3,0),k('scale',0,.9),k('scale',1.1,1.04),k('scale',3.3,1)]
for i in range(3):
 x=43+i*5
 l=artwork(f'Steam {i+1}','<path d="M8 62C-8 43 24 35 8 10" stroke="#F7E8CC" stroke-width="3" fill="none" stroke-linecap="round"/>',0,12,x,34,2.5,5)
 l['opacity']=.8;l['keys']=[k('y',0,36),k('y',3,32),k('y',6,35),k('y',9,31),k('y',12,34)]
# Small copy is optional decoration; no lesson instruction relies on the margins.
package=dict(format='autopromote-graphics',version=1,name='Reading beat / original coffee poster artwork',width=W,height=H,duration=D,layers=layers,groups=[])
(R/'poster-v3.graphics.json').write_text(json.dumps(package,indent=2)+'\n')
subprocess.run(['ffmpeg','-v','error','-y','-f','lavfi','-i','color=c=0xBE3028:s=720x1280:r=24:d=12','-an','-c:v','libx264','-preset','fast','-crf','25','-pix_fmt','yuv420p','-movflags','+faststart',str(R/'blank-stage.mp4')],check=True)
(R/'direction.json').write_text(json.dumps({'name':'Give animated text time to be read','sample':'Original coffee poster, twelve-second native motion result','tutorial':'Sixty seconds: result, rushed comparison, exact title/motion controls, hold keys, replay, takeaway','criticalContent':{'xPercent':[14,82],'yPercent':[18,64]},'narration':'Explicit local preset speech will explain the real recorded controls; no cloned identity','sound':'Voice leads; no repetitive synthetic score','thumbnail':'Native poster frame with a concise technique headline, checked at phone size','abandonedDraft':'ONE IDEA / SIX VOICES source script was not executed or selected; unrelated marketing direction excluded'},indent=2)+'\n')
print('Original cup/sun source artwork and plain twelve-second native stage ready.')
