"""Actual decoded native export versus its exact reviewed mask-backed preview."""
import argparse,json,subprocess
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
p=argparse.ArgumentParser();p.add_argument('native');p.add_argument('review');a=p.parse_args();n=Path(a.native);out=Path(a.review)
def decode(file,w,h):
 b=subprocess.check_output(['ffmpeg','-nostdin','-v','error','-threads','1','-i',str(file),'-map','0:v:0','-threads','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1']);assert len(b)==48*w*h*3
 return [Image.frombytes('RGB',(w,h),b[i*w*h*3:(i+1)*w*h*3]) for i in range(48)]
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate,nb_frames','-of','json',str(n/'native-export.mp4')]))['streams'][0]
assert probe['avg_frame_rate']=='24/1' and int(probe['nb_frames'])==48
size=(probe['width'],probe['height']);assert size in [(1544,1080),(1920,1080)],size
# Disabling the global automatic crop preserves the source aspect at 1080h.
# The ordinary enabled 16:9 Fit full path instead pads that same content.
content=(0,0,1544,1080) if size==(1544,1080) else (188,0,1732,1080)
preview=decode(n/'preview.mp4',1430,1000);final=decode(n/'native-export.mp4',*size);rows=[];(out/'export').mkdir(exist_ok=True)
regions={'head':(660,45,1040,480),'leftHand':(280,240,680,720),'rightHand':(1040,170,1430,760),'equipment':(0,700,950,1000),'shirt':(430,450,1370,980)}
for i,(pr,ex) in enumerate(zip(preview,final)):
 expected=Image.new('RGB',size);expected.paste(pr.resize((1544,1080),Image.Resampling.LANCZOS),(content[0],0));err=np.abs(np.asarray(expected).astype(np.int16)-np.asarray(ex));aligned=ex.crop(content).resize((1430,1000),Image.Resampling.LANCZOS);diff=np.abs(np.asarray(pr).astype(np.int16)-np.asarray(aligned));rows.append({'frame':i,'expectedFitMeanRgbError':float(err.mean()),'regions':{k:float(diff[y0:y1,x0:x1].mean()) for k,(x0,y0,x1,y1) in regions.items()}})
 aligned.save(out/'export'/f'{i:04d}.jpg',quality=97)
 if i in [0,6,8,12,23,24,36,47]:
  aligned.save(out/'export'/f'{i:04d}.png');source=Image.open(out/'source'/f'{i:04d}.png');before=Image.open(out/'before'/f'{i:04d}.png');sheet=Image.new('RGB',(4290,1030),(15,15,15));draw=ImageDraw.Draw(sheet)
  for j,(label,im) in enumerate(zip(['Original source','OWNER-REJECTED four-minute output','Actual new native export'],[source,before,aligned])):sheet.paste(im,(1430*j,30));draw.text((1430*j+5,7),f'{label} | source {224+i/24:.4f}s',fill='white')
  sheet.save(out/f'actual-export-comparison-{i:04d}.jpg',quality=97)
def audio(file):return np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-i',str(file),'-vn','-ac','1','-ar','48000','-f','f32le','pipe:1']),np.float32)
ap,ae=audio(n/'preview.mp4'),audio(n/'native-export.mp4');length=min(len(ap),len(ae));assert length>=95000
r={'previewFrames':48,'exportFrames':48,'fps':24,'masterRangeSeconds':[224,226],'nativeExportSize':size,'fitContent':content,'sourceAspectPreserved':size==(1544,1080),'meanRgbError':float(np.mean([r['expectedFitMeanRgbError'] for r in rows])),'maximumFrameMeanRgbError':max(r['expectedFitMeanRgbError'] for r in rows),'frames':rows,'audio':{'previewSamples':len(ap),'exportSamples':len(ae),'zeroLagCorrelation':float(np.corrcoef(ap[:length],ae[:length])[0,1]),'subjectiveListeningApproval':False},'pixelIdentityClaim':False,'creativeApproval':False}
(n/'preview-export-comparison.json').write_text(json.dumps(r,indent=2));print(json.dumps({k:v for k,v in r.items() if k!='frames'},indent=2))
