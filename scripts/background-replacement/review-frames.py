"""Pair masks only with their exact decoded normalized-source frame indices."""
import argparse,json,subprocess
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
p=argparse.ArgumentParser();p.add_argument('job');p.add_argument('output');a=p.parse_args();root=Path(a.job);out=Path(a.output);out.mkdir(exist_ok=True)
source=root/'outputs/normalized_source.mp4';masks=root/'outputs/subject_masks'
if not source.exists():source=root/'normalized_source.mp4';masks=root/'subject_masks'
probe=json.loads(subprocess.run(['ffprobe','-v','error','-select_streams','v:0','-show_streams','-of','json',str(source)],capture_output=True,text=True,check=True).stdout)['streams'][0];w,h=int(probe['width']),int(probe['height'])
indices=[0,12,24,35,36,48,60,71]
canvas=Image.new('RGB',(1430,500*len(indices)))
for row,index in enumerate(indices):
 f=masks/f'matte_{index:04d}.png'
 if not f.exists():continue
 data=subprocess.run(['ffmpeg','-nostdin','-v','error','-i',str(source),'-vf',f'select=eq(n\\,{index})','-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],capture_output=True,check=True).stdout
 rgb=Image.frombytes('RGB',(w,h),data);mask=Image.open(f).point(lambda a:255 if a>=128 else 0)
 comp=Image.new('RGB',(w,h),(65,75,82));comp.paste(rgb,mask=mask)
 for col,image in enumerate([rgb,comp]):
  image=image.copy()
  image.thumbnail((715,500));ImageDraw.Draw(image).text((10,10),f'{index}/72 | {index/24:.4f}s | '+('source' if col==0 else 'segmentation'),fill='white');canvas.paste(image,(col*715,row*500))
 rgb.save(out/f'source-{index:04d}.png');comp.save(out/f'mask-composite-{index:04d}.png')
canvas.save(out/'moving-selection-review.jpg')
