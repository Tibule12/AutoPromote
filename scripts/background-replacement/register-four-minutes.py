"""Read-only source shot/zoom registration for the requested continuous 0–240s test.
No masks are inferred and no original source pixels are edited by this pass.
"""
from pathlib import Path
import argparse,json,hashlib,time,subprocess
import cv2,numpy as np
from PIL import Image,ImageDraw
p=argparse.ArgumentParser();p.add_argument('output');a=p.parse_args();out=Path(a.output);out.mkdir(exist_ok=True,parents=True)
source=Path('/home/tibule12/Videos/cam-combiner-5050c706-a6cb-48bc-ac43-8fa54f21bc1a.mp4')
cv2.setNumThreads(2)
refs=[];sift=cv2.SIFT_create(nfeatures=3500);bf=cv2.BFMatcher()
for i,file in enumerate(['reports/background-replacement-20261101/private/source-3s.mp4','reports/background-replacement-20261101/private/two-speaker-r4/Speaker 2 - source 54-57s.mp4']):
 c=cv2.VideoCapture(file);ok,bgr=c.read();c.release();assert ok
 rgb=cv2.cvtColor(bgr,cv2.COLOR_BGR2RGB);h,w=rgb.shape[:2]
 Image.fromarray(rgb).save(out/f'reference-{i}.png')
 gray=cv2.cvtColor(cv2.resize(bgr,(0,0),fx=.5,fy=.5),cv2.COLOR_BGR2GRAY)
 # Use the room, TV bezel, static equipment and furniture, not faces/clothing.
 mask=np.full(gray.shape,255,np.uint8)
 if i==0:mask[:420,:430]=0
 else:mask[:450,170:]=0
 kp,desc=sift.detectAndCompute(gray,mask);refs.append((rgb,kp,desc))
decoder=subprocess.Popen(['ffmpeg','-nostdin','-v','error','-threads','2','-i',str(source),'-t','240','-vf','fps=4,scale=960:540','-an','-pix_fmt','bgr24','-f','rawvideo','pipe:1'],stdout=subprocess.PIPE)
rows=[];samples=[];last=None
start=time.monotonic()
for index in range(0,5760,6):
 t=index/24;raw=decoder.stdout.read(960*540*3);assert len(raw)==960*540*3,t
 small=np.frombuffer(raw,np.uint8).reshape(540,960,3);gray=cv2.cvtColor(small,cv2.COLOR_BGR2GRAY);kp,desc=sift.detectAndCompute(gray,None)
 candidates=[]
 for angle,(ref,rkp,rdesc) in enumerate(refs):
  good=[m for m,n in bf.knnMatch(desc,rdesc,k=2) if m.distance<.68*n.distance]
  if len(good)<8:continue
  pts=np.float32([kp[m.queryIdx].pt for m in good]);dst=np.float32([rkp[m.trainIdx].pt for m in good])
  mat,inliers=cv2.estimateAffinePartial2D(pts,dst,method=cv2.RANSAC,ransacReprojThreshold=1.6,maxIters=3000,confidence=.999)
  if mat is None:continue
  count=int(inliers.sum());scale=float(np.linalg.norm(mat[0,:2]));error=float(np.median(np.linalg.norm(pts@mat[:,:2].T+mat[:,2]-dst,axis=1)[inliers[:,0]>0]))
  if count<10 or not .55<scale<1.5:continue
  full=mat.copy();full[:,2]*=2
  candidates.append({'frame':index,'seconds':t,'angle':angle,'matrix':full.tolist(),'inliers':count,'medianInlierErrorHalfPixels':error,'referenceScale':scale})
 if not candidates:raise ValueError(f'No defensible source-camera match at {t}s')
 row=max(candidates,key=lambda v:v['inliers']);rows.append(row)
 if index%120==0 or last!=row['angle']:
  rgb=cv2.cvtColor(small,cv2.COLOR_BGR2RGB);ref=refs[row['angle']][0];preview_matrix=np.array(row['matrix']);preview_matrix[:,2]/=2;warped=cv2.warpAffine(rgb,preview_matrix,(ref.shape[1]//2,ref.shape[0]//2));Image.fromarray(warped).resize((429,300)).save(out/f'registered-{index:04d}.jpg',quality=92)
  samples.append({'frame':index,'seconds':t,'angle':row['angle'],'file':f'registered-{index:04d}.jpg'})
 last=row['angle']
 if index%480==0:print(json.dumps({'event':'source_registration','seconds':t,'angle':row['angle'],'inliers':row['inliers']}),flush=True)
assert not decoder.stdout.read(1) and decoder.wait()==0
transitions=[r for i,r in enumerate(rows) if i==0 or r['angle']!=rows[i-1]['angle']]
result={'source':str(source),'startSeconds':0,'durationSeconds':240,'fps':24,'frameCount':5760,'sampleEveryFrames':6,'registration':'SIFT room features and RANSAC similarity; camera identity independently classified; transforms must be reviewed','rows':rows,'sampleFrames':samples,'coarseCameraTransitions':transitions,'runtimeSeconds':time.monotonic()-start}
(out/'registration.json').write_text(json.dumps(result,indent=2))
can=Image.new('RGB',(429*4,325*((len(samples)+3)//4)),(20,20,20));d=ImageDraw.Draw(can)
for i,s in enumerate(samples):x=i%4*429;y=i//4*325;can.paste(Image.open(out/s['file']),(x,y+25));d.text((x+8,y+5),f"{s['seconds']:.2f}s / speaker {s['angle']+1}",fill='white')
can.save(out/'registered-contact.jpg',quality=92)
print(json.dumps({'complete':True,'rows':len(rows),'transitions':[(r['seconds'],r['angle']) for r in transitions],'runtimeSeconds':result['runtimeSeconds']}),flush=True)
