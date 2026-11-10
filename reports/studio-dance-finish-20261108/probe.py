from pathlib import Path
import sys,cv2,numpy as np,subprocess
from PIL import Image,ImageDraw
sys.path.insert(0,str(Path.cwd()))
from python_media_worker.studio_watermark_cleanup import badge_ink_mask,platform_icon_envelope
r=Path(__file__).resolve().parent
def frame(t):
    data=subprocess.check_output(['ffmpeg','-v','error','-ss',str(t),'-i','/home/tibule12/Videos/number two dance.mp4','-frames:v','1','-pix_fmt','bgr24','-f','rawvideo','-'])
    return np.frombuffer(data,np.uint8).reshape(1024,576,3).copy()
seed=frame(8);x,y,w,h=443,768,126,112
core,mask,_=badge_ink_mask(seed[y:y+h,x:x+w]);mask=platform_icon_envelope(core,mask,77)
board=Image.new('RGB',(3*292,4*382),'#11151c');d=ImageDraw.Draw(board)
for row,t in enumerate([9.5,12,13.75,13.875]):
    im=frame(t);full=np.zeros(im.shape[:2],np.uint8);full[y:y+h,x:x+w]=mask
    b,g,red=cv2.split(im);redmask=((red.astype(float)>g*1.4)&(red.astype(float)>b*1.35)&(red>60)).astype('uint8')
    n,labels,stats,_=cv2.connectedComponentsWithStats(redmask)
    protect=np.zeros_like(full)
    for i in range(1,n):
        if stats[i,4]>350 and (stats[i,0]<x or stats[i,1]<y):protect[labels==i]=255
    protect=cv2.dilate(protect,np.ones((3,3),np.uint8));full[protect>0]=0
    telea=cv2.inpaint(im,full,3,cv2.INPAINT_TELEA)
    ns=cv2.inpaint(im,full,5,cv2.INPAINT_NS)
    for col,(label,a) in enumerate([('original',im),('tight / Telea',telea),('tight / NS',ns)]):
        crop=Image.fromarray(cv2.cvtColor(a[740:910,430:576],cv2.COLOR_BGR2RGB)).resize((292,340))
        board.paste(crop,(col*292,row*382+42));d.text((col*292+5,row*382+5),f'{t}s / {label}',fill='white')
board.save(r/'private/cleanup-probe.jpg',quality=96)
