"""Private photographed empty-background correction after moving material repair.

A blue background gap cannot become opaque black after spill subtraction.
Only repeatedly photographed empty support and actual current RGB authorize
this correction; real foreground colours that differ from B remain untouched.
"""
import argparse,json,time
from pathlib import Path
import cv2,numpy as np
from PIL import Image,ImageDraw
from model_workers.common import sha,write_json
from recovered_motion_inputs import PRIVATE,RECOVERED,PAIR,original,renderer,load_components


def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('out',type=Path);p.add_argument('--parent',type=Path,default=PRIVATE/'current-material-motion-r189-20261106');p.add_argument('--indices',default='15,39,17,7,35');p.add_argument('--all-frames',action='store_true');p.add_argument('--noise',type=float,default=9);a=p.parse_args();a.out.mkdir(exist_ok=False);cv2.setNumThreads(2);(a.out/'implementation.py').write_bytes(Path(__file__).read_bytes());r=renderer();prepare=r._prepare_foreground
 B=np.array(Image.open(PAIR/'actual-photographed-reference.png')).astype(float);observed=np.array(Image.open(PAIR/'actual-photographed-support.png'))>0;rows=[];start=time.monotonic()
 for index in (range(48)if a.all_frames else map(int,a.indices.split(','))):
  image=original(index);C=np.array(image).astype(float);foreground=Image.open(a.parent/f'foreground-{index:04d}.png').convert('RGB');before=np.array(Image.open(a.parent/f'alpha-{index:04d}.png').convert('L'));A=before.astype(float)/255;planes=load_components(index)
  support=np.maximum(planes[1],planes[2]);domain=(cv2.dilate((support>=64).astype(np.uint8),np.ones((31,31),np.uint8))>0)&observed
  domain&=~((planes[0]>=128)&(support<32))
  residual=np.max(abs(C-B),axis=2)
  # Measured source-code agreement, not a blue-hue veto. Remove only the
  # portion of this candidate unsupported above the actual codec/noise floor.
  keep=np.clip((residual-a.noise)/(a.noise+1),0,1)
  scope=np.minimum(cv2.distanceTransform(domain.astype(np.uint8),cv2.DIST_L2,5)/6,1)
  A*=1-scope*(1-keep)
  alpha=Image.fromarray(np.rint(A*255).astype(np.uint8));r._prepare_foreground=lambda *unused,f=foreground,m=alpha:(f,m);out=r.render(image,index);r._prepare_foreground=prepare
  foreground.save(a.out/f'foreground-{index:04d}.png');alpha.save(a.out/f'alpha-{index:04d}.png');out.save(a.out/f'actual-composite-{index:04d}.png')
  for side,box in [('left',(280,240,700,720)),('right',(1040,170,1430,760))]:
   w,h=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(w*3,h+24))
   for col,(label,picture)in enumerate([('Original source',image),('Earlier material repair',Image.open(a.parent/f'actual-composite-{index:04d}.png')),('Photographed empty-gap correction',out)]):sheet.paste(picture.crop(box),(col*w,24));ImageDraw.Draw(sheet).text((col*w+3,4),label,fill='white')
   sheet.save(a.out/f'actual-{side}-comparison-{index:04d}.jpg',quality=98)
  rows.append({'frame':index,'alphaPixelsChanged':int((np.array(alpha)!=before).sum()),'knownObservedBackgroundCompared':True,'foregroundRgbUnchanged':True,'visualPass':False});print(json.dumps({'frame':index,'seconds':time.monotonic()-start}),flush=True)
 write_json(a.out/'receipt.json',{'rows':rows,'allFrames':a.all_frames,'parent':str(a.parent),'parentReceiptSha256':sha(a.parent/'receipt.json'),'sourceSha256':json.loads((RECOVERED/'receipt.json').read_text())['sourceSha256'],'sourceRecoveryReceiptSha256':sha(RECOVERED/'receipt.json'),'observedBackgroundSha256':sha(PAIR/'actual-photographed-reference.png'),'observedSupportSha256':sha(PAIR/'actual-photographed-support.png'),'noiseFloor255':a.noise,'elapsedSeconds':time.monotonic()-start,'nativeAdmission':False,'visualPass':False,'fourMinuteProof':False,'paidCloudInference':False,'providerUpload':False})
if __name__=='__main__':main()
