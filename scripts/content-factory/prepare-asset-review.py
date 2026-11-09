"""Expose every decoded frame and native detail; never infer creative approval."""
import argparse,hashlib,json,math,subprocess
from pathlib import Path

import numpy as np
from PIL import Image,ImageDraw

def prepare(source,output,regions):
 if output.exists() and any(output.iterdir()):raise FileExistsError('Preserve prior review evidence')
 info=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate,duration,nb_frames','-of','json',str(source)]))['streams'][0]
 width,height=int(info['width']),int(info['height'])
 numerator,denominator=map(int,info['avg_frame_rate'].split('/'));fps=numerator/denominator
 if width*height>1920*1080 or not 1<=fps<=60 or float(info.get('duration',0))>15:
  raise ValueError('Review requires a bounded raw asset, not an entire film')
 raw=subprocess.check_output(['ffmpeg','-v','error','-threads','1','-i',str(source),'-pix_fmt','rgb24','-f','rawvideo','pipe:1'])
 frames=np.frombuffer(raw,dtype=np.uint8).reshape((-1,height,width,3))
 if not len(frames):raise ValueError('Empty asset')
 output.mkdir(parents=True)
 def sheet(indices,name,box=None,columns=7):
  size=(320,round(320*(box[3]-box[1])/(box[2]-box[0]))) if box else (320,round(320*height/width))
  canvas=Image.new('RGB',(size[0]*columns,(size[1]+24)*math.ceil(len(indices)/columns)),'#090b12');draw=ImageDraw.Draw(canvas)
  for n,i in enumerate(indices):
   img=Image.fromarray(frames[i]);img=img.crop(box) if box else img
   x,y=(n%columns)*size[0],(n//columns)*(size[1]+24)
   canvas.paste(img.resize(size,Image.Resampling.LANCZOS),(x,y));draw.text((x+6,y+size[1]+4),f'frame {i} / {i/fps:.3f}s',fill='white')
  canvas.save(output/name,quality=92)
 sheet(list(range(len(frames))),'all-frames.jpg')
 native=sorted(set(round(i*(len(frames)-1)/6) for i in range(7)))
 for i in native:Image.fromarray(frames[i]).save(output/f'native-{i:03d}.png')
 for name,box in regions.items():
  if not name.replace('-','').isalnum() or len(box)!=4 or not 0<=box[0]<box[2]<=width or not 0<=box[1]<box[3]<=height:
   raise ValueError('Invalid native-pixel review region')
  sheet(list(range(len(frames))),f'{name}-all-frames.jpg',tuple(box))
 changes=np.abs(np.diff(frames.astype(np.int16),axis=0)).mean(axis=(1,2,3))
 receipt={'status':'DECODED_PENDING_VISUAL_REVIEW','artifactSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'stream':info,'decodedFrames':len(frames),'allFramesIncluded':True,'nativeFrames':native,'detailRegions':regions,'largestChanges':[{'fromFrame':int(i),'toFrame':int(i+1),'meanAbsolutePixelChange':float(changes[i])} for i in np.argsort(changes)[-5:][::-1]],'limitation':'All-frame evidence and motion diagnostics only. A reviewer must judge anatomy, physical contact, vessel geometry, water interaction, scene continuity and story. Playback and listening are separate.'}
 (output/'decode-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
 print(json.dumps({'frames':len(frames),'sha256':receipt['artifactSha256'],'status':receipt['status']}))

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--regions',type=Path)
 a=p.parse_args();prepare(a.source,a.output,json.loads(a.regions.read_text()) if a.regions else {})
