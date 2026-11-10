# A source-specific QA diagnostic, not general automatic watermark recognition.
from pathlib import Path
import json,sys,cv2,numpy as np
r=Path(__file__).resolve().parent
threshold=.72 # Declared before scanning the finished native clips.
for word in sys.argv[1:]:
 prep=json.load(open(r/(word+'-preparation.json')));c=cv2.VideoCapture('/home/tibule12/Videos/'+prep['sourceName']);c.set(cv2.CAP_PROP_POS_MSEC,(prep['sourceStart']+.5)*1000);ok,ref=c.read();c.release();assert ok
 template=cv2.cvtColor(ref[824:846,494:574],cv2.COLOR_BGR2GRAY);template=cv2.Laplacian(template,cv2.CV_32F)
 c=cv2.VideoCapture(str(r/'private'/word/'native-motion-flow/final.mp4'));scores=[];images=[]
 while True:
  ok,im=c.read()
  if not ok:break
  roi=cv2.Laplacian(cv2.cvtColor(im[750:900,425:576],cv2.COLOR_BGR2GRAY),cv2.CV_32F)
  score=float(cv2.matchTemplate(roi,template,cv2.TM_CCOEFF_NORMED).max());scores.append(score)
  if score>=threshold:images.append((len(scores)-1,im))
 c.release();positive=float(cv2.matchTemplate(cv2.Laplacian(cv2.cvtColor(ref[750:900,425:576],cv2.COLOR_BGR2GRAY),cv2.CV_32F),template,cv2.TM_CCOEFF_NORMED).max());assert positive>=threshold
 out={'word':word,'purpose':'Known-source TikTok-word edge correlation only; not universal semantic detection or whole creative qualification','predeclaredThreshold':threshold,'positiveSourceControl':positive,'framesChecked':len(scores),'maxNativeScore':max(scores),'exceedingFrames':[i for i,s in enumerate(scores)if s>=threshold],'scores':scores}
 (r/'private'/word/'known-logo-residual.json').write_text(json.dumps(out,indent=2))
 for i,im in images:cv2.imwrite(str(r/'private'/word/f'possible-logo-frame-{i}.png'),im)
 print(word,'positive',positive,'native max',max(scores),'exceeding',out['exceedingFrames'],flush=True)
