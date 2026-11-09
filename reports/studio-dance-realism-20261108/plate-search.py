import cv2,numpy as np,json
from pathlib import Path
from PIL import Image,ImageDraw
r=Path(__file__).resolve().parent;c=cv2.VideoCapture('/home/tibule12/Videos/number two dance.mp4');references=[]
for t in [8,9,10,11,12,13]:
 c.set(cv2.CAP_PROP_POS_MSEC,t*1000);ok,im=c.read();assert ok;references.append(im)
# Compare a surrounding ring; don't score pixels hidden by the original badge.
ring=np.zeros((1024,576),np.uint8);ring[750:896,435:576]=1;ring[770:880,460:576]=0
results=[];ims=[]
for t in np.arange(.2,5,.2):
 c.set(cv2.CAP_PROP_POS_MSEC,t*1000);ok,im=c.read();assert ok
 score=np.mean([np.abs(im.astype(float)-ref)[ring>0].mean()for ref in references]);results.append({'sourceTime':round(float(t),2),'meanRingDifference':float(score)});ims.append(im)
c.release();order=np.argsort([x['meanRingDifference']for x in results]);board=Image.new('RGB',(5*216,600),'#10131b');draw=ImageDraw.Draw(board)
for i,index in enumerate(order[:5]):
 im=ims[index];board.paste(Image.fromarray(cv2.cvtColor(im[700:970,420:576],cv2.COLOR_BGR2RGB)).resize((216,374)),(i*216,25));draw.text((i*216+5,5),str(results[index]),fill='white');
board.save(r/'private/plate-candidates.jpg');(r/'plate-search.json').write_text(json.dumps([results[i]for i in order],indent=2));print(results[order[0]]);cv2.imwrite(str(r/'private/best-early-source.png'),ims[order[0]])
