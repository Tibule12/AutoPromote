"""Source-assisted polygon authoring; emits editable points, never effect footage.

The ROI is a reviewed authoring selection on this retained shot. This is not
advertised as a general segmentation/tracking model or a Studio AI service.
"""
import hashlib,json
from pathlib import Path
import cv2
import numpy as np
from PIL import Image,ImageDraw

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'reports/studio-cinematic-episode-20261101'
SOURCE=ROOT/'reports/studio-motion-flow-takeover-20261031/video-texture/open-world-sources/Coast.mp4'
capture=cv2.VideoCapture(str(SOURCE))
points=[]
review=Image.new('RGB',(1280,760),'#10131c');draw=ImageDraw.Draw(review)
for index in range(96):
    ok,frame=capture.read()
    if not ok:raise RuntimeError('Incomplete source decoding')
    h,w=frame.shape[:2]
    grey=cv2.cvtColor(frame,cv2.COLOR_BGR2GRAY)
    binary=np.zeros((h,w),np.uint8)
    binary[int(h*.35):int(h*.69),int(w*.66):int(w*.90)]=(grey[int(h*.35):int(h*.69),int(w*.66):int(w*.90)]<65)*255
    binary=cv2.morphologyEx(binary,cv2.MORPH_CLOSE,np.ones((3,3),np.uint8))
    contours,_=cv2.findContours(binary,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)
    eligible=[c for c in contours if cv2.contourArea(c)>1500 and cv2.boundingRect(c)[1]<h*.55]
    if not eligible:raise RuntimeError(f'No reviewable subject contour at frame {index}')
    contour=max(eligible,key=cv2.contourArea).reshape(-1,2).astype(float)
    # Anchor at the topmost head point and preserve contour orientation so
    # ordinary numeric point keys can interpolate neighbouring source samples.
    anchor=np.lexsort((contour[:,0],contour[:,1]))[0]
    contour=np.concatenate((contour[anchor:],contour[:anchor],contour[anchor:anchor+1]))
    lengths=np.sqrt(np.sum(np.diff(contour,axis=0)**2,axis=1));distance=np.r_[0,np.cumsum(lengths)]
    samples=np.linspace(0,distance[-1],30,endpoint=False)
    polygon=np.column_stack([np.interp(samples,distance,contour[:,axis]) for axis in [0,1]])
    values=(polygon/np.array([w,h])*100).round(6).tolist()
    points.append({'sourceFrame':index,'sourceTime':index/24,'points':values})
    if index in [0,24,48,95]:
        slot=[0,24,48,95].index(index);im=Image.fromarray(cv2.cvtColor(frame,cv2.COLOR_BGR2RGB));p=ImageDraw.Draw(im)
        p.line([tuple(point) for point in polygon]+[tuple(polygon[0])],fill='#c4ff43',width=2)
        im.thumbnail((640,360));x=slot%2*640;y=slot//2*380
        review.paste(im,(x,y+20));draw.text((x+8,y+4),f'Source {index}/24 - authored upper-body occlusion contour',fill='white')
capture.release()
review.save(OUT/'subject-contour-review-torso.jpg')
(OUT/'subject-point-directions.json').write_text(json.dumps({'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
    'method':'Reviewed dark-subject ROI, connected contour and anchored 30-point resampling',
    'scope':'Upper-body occlusion authoring on this shot; not automatic whole-person segmentation or general tracking qualification.',
    'fps':24,'frames':points},separators=(',',':')))
print('Prepared 96 source-bound polygon poses for native editable point keys.')
