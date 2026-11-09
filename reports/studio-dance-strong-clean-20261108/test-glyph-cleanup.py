import cv2,numpy as np
from pathlib import Path
r=Path(__file__).resolve().parent;p=r/'private';cap=cv2.VideoCapture('/home/tibule12/Videos/number two dance.mp4');cap.set(cv2.CAP_PROP_POS_MSEC,8000);ok,im=cap.read();assert ok
x,y,w,h=443,768,126,112;roi=im[y:y+h,x:x+w];gray=roi.max(axis=2);top=cv2.morphologyEx(gray,cv2.MORPH_TOPHAT,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(21,21)));mask=((gray>125)&(top>24)).astype('uint8')*255
mask=cv2.dilate(mask,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(9,9)));whole=np.zeros(im.shape[:2],np.uint8);whole[y:y+h,x:x+w]=mask
for method,name in [(cv2.INPAINT_TELEA,'telea'),(cv2.INPAINT_NS,'ns')]:
 out=cv2.inpaint(im,whole,3,method);cv2.imwrite(str(p/('glyph-'+name+'.png')),out);cv2.imwrite(str(p/('glyph-'+name+'-corner.png')),out[735:925,400:576]);
cv2.imwrite(str(p/'glyph-mask.png'),whole);cv2.imwrite(str(p/'glyph-source.png'),im)
