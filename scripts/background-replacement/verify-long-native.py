"""Actual picture/sound transport measurements, separate from creative quality."""
import argparse,json,subprocess,hashlib
from pathlib import Path
import cv2,numpy as np
from PIL import Image,ImageDraw
p=argparse.ArgumentParser();p.add_argument('root');p.add_argument('destination');a=p.parse_args();r=Path(a.root);d=Path(a.destination);native=r/'native-final/Four-minute native export.mp4';source=d/'Four-minute background replacement - review.mp4';out=r/'native-comparison';out.mkdir(exist_ok=True)
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-show_streams','-of','json',str(native)]));video=next(s for s in probe['streams'] if s['codec_type']=='video');assert int(video['nb_read_frames'])==5760 and (video['width'],video['height'])==(1920,1080)
subprocess.run(['ffmpeg','-nostdin','-v','error','-i',str(native),'-f','null','-'],check=True)
def audio(file):return np.frombuffer(subprocess.check_output(['ffmpeg','-nostdin','-v','error','-i',str(file),'-vn','-ac','1','-ar','16000','-f','f32le','pipe:1']),np.float32).astype(np.float64)
x,y=audio(source),audio(native);n=min(len(x),len(y));sound=[]
for start in range(0,240,30):
 lo=start*16000;hi=min(n,(start+30)*16000);u=x[lo:hi];v=y[lo:hi];sound.append({'start':start,'end':hi/16000,'zeroOffsetCorrelation':float(np.dot(u,v)/np.sqrt(np.dot(u,u)*np.dot(v,v))),'rmsGain':float(np.sqrt(np.mean(v*v)/np.mean(u*u)))})
c1,c2=cv2.VideoCapture(str(source)),cv2.VideoCapture(str(native));rows=[]
for t in [0,15,45,50,75,100,115,125,145,165,198,225,239]:
 pictures=[]
 for capture in [c1,c2]:capture.set(cv2.CAP_PROP_POS_MSEC,t*1000);ok,im=capture.read();assert ok;pictures.append(Image.fromarray(cv2.cvtColor(im,cv2.COLOR_BGR2RGB)))
 original,export=pictures;w,h=original.size;scale=min(1920/w,1080/h);fitted=original.resize((round(w*scale),round(h*scale)),Image.Resampling.LANCZOS);expected=Image.new('RGB',(1920,1080));expected.paste(fitted,((1920-fitted.width)//2,(1080-fitted.height)//2));diff=np.abs(np.array(expected,dtype=np.int16)-np.array(export,dtype=np.int16));rows.append({'seconds':t,'fitReferenceMeanAbsoluteRgbDifference':float(diff.mean())})
 panel=Image.new('RGB',(3840,1114),(18,18,18));panel.paste(expected,(0,34));panel.paste(export,(1920,34));draw=ImageDraw.Draw(panel);draw.text((8,8),f'Actual imported review, reference fit | {t}s',fill='white');draw.text((1928,8),f'Actual native export | {t}s',fill='white');panel.save(out/f'{t:03d}-preview-export.jpg',quality=96)
c1.release();c2.release();receipt={'nativeExportSha256':hashlib.sha256(native.read_bytes()).hexdigest(),'fullDecodePassed':True,'frames':5760,'durationSeconds':240,'dimensions':[1920,1080],'audioWindows':sound,'pictureMeasurements':rows,'pixelIdentical':False,'sourceIsFlattenedReview':True,'allMovingEdgesQualified':False,'creativeGate':False,'note':'Fit/reference differences include real native re-encoding. Numerical correspondence is not a visual pass.'};(out/'transport.json').write_text(json.dumps(receipt,indent=2));print('FULL_NATIVE_DECODE_AND_SOUND_MEASURED',flush=True)
for file in [native]:
 target=d/'Studio native export - four-minute review.mp4'
 if not target.exists():target.hardlink_to(file)
