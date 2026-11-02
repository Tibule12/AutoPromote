"""Private CPU source analysis -> native point directions. No rendered alpha footage."""
import cv2,numpy as np,json,hashlib,time
import onnxruntime as ort
from pathlib import Path
from PIL import Image,ImageDraw
root=Path(__file__).resolve().parents[2];out=root/'reports/studio-cinematic-episode-20261101/creative-rebuild-v2'
model=Path.home()/'.cache/autopromote-model-runtime/rvm-private-cpu-evaluation-v1/rvm_mobilenetv3_fp32.onnx';assert hashlib.sha256(model.read_bytes()).hexdigest()=='88d4531297118f595bf2fd60f6f566aec2e559393802d1f436c380f0cbbd2828'
opt=ort.SessionOptions();opt.intra_op_num_threads=2;opt.inter_op_num_threads=1;sess=ort.InferenceSession(str(model),sess_options=opt,providers=['CPUExecutionProvider'])
src=root/'reports/studio-motion-flow-takeover-20261031/video-texture/open-world-sources/City.mp4';capture=cv2.VideoCapture(str(src));state=[np.zeros((1,1,1,1),np.float32) for _ in range(4)];ratio=np.array([.5],np.float32);poses=[];board=Image.new('RGB',(1280,760),'#080b14');dr=ImageDraw.Draw(board);began=time.monotonic()
for index in range(192):
 ok,frame=capture.read();assert ok
 small=cv2.resize(frame,(640,360));rgb=cv2.cvtColor(small,cv2.COLOR_BGR2RGB);tensor=np.transpose(rgb.astype(np.float32)/255,(2,0,1))[None]
 _,alpha,*state=sess.run(None,dict(src=tensor,**{f'r{i+1}i':v for i,v in enumerate(state)},downsample_ratio=ratio))
 if index<96 or (index%2 and index!=191):continue
 hsv=cv2.cvtColor(small,cv2.COLOR_BGR2HSV);H,S,V=cv2.split(hsv);B,G,R=cv2.split(small)
 skin=(H<23)&(S>80)&(V>60)&(R.astype(float)>G*1.25)&(R.astype(float)>B*1.4)
 roi=np.zeros((360,640),bool);roi[90:188,317:385]=True
 # Reviewed wrist positions keep warm building details out of the hand selection.
 wrist_times=[4,4.4,4.8,5.2,5.6,6,6.4,6.8,7.2,7.6,8]
 wrist_x=[361,351,358,359,360,332,351,368,366,333,351]
 wrist_y=[119,146,155,118,140,174,155,128,145,175,153]
 wx=np.interp(index/24,wrist_times,wrist_x);wy=np.interp(index/24,wrist_times,wrist_y)
 skin=cv2.morphologyEx((skin&roi).astype(np.uint8)*255,cv2.MORPH_OPEN,np.ones((3,3),np.uint8))
 cs,_=cv2.findContours(skin,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE);clean=np.zeros_like(skin)
 cs=[z for z in cs if cv2.boundingRect(z)[2]>=4 and cv2.boundingRect(z)[3]>=7 and cv2.contourArea(z)>25]
 if cs and not(wx<339 and wy>158):
  def score(z):
   m=cv2.moments(z);cx=m['m10']/max(m['m00'],1);cy=m['m01']/max(m['m00'],1)
   return (cx-wx)**2+(cy-wy)**2
  chosen=min(cs,key=score)
  if score(chosen)<650:cv2.drawContours(clean,[chosen],-1,255,-1)
 ground=np.ones((360,640),bool);ground[215:]=(G.astype(float)>=R*.98)[215:]
 binary=(((alpha[0,0]>.8)&ground)|(clean>0)).astype(np.uint8)*255;binary[:25]=0;binary[:, :240]=0;binary[:,410:]=0;binary[305:]=0
 binary=cv2.morphologyEx(binary,cv2.MORPH_CLOSE,np.ones((3,3),np.uint8))
 contours,_=cv2.findContours(binary,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE);contour=max(contours,key=cv2.contourArea).reshape(-1,2).astype(float)
 anchor=np.lexsort((contour[:,0],contour[:,1]))[0];contour=np.r_[contour[anchor:],contour[:anchor],contour[anchor:anchor+1]]
 d=np.r_[0,np.cumsum(np.linalg.norm(np.diff(contour,axis=0),axis=1))];dist=np.linspace(0,d[-1],44,endpoint=False);poly=np.array([np.interp(dist,d,contour[:,j]) for j in [0,1]]).T
 poses.append({'sourceFrame':index,'sourceTime':index/24,'points':(poly/[640,360]*100).round(5).tolist()})
 if index in [96,120,144,168]:
  i=[96,120,144,168].index(index);im=Image.fromarray(rgb);p=ImageDraw.Draw(im);p.line([tuple(q) for q in poly]+[tuple(poly[0])],fill='#c4ff43',width=2);board.paste(im,(i%2*640,i//2*380+20));dr.text((i%2*640+8,i//2*380),f'City source {index}/24 - native44-point directions',fill='white')
 if time.monotonic()-began>180:raise RuntimeError('Bounded CPU analysis expired')
capture.release();board.save(out/'city-contour-review.jpg');data={'sourceSha256':hashlib.sha256(src.read_bytes()).hexdigest(),'method':'Private cached RVM CPU analysis plus reviewed wrist anchors supplies44-point native authoring directions; original RGB renders through Studio, no model alpha movie','modelSha256':hashlib.sha256(model.read_bytes()).hexdigest(),'productSegmentationIntegration':False,'newDownloadedBytes':0,'paidCalls':0,'elapsedSeconds':time.monotonic()-began,'poses':poses};(out/'city-contour-directions.json').write_text(json.dumps(data,separators=(',',':')));print(json.dumps({k:v for k,v in data.items() if k!='poses'}))
