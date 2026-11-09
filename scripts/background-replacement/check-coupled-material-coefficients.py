"""Private spatially coupled photographed material/background decomposition.

Fit C = s*U + t*B with two continuous coefficient fields. U is measured current
hand/cuff chromaticity, alpha=1-t and s*U is premultiplied foreground. Independent
opaque model interiors anchor t=0; no opaque seed is inferred from colour alone.
"""
import argparse,json,time
from pathlib import Path
import cv2,numpy as np
from PIL import Image,ImageDraw
from scipy.ndimage import distance_transform_edt
from model_workers.common import sha,write_json
from recovered_motion_inputs import PRIVATE,RECOVERED,PAIR,original,renderer,load_components,pair


def solve(C,B,hand,cuff,native,prior,observed,*,smooth=.05,iterations=400):
 C=C.astype(np.float64)/255;B=B.astype(np.float64)/255
 hd=cv2.distanceTransform((hand>=224).astype(np.uint8),cv2.DIST_L2,5)
 cd=cv2.distanceTransform((cuff>=224).astype(np.uint8),cv2.DIST_L2,5)
 y=C@np.array([.2126,.7152,.0722]);hsv=cv2.cvtColor(np.rint(C*255).astype(np.uint8),cv2.COLOR_RGB2HSV)
 warm=(C[:,:,0]-C[:,:,2]>.045)&(C[:,:,1]-C[:,:,2]>.012)
 skin=(hd>6)&(cd<3)&(native>=254)&warm&(y>.06)&(y<.8)
 cloth=(cd>10)&(native>=254)&(hsv[:,:,1]<80)&(y>.15)
 if skin.sum()<12 or cloth.sum()<16:raise ValueError('Insufficient independently photographed material seeds')
 core=skin|cloth;_,nearest=distance_transform_edt(~core,return_indices=True)
 chroma=C/np.maximum(y[:,:,None],.01);U=chroma[nearest[0],nearest[1]];U=cv2.GaussianBlur(U,(0,0),3)
 difference=np.max(abs(C-B),axis=2)
 opaque=np.clip((hd-6)/10,0,1)*(native>=254)*(difference>.06)
 opaque=np.maximum(opaque,np.clip((cd-8)/10,0,1)*(native>=254)*(difference>.06))
 empty=observed&(difference<6/255)
 anchor=opaque*8;anchor[empty]=15
 target_t=np.zeros_like(prior);target_t[empty]=1
 # Current prior is a weak guide, never evidence stronger than the photo.
 uu=np.sum(U*U,axis=2);bb=np.sum(B*B,axis=2);ub=np.sum(U*B,axis=2)
 uc=np.sum(U*C,axis=2);bc=np.sum(B*C,axis=2)
 lambda_s=smooth;lambda_t=smooth
 m11=uu+4*lambda_s+.0001;m22=bb+4*lambda_t+anchor+.001
 det=m11*m22-ub*ub
 t=1-prior;s=np.maximum(np.sum((C-t[:,:,None]*B)*U,axis=2)/np.maximum(uu,1e-8),0)
 kernel=np.array([[0,1,0],[1,0,1],[0,1,0]],np.float64)
 last=None
 for i in range(iterations):
  rs=uc+lambda_s*cv2.filter2D(s,-1,kernel,borderType=cv2.BORDER_REFLECT)
  rt=bc+lambda_t*cv2.filter2D(t,-1,kernel,borderType=cv2.BORDER_REFLECT)+anchor*target_t+.001*(1-prior)
  ns=np.maximum((rs*m22-rt*ub)/det,0)
  nt=np.clip((rt*m11-rs*ub)/det,0,1)
  change=max(float(np.max(abs(ns-s))),float(np.max(abs(nt-t))));s,t=ns,nt
  if change<1e-6:break
 a=1-t;P=s[:,:,None]*U;F=P/np.maximum(a[:,:,None],.001)
 # Exact current opaque surface details, including rings/fabric, survive;
 # inferred soft-edge pixels use the same coefficient pair and no old B RGB.
 keep=np.minimum(opaque,1);F=F*(1-keep[:,:,None])+C*keep[:,:,None]
 return a,F.clip(0,1),{'currentSkinSeeds':int(skin.sum()),'independentCuffSeeds':int(cloth.sum()),'iterations':i+1,'maximumCoefficientUpdate':change,'meanPhotographicResidual':float(np.mean(abs(P+t[:,:,None]*B-C)[observed])),'strength':smooth}


def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('out',type=Path);p.add_argument('--indices',default='7,17,35,39');p.add_argument('--smooth',type=float,default=.05);p.add_argument('--all-frames',action='store_true');a=p.parse_args();a.out.mkdir(exist_ok=False);cv2.setNumThreads(2);(a.out/'implementation.py').write_bytes(Path(__file__).read_bytes())
 r=renderer();prepare=r._prepare_foreground;B=np.array(Image.open(PAIR/'actual-photographed-reference.png'));observed=np.array(Image.open(PAIR/'actual-photographed-support.png'))>0;garment=PRIVATE/'garment-tracks-r147-20261105';gr=json.loads((garment/'receipt.json').read_text());started=time.monotonic();rows=[]
 for index in (range(48)if a.all_frames else map(int,a.indices.split(','))):
  image=original(index);C=np.array(image);f,ma=pair(index);F=np.array(f).astype(float)/255;A=np.array(ma).astype(float)/255;planes=load_components(index);native=np.array(Image.open(RECOVERED/f'native-alpha/matte_{index:04d}.png'));stats=[]
  for ci in [1,2]:
   hand=planes[ci];meta=gr['rows'][index]['components'][ci-1];path=garment/meta['file']
   if sha(path)!=meta['sha256']:raise ValueError('Cuff evidence changed')
   cuff=np.array(Image.open(path));ys,xs=np.where(hand>=64)
   if not len(xs):continue
   x0,y0=max(0,int(xs.min())-55),max(0,int(ys.min())-55);x1,y1=min(1430,int(xs.max())+56),min(1000,int(ys.max())+66);sl=np.s_[y0:y1,x0:x1]
   na,nf,diag=solve(C[sl],B[sl],hand[sl],cuff[sl],native[sl],A[sl],observed[sl],smooth=a.smooth)
   domain=(cv2.dilate((hand[sl]>=64).astype(np.uint8),np.ones((31,31),np.uint8))>0)&observed[sl];weight=np.minimum(cv2.distanceTransform(domain.astype(np.uint8),cv2.DIST_L2,5)/8,1);weight[(planes[0][sl]>=128)&(hand[sl]<32)]=0
   nexta=A[sl]*(1-weight)+na*weight;P=F[sl]*A[sl][:,:,None]*(1-weight[:,:,None])+nf*na[:,:,None]*weight[:,:,None];F[sl]=P/np.maximum(nexta[:,:,None],.001);A[sl]=nexta;stats.append({'component':ci,**diag})
  foreground=Image.fromarray(np.rint(F.clip(0,1)*255).astype(np.uint8));alpha=Image.fromarray(np.rint(A.clip(0,1)*255).astype(np.uint8));r._prepare_foreground=lambda *unused,f=foreground,m=alpha:(f,m);out=r.render(image,index);r._prepare_foreground=prepare;foreground.save(a.out/f'foreground-{index:04d}.png');alpha.save(a.out/f'alpha-{index:04d}.png');out.save(a.out/f'actual-composite-{index:04d}.png')
  for side,box in [('left',(280,240,700,720)),('right',(1040,170,1430,760))]:
   w,h=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(w*3,h+24))
   for col,(label,picture)in enumerate([('Original source',image),('Earlier paired estimate',Image.open(PAIR/f'actual-composite-{index:04d}.png')),('Coupled material/background coefficients',out)]):sheet.paste(picture.crop(box),(col*w,24));ImageDraw.Draw(sheet).text((col*w+3,4),label,fill='white')
   sheet.save(a.out/f'actual-{side}-comparison-{index:04d}.jpg',quality=98)
  rows.append({'frame':index,'components':stats,'visualPass':False});print(json.dumps({'frame':index,'seconds':time.monotonic()-started}),flush=True)
 write_json(a.out/'receipt.json',{'rows':rows,'allFrames':a.all_frames,'sourceSha256':json.loads((RECOVERED/'receipt.json').read_text())['sourceSha256'],'sourceRecoveryReceiptSha256':sha(RECOVERED/'receipt.json'),'elapsedSeconds':time.monotonic()-started,'visualPass':False,'nativeAdmission':False,'fourMinuteProof':False,'providerUpload':False,'paidCloudInference':False})
if __name__=='__main__':main()
