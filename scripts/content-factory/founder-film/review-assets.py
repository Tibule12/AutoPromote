from pathlib import Path
import json,hashlib,subprocess,io,sys
from PIL import Image,ImageDraw
r=Path(sys.argv[1]);story=json.loads((r/'storyboard.json').read_text());w,h=400,225;sheet=Image.new('RGB',(w*3,(h+24)*11),(9,10,18));draw=ImageDraw.Draw(sheet)
for j,s in enumerate(story['scenes']):
 for k,at in enumerate([.3,s['duration']*.55,s['duration']-.2]):
  p=r/'assets'/s['id']/'video.mp4';out=subprocess.run(['ffmpeg','-v','error','-ss',str(at),'-i',str(p),'-frames:v','1','-vf','scale=400:225','-f','image2pipe','-vcodec','png','-'],capture_output=True,check=True);im=Image.open(io.BytesIO(out.stdout)).convert('RGB');sheet.paste(im,(w*k,(h+24)*j));draw.text((w*k+5,(h+24)*j+h+4),s['id']+' '+str(round(at,2))+'s',fill=(234,231,249))
sheet.save(r/'raw-asset-sheet.jpg',quality=91)
