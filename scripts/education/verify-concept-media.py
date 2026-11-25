"""Independently inspect native movies, including every bubble-sort card pose.
No reference movie is substituted for the native exports.
"""
import json,hashlib,subprocess
from pathlib import Path
import cv2,numpy as np
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[2];WORK=Path('/home/tibule12/.local/share/autopromote-qa/education-20261124');OUT=ROOT/'reports/education-phase1-20261124';ASSETS=ROOT/'frontend/public/education/it-studio-v1'
reports=[]
def rgb(hex):return np.array([int(hex[i:i+2],16)for i in [1,3,5]])
def ease(p):return 4*p*p*p if p<.5 else 1-(-2*p+2)**3/2
for identity in ['variables-loops','validation-debugging','bubble-sort','database-joins']:
 folder=WORK/identity;movie=folder/'final.mp4'
 if not (folder/'lesson-proof.json').exists():continue
 subprocess.run(['ffmpeg','-v','error','-i',str(movie),'-f','null','-'],check=True,capture_output=True)
 cap=cv2.VideoCapture(str(movie));assert cap.isOpened();fps=cap.get(cv2.CAP_PROP_FPS);count=int(cap.get(cv2.CAP_PROP_FRAME_COUNT));assert abs(fps-24)<.001 and count==672
 composition=json.loads((ASSETS/(identity+'.graphics.json')).read_text());samples=[];max_error=0.;settled_error=0.;moving_measurements_outside_limit=0;frame_index=0
 if identity=='bubble-sort':trace=json.loads((ASSETS/'bubble-sort-trace.json').read_text());colours=[rgb(l['vectorShape']['fill']['color'])for l in composition['layers']if l['id'].startswith('card-')]
 while True:
  ok,bgr=cap.read()
  if not ok:break
  frame=cv2.cvtColor(bgr,cv2.COLOR_BGR2RGB);t=frame_index/fps
  if identity=='bubble-sort':
   for idx,(value,colour)in enumerate(zip(trace['input'],colours)):
    # The intentional white comparison outline crosses a card during a swap.
    # Observe its complete unique-colour footprint rather than misclassifying
    # the two visible regions on either side of that line as a broken card.
    mask=np.linalg.norm(frame.astype(np.int16)-colour,axis=2)<30
    # The same mint is deliberately used in the course heading/counter. The
    # independently known card-motion band excludes those unrelated labels.
    mask[:200,:]=False;mask[480:,:]=False
    # Ignore codec fringe specks on another card's border. Closing only the
    # outline plus compressed edge interruption joins one card's regions.
    # This measurement operation never modifies the delivered movie.
    joined=cv2.morphologyEx(mask.astype('uint8'),cv2.MORPH_CLOSE,np.ones((15,3),np.uint8))
    n,labels,stats,_=cv2.connectedComponentsWithStats(joined)
    chosen=max(range(1,n),key=lambda i:stats[i,4]);assert stats[chosen,4]>5000,(frame_index,value,'missing card colour footprint')
    x,y,w,h,area=stats[chosen];observed=np.array([x+(w-1)/2,y+(h-1)/2]);px=trace['slotCentres'][idx];py=trace['cardY']
    for move in [m for m in trace['moves']if m['value']==value]:
     if t>=move['end']:px=trace['slotCentres'][idx]+move['xEnd'];py=trace['cardY']
     elif t>=move['start']:
      p=(t-move['start'])/(move['end']-move['start']);px=trace['slotCentres'][idx]+move['xStart']+(move['xEnd']-move['xStart'])*ease(p)
      if t<=move['middle']:py=trace['cardY']+move['yMiddle']*ease((t-move['start'])/(move['middle']-move['start']))
      else:py=trace['cardY']+move['yMiddle']*(1-ease((t-move['middle'])/(move['end']-move['middle'])))
    expected=np.array([1280*px/100,720*py/100]);err=float(np.abs(observed-expected).max());max_error=max(max_error,err)
    moving=any(m['start']<t<m['end']for m in trace['moves']if m['value']==value)
    if not moving:
     settled_error=max(settled_error,err);assert err<=3,(frame_index,value,observed.tolist(),expected.tolist(),err)
    elif err>3:moving_measurements_outside_limit+=1
  if frame_index in [48,87,150,252,396,492,600]:samples.append((t,Image.fromarray(frame).resize((512,288))))
  frame_index+=1
 cap.release();assert frame_index==672
 sheet=Image.new('RGB',(1024,4*314),'#101b2b');draw=ImageDraw.Draw(sheet)
 for i,(at,frame)in enumerate(samples):x=(i%2)*512;y=(i//2)*314;sheet.paste(frame,(x,y));draw.text((x+10,y+290),f'{identity}: {at:.3f}s',fill='white')
 sheet.save(OUT/(identity+'-contact-sheet.jpg'))
 pairs=[]
 for preview in sorted(folder.glob('preview-*.png')):
  try:at=float(preview.stem[8:])
  except ValueError:continue
  cap=cv2.VideoCapture(str(movie));cap.set(cv2.CAP_PROP_POS_MSEC,at*1000);ok,bgr=cap.read();cap.release();assert ok
  final=Image.fromarray(cv2.cvtColor(bgr,cv2.COLOR_BGR2RGB));before=Image.open(preview).convert('RGB').resize((1280,720));mae=float(np.abs(np.array(before).astype(float)-np.array(final).astype(float)).mean());pair=Image.new('RGB',(2560,720));pair.paste(before,(0,0));pair.paste(final,(1280,0));pair.resize((1280,360)).save(OUT/(identity+'-pair-'+str(at)+'.jpg'));pairs.append({'time':at,'meanAbsoluteRgbDifference':mae,'strictPixelParityClaimed':False})
 reports.append({'lessonId':identity,'nativeResultSha256':hashlib.sha256(movie.read_bytes()).hexdigest(),'fullDecode':True,'frames':frame_index,'width':1280,'height':720,'fps':fps,'seconds':28,'layers':len(composition['layers']),'groups':len(composition['groups']),'previewExportPairs':pairs,'bubbleAllFrameGeometry':{'frames':672,'cardsPerFrame':4,'settledPosesMaximumAxisErrorPixels':settled_error,'settledLimitPixels':3,'movingColourFootprintMaximumAxisErrorPixels':max_error,'movingFootprintsOutsideThreePixelLimit':moving_measurements_outside_limit,'movingGeometryQualified':moving_measurements_outside_limit==0,'measurementLimitation':'White outline occlusion and encoded colour fringes interrupt the coloured footprint during swaps. Moving measurements remain diagnostic; no threshold was widened to qualify them.'}if identity=='bubble-sort'else None,'teacherApproval':False,'independentLearnerReproduction':False})
(OUT/'concept-verification.json').write_text(json.dumps(reports,indent=2)+'\n');print(json.dumps({'nativeMoviesDecoded':len(reports),'allFrameBubblePoseCheck':next((r['bubbleAllFrameGeometry']for r in reports if r['lessonId']=='bubble-sort'),None)}))
