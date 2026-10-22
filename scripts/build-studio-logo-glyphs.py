#!/usr/bin/env python3
"""Extract licensed bundled Inter contours for native, editable logo lettering."""
import hashlib,json
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.basePen import BasePen
ROOT=Path(__file__).resolve().parents[1]
class Contours(BasePen):
 def __init__(self,glyphs):super().__init__(glyphs);self.contours=[];self.current=None
 def _moveTo(self,p):self.current=[dict(x=p[0],y=p[1],**{'in':[0,0],'out':[0,0]})]
 def _lineTo(self,p):self.current.append(dict(x=p[0],y=p[1],**{'in':[0,0],'out':[0,0]}))
 def _curveToOne(self,a,b,c):
  old=self.current[-1];old['out']=[a[0]-old['x'],a[1]-old['y']];self.current.append(dict(x=c[0],y=c[1],**{'in':[b[0]-c[0],b[1]-c[1]],'out':[0,0]}))
 def _closePath(self):
  if len(self.current)>1 and [self.current[-1]['x'],self.current[-1]['y']]==[self.current[0]['x'],self.current[0]['y']]:self.current[0]['in']=self.current.pop()['in']
  self.contours.append(self.current);self.current=None
 def _endPath(self):raise ValueError('Expected closed glyph contours')
result={'version':1,'source':'Bundled Inter: existing SIL Open Font License assets; exact unhinted contours, no external generation','weights':{}}
for weight,suffix in [(600,'SemiBold'),(900,'Black')]:
 path=ROOT/f'python_media_worker/assets/fonts/Inter-{suffix}.ttf';font=TTFont(path);gs=font.getGlyphSet();cmap=font.getBestCmap();upm=font['head'].unitsPerEm
 data={'fontSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'unitsPerEm':upm,'glyphs':{}}
 for char in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 &.-':
  name=cmap[ord(char)];pen=Contours(gs);gs[name].draw(pen);advance=font['hmtx'][name][0]
  if not pen.contours:data['glyphs'][char]={'advance':advance,'contours':[]};continue
  pts=[n for c in pen.contours for n in c];xmin=min(n['x'] for n in pts);ymax=max(n['y'] for n in pts)
  # An em-sized square retains all counters and avoids tiny PNG/image boxes.
  side=max(upm,max(n['x'] for n in pts)-xmin,ymax-min(n['y'] for n in pts))*1.04;left=xmin-side*.02;top=ymax+side*.02
  contours=[]
  for nodes in pen.contours:
   contours.append({'closed':True,'nodes':[dict(x=round((n['x']-left)/side*100,8),y=round((top-n['y'])/side*100,8),**{'in':[round(n['in'][0]/side*100,8),round(-n['in'][1]/side*100,8)],'out':[round(n['out'][0]/side*100,8),round(-n['out'][1]/side*100,8)]}) for n in nodes]})
  assert len(contours)<=8 and sum(len(c['nodes']) for c in contours)<=256,(char,len(contours))
  data['glyphs'][char]={'advance':advance,'left':left,'top':top,'side':side,'contours':contours}
 result['weights'][str(weight)]=data
out=ROOT/'frontend/src/components/motion/logoGlyphs.v1.json';out.write_text(json.dumps(result,separators=(',',':'))+'\n');print(out,len(out.read_bytes()))
