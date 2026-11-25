"""Independent pixel/state checks of the finished teaching films, not just JSON."""
import os,json,math
from pathlib import Path
import cv2,numpy as np
R=Path(__file__).resolve().parents[3];A=R/'frontend/public/education/technical-v1';W=Path(os.environ.get('TECHNICAL_EDUCATION_WORK','/home/tibule12/.local/share/autopromote-qa/education-technical-20261125/revision2'))
def frame(id,t):
 c=cv2.VideoCapture(str(A/id/'result.mp4'));c.set(cv2.CAP_PROP_POS_FRAMES,round(t*24));ok,f=c.read();c.release();assert ok;return f[:,:,::-1]
def luma(p):return float(np.asarray(p)@np.array([.2126,.7152,.0722]))
def update(id,checks):
 p=W/id/'movie-verification.json';x=json.loads(p.read_text());x['nativePixelSemanticChecks']=checks;p.write_text(json.dumps(x,indent=2)+'\n');print(id,checks,flush=True)

id='egd-drawing-views';f=frame(id,24)
blue=lambda p:int(p[2])>int(p[0])+30 and int(p[1])>int(p[0])+10
green=lambda p:int(p[1])>int(p[0])+20 and int(p[1])>int(p[2])+5
warm=lambda p:int(p[0])>int(p[1])+8 and int(p[1])>int(p[2])+10
assert blue(f[400,640])and blue(f[470,780])and not blue(f[400,780]),'Front stepped silhouette'
assert green(f[250,650])and green(f[250,785]),'Top view rectangle'
assert warm(f[400,950])and warm(f[470,950]),'Right-side rectangle'
assert luma(f[240,690])>luma(f[240,650])+40,'Visible top step edge'
assert luma(f[440,960])>luma(f[400,960])+40,'Visible side step edge'
update(id,{'actualFrontSteppedSilhouette':True,'actualTopAndRightViewsAtThirdAnglePositions':True,'visibleTopAndSideStepEdges':True,'source':'Actual decoded native frame24s, well inside the final explanatory interval.'})

id='electrical-simple-circuit';c=cv2.VideoCapture(str(A/id/'result.mp4'));angles=[];lamps=[];marker_frames=[];i=0
yy,xx=np.indices((45,45));disk=(xx-22)**2+(yy-22)**2<21**2
while True:
 ok,bgr=c.read()
 if not ok:break
 f=bgr[:,:,::-1];t=i/24;patch=f[328:373,878:923];light=float(np.median((patch@np.array([.2126,.7152,.0722]))[disk]));lit=light>55;lamps.append((i,light))
 expected=9.5<=t<24.05
 assert lit==expected,('Native lamp timing',i,light,expected)
 roi=f[70:340,355:640].astype(float);r,g,b=roi[:,:,0],roi[:,:,1],roi[:,:,2];mask=(r>220)&(g>170)&(g<235)&(b>110)&(b<180);ys,xs=np.where(mask);xs=xs+355;ys=ys+70;far=(xs-500)**2+(ys-200)**2>18**2
 assert far.sum()>50,('Native switch lever missing',i)
 angle=math.degrees(math.atan2(float(np.mean(ys[far])-200),float(np.mean(xs[far])-500)));angles.append(angle)
 if t<=8.5:expected_angle=-35
 elif t<9.5:expected_angle=-35+35*(t-8.5)
 elif t<=24:expected_angle=0
 elif t<25:expected_angle=-35*(t-24)
 else:expected_angle=-35
 assert abs(angle-expected_angle)<3.0,('Native lever pose',i,angle,expected_angle)
 roi=f[180:535,225:915].astype(float);r,g,b=roi[:,:,0],roi[:,:,1],roi[:,:,2];count=np.count_nonzero((r>225)&(g>180)&(b<110))
 if count>=8:marker_frames.append(i);assert 9.5<=t<24.05,('Visible current indicator while open',i)
 i+=1
c.release();assert i==672 and len(marker_frames)>250
update(id,{'all672NativeLampStatesMatchClosureInterval':True,'all672NativeLeverAnglesMatchKeys':True,'leverAngleToleranceDegrees':3,'currentMarkerVisibleFrames':len(marker_frames),'currentIndicatorOnlyWhileClosed':True,'lampOffMedianLuma':float(np.median([v for j,v in lamps if j<200])),'lampOnMedianLuma':float(np.median([v for j,v in lamps if 300<j<500])),'source':'Every actual native output frame; illustrative direction indicators, no electrical simulation or measurement claim.'})

id='civil-brick-sequence';c=cv2.VideoCapture(str(A/id/'result.mp4'));starts=[3,8,13,18];ys=[520,460,400,340];i=0
def brick(p):
 r,g,b=map(int,p);return r>g+30 and r>b+50 and g>50
while True:
 ok,bgr=c.read()
 if not ok:break
 f=bgr[:,:,::-1];t=i/24
 for start,y in zip(starts,ys):
  present=brick(f[y,520])
  if t<start:assert not present,('Course appears before its native start',i,start)
  if t>=start+.95:assert present,('Completed course missing',i,start)
 assert not brick(f[460,1100]),('Wall leaks past native crop',i)
 i+=1
c.release();assert i==672;f=frame(id,24);phases=[];joints=[]
for y in ys:
 p=f[y,250:1040].astype(int);m=(np.max(p,axis=1)-np.min(p,axis=1)<30)&(np.mean(p,axis=1)>110);cols=np.where(m)[0]+250;runs=[]
 for x in cols:
  if not runs or x>runs[-1][-1]+1:runs.append([int(x)])
  else:runs[-1].append(int(x))
 centres=[float(np.mean(run))for run in runs if len(run)>=3];assert len(centres)>=3;(joints.append(centres));phases.append(float(np.median(np.mod(centres,160))))
assert all(abs((a-b)%160-80)<2 for a,b in zip(phases,phases[1:])),('Native stagger',phases)
update(id,{'all672CourseOrderAndSettledPresenceChecks':True,'all672RightCropNoLeakChecks':True,'actualVerticalJointCentresPixels':joints,'actualAlternateHalfModuleOffsetPixels':80,'jointPositionTolerancePixels':2,'source':'Actual native frame sequence and final mortar-joint detection; cropped elevation, not a construction specification.'})
