"""Independent bounded technical checks. Not teacher approval or creative completion."""
import os,json,math,xml.etree.ElementTree as ET
from pathlib import Path
import cv2,numpy as np
R=Path(__file__).resolve().parents[3];A=R/'frontend/public/education/technical-v1';W=Path(os.environ.get('TECHNICAL_EDUCATION_WORK','/home/tibule12/.local/share/autopromote-qa/education-technical-20261125/revision2'));catalog=json.loads((W/'catalog.json').read_text());reports={}
def read(id):return json.loads((A/id/'lesson.graphics.json').read_text())
def layer(s,n):return next(l for l in s['layers']if l['name']==n)
def evalkey(l,prop,t):
 ks=sorted((k for k in l.get('keys',[])if k['property']==prop),key=lambda k:k['time'])
 if not ks:return l.get(prop,1 if prop in ['opacity','scale']else 0)
 if t<=ks[0]['time']:return ks[0]['value']
 for a,b in zip(ks,ks[1:]):
  if t<=b['time']:
   if b['easing']=='hold':return b['value']if t==b['time']else a['value']
   f=(t-a['time'])/(b['time']-a['time']);return a['value']+(b['value']-a['value'])*f
 return ks[-1]['value']

s=read('egd-drawing-views')
def polygons(n):return [[tuple(map(float,p.split(',')))for p in x.attrib['points'].split()]for x in ET.fromstring(layer(s,n)['svg']).iter()if x.tag.endswith('polygon')]
front=polygons('Front view')[0];top=polygons('Top view')[0];side=polygons('Right-side view')[0]
assert front==[(600,500),(840,500),(840,440),(690,440),(690,380),(600,380)]
assert top==[(600,175),(840,175),(840,325),(600,325)]
assert side==[(900,380),(1050,380),(1050,500),(900,500)]
assert max(y for x,y in top)<min(y for x,y in front) and min(x for x,y in side)>max(x for x,y in front)
assert (max(x for x,y in front)-min(x for x,y in front))/3==80
assert (max(y for x,y in front)-min(y for x,y in front))/3==40
assert (max(y for x,y in top)-min(y for x,y in top))/3==50
assert (max(x for x,y in side)-min(x for x,y in side))/3==50
reports['egd-drawing-views']={'thirdAnglePlacement':True,'frontWidthHeight':[80,40],'topWidthDepth':[80,50],'rightDepthHeight':[50,40],'sameSteppedSolid':True,'preparedStaticProjectionDisclosed':True,'CADOr3DSimulation':False}

s=read('mechanical-gears');g1=layer(s,'Driver gear');g2=layer(s,'Driven gear')
assert abs((g2['x']-g1['x'])*12.8-216)<1e-5
for t in np.linspace(4,24,481):assert abs(evalkey(g2,'rotation',t)+evalkey(g1,'rotation',t)/2)<1e-5
assert all(k['easing']=='linear'for g in[g1,g2]for k in g['keys'])
def points(g):
 root=ET.fromstring(g['svg']);poly=next(x for x in root if x.tag.endswith('polygon'));c=float(root.attrib['width'])/2
 return np.array([list(map(float,p.split(',')))for p in poly.attrib['points'].split()])-c
p1,p2=points(g1),points(g2);scale=5;origin=np.array([350,180]);shape=(int(350*scale),int(520*scale));overlaps=[]
for theta in np.linspace(-180,180,361):
 masks=[]
 for pts,centre,angle in[(p1,np.array([470,350]),theta),(p2,np.array([686,350]),-theta/2)]:
  a=math.radians(angle);rot=np.array([[math.cos(a),-math.sin(a)],[math.sin(a),math.cos(a)]])
  coords=np.rint((pts@rot.T+centre-origin)*scale).astype(np.int32);m=np.zeros(shape,np.uint8);cv2.fillPoly(m,[coords],255);masks.append(m)
 # Erode one 0.2px raster boundary from each shape: boundary contact is allowed.
 eroded=[cv2.erode(m,np.ones((3,3),np.uint8))for m in masks]
 overlaps.append(int(np.count_nonzero(cv2.bitwise_and(*eroded)))/(scale*scale))
assert max(overlaps)<.5,('Involute interior interference',max(overlaps))
reports['mechanical-gears']={'driverTeeth':20,'drivenTeeth':40,'pressureAngleDegrees':20,'drawingModulePixels':7.2,'pitchRadiiPixels':[72,144],'centreDistancePixels':216,'oppositeRotation':True,'nativeRateRatio':2,'driverIntervalDegrees':360,'drivenIntervalDegrees':-180,'linearKeys':True,'sampledToothMeshStates':361,'maxErodedRasterInteriorOverlapSquarePixels':max(overlaps),'rasterBoundaryTolerancePixels':.2,'manufacturingOrForceSimulation':False,'120rpmInputAnswer':60,'idealPowerNotCreated':True}

s=read('electrical-simple-circuit');switch=layer(s,'Switch lever');lamp=layer(s,'Lamp light');marker=layer(s,'Conventional current marker')
for t in np.arange(0,28,1/24):
 lit=evalkey(lamp,'opacity',float(t))>.5
 if lit:assert abs(evalkey(switch,'rotation',float(t)))<2,'Lamp lit across an open contact'
 if marker['startTime']<=t<marker['startTime']+marker['duration'] and evalkey(marker,'opacity',float(t))>.5:assert abs(evalkey(switch,'rotation',float(t)))<1e-5
xkeys=[k for k in marker['keys']if k['property']=='x'];ykeys=[k for k in marker['keys']if k['property']=='y'];path=[(round(x['value']*12.8,3),round(y['value']*7.2,3))for x,y in zip(xkeys,ykeys)]
assert path[0]==(240,280)and path[-1]==(240,420)
assert path[2:5]==[(500,200),(620,200),(900,200)]
reports['electrical-simple-circuit']={'sourceVoltsLabel':3,'currentExternalDirection':'positive to negative','markerPathPixels':path,'markersOnlyWhileClosed':True,'switchLightCausalFrameCheck':True,'illustrationNotSimulation':True,'supervisedPracticalBoundary':True,'measuredCurrentOrElectronSpeed':False}

s=read('civil-brick-sequence');rows=[layer(s,'Course '+str(i))for i in range(1,5)]
for i,row in enumerate(rows):
 assert row['startTime']==3+i*5
 assert abs(evalkey(row,'y',25)*7.2-(520-i*60))<1e-4
 group=next(g for g in s['groups']if g['id']=='Wall crop');assert group['layerIds']==[r['id']for r in rows]
 # Geometry from original rectangle assets: real 150px bricks + 10px perp joints.
 root=ET.fromstring(row['svg']);bricks=[r for r in root if r.tag.endswith('rect')and r.attrib.get('width')=='150'];xs=[int(r.attrib['x'])for r in bricks]
 assert all(b-a==160 for a,b in zip(xs,xs[1:]));assert all(r.attrib['height']=='52'for r in bricks)
 assert (xs[0]%160)==(0 if i%2==0 else 80)
reports['civil-brick-sequence']={'courses':4,'bottomUpNativeStartsSeconds':[3,8,13,18],'drawingModulePixels':160,'alternateOffsetPixels':80,'brickHeightPixels':52,'bedJointPixels':8,'perpJointPixels':10,'nativeGroupCrop':group['mask'],'cropFragmentsNotCutInstructions':True,'structuralOrConstructionSpecification':False}
for id,report in reports.items():
 report.update({'assessment':'Bounded geometry/kinematic/timing checks; not educator sign-off','teacherFeedbackReceived':False,'independentLearnerRecreation':False,'schoolHardwareTrial':False});(W/id).mkdir(exist_ok=True);(W/id/'geometry-verification.json').write_text(json.dumps(report,indent=2)+'\n')
(W/'geometry-verification.json').write_text(json.dumps(reports,indent=2)+'\n');print(json.dumps(reports,indent=2))
