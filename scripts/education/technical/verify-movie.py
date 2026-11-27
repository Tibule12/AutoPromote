"""Read every native output frame and compare selected pre-final preview frames.
This supplements actual native workflow recordings; it cannot supply human review.
"""
import os,json,math,hashlib,sys,subprocess
from pathlib import Path
import cv2,numpy as np
R=Path(__file__).resolve().parents[3];A=R/'frontend/public/education/technical-v1';W=Path(os.environ.get('TECHNICAL_EDUCATION_WORK','/home/tibule12/.local/share/autopromote-qa/education-technical-20261125/revision2'));id=sys.argv[1];d=A/id;w=W/id
p=d/'result.mp4';proof=json.loads((w/'tutorial/proof.json').read_text());decision_check=json.loads((w/'tutorial/pre-export-decision-check.json').read_text());assert decision_check['allReferenceDecisionsAgree']and not decision_check['differences'];assert hashlib.sha256(p.read_bytes()).hexdigest()==proof['outputSha256'];cap=cv2.VideoCapture(str(p));assert cap.isOpened();fps=cap.get(cv2.CAP_PROP_FPS);assert abs(fps-24)<.001;assert cap.get(cv2.CAP_PROP_FRAME_WIDTH)==1280 and cap.get(cv2.CAP_PROP_FRAME_HEIGHT)==720
samples=json.loads((w/'preview-pairs/samples.json').read_text());wanted={round(x['time']*fps):x['time']for x in samples};pairs=[];frames=0;maxblack=0;dots=[];sheet=[];selected={0,24,48,72,96,120,144,168,192,216,240,264,288,312,336,360,384,408,432,456,480,504,528,552,576,600,624,648,671}
def dot(frame,kind):
 b,g,r=cv2.split(frame)
 if kind=='driver':mask=((r>190)&(g<125)&(b>40)&(b<180)).astype(np.uint8);cx,cy,radius=470,350,67
 else:mask=((g>170)&(r<120)&(b>40)&(b<165)).astype(np.uint8);cx,cy,radius=686,350,119
 yy,xx=np.indices(mask.shape);mask[((xx-cx)**2+(yy-cy)**2)>radius**2]=0
 n,labels,stats,centres=cv2.connectedComponentsWithStats(mask,8);found=[(stats[i,4],centres[i])for i in range(1,n)if stats[i,4]>=12]
 assert found,('Missing index marker',kind,frames)
 size,centre=max(found,key=lambda a:a[0]);return centre.tolist(),math.degrees(math.atan2(centre[1]-cy,centre[0]-cx))
while True:
 ok,frame=cap.read()
 if not ok:break
 assert frame.shape[:2]==(720,1280);assert frame.std()>5,('Blank output',frames)
 if id=='mechanical-gears' and 96<=frames<=576:
  c1,a1=dot(frame,'driver');c2,a2=dot(frame,'driven');dots.append({'frame':frames,'time':frames/24,'driver':c1,'driven':c2,'angles':[a1,a2]})
 if frames in wanted:
  t=wanted[frames];before=cv2.imread(str(w/'preview-pairs'/f'{t}.png'));assert before is not None
  before=cv2.resize(before,(1280,720),interpolation=cv2.INTER_AREA);delta=cv2.absdiff(before,frame)
  # State/timing diagnostic, not a new whole-Studio pixel tolerance.
  pairs.append({'time':t,'meanAbsoluteRgbDifference':float(delta.mean()),'p95RgbDifference':float(np.percentile(delta,95)),'previewPixels':[before.shape[1],before.shape[0]],'outputFrame':frames,'scope':'Pre-final paused canvas versus native final. No strict whole-picture parity promotion.'})
  cv2.imwrite(str(w/'preview-pairs'/f'{t}-native.png'),frame)
 if frames in selected:
  small=cv2.resize(frame,(426,240));cv2.putText(small,f'{frames/24:.3f}s',(8,20),cv2.FONT_HERSHEY_SIMPLEX,.5,(255,255,255),1,cv2.LINE_AA);sheet.append(small)
 frames+=1
cap.release();assert frames==672,frames;assert len(pairs)==len(samples),(len(pairs),len(samples))
gear=None
if dots:
 angles=np.unwrap(np.radians(np.array([x['angles']for x in dots])),axis=0)*180/math.pi
 expected=np.array([[-180+18*(x['time']-4),90-9*(x['time']-4)]for x in dots]);angles+=np.rint((expected[0]-angles[0])/360)*360;error=np.abs(angles-expected)
 assert error.max()<2.0,('Native gear rate/direction drift',float(error.max()))
 travelled=angles[-1]-angles[0];assert travelled[0]>358 and travelled[1]<-178
 gear={'all481MovingSamplesDetected':True,'maxIndexAngleErrorDegrees':float(error.max()),'driverMeasuredTurnDegrees':float(travelled[0]),'drivenMeasuredTurnDegrees':float(travelled[1]),'measuredOppositeSpeedRatio':float(abs(travelled[0]/travelled[1])),'toleranceDegrees':2.0,'note':'Tracks coloured index dots in actual native final frames. This is kinematic illustration verification, not engineering force simulation.'};(w/'native-gear-tracking.json').write_text(json.dumps(dots,indent=2))
while len(sheet)%3:sheet.append(np.zeros_like(sheet[0]))
contact=np.concatenate([np.concatenate(sheet[i:i+3],axis=1)for i in range(0,len(sheet),3)],axis=0);cv2.imwrite(str(w/'native-moving-inspection.jpg'),contact)
geometry=json.loads((w/'geometry-verification.json').read_text());report={'lessonId':id,'sha256':proof['outputSha256'],'framesDecoded':frames,'seconds':frames/24,'width':1280,'height':720,'fps':fps,'allFramesNonblank':True,'nativeWorkflowProof':'tutorial/proof.json','geometryAssessment':geometry,'pairedPreFinalPreview':pairs,'nativeGearMotion':gear,'strictWholeStudioPixelParity':False,'externalTeacherReview':False,'independentLearnerRecreation':False,'actualSchoolHardwareTrial':False,'creativeOwnerApproval':False,'reviewLimit':'Geometry/kinematic/timing and actual decoded-film checks support a private teacher-review candidate. Teachers must judge educational suitability and practical terminology; full human listening and school-device trials remain required.'}
# The film itself must contain non-silent audio, not merely an audio stream.
pcm=subprocess.check_output(['ffmpeg','-v','error','-i',str(p),'-vn','-f','f32le','-ac','1','-ar','16000','-']);audio=np.frombuffer(pcm,np.float32);rms=float(np.sqrt(np.mean(audio**2)));assert rms>.005;report['audioRms']=rms;report['noSubtitleTracks']=not any(s['codec_type']=='subtitle'for s in json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-of','json',str(p)]))['streams']);assert report['noSubtitleTracks']
(w/'movie-verification.json').write_text(json.dumps(report,indent=2)+'\n');print(id,'all 672 native frames, sound and',len(pairs),'pre-final pairs inspected; gear',gear)
