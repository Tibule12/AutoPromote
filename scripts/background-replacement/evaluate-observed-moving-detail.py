"""Compare real local hand-detail mattes using photographed background evidence.

Diagnostic only: do not publish or register these results without actual review.
No generated background, model download, or paid inference is performed.
"""
import argparse, json, hashlib, time
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageDraw
import torch
from transformers import VitMatteForImageMatting
from pymatting import estimate_alpha_cf, estimate_foreground_ml
from pymatting.preconditioner.ichol import ichol


def main():
    p=argparse.ArgumentParser();p.add_argument('out',type=Path);p.add_argument('--indices',default='8,23,24');a=p.parse_args()
    a.out.mkdir(parents=True,exist_ok=False)
    torch.set_num_threads(4);torch.set_num_interop_threads(1);cv2.setNumThreads(2)
    root=Path('/tmp/autopromote-application-demo-YU8K0a/model-jobs/95d7eae50defbb48aa4d96b1890342f2d6b56c4585874c53ece8248c44dd2fc3/c86ff0c1-50fd-4481-a01d-e659883290e8')
    rgbdir=root/'outputs/rgb';guide=root/'component_dependency';manifest=json.loads((guide/'manifest.json').read_text())
    ref=np.asarray(Image.open(rgbdir/'rgb_0047.png'));ref_union=np.asarray(Image.open(root/'dependency/matte_0047.png'))
    known=cv2.dilate((ref_union>=24).astype(np.uint8),np.ones((21,21),np.uint8))==0
    Image.fromarray(known.astype(np.uint8)*255).save(a.out/'photographed-background-support.png')
    bgr=Path('/home/tibule12/.cache/autopromote-model-runtime/backgroundmattingv2-mit-eval-v1/model.pth')
    with bgr.open('rb') as f:assert hashlib.file_digest(f,'sha256').hexdigest()=='6d449e8a0445438491cf07c03a6e86f21df2b3aa2dc630d9430347fcb807aae4'
    bgmodel=torch.jit.load(str(bgr),map_location='cpu').eval();bgmodel.backbone_scale=1.;bgmodel.refine_mode='full'
    vit=VitMatteForImageMatting.from_pretrained('/home/tibule12/.cache/autopromote-model-runtime/vitmatte-small-pinned',local_files_only=True).eval()
    plate=np.asarray(Image.open('reports/background-replacement-20261101/private/replacement.png').convert('RGB')).astype(np.float64)/255
    rows=[]
    for index in map(int,a.indices.split(',')):
        rgb=np.asarray(Image.open(rgbdir/f'rgb_{index:04d}.png'));alpha=np.asarray(Image.open(root/'outputs/subject_masks'/f'matte_{index:04d}.png'))
        for component in [1,2]:
            hand=np.asarray(Image.open(guide/manifest['components'][component]['frames'][index]['file']))
            mask=hand>=128
            ys,xs=np.where(mask)
            if not len(xs):continue
            x0,y0=max(0,int(xs.min())-55),max(0,int(ys.min())-55);x1,y1=min(1430,int(xs.max())+56),min(1000,int(ys.max())+56)
            sl=np.s_[y0:y1,x0:x1];image=rgb[sl];bg=ref[sl];h,w=image.shape[:2];valid=known[sl]
            domain=(cv2.dilate(mask.astype(np.uint8),np.ones((31,31),np.uint8))>0)[sl]&valid
            # Verify same-source stationary background agreement away from the
            # current hand; a different camera or varying screen cannot be a
            # trustworthy clean-plate reference there.
            union=np.asarray(Image.open(root/'dependency'/f'matte_{index:04d}.png'))
            empty=(cv2.dilate((union>=24).astype(np.uint8),np.ones((31,31),np.uint8))==0)[sl]&valid
            delta=image.astype(np.float32)-bg.astype(np.float32)
            offset=np.median(delta[empty],axis=0) if empty.sum()>128 else np.zeros(3)
            background=np.clip(bg.astype(np.float32)+offset,0,255)
            photo=np.linalg.norm(image.astype(np.float32)-background,axis=2)
            tensor=lambda im:torch.from_numpy(im.copy()).permute(2,0,1)[None].float()/255
            pad=lambda v:torch.nn.functional.pad(v,(0,(-w)%32,0,(-h)%32),mode='replicate')
            with torch.inference_mode():
                ba,bf,*_=bgmodel(pad(tensor(image)),pad(tensor(background)))
            bg_alpha=ba[0,0,:h,:w].numpy().clip(0,1);bg_foreground=bf[0,:,:h,:w].permute(1,2,0).numpy().clip(0,1)
            base=np.asarray(Image.open(root/'outputs/trimaps'/f'trimap_{index:04d}.png'))[sl].copy()
            # Observed identical source background is authoritative only in
            # that observed domain. Do not key skin/clothing by arbitrary hue.
            corrected=base.copy();corrected[domain]=128;corrected[domain&(photo<8)]=0
            # A visible empty plate does not make an opaque palm transparent.
            # Preserve current deep hand/body interiors as known foreground;
            # only their thin boundaries and gaps need reclassification.
            core=cv2.erode((hand>=224).astype(np.uint8),np.ones((65,65),np.uint8))[sl]>0
            body_core=(cv2.distanceTransform((union>=128).astype(np.uint8),cv2.DIST_L2,5)>48)[sl]
            corrected[domain&(core|body_core)&(base==255)]=255
            for variant in ['observed-colour-line']:
                tri=base.copy() if variant=='native-trimap-tile' else corrected.copy()
                if variant=='observed-bg-trimap-tile':
                    tri[domain&(bg_alpha<.02)&(photo<30)]=0
                    # BG model remains only evidence. It cannot introduce
                    # opaque seeds over the current independent hand interior.
                if variant=='observed-colour-line':
                    current=image.astype(np.float32);empty=background.astype(np.float32)
                    seed=(cv2.distanceTransform((hand>=224).astype(np.uint8),cv2.DIST_L2,5)[sl]>22)&(base==255)
                    seed &= valid & (photo>30)
                    samples=current[seed]
                    assert len(samples)>32
                    cv2.setRNGSeed(0)
                    _,_,palette=cv2.kmeans(samples,min(40,len(samples)),None,(cv2.TERM_CRITERIA_EPS+cv2.TERM_CRITERIA_MAX_ITER,40,.05),1,cv2.KMEANS_PP_CENTERS)
                    score=np.full((h,w),np.inf,np.float32);values=alpha[sl].astype(np.float32)/255
                    residual=np.full((h,w),np.inf,np.float32)
                    delta=current-empty
                    for colour in palette:
                        vector=colour-empty;contrast=np.sum(vector*vector,axis=2)
                        estimate=np.clip(np.sum(delta*vector,axis=2)/np.maximum(contrast,1),0,1)
                        error=np.mean((delta-estimate[...,None]*vector)**2,axis=2)
                        objective=error+16*(1-estimate)**2
                        use=(objective<score)&(contrast>35**2)
                        values[use]=estimate[use];score[use]=objective[use];residual[use]=np.sqrt(error[use])
                    values[photo<7]=0
                    stable_core=(cv2.distanceTransform((hand>=224).astype(np.uint8),cv2.DIST_L2,5)[sl]>22)&(base==255)
                    values[stable_core|body_core]=alpha[sl][stable_core|body_core]/255
                    uncertain=~(stable_core|body_core)
                    accept=domain&uncertain&(residual<12)
                    blend=np.clip((14-residual)/5,0,1)*accept
                    values=alpha[sl]/255*(1-blend)+values*blend
                    recovered=(current-(1-values[...,None])*empty)/np.maximum(values[...,None],.02)
                    recovered=np.clip(recovered/255,0,1)
                    clean=estimate_foreground_ml(image.astype(np.float64)/255,values.astype(np.float64)).clip(0,1)
                    foreground=clean*(1-blend[...,None])+recovered*blend[...,None]
                elif variant=='observed-bg-model':values=bg_alpha;foreground=bg_foreground
                else:
                    inp=torch.cat((tensor(image)*2-1,torch.from_numpy(tri.copy())[None,None].float()/255),1)
                    inp=torch.nn.functional.pad(inp,(0,(-w)%32,0,(-h)%32),mode='replicate')
                    with torch.inference_mode():values=vit(pixel_values=inp).alphas[0,0,:h,:w].numpy().clip(0,1)
                    values[tri==0]=0;values[tri==255]=1
                    foreground=estimate_foreground_ml(image.astype(np.float64)/255,values.astype(np.float64)).clip(0,1)
                out=a.out/variant;out.mkdir(exist_ok=True);tag=f'{index:04d}-hand{component}'
                new=alpha[sl].astype(np.float64)/255;weight=np.minimum(cv2.distanceTransform(domain.astype(np.uint8),cv2.DIST_L2,5)/12,1)
                new=new*(1-weight)+values*weight
                # Show the diagnostic crop; the actual scene grade and rest of
                # the image are deliberately not claimed as native output.
                result=np.rint((foreground*new[...,None]+plate[sl]*(1-new[...,None]))*255).astype(np.uint8)
                Image.fromarray(np.rint(new*255).astype(np.uint8)).save(out/f'alpha-{tag}.png')
                Image.fromarray(result).save(out/f'composite-{tag}.png')
                Image.fromarray(tri).save(out/f'trimap-{tag}.png')
                sheet=Image.new('RGB',(w*3,h+24));draw=ImageDraw.Draw(sheet)
                for j,(label,im) in enumerate([('Source',image),('Candidate (diagnostic)',result),('Alpha',np.repeat(np.rint(new*255).astype(np.uint8)[...,None],3,2))]):
                    sheet.paste(Image.fromarray(im),(j*w,24));draw.text((j*w,0),label,fill='white')
                sheet.save(out/f'comparison-{tag}.jpg',quality=97)
                rows.append({'frame':index,'component':component,'variant':variant,'crop':[x0,y0,x1,y1],'observedPixels':int(domain.sum()),'observedBackgroundOffset':offset.tolist(),'sameSourceEmptyMedianResidual':float(np.median(photo[empty])) if empty.any() else None})
                print('ACTUAL_DETAIL_PROBE',index,component,variant,flush=True)
    (a.out/'evaluation.json').write_text(json.dumps({'sourceFrames':48,'tested':rows,'visualPass':False,'nativeExport':False,'noPaidInference':True},indent=2))


if __name__=='__main__':main()
