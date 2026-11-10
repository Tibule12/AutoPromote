from pathlib import Path
import subprocess,numpy as np,cv2,json,hashlib,warnings
from PIL import Image
r=Path(__file__).resolve().parent;(r/'prepared').mkdir(exist_ok=True)
src=Path('/home/tibule12/Videos/number one dance.mp4')
raw=subprocess.check_output(['ffmpeg','-v','error','-threads','2','-i',str(src),'-t','23.5','-vf','fps=2','-an','-pix_fmt','rgb24','-f','rawvideo','-'])
frames=np.frombuffer(raw,np.uint8).reshape(-1,1024,576,3);Y,X=np.indices((1024,576));masks=[]
for i,f in enumerate(frames):
    g=cv2.cvtColor(f,cv2.COLOR_RGB2GRAY);n,l,st,c=cv2.connectedComponentsWithStats(((g<65)&(Y>220)&(Y<900)).astype('uint8'));mask=np.zeros(g.shape,'uint8')
    for j in range(1,n):
        x,y,w,h,area=st[j]
        if area>1200 and h>100 and w<400:
            cv2.rectangle(mask,(max(0,x-18),max(0,y-18)),(min(575,x+w+18),min(1023,y+h+42)),1,-1)
    if i<14:mask[450:640,:140]=1
    if i>=10:mask[750:970,420:]=1
    masks.append(mask)
sift=cv2.SIFT_create(nfeatures=3000);matcher=cv2.BFMatcher();ref=16
rk,rd=sift.detectAndCompute(cv2.cvtColor(frames[ref],cv2.COLOR_RGB2GRAY),(1-masks[ref])*255)
registered=[];registrations=[]
for i,f in enumerate(frames):
    if i==ref:H=np.eye(3);inliers=999
    else:
        k,d=sift.detectAndCompute(cv2.cvtColor(f,cv2.COLOR_RGB2GRAY),(1-masks[i])*255)
        if d is None:continue
        matches=matcher.knnMatch(d,rd,k=2);good=[m for m,n in matches if m.distance<.7*n.distance]
        if len(good)<10:continue
        H,inmask=cv2.findHomography(np.float32([k[m.queryIdx].pt for m in good]),np.float32([rk[m.trainIdx].pt for m in good]),cv2.RANSAC,2)
        if H is None or np.count_nonzero(inmask)<10:continue
        inliers=int(np.count_nonzero(inmask))
    warped=cv2.warpPerspective(f,H,(576,1024));valid=cv2.warpPerspective((1-masks[i])*255,H,(576,1024),flags=cv2.INTER_NEAREST)
    a=warped.astype('float32');a[valid<255]=np.nan;registered.append(a);registrations.append({'time':i/2,'inliers':inliers,'H':H.tolist()})
arr=np.array(registered)
with warnings.catch_warnings():
    warnings.simplefilter('ignore');plate=np.nanmedian(arr,axis=0)
missing=np.isnan(plate).any(2);plate=np.uint8(np.nan_to_num(plate,nan=0))
if missing.any():plate=cv2.inpaint(plate,missing.astype('uint8')*255,5,cv2.INPAINT_TELEA)
Image.fromarray(plate).save(r/'prepared/Court - temporal background plate.png')
(r/'plate-provenance.json').write_text(json.dumps({'sourceSha256':hashlib.file_digest(src.open('rb'),'sha256').hexdigest(),'registrations':registrations,'referenceSeconds':ref/2,'method':'SIFT/RANSAC planar registration and per-pixel temporal median of actual source with subject and alternating badge exclusions','inferredHolePixels':int(np.count_nonzero(missing)),'inferredHoleMethod':'OpenCV Telea5 only where no unoccluded sample exists','noGenerativeProvider':True,'backgroundIsPreparedSourcePlateNotRecoveredGroundTruth':True},indent=2))
print('Prepared actual-source background; missing/inferred pixels',np.count_nonzero(missing))
