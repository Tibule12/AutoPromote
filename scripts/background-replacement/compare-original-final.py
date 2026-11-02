"""Original master, previous native export and current native export crop evidence."""
from pathlib import Path
import json,cv2
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[2];p=ROOT/'reports/background-replacement-20261101/private/piece-review-r6';d=json.loads((p/'piece-review-provenance.json').read_text());c=cv2.VideoCapture(str(p/'native-final/two-speaker-native-export.mp4'));out=p/'final-detail-pass/original-comparison';out.mkdir(parents=True,exist_ok=True);font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',18)
for angle,entry in enumerate(d['angles'],1):
 new=[]
 for i in range(72):
  ok,f=c.read();assert ok;common=cv2.resize(f[:,188:1732],(1430,1000),interpolation=cv2.INTER_AREA);new.append(common if angle==1 else cv2.resize(common[3:996],(1440,1000),interpolation=cv2.INTER_AREA))
 for name,roi in entry['regions'].items():
  x0,y0,x1,y1=roi;w,h=x1-x0,y1-y0;scale=2 if w<420 else 1
  for i in [0,24,36,48,71]:
   canvas=Image.new('RGB',(w*scale*3,h*scale+36),(18,18,18));draw=ImageDraw.Draw(canvas)
   stages=[('Original master',cv2.imread(str(p/f'angle-{angle}/original/{i:04d}.png'))),('Previous export',cv2.imread(str(p/f'angle-{angle}/export/{i:04d}.png'))),('Repaired export',new[i])]
   for j,(label,im) in enumerate(stages):
    crop=im[y0:y1,x0:x1];canvas.paste(Image.fromarray(cv2.cvtColor(crop,cv2.COLOR_BGR2RGB)).resize((w*scale,h*scale),Image.Resampling.NEAREST),(j*w*scale,36));draw.text((j*w*scale+5,8),f'{label} f{i}',font=font,fill='white')
   canvas.save(out/f'angle-{angle}-{name}-{i:04d}.png')
assert not c.read()[0];c.release();print('75 actual original/previous/current region comparisons created.')
