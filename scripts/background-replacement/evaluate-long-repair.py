"""Local retained-footage visual trial; no product model registration or cloud use."""
from pathlib import Path
import sys,json,time,hashlib,subprocess
import numpy as np,cv2,onnxruntime as ort
from PIL import Image,ImageDraw,ImageFilter,ImageEnhance
R=Path('reports/background-replacement-20261101/private/four-minute-r9');R.mkdir(exist_ok=True)
W=1430;H=1000
p=Path('/home/tibule12/.cache/autopromote-model-runtime/rvm-private-cpu-evaluation-v1/rvm_mobilenetv3_fp32.onnx');assert hashlib.file_digest(p.open('rb'),'sha256').hexdigest()=='88d4531297118f595bf2fd60f6f566aec2e559393802d1f436c380f0cbbd2828'
opt=ort.SessionOptions();opt.intra_op_num_threads=4;opt.inter_op_num_threads=1;model=ort.InferenceSession(str(p),sess_options=opt,providers=['CPUExecutionProvider'])
# Separate, real retained alpha per reference camera, not a painted person.
a0=np.array(Image.open('reports/background-replacement-20261101/private/fine-props-r8/native-effective-alpha/effective-alpha/alpha_0000.png'))
a1=np.array(Image.open('reports/background-replacement-20261101/private/piece-review-r6/effective-alpha-second/effective-alpha/alpha_0000.png'))
refs=[a0,a1];bg=Image.open('reports/background-replacement-20261101/private/replacement.png').convert('RGB')
for t in [0,15,44,55,75,110,115,120,145,165,180,210,235]:
 src=np.array(Image.open(R/f'source-{t:03d}.png'));h,w=src.shape[:2];angle=0 if w==1430 else 1
 old=np.array(Image.open(R/f'alpha-{t:03d}.png').resize((w,h),Image.Resampling.LANCZOS).convert('L'))
 start=time.monotonic();_,pha,*_=model.run(None,{'src':src.transpose(2,0,1)[None].astype(np.float32)/255,'downsample_ratio':np.array([.35],np.float32),**{f'r{i}i':np.zeros((1,1,1,1),np.float32) for i in range(1,5)}});person=np.rint(pha[0,0].clip(0,1)*255).astype(np.uint8)
 person[:,round(w*.68):]=0 if angle==0 else person[:,round(w*.68):]
 if angle==1:person[:,:200]=0
 # Actual source-colour couch remains opaque as it is uncovered by a gesture.
 static=refs[angle].copy();hsv=cv2.cvtColor(src,cv2.COLOR_RGB2HSV)
 if angle==0:
  static[:,:650]=0;static[:440]=0;static[:540,:1000]=0
  # Remove the captured reference person's shoulder, retaining the separately selected rails.
  static[:600,:750]=0
  blue=(hsv[:,:,0]>95)&(hsv[:,:,0]<130)&(hsv[:,:,1]>55)&(hsv[:,:,2]<175);blue[:580]=False;blue[:,850:]=False
  static[blue]=255
  static[744:,844:]=255
 else:
  static[:480]=0;static[:,450:]=0
 # Keep independently confirmed existing opaque person core but do not restore
 # the old rectangular holdout outside the current video-matting silhouette.
 support=cv2.dilate((person>=32).astype(np.uint8),np.ones((5,5),np.uint8))>0
 combined=person.copy();combined[support]=np.maximum(combined[support],old[support]);combined=np.maximum(combined,static)
 # Preserve the neural head silhouette rather than the old original-wall wedge.
 face=cv2.FaceDetectorYN_create('/home/tibule12/Projects/AutoPromte/AutoPromote/python_media_worker/models/yunet/face_detection_yunet_2023mar.onnx','',(w,h),.6,.3,5000);_,faces=face.detect(cv2.cvtColor(src,cv2.COLOR_RGB2BGR))
 if faces is not None:
  f=max(faces,key=lambda q:q[2]*q[3]);x,y,fw,fh=f[:4];x0=max(0,round(x-fw*.45));x1=min(w,round(x+fw*1.4));y0=max(0,round(y-fh*.7));y1=min(h,round(y+fh*1.1));combined[y0:y1,x0:x1]=np.maximum(person[y0:y1,x0:x1],static[y0:y1,x0:x1])
 # This is an ungraded diagnostic to inspect the alpha separately.
 background=ImageEnhance.Brightness(ImageEnhance.Color(bg.resize((w,h),Image.Resampling.LANCZOS)).enhance(.8)).enhance(2**-.35).filter(ImageFilter.GaussianBlur(2));background.paste(Image.fromarray(src),mask=Image.fromarray(combined));background.save(R/f'trial-{t:03d}.png');Image.fromarray(combined).save(R/f'trial-alpha-{t:03d}.png');Image.fromarray(person).save(R/f'person-{t:03d}.png')
 sheet=Image.new('RGB',(w*2,h+30),(15,15,15));d=ImageDraw.Draw(sheet);sheet.paste(Image.fromarray(src),(0,30));sheet.paste(background,(w,30));d.text((8,8),f'Source {t}s',fill='white');d.text((w+8,8),f'Private trial | {time.monotonic()-start:.2f}s local inference',fill='white');sheet.save(R/f'trial-pair-{t:03d}.jpg',quality=96);print('ACTUAL_REFERENCE_TRIAL',t,angle,round(time.monotonic()-start,2),flush=True)
