"""Decode actual native picture/audio transport; no creative pass inferred."""
from pathlib import Path
import argparse,subprocess,json,hashlib
import cv2,numpy as np
from PIL import Image,ImageDraw
p=argparse.ArgumentParser();p.add_argument('root');a=p.parse_args();r=Path(a.root);source=r/'assembled/Four-minute repaired preview.mp4';native=r/'native-final/Four-minute native export.mp4';out=r/'native-comparison';out.mkdir(exist_ok=False)
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-show_streams','-of','json',str(native)]));v=next(s for s in probe['streams'] if s['codec_type']=='video');assert v['nb_read_frames']=='5760' and float(v['duration'])==240 and (v['width'],v['height'])==(1920,1080);subprocess.run(['ffmpeg','-nostdin','-v','error','-threads','1','-i',str(native),'-f','null','-'],check=True)
def sound(file):return np.frombuffer(subprocess.check_output(['ffmpeg','-nostdin','-v','error','-threads','1','-i',str(file),'-vn','-ac','1','-ar','16000','-f','f32le','pipe:1']),np.float32).astype(np.float64)
x,y=sound(source),sound(native);audio=[]
for t in range(0,240,30):
 lo=t*16000;hi=min(len(x),len(y),(t+30)*16000);u,w=x[lo:hi],y[lo:hi];corr=float(np.dot(u,w)/np.sqrt(np.dot(u,u)*np.dot(w,w)));gain=float(np.sqrt(np.mean(w*w)/np.mean(u*u)));assert corr>.98 and .98<gain<1.02;audio.append({'startSeconds':t,'zeroLagCorrelation':corr,'rmsGain':gain})
c1,c2=cv2.VideoCapture(str(source)),cv2.VideoCapture(str(native));rows=[]
for t in [0,3,15,44,49.5,50,55,66,75,89,91.75,115,115.5,120,125,145,165,177,198,210,214.75,225,235,239]:
 frames=[]
 for c in [c1,c2]:c.set(cv2.CAP_PROP_POS_FRAMES,round(t*24));ok,im=c.read();assert ok;frames.append(Image.fromarray(cv2.cvtColor(im,cv2.COLOR_BGR2RGB)))
 original,actual=frames;expected=Image.new('RGB',(1920,1080));content=original.resize((1544,1080),Image.Resampling.LANCZOS);expected.paste(content,(188,0));diff=np.abs(np.array(expected,dtype=np.int16)-np.array(actual,dtype=np.int16));mae=float(diff.mean());assert mae<3,('Native fit mismatch',t,mae);rows.append({'sourceSeconds':t,'fittedPreviewMeanAbsoluteRgbDifference':mae});pair=Image.new('RGB',(3840,1110),(20,20,20));pair.paste(expected,(0,30));pair.paste(actual,(1920,30));d=ImageDraw.Draw(pair);d.text((8,8),f'Actual preview reference fit | {t}s',fill='white');d.text((1928,8),'Actual native final',fill='white');pair.save(out/f'{round(t*24):05d}-preview-native.jpg',quality=96)
c1.release();c2.release();receipt={'nativeExportSha256':hashlib.file_digest(native.open('rb'),'sha256').hexdigest(),'previewSha256':hashlib.file_digest(source.open('rb'),'sha256').hexdigest(),'frames':5760,'durationSeconds':240,'dimensions':[1920,1080],'fullDecodePassed':True,'audioWindows':audio,'pictureMeasurements':rows,'nativeSourceIsFlattenedReview':True,'editableLongFormModelMasksQualified':False,'creativeGate':False,'pixelIdentical':False};(out/'transport.json').write_text(json.dumps(receipt,indent=2));print('REAL_FOUR_MINUTE_NATIVE_TRANSPORT_VERIFIED',flush=True)
