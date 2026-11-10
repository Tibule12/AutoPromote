"""Private current-source hand/cuff joint solve; no native model admission.

Uses separately tracked current garment material rather than treating semantic
hand interiors as true opacity. Outputs stay internal until real motion passes.
"""
import argparse,json,time
from pathlib import Path
import cv2,numpy as np
from PIL import Image,ImageDraw
from scipy.ndimage import distance_transform_edt
from model_workers.common import sha,write_json
from recovered_motion_inputs import PRIVATE,RECOVERED,PAIR,original,pair,renderer,load_components


def solve(C,B,hand,cuff,observed,prior,oldF,*,strength=1.5,iterations=30):
    C=C.astype(np.float64)/255;B=B.astype(np.float64)/255
    hd=cv2.distanceTransform((hand>=224).astype(np.uint8),cv2.DIST_L2,5)
    cd=cv2.distanceTransform((cuff>=224).astype(np.uint8),cv2.DIST_L2,5)
    hsv=cv2.cvtColor(np.rint(C*255).astype(np.uint8),cv2.COLOR_RGB2HSV)
    skin=(hd>10)&(cd<3)&(C[:,:,0]-C[:,:,1]>.025)&(C[:,:,1]>=C[:,:,2]-.01)&(prior>.98)&(hsv[:,:,2]<235)
    cloth=(cd>12)&(hsv[:,:,1]<80)&(prior>.98)
    if skin.sum()<24 or cloth.sum()<24:raise ValueError('Insufficient independently selected current opaque material')
    # Reject implausible sampled screen orange from the skin seeds using the
    # dominant deep current palm chromaticity, never a global fixed skin hue.
    values=C[skin];chroma=values/np.maximum(values.sum(1,keepdims=True),.001);median=np.median(chroma,axis=0)
    distance=np.linalg.norm(C/np.maximum(C.sum(2,keepdims=True),.001)-median,axis=2)
    skin &= distance<.045
    if skin.sum()<20:raise ValueError('Deep skin seeds are not photometrically consistent')
    core=skin|cloth
    _,nearest=distance_transform_edt(~core,return_indices=True)
    material=C[nearest[0],nearest[1]].copy();material=cv2.GaussianBlur(material,(0,0),2)
    F=material.copy();A=prior.copy()
    domain=observed&(cv2.dilate((hand>=64).astype(np.uint8),np.ones((31,31),np.uint8))>0)
    # Both estimated channels share one actual photographed composition equation.
    # Do not force semantic interior pixels opaque through a blurred gesture.
    empty=domain&(np.max(abs(C-B),axis=2)<7/255)
    anchors=core.astype(float)*25
    # Foreground colour can vary with real shading, but photographed B texture
    # cannot independently become a new foreground island in the mixed edge.
    residuals=[]
    for _ in range(iterations):
        vector=F-B;contrast=np.sum(vector*vector,axis=2)
        target=np.clip(np.sum((C-B)*vector,axis=2)/np.maximum(contrast,.0001),0,1)
        unary=contrast+.002
        for j in range(12):
            neighbours=cv2.filter2D(A,-1,np.array([[0,1,0],[1,0,1],[0,1,0]],float),borderType=cv2.BORDER_REFLECT)
            A=(unary*target+.018*neighbours)/(unary+.072)
            A[~domain]=prior[~domain];A[empty]=0;A[skin|cloth]=1
        weight=A*A*domain
        base=anchors+.015+weight
        rhs=anchors[:,:,None]*C+.015*material+(A*domain)[:,:,None]*(C-(1-A[:,:,None])*B)
        for j in range(24):
            neighbours=cv2.filter2D(F,-1,np.array([[0,1,0],[1,0,1],[0,1,0]],float),borderType=cv2.BORDER_REFLECT)
            F=((rhs+strength*neighbours)/(base+4*strength)[:,:,None]).clip(0,1)
        residuals.append(float(np.mean(abs(A[:,:,None]*F+(1-A[:,:,None])*B-C)[domain])))
    return A.clip(0,1),F.clip(0,1),{'currentSkinSeeds':int(skin.sum()),'independentCuffSeeds':int(cloth.sum()),'photoResidualHistory':residuals,'strength':strength,'iterations':iterations,'semanticCoreNotOpaqueSeed':True}


def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('out',type=Path);p.add_argument('--indices',default='7,23,10,17,35');p.add_argument('--strength',default=1.5,type=float);p.add_argument('--iterations',default=30,type=int);a=p.parse_args();a.out.mkdir(exist_ok=False);(a.out/'implementation.py').write_bytes(Path(__file__).read_bytes());cv2.setNumThreads(2)
 r=renderer();prepare=r._prepare_foreground;B=np.array(Image.open(PAIR/'actual-photographed-reference.png'));observed=np.array(Image.open(PAIR/'actual-photographed-support.png'))>0
 garment=PRIVATE/'garment-tracks-r147-20261105';gr=json.loads((garment/'receipt.json').read_text());start=time.monotonic();rows=[]
 for index in map(int,a.indices.split(',')):
  source=original(index);rgb=np.array(source);f,ma=pair(index);F=np.array(f).astype(float)/255;A=np.array(ma).astype(float)/255;components=load_components(index);stats=[]
  for ci in [1,2]:
   hand=components[ci];meta=gr['rows'][index]['components'][ci-1];cuffpath=garment/meta['file']
   if sha(cuffpath)!=meta['sha256']:raise ValueError('Independent cuff bytes changed')
   cuff=np.array(Image.open(cuffpath));ys,xs=np.where(hand>=64)
   if not len(xs):continue
   x0,y0=max(0,int(xs.min())-45),max(0,int(ys.min())-45);x1,y1=min(1430,int(xs.max())+46),min(1000,int(ys.max())+66);sl=np.s_[y0:y1,x0:x1]
   na,nf,diagnostic=solve(rgb[sl],B[sl],hand[sl],cuff[sl],observed[sl],A[sl],F[sl],strength=a.strength,iterations=a.iterations)
   domain=(cv2.dilate((hand[sl]>=64).astype(np.uint8),np.ones((31,31),np.uint8))>0)&observed[sl]
   weight=np.minimum(cv2.distanceTransform(domain.astype(np.uint8),cv2.DIST_L2,5)/8,1)
   # The separate current primary person prevents hand-only geometry from
   # deleting the neighbouring shoulder outside the hand/cuff selections.
   unrelated=(components[0][sl]>=128)&(hand[sl]<32)&(cuff[sl]<32)
   weight[unrelated]=0
   nexta=A[sl]*(1-weight)+na*weight
   premul=F[sl]*A[sl][:,:,None]*(1-weight[:,:,None])+nf*na[:,:,None]*weight[:,:,None]
   F[sl]=premul/np.maximum(nexta[:,:,None],.001);A[sl]=nexta;stats.append({'component':ci,**diagnostic})
  foreground=Image.fromarray(np.rint(F.clip(0,1)*255).astype(np.uint8));alpha=Image.fromarray(np.rint(A.clip(0,1)*255).astype(np.uint8));r._prepare_foreground=lambda *unused,f=foreground,m=alpha:(f,m);result=r.render(source,index);r._prepare_foreground=prepare
  result.save(a.out/f'actual-composite-{index:04d}.png');foreground.save(a.out/f'foreground-{index:04d}.png');alpha.save(a.out/f'alpha-{index:04d}.png')
  for side,box in [('left',(280,240,700,720)),('right',(1040,170,1430,760))]:
   w,h=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(w*3,h+24))
   for col,(label,image)in enumerate([('Original source',source),('Earlier paired estimate',Image.open(PAIR/f'actual-composite-{index:04d}.png')),('Current separate-material joint solve',result)]):sheet.paste(image.crop(box),(col*w,24));ImageDraw.Draw(sheet).text((col*w+3,4),label,fill='white')
   sheet.save(a.out/f'actual-{side}-comparison-{index:04d}.jpg',quality=98)
  rows.append({'frame':index,'components':stats,'visualPass':False});print(json.dumps({'frame':index,'seconds':time.monotonic()-start}),flush=True)
 write_json(a.out/'receipt.json',{'rows':rows,'sourceRecoveryReceiptSha256':sha(RECOVERED/'receipt.json'),'cuffTrackingReceiptSha256':sha(garment/'receipt.json'),'elapsedSeconds':time.monotonic()-start,'nativeAdmission':False,'fourMinuteProof':False,'visualPass':False,'paidCloudInference':False,'providerUpload':False})
if __name__=='__main__':main()
