"""Read-only cross-camera matching of the photographed old TV background."""
from pathlib import Path
import cv2,numpy as np,json
from PIL import Image,ImageDraw
r=Path('reports/background-replacement-20261101/private/four-minute-r9');cv2.setNumThreads(2)
a=np.array(Image.open(r/'source-115.png'));b=np.array(Image.open(r/'source-055.png'));maskA=np.zeros(a.shape[:2],np.uint8);maskA[100:730,750:]=255;maskA[400:]=0;maskB=np.zeros(b.shape[:2],np.uint8);maskB[40:750,:390]=255
sift=cv2.SIFT_create(nfeatures=8000);k1,d1=sift.detectAndCompute(cv2.cvtColor(a,cv2.COLOR_RGB2GRAY),maskA);k2,d2=sift.detectAndCompute(cv2.cvtColor(b,cv2.COLOR_RGB2GRAY),maskB);good=[m for m,n in cv2.BFMatcher().knnMatch(d2,d1,k=2) if m.distance<.7*n.distance];print('TV_MATCHES',len(good),flush=True)
if len(good)>6:
 pts=np.float32([k2[m.queryIdx].pt for m in good]);dst=np.float32([k1[m.trainIdx].pt for m in good]);H,inside=cv2.findHomography(pts,dst,cv2.RANSAC,2);print('INLIERS',int(inside.sum()),H,flush=True);warped=cv2.warpPerspective(b,H,(1430,1000),flags=cv2.INTER_LANCZOS4);Image.fromarray(warped).save(r/'cross-camera-tv-plate.png');mix=np.rint(a*.5+warped*.5).astype(np.uint8);Image.fromarray(mix).save(r/'cross-camera-tv-overlay.png');(r/'cross-camera-tv-mapping.json').write_text(json.dumps({'matrix':H.tolist(),'matches':len(good),'inliers':int(inside.sum()),'qualification':'Actual pixel and occlusion review required; this is not a recovered clean plate.'},indent=2))
