"""Private material-conditioned colour repair, preserving source-sized opacity.

Blue reflected room light is measured on the actual hand surface; it must not
be erased as if it were empty background. The default changes excess-blue
chroma; the optional photographed-direction diagnostic also tests other spill.
"""
import argparse,json,time
from pathlib import Path
import cv2,numpy as np
from PIL import Image,ImageDraw
from scipy.spatial import cKDTree
from model_workers.common import sha,write_json
from recovered_motion_inputs import PRIVATE,RECOVERED,PAIR,original,renderer,load_components


def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('out',type=Path);p.add_argument('--indices',default='7,23,10,17,35');p.add_argument('--parent',type=Path,default=PRIVATE/'native-alpha-photo-pair-r184-20261106');p.add_argument('--all-frames',action='store_true');p.add_argument('--strong',action='store_true');p.add_argument('--subtract-room-light',action='store_true');p.add_argument('--protect-primary',action='store_true');p.add_argument('--deep-light-only',action='store_true');p.add_argument('--photographed-spill-direction',action='store_true');p.add_argument('--domain-radius',type=int,choices=[3,15],default=3);a=p.parse_args();a.out.mkdir(exist_ok=False);cv2.setNumThreads(2);(a.out/'implementation.py').write_bytes(Path(__file__).read_bytes())
 r=renderer();prepare=r._prepare_foreground;oldroom=np.array(Image.open(PAIR/'actual-photographed-reference.png')).astype(float)/255;observed=np.array(Image.open(PAIR/'actual-photographed-support.png'))>0;garment=PRIVATE/'garment-tracks-r147-20261105';gr=json.loads((garment/'receipt.json').read_text());started=time.monotonic();rows=[]
 for index in (range(48)if a.all_frames else map(int,a.indices.split(','))):
  image=original(index);f=Image.open(a.parent/f'foreground-{index:04d}.png').convert('RGB');alpha=Image.open(a.parent/f'alpha-{index:04d}.png').convert('L');F=np.array(f).astype(float)/255;A=np.array(alpha).astype(float)/255;planes=load_components(index);diagnostics=[]
  if a.protect_primary:
   unrelated=(planes[0]>=128)&(np.maximum(planes[1],planes[2])<32)
   basef=np.array(Image.open(PAIR/f'foreground-{index:04d}.png')).astype(float)/255;basem=np.array(Image.open(PAIR/f'alpha-{index:04d}.png')).astype(float)/255
   F[unrelated]=basef[unrelated];A[unrelated]=basem[unrelated]
   alpha=Image.fromarray(np.rint(A*255).astype(np.uint8))
  for ci in [1,2]:
   hand=planes[ci];meta=gr['rows'][index]['components'][ci-1];cuff=garment/meta['file']
   if sha(cuff)!=meta['sha256']:raise ValueError('Independent garment selection changed')
   cuff=np.array(Image.open(cuff));depth=cv2.distanceTransform((hand>=224).astype(np.uint8),cv2.DIST_L2,5)
   Y=F@np.array([.2126,.7152,.0722]);skin=(depth>8)&(cuff<64)&(A>.98)&(F[:,:,0]-F[:,:,2]>.035)&(F[:,:,1]-F[:,:,2]>.015)&(Y>.07)&(Y<.75)
   ys,xs=np.where(skin)
   if len(xs)<32:raise ValueError('No clean current hand material for colour repair')
   local=F[ys,xs];lum=Y[ys,xs];chroma=local/np.maximum(lum[:,None],.001)
   size=2*a.domain_radius+1
   scope=(cv2.dilate((hand>=64).astype(np.uint8),np.ones((size,size),np.uint8))>0)&(cuff<128)&(A>.001)
   excess=F[:,:,2]-np.minimum(F[:,:,0],F[:,:,1]);use=np.clip((excess-(.006 if a.strong else .015))/(.025 if a.strong else .08),0,1)*scope
   if a.photographed_spill_direction:
    # A source TV may contaminate an edge with orange rather than blue.
    # Find only chromaticity departures in the photographed B direction,
    # relative to current opaque hand material; no global skin-colour key.
    median=np.median(chroma,axis=0)
    foreground_chroma=F/np.maximum(Y[:,:,None],.01)
    by=oldroom@np.array([.2126,.7152,.0722]);background_chroma=oldroom/np.maximum(by[:,:,None],.01)
    direction=background_chroma-median
    departure=foreground_chroma-median
    projection=np.sum(departure*direction,axis=2)/np.maximum(np.sum(direction*direction,axis=2),.01)
    perpendicular=np.linalg.norm(departure-projection[:,:,None]*direction,axis=2)
    colour_distance=np.linalg.norm(departure,axis=2)
    directed=np.clip((projection-.10)/.25,0,1)*np.clip((colour_distance-.12)/.25,0,1)
    directed*=np.clip((.45-perpendicular)/.25,0,1)*observed*scope
    use=np.maximum(use,directed)
   yy,xx=np.where(use>.001)
   if len(xx):
    tree=cKDTree(np.stack([ys/35,xs/35,lum/.12],axis=1)[::2]);distance,near=tree.query(np.stack([yy/35,xx/35,Y[yy,xx]/.12],axis=1),k=12)
    weight=1/np.maximum(distance,.15)**2;target=(chroma[::2][near]*weight[:,:,None]).sum(1)/weight.sum(1)[:,None]
    # Preserve the actual local luminance and every alpha value. Warm skin
    # pixels remain bit-for-bit unchanged; only excess-blue material chroma
    # receives an actual current-material interpolation.
    repaired=target*Y[yy,xx,None]
    if a.subtract_room_light:
     actual=F[yy,xx];light=oldroom[yy,xx]
     uu=np.sum(target*target,axis=1);ll=np.sum(light*light,axis=1);ul=np.sum(target*light,axis=1)
     ux=np.sum(target*actual,axis=1);lx=np.sum(light*actual,axis=1);det=uu*ll-ul*ul
     spill=np.maximum((lx*uu-ux*ul)/np.maximum(det,1e-8),0)
     reflected=light*spill[:,None]
     # Remove a positive observed-blue lighting contribution; preserving all
     # original luminance would leave a bright source-room band on the wrist.
     # Reject ill-conditioned or unknown photographic background directions.
     valid=observed[yy,xx]&(det/(uu*ll+1e-8)>.04)
     removed=np.where(valid[:,None],np.maximum(actual-reflected,0),repaired)
     if a.deep_light_only:
      light_weight=np.clip((depth[yy,xx]-4)/12,0,1)
      repaired=repaired*(1-light_weight[:,None])+removed*light_weight[:,None]
     else:repaired=removed
    F[yy,xx]=F[yy,xx]*(1-use[yy,xx,None])+repaired*use[yy,xx,None]
   diagnostics.append({'component':ci,'currentWarmMaterialSeeds':len(xs),'colourOnlyTouchedPixels':len(xx),'alphaChanged':False})
  if a.protect_primary:
   unrelated=(planes[0]>=128)&(np.maximum(planes[1],planes[2])<32)
   outside=cv2.dilate((np.maximum(planes[1],planes[2])>=64).astype(np.uint8),np.ones((31,31),np.uint8))==0
   protected=unrelated|outside
   F[protected]=basef[protected];A[protected]=basem[protected]
   alpha=Image.fromarray(np.rint(A*255).astype(np.uint8))
  fg=Image.fromarray(np.rint(F.clip(0,1)*255).astype(np.uint8));r._prepare_foreground=lambda *unused,f=fg,m=alpha:(f,m);out=r.render(image,index);r._prepare_foreground=prepare;fg.save(a.out/f'foreground-{index:04d}.png');alpha.save(a.out/f'alpha-{index:04d}.png');out.save(a.out/f'actual-composite-{index:04d}.png')
  for side,box in [('left',(280,240,700,720)),('right',(1040,170,1430,760))]:
   w,h=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(w*3,h+24))
   for col,(label,picture)in enumerate([('Original source',image),('Earlier paired estimate',Image.open(PAIR/f'actual-composite-{index:04d}.png')),('Native opacity + current-material spill repair',out)]):sheet.paste(picture.crop(box),(col*w,24));ImageDraw.Draw(sheet).text((col*w+3,4),label,fill='white')
   sheet.save(a.out/f'actual-{side}-comparison-{index:04d}.jpg',quality=98)
  rows.append({'frame':index,'components':diagnostics,'visualPass':False});print(json.dumps({'frame':index,'seconds':time.monotonic()-started}),flush=True)
 write_json(a.out/'receipt.json',{'rows':rows,'parent':str(a.parent),'sourceSha256':json.loads((RECOVERED/'receipt.json').read_text())['sourceSha256'],'sourceRecoveryReceiptSha256':sha(RECOVERED/'receipt.json'),'parentReceiptSha256':sha(a.parent/'receipt.json'),'alphaUnchanged':not a.protect_primary,'unrelatedPrimaryRestoredFromEarlierVerifiedPair':a.protect_primary,'primaryProtectionAlsoAppliedAfterAllColourOperations':a.protect_primary,'outsideHandRawPairRestored':a.protect_primary,'alphaUnchangedInsideCurrentHandSelections':True,'luminancePreservedBeforeEightBitQuantisation':not a.subtract_room_light,'onlyExcessBlueChromaWithinCurrentHandSelection':not a.photographed_spill_direction,'photographedSpillDirection':a.photographed_spill_direction,'strongSpill':a.strong,'subtractPositivePhotographedRoomLight':a.subtract_room_light,'deepOpaqueMaterialLightingOnly':a.deep_light_only,'elapsedSeconds':time.monotonic()-started,'allFrames':a.all_frames,'nativeAdmission':False,'fourMinuteProof':False,'visualPass':False,'providerUpload':False,'paidCloudInference':False})
if __name__=='__main__':main()
