"""Private actual-source joint opacity/colour check; never a product fallback."""
import argparse, json, time
from pathlib import Path
import cv2, numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt
from python_media_worker.studio_subject_matte import CachedSubjectMatte, sha256
from python_media_worker.studio_vfx_plan import VfxFrameRenderer

p=argparse.ArgumentParser();p.add_argument('out',type=Path);p.add_argument('--smooth-foreground',action='store_true');a=p.parse_args();a.out.mkdir(exist_ok=False)
cv2.setNumThreads(2)
root=Path('/tmp/autopromote-application-demo-YU8K0a/model-jobs/39e005f4354085956cb2bcc82468b18296955d32b26cf3958c53821cbc3f5526/2f43d6cc-1eda-4854-be75-66cceadd172a')
guide=root/'component_dependency';manifest=json.load(open(guide/'manifest.json'))
work=Path('/tmp/autopromote-application-demo-YU8K0a/subject-previews/f2033724-fb92-44dd-b7ae-54114b51036f')
spec=json.load(open(work/'spec.json'))['spec'];cache=CachedSubjectMatte(work/'matte',work/'source.mp4')
assets={v['assetId']:work/f'replacement-{i}.asset' for i,v in enumerate(spec['replacementAssets'])}
renderer=VfxFrameRenderer({'version':1,'source_sha256':sha256(work/'source.mp4'),'matte_sha256':cache.artifact_sha256,'effects':spec['scene']['effects']},cache,assets.__getitem__)
prepare=renderer._prepare_foreground
reference=np.asarray(Image.open(root/'outputs/observed_detail/photographed-reference.png')).astype(float)/255
observed=np.asarray(Image.open(root/'outputs/observed_detail/observed-support.png'))>0
rows=[]
for index in [6,9,23,36]:
    rgb=Image.open(root/f'outputs/rgb/rgb_{index:04d}.png').convert('RGB');C=np.asarray(rgb).astype(float)/255;h,w=C.shape[:2]
    active=[e for e in renderer.plan['effects'] if e['start']<=index/24<e['end']]
    fg,effective=prepare(rgb,Image.fromarray(cache.frame(index)),active,w,h);base=np.asarray(effective).astype(float)/255;oldf=np.asarray(fg).astype(float)/255
    fixed=np.zeros((h,w),np.uint8)
    for comp in manifest['components']:
        if not comp['selection'].get('propagate',True):np.maximum(fixed,np.asarray(Image.open(guide/comp['frames'][index]['file'])),out=fixed)
    for gamma in [1.,2.2]:
        values=base.copy();colour=oldf.copy();linear=C**gamma;B=reference**gamma
        for ci in [1,2]:
            hand=np.asarray(Image.open(guide/manifest['components'][ci]['frames'][index]['file']))
            depth=cv2.distanceTransform((hand>=224).astype(np.uint8),cv2.DIST_L2,5)
            hsv=cv2.cvtColor(np.rint(C*255).astype(np.uint8),cv2.COLOR_RGB2HSV)
            pure=(depth>13)&(base>.99)&(hsv[:,:,1]>65)&(hsv[:,:,2]<230)&((C[:,:,0]-C[:,:,1])>.4*(C[:,:,1]-C[:,:,2]))
            if pure.sum()<32:continue
            _,nearest=distance_transform_edt(~pure,return_indices=True);F=linear[nearest[0],nearest[1]]
            F=cv2.GaussianBlur(F,(0,0),3)
            vector=F-B;delta=linear-B;contrast=np.sum(vector*vector,2)
            alpha=np.clip(np.sum(delta*vector,2)/np.maximum(contrast,.0001),0,1)
            # The actually observed RGB must remain feasible after unmixing.
            lower=np.max(np.where(linear<B,1-linear/np.maximum(B,.0001),(linear-B)/np.maximum(1-B,.0001)),2)
            alpha=np.maximum(alpha,lower.clip(0,1));recovered=(linear-(1-alpha[...,None])*B)/np.maximum(alpha[...,None],.001)
            error=np.sqrt(np.mean((delta-alpha[...,None]*vector)**2,2))
            domain=(cv2.dilate((hand>=128).astype(np.uint8),np.ones((31,31),np.uint8))>0)&observed&(fixed<24)&(depth<28)
            confidence=np.clip((.065-error)/.04,0,1)*np.clip((28-depth)/10,0,1)
            weight=np.minimum(cv2.distanceTransform(domain.astype(np.uint8),cv2.DIST_L2,5)/8,1)*confidence
            previous=values.copy();nexta=previous*(1-weight)+alpha*weight
            newf=(F if a.smooth_foreground else recovered).clip(0,1)**(1/gamma)
            premul=colour*previous[...,None]*(1-weight[...,None])+newf*alpha[...,None]*weight[...,None]
            colour=np.where(nexta[...,None]>.001,premul/np.maximum(nexta[...,None],.001),colour);values=nexta
        renderer._prepare_foreground=lambda *args,v=values,f=colour:(Image.fromarray(np.rint(f.clip(0,1)*255).astype(np.uint8)),Image.fromarray(np.rint(v.clip(0,1)*255).astype(np.uint8)))
        try:result=renderer.render(rgb,index)
        finally:renderer._prepare_foreground=prepare
        result.save(a.out/f'composite-{gamma}-{index:04d}.png')
        for label,box in [('left',(280,240,680,720)),('right',(1040,170,1430,760))]:
            cw,ch=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(cw*3,ch+24));draw=ImageDraw.Draw(sheet)
            for j,(title,im) in enumerate([('Actual source',rgb),('Current native',Image.open(f'/dev/shm/autopromote-native-click-review-r66-20261104/preview/{index:04d}.png')),('Observed premultiplication '+str(gamma),result)]):sheet.paste(im.crop(box),(cw*j,24));draw.text((cw*j+3,4),title,fill='white')
            sheet.save(a.out/f'{label}-{gamma}-{index:04d}.jpg',quality=97)
        rows.append({'frame':index,'gamma':gamma});print('INTERNAL_PREMULTIPLICATION',index,gamma,flush=True)
        (a.out/'evaluation.json').write_text(json.dumps({'internalOnly':True,'visualPass':False,'fourMinuteProof':False,'rows':rows},indent=2)+'\n')
