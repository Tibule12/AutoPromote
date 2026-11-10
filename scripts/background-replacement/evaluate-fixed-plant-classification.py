"""Source-resolution fixed-plant classification diagnostic with real clicks."""
import argparse,json
from pathlib import Path
import cv2,numpy as np
from PIL import Image,ImageDraw
from pymatting import estimate_alpha_cf
from pymatting.preconditioner.ichol import ichol
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
from python_media_worker.studio_subject_matte import CachedSubjectMatte,sha256
p=argparse.ArgumentParser();p.add_argument('out',type=Path);p.add_argument('--confidences',default='220,245');p.add_argument('--protect-medial',action='store_true');a=p.parse_args();a.out.mkdir(exist_ok=False);cv2.setNumThreads(2)
root=Path('/tmp/autopromote-application-demo-YU8K0a/model-jobs/2ffcb14a6f49829c8367f70a0e2acf88c680677ea16c867b2b06e16625b50d8b/8bdb364c-fc94-4289-b720-4374bcefcc9a');rgb=np.asarray(Image.open(root/'outputs/rgb/rgb_0000.png'));prior=np.asarray(Image.open(root/'outputs/subject_masks/matte_0000.png'));probe=Path('/dev/shm/autopromote-corrected-plant-r33-20261104');prob=np.asarray(Image.open(probe/'corrected-tv-alpha.png'));selection=json.loads((probe/'corrected-tv-selection.json').read_text())
work=Path('/tmp/autopromote-application-demo-YU8K0a/subject-previews/cfa95525-d7a9-4afe-9f51-2951ae9ab0bd');spec=json.loads((work/'spec.json').read_text())['spec'];base=CachedSubjectMatte(work/'matte',work/'source.mp4');assets={v['assetId']:work/f'replacement-{i}.asset' for i,v in enumerate(spec['replacementAssets'])}
class Cache:
 manifest=base.manifest;artifact_sha256='private-diagnostic';directory=None
 def frame(self,index):return changed
x0,y0,x1,y1=0,755,176,992;picture=rgb[y0:y1,x0:x1].copy();pr=prob[y0:y1,x0:x1]
for confidence in map(int,a.confidences.split(',')):
 gc=np.full(pr.shape,cv2.GC_PR_BGD,np.uint8);gc[pr>=128]=cv2.GC_PR_FGD;gc[cv2.dilate((pr>=64).astype(np.uint8),np.ones((5,5),np.uint8))==0]=cv2.GC_BGD;gc[cv2.erode((pr>=confidence).astype(np.uint8),np.ones((3,3),np.uint8))>0]=cv2.GC_FGD
 medial=None
 if a.protect_medial:
  distance=cv2.distanceTransform((pr>=128).astype(np.uint8),cv2.DIST_L2,5);medial=(distance>=cv2.dilate(distance,np.ones((3,3),np.uint8))-.01)&(distance>=1)&(distance<=2)&(pr>=128);gc[medial]=cv2.GC_FGD
 for point in selection['points']:
  x,y=round(point['position'][0]*1430)-x0,round(point['position'][1]*1000)-y0
  if 0<=x<x1-x0 and 0<=y<y1-y0:cv2.circle(gc,(x,y),1,cv2.GC_FGD if point['label'] else cv2.GC_BGD,-1)
 cv2.setRNGSeed(0);cv2.grabCut(picture,gc,None,np.zeros((1,65)),np.zeros((1,65)),5,cv2.GC_INIT_WITH_MASK);selected=np.isin(gc,[cv2.GC_FGD,cv2.GC_PR_FGD]).astype(np.uint8)
 tri=np.full(pr.shape,.5);tri[cv2.erode(selected,np.ones((3,3),np.uint8))>0]=1;tri[cv2.dilate(selected,np.ones((5,5),np.uint8))==0]=0
 if medial is not None:tri[medial]=1
 for point in selection['points']:
  x,y=round(point['position'][0]*1430)-x0,round(point['position'][1]*1000)-y0
  if 0<=x<x1-x0 and 0<=y<y1-y0:cv2.circle(tri,(x,y),1,float(point['label']),-1)
 alpha=estimate_alpha_cf(picture.astype(float)/255,tri,laplacian_kwargs={'epsilon':1e-6},preconditioner=lambda matrix:ichol(matrix,shifts=[.01,.1,1,10,100]),cg_kwargs={'rtol':1e-6,'maxiter':500});changed=prior.copy();changed[y0:y1,x0:x1]=np.rint(alpha.clip(0,1)*255).astype(np.uint8);Image.fromarray(changed).save(a.out/f'alpha-{confidence}.png');renderer=VfxFrameRenderer({'version':1,'source_sha256':sha256(work/'source.mp4'),'matte_sha256':'private-diagnostic','effects':spec['scene']['effects']},Cache(),asset_resolver=assets.__getitem__);result=renderer.render(Image.fromarray(rgb),0);result.save(a.out/f'composite-{confidence}.png');box=(0,755,210,992);sheet=Image.new('RGB',(630,261));draw=ImageDraw.Draw(sheet)
 for j,(name,im) in enumerate([('Actual source',Image.fromarray(rgb)),('Actual prior preview',Image.open('/dev/shm/autopromote-native-motion-review-r31-20261104/preview/0000.png')),(f'Click-seeded GMM {confidence}',result)]):sheet.paste(im.crop(box),(210*j,24));draw.text((210*j,0),name,fill='white')
 sheet.resize((1260,522)).save(a.out/f'comparison-{confidence}.jpg',quality=97);print('ACTUAL_CLICK_SEEDED_GMM',confidence,flush=True)
