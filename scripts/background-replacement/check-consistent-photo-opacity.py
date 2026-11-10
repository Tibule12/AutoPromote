"""Private coupled source reconstruction after photographic opacity correction.

Never keep foreground RGB estimated with an obsolete alpha. Retained source,
background and tracked components are used; no model admission is manufactured.
"""
import argparse,json,time
from pathlib import Path
import cv2,numpy as np
from PIL import Image,ImageDraw
from model_workers.common import sha,write_json
from photographed_joint_solver import photographed_affine_transmission,regularize_photographed_opacity
from recovered_motion_inputs import PRIVATE,RECOVERED,PAIR,original,pair,renderer,load_components


def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('out',type=Path);p.add_argument('--indices',default='7,23,10,17,35');p.add_argument('--propagate',action='store_true');p.add_argument('--radius',default=10,type=int);p.add_argument('--native-alpha',action='store_true');p.add_argument('--restore-native-opaque-core',action='store_true');p.add_argument('--common-noise',action='store_true');p.add_argument('--all-frames',action='store_true');p.add_argument('--prior-alpha',action='store_true');a=p.parse_args();a.out.mkdir(exist_ok=False);cv2.setNumThreads(2)
 (a.out/'implementation.py').write_bytes(Path(__file__).read_bytes());(a.out/'photographed_joint_solver.py').write_bytes(Path(__file__).with_name('photographed_joint_solver.py').read_bytes())
 B=np.array(Image.open(PAIR/'actual-photographed-reference.png'));observed=np.array(Image.open(PAIR/'actual-photographed-support.png'))>0;r=renderer();prepare=r._prepare_foreground;rows=[];started=time.monotonic()
 for index in (range(48)if a.all_frames else map(int,a.indices.split(','))):
  image=original(index);rgb=np.array(image);f,alpha=pair(index);F=np.array(f).astype(float)/255;A=np.array(alpha).astype(float)/255;components=load_components(index);stats=[]
  for ci in [1,2]:
   hand=components[ci];ys,xs=np.where(hand>=64)
   if not len(xs):continue
   x0,y0=max(0,int(xs.min())-55),max(0,int(ys.min())-55);x1,y1=min(1430,int(xs.max())+56),min(1000,int(ys.max())+56);sl=np.s_[y0:y1,x0:x1]
   C=rgb[sl].astype(float)/255;bg=B[sl].astype(float)/255;prior=A[sl]
   if a.native_alpha or a.prior_alpha:na=prior.copy()
   else:
    target,confidence,texture=photographed_affine_transmission(rgb[sl],B[sl],observed[sl],prior,radius=a.radius)
    na=regularize_photographed_opacity(rgb[sl],prior,target,confidence,B[sl],observed[sl]) if a.propagate else target
   if a.native_alpha:
    na=np.array(Image.open(RECOVERED/f'native-alpha/matte_{index:04d}.png')).astype(float)[sl]/255
   if a.restore_native_opaque_core:
    native=np.array(Image.open(RECOVERED/f'native-alpha/matte_{index:04d}.png'))[sl]
    depth=cv2.distanceTransform((hand[sl]>=224).astype(np.uint8),cv2.DIST_L2,5)
    opacity=np.clip((depth-6)/10,0,1)*(native>=254)
    na=na*(1-opacity)+opacity
   if a.common_noise:
    delta=C-bg;smooth=cv2.GaussianBlur(delta,(0,0),.7)
    soft=np.clip((.995-na)/.2,0,1)
    C=bg+delta*(1-soft[:,:,None])+smooth*soft[:,:,None]
    noise=6/255
    lower=np.maximum(np.maximum((C-bg-noise)/np.maximum(1-bg,1e-6),(bg-C-noise)/np.maximum(bg,1e-6)).max(2),0).clip(0,1)
    na=np.maximum(na,lower)
   # Reconstruct with this run's opacity. Earlier r151 already recomputed
   # foreground too; obsolete foreground RGB was not its verified defect.
   premul=C-(1-na[:,:,None])*bg
   nf=(premul/np.maximum(na[:,:,None],.001)).clip(0,1)
   domain=(cv2.dilate((hand[sl]>=64).astype(np.uint8),np.ones((31,31),np.uint8))>0)&observed[sl]
   weight=np.minimum(cv2.distanceTransform(domain.astype(np.uint8),cv2.DIST_L2,5)/8,1)
   unrelated=(components[0][sl]>=128)&(hand[sl]<32)
   weight[unrelated]=0
   nexta=prior*(1-weight)+na*weight
   P=F[sl]*prior[:,:,None]*(1-weight[:,:,None])+nf*na[:,:,None]*weight[:,:,None]
   F[sl]=P/np.maximum(nexta[:,:,None],.001);A[sl]=nexta
   stats.append({'component':ci,'textureConstraintPixels':0 if (a.native_alpha or a.prior_alpha) else int((confidence>.5).sum()),'foregroundRecomputedAfterNewAlpha':True})
  fg=Image.fromarray(np.rint(F.clip(0,1)*255).astype(np.uint8));ma=Image.fromarray(np.rint(A.clip(0,1)*255).astype(np.uint8));r._prepare_foreground=lambda *unused,f=fg,m=ma:(f,m);out=r.render(image,index);r._prepare_foreground=prepare
  fg.save(a.out/f'foreground-{index:04d}.png');ma.save(a.out/f'alpha-{index:04d}.png');out.save(a.out/f'actual-composite-{index:04d}.png')
  for side,box in [('left',(280,240,700,720)),('right',(1040,170,1430,760))]:
   w,h=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(w*3,h+24))
   for col,(label,picture)in enumerate([('Original source',image),('Earlier paired correction',Image.open(PAIR/f'actual-composite-{index:04d}.png')),('Reconstructed F after corrected alpha',out)]):sheet.paste(picture.crop(box),(col*w,24));ImageDraw.Draw(sheet).text((col*w+3,4),label,fill='white')
   sheet.save(a.out/f'actual-{side}-comparison-{index:04d}.jpg',quality=98)
  rows.append({'frame':index,'components':stats,'visualPass':False});print(json.dumps({'frame':index,'seconds':time.monotonic()-started}),flush=True)
 write_json(a.out/'receipt.json',{'rows':rows,'allFrames':a.all_frames,'propagatePhotographicOpacity':a.propagate,'radius':a.radius,'originalSavedNativeAlphaUsed':a.native_alpha,'existingSoftAlphaPriorRetained':a.prior_alpha,'nativeOpaqueCoreRestored':a.restore_native_opaque_core,'commonObservationNoise':a.common_noise,'newOpacityAndForegroundUseSameSourceEquation':True,'sourceSha256':json.loads((RECOVERED/'receipt.json').read_text())['sourceSha256'],'unrelatedCurrentPersonOutsideHandSelectionPreserved':True,'sourceRecoveryReceiptSha256':sha(RECOVERED/'receipt.json'),'elapsedSeconds':time.monotonic()-started,'nativeAdmission':False,'fourMinuteProof':False,'visualPass':False,'paidCloudInference':False,'providerUpload':False})
if __name__=='__main__':main()
