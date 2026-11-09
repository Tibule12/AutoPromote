from pathlib import Path
from PIL import Image,ImageDraw
import json,sys
r=Path(sys.argv[1]);shots=json.loads((r/'storyboard.json').read_text())['scenes'];w,h=480,270;sheet=Image.new('RGB',(w*3,(h+25)*len(shots)),(9,10,18));d=ImageDraw.Draw(sheet)
for j,shot in enumerate(shots):
 for k,p in enumerate(sorted((r/'assets'/shot['id']).glob('preview-*.png'))[:3]):
  im=Image.open(p).convert('RGB');im.thumbnail((w,h));sheet.paste(im,(k*w,j*(h+25)));d.text((k*w+8,j*(h+25)+h+6),shot['id']+' / '+p.stem,fill=(224,222,241))
  im.save(p.with_suffix('.jpg'),quality=88)
sheet.save(r/'preview-sheet.jpg',quality=90)
