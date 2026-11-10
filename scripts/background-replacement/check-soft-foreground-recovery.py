"""Private fixed-background recovery of soft foreground RGB.

Opaque source details remain exact. A shared spatial foreground field regularizes
only the soft boundary rather than clipping an unstable per-pixel inverse. Alpha
is unchanged by default; the named diagnostic options also evaluate soft alpha.
"""
import argparse,json,time
from pathlib import Path
import cv2,numpy as np
from PIL import Image,ImageDraw
from scipy.ndimage import distance_transform_edt
from model_workers.common import sha,write_json
from recovered_motion_inputs import PRIVATE,RECOVERED,PAIR,original,renderer,load_components
from photographed_joint_solver import photographed_affine_transmission
from model_workers.adapters.temporal_alpha import source_motion_radius


def recover(C,B,A,old,observed,*,strength=.7,iterations=300):
 C=C.astype(float)/255;B=B.astype(float)/255
 opaque=A>=254/255
 if opaque.sum()<32:raise ValueError('No opaque current source anchors')
 _,nearest=distance_transform_edt(~opaque,return_indices=True)
 initial=C[nearest[0],nearest[1]].copy()
 F=initial.copy();anchors=opaque.astype(float)*50
 data=A*A*observed
 rhs=A[:,:,None]*(C-(1-A[:,:,None])*B)*observed[:,:,None]+anchors[:,:,None]*C+.001*initial
 base=data+anchors+.001
 kernel=np.array([[0,1,0],[1,0,1],[0,1,0]],float)
 for iteration in range(iterations):
  near=cv2.filter2D(F,-1,kernel,borderType=cv2.BORDER_REFLECT)
  nextf=np.clip((rhs+strength*near)/(base+4*strength)[:,:,None],0,1)
  error=float(abs(nextf-F).max());F=nextf
  if error<1e-5:break
 F[opaque]=C[opaque]
 return F,{'fixedSourceBackground':True,'iterations':iteration+1,'maximumFgUpdate':error,'sourceOpaqueAnchors':int(opaque.sum()),'strength':strength}


def source_knn_alpha(rgb,background,observed,alpha,hand,primary):
 """Private source-colour-neighbour diagnostic, not a product model."""
 from pymatting import estimate_alpha_knn
 difference=np.max(abs(rgb.astype(np.int16)-background.astype(np.int16)),axis=2)
 deep=cv2.erode((hand>=224).astype(np.uint8),np.ones((15,15),np.uint8))>0
 foreground=(alpha>=254/255)&((hand<32)|deep)&(difference>16)
 background_pixels=(hand<8)&(primary<8)&observed&(difference<12)
 if foreground.sum()<32 or background_pixels.sum()<32:raise ValueError('Insufficient independent source-colour constraints')
 trimap=np.full(alpha.shape,.5);trimap[foreground]=1;trimap[background_pixels]=0
 output=estimate_alpha_knn(rgb.astype(float)/255,trimap,
  laplacian_kwargs={'n_neighbors':[12,8],'distance_weights':[1.,.1]},
  cg_kwargs={'maxiter':2000,'rtol':1e-6})
 return output,{'sourceColourKnnForegroundSeeds':int(foreground.sum()),'sourceColourKnnBackgroundSeeds':int(background_pixels.sum()),'productModelAdmission':False}


def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('out',type=Path);p.add_argument('--indices',default='7,17,35,39');p.add_argument('--parent',type=Path,default=PRIVATE/'native-alpha-full-motion-r188-20261106');p.add_argument('--strength',type=float,default=.7);p.add_argument('--all-frames',action='store_true');p.add_argument('--soft-photo-transmission',action='store_true');p.add_argument('--knn-soft',action='store_true');p.add_argument('--moving-photo-edge',action='store_true');a=p.parse_args();a.out.mkdir(exist_ok=False);cv2.setNumThreads(2);(a.out/'implementation.py').write_bytes(Path(__file__).read_bytes());r=renderer();prepare=r._prepare_foreground
 B=np.array(Image.open(PAIR/'actual-photographed-reference.png'));observed=np.array(Image.open(PAIR/'actual-photographed-support.png'))>0;rows=[];start=time.monotonic()
 for index in (range(48)if a.all_frames else map(int,a.indices.split(','))):
  image=original(index);rgb=np.array(image);F=np.array(Image.open(a.parent/f'foreground-{index:04d}.png')).astype(float)/255;ma=Image.open(a.parent/f'alpha-{index:04d}.png').convert('L');A=np.array(ma).astype(float)/255;planes=load_components(index);stats=[]
  baselineF=np.array(Image.open(PAIR/f'foreground-{index:04d}.png')).astype(float)/255;baselineA=np.array(Image.open(PAIR/f'alpha-{index:04d}.png')).astype(float)/255
  motion=source_motion_radius(rgb,np.array(original(index-1 if index else 1)),1)if a.moving_photo_edge else None
  for ci in [1,2]:
   hand=planes[ci];ys,xs=np.where(hand>=64)
   if not len(xs):continue
   x0,y0=max(0,int(xs.min())-45),max(0,int(ys.min())-45);x1,y1=min(1430,int(xs.max())+46),min(1000,int(ys.max())+66);sl=np.s_[y0:y1,x0:x1]
   if a.knn_soft:
    prior=A[sl].copy();target,knn_stats=source_knn_alpha(rgb[sl],B[sl],observed[sl],prior,hand[sl],planes[0][sl])
    domain=(cv2.dilate((hand[sl]>=64).astype(np.uint8),np.ones((31,31),np.uint8))>0)&observed[sl]
    weight=np.minimum(cv2.distanceTransform(domain.astype(np.uint8),cv2.DIST_L2,5)/8,1)
    weight*=np.clip((.999-prior)/.04,0,1)
    weight[(planes[0][sl]>=128)&(hand[sl]<32)]=0
    A[sl]=prior*(1-weight)+target*weight
    stats.append({'component':ci,**knn_stats})
   if a.soft_photo_transmission:
    prior=A[sl].copy()
    target,confidence,texture=photographed_affine_transmission(rgb[sl],B[sl],observed[sl],prior,radius=3)
    # Only genuinely mixed native edges may change. Photographed texture
    # transmission must not make a separately opaque palm transparent.
    domain=(cv2.dilate((hand[sl]>=64).astype(np.uint8),np.ones((31,31),np.uint8))>0)&observed[sl]
    weight=confidence*np.minimum(cv2.distanceTransform(domain.astype(np.uint8),cv2.DIST_L2,5)/8,1)
    gate=np.clip((.999-prior)/.03,0,1)
    if a.moving_photo_edge:
     depth=cv2.distanceTransform((hand[sl]>=224).astype(np.uint8),cv2.DIST_L2,5)
     release=np.clip((motion[sl]-4)/6,0,1)*np.clip((20-depth)/8,0,1)
     gate=np.maximum(gate,release)
    weight*=gate*np.clip(prior/.02,0,1)
    weight[(planes[0][sl]>=128)&(hand[sl]<32)]=0
    A[sl]=prior*(1-weight)+target*weight
   nf,diagnostic=recover(rgb[sl],B[sl],A[sl],F[sl],observed[sl],strength=a.strength)
   domain=(cv2.dilate((hand[sl]>=64).astype(np.uint8),np.ones((31,31),np.uint8))>0)&observed[sl]
   weight=np.minimum(cv2.distanceTransform(domain.astype(np.uint8),cv2.DIST_L2,5)/8,1)
   weight*=np.clip((.999-A[sl])/.04,0,1)
   F[sl]=F[sl]*(1-weight[:,:,None])+nf*weight[:,:,None];stats.append({'component':ci,**diagnostic})
  unrelated=(planes[0]>=128)&(np.maximum(planes[1],planes[2])<32);F[unrelated]=baselineF[unrelated];A[unrelated]=baselineA[unrelated]
  fg=Image.fromarray(np.rint(F.clip(0,1)*255).astype(np.uint8));alpha=Image.fromarray(np.rint(A*255).astype(np.uint8));r._prepare_foreground=lambda *unused,f=fg,m=alpha:(f,m);out=r.render(image,index);r._prepare_foreground=prepare;fg.save(a.out/f'foreground-{index:04d}.png');alpha.save(a.out/f'alpha-{index:04d}.png');out.save(a.out/f'actual-composite-{index:04d}.png')
  for side,box in [('left',(280,240,700,720)),('right',(1040,170,1430,760))]:
   w,h=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(w*3,h+24))
   for col,(label,picture)in enumerate([('Original source',image),('Earlier paired estimate',Image.open(PAIR/f'actual-composite-{index:04d}.png')),('Fixed-background soft foreground recovery',out)]):sheet.paste(picture.crop(box),(col*w,24));ImageDraw.Draw(sheet).text((col*w+3,4),label,fill='white')
   sheet.save(a.out/f'actual-{side}-comparison-{index:04d}.jpg',quality=98)
  rows.append({'frame':index,'components':stats,'visualPass':False});print(json.dumps({'frame':index,'seconds':time.monotonic()-start}),flush=True)
 write_json(a.out/'receipt.json',{'rows':rows,'allFrames':a.all_frames,'softPhotographicTransmission':a.soft_photo_transmission,'privateSourceColourKnn':a.knn_soft,'photographicReleaseOnlyInMeasuredMovingEdge':a.moving_photo_edge,'sourceSha256':json.loads((RECOVERED/'receipt.json').read_text())['sourceSha256'],'sourceRecoveryReceiptSha256':sha(RECOVERED/'receipt.json'),'elapsedSeconds':time.monotonic()-start,'parent':str(a.parent),'parentReceiptSha256':sha(a.parent/'receipt.json'),'nativeAdmission':False,'visualPass':False,'fourMinuteProof':False,'providerUpload':False,'paidCloudInference':False})
if __name__=='__main__':main()
