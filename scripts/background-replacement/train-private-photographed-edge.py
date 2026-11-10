"""Bounded local adaptation of the cached MIT joint alpha/F model.

Synthetic exposure mixtures use photographed opaque hand/cuff material from
frames26–37; the defective frames10/17 are held out. Synthetic losses cannot
qualify real motion. No model or media is uploaded; no native model is admitted.
"""
import argparse
import json
from pathlib import Path
import socket
import time

import cv2
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt
import torch
from torch.nn import functional as functional

from model_workers.common import sha,write_json


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('out',type=Path)
    parser.add_argument('--steps',type=int,default=600)
    parser.add_argument('--unfreeze-backbone',action='store_true')
    parser.add_argument('--physical-exposure',action='store_true')
    parser.add_argument('--source-background-patches',action='store_true')
    parser.add_argument('--focus-soft-boundaries',action='store_true')
    parser.add_argument('--resume-adapter',type=Path)
    parser.add_argument('--independent-material-supervision',action='store_true')
    parser.add_argument('--independent-shape-target',action='store_true')
    args=parser.parse_args()
    if not 1<=args.steps<=1200:raise ValueError('Unbounded private training')
    if args.independent_shape_target and not args.independent_material_supervision:raise ValueError('Synthetic shape supervision requires independent clean-material samples')
    args.out.mkdir(exist_ok=False)
    (args.out/'implementation.py').write_bytes(Path(__file__).read_bytes())
    torch.set_num_threads(2);torch.set_num_interop_threads(1);cv2.setNumThreads(2)
    torch.manual_seed(8352);rng=np.random.default_rng(8352)
    work=Path('/dev/shm/autopromote-current-pipeline-r83-20261105/alpha-work')
    guide=work/'component_dependency';manifest=json.loads((guide/'manifest.json').read_text())
    rgbdir=work/'outputs/rgb';alphadir=work/'outputs/subject_masks'
    model_path=Path('/home/tibule12/.cache/autopromote-model-runtime/backgroundmattingv2-mit-eval-v1/model.pth')
    if sha(model_path)!='6d449e8a0445438491cf07c03a6e86f21df2b3aa2dc630d9430347fcb807aae4':raise ValueError('Wrong pinned model')
    socket.socket.connect=lambda *a,**k:(_ for _ in ()).throw(RuntimeError('Local inference/training only'))
    model=torch.jit.load(str(model_path),map_location='cuda').eval()
    model.backbone_scale=.5;model.refine_mode='full'
    selected=[]
    for name,parameter in model.named_parameters():
        parameter.requires_grad_(args.unfreeze_backbone or not name.startswith('backbone'))
        if parameter.requires_grad:selected.append((name,parameter))
    resumed=None
    if args.resume_adapter:
        previous=json.loads((args.resume_adapter.parent/'receipt.json').read_text())
        if previous['parentModelSha256']!=sha(model_path) or previous['adapterSha256']!=sha(args.resume_adapter):
            raise ValueError('Previous private adaptation identity changed')
        state=torch.load(args.resume_adapter,map_location='cuda',weights_only=True)
        current=dict(model.named_parameters())
        if set(state)!=set(n for n,v in selected):raise ValueError('Private resume parameter scope differs')
        with torch.no_grad():
            for name,value in state.items():current[name].copy_(value)
        resumed={'adapterSha256':sha(args.resume_adapter),'receiptSha256':sha(args.resume_adapter.parent/'receipt.json')}
    optimizer=torch.optim.Adam([v for n,v in selected],lr=1e-4 if resumed else 2e-4,foreach=False)
    garment_root=Path('reports/background-replacement-20261101/private/garment-tracks-r147-20261105')
    garment_receipt=json.loads((garment_root/'receipt.json').read_text()) if args.independent_material_supervision else None
    samples=[];provenance=[]
    for index in range(26,38):
        picture=np.array(Image.open(rgbdir/f'rgb_{index:04d}.png').convert('RGB'))
        alpha=np.array(Image.open(alphadir/f'matte_{index:04d}.png'))
        hsv=cv2.cvtColor(picture,cv2.COLOR_RGB2HSV)
        for ci in [1,2]:
            hand=np.array(Image.open(guide/manifest['components'][ci]['frames'][index]['file']))
            ys,xs=np.where(hand>=224)
            if len(xs)<128:continue
            x0,y0=max(0,int(xs.min())-40),max(0,int(ys.min())-40)
            x1,y1=min(1430,int(xs.max())+41),min(1000,int(ys.max())+101)
            # Only opaque photographed samples supply training colour; source
            # blurred edges never masquerade as known clean foreground RGB.
            A=((alpha>=254)&(hand>=224)).astype(np.uint8)
            A|=((alpha>=254)&(hsv[:,:,1]<80)&(hsv[:,:,2]>110)).astype(np.uint8)
            if args.independent_material_supervision:
                row=garment_receipt['rows'][index]
                if row['sourceFrame']!=index or row['sourceRgbSha256']!=sha(rgbdir/f'rgb_{index:04d}.png'):
                    raise ValueError('Independent garment/source alignment changed')
                selection=row['components'][ci-1];path=garment_root/selection['file']
                if sha(path)!=selection['sha256']:raise ValueError('Independent garment track bytes changed')
                cuff=np.array(Image.open(path))
                hdepth=cv2.distanceTransform((hand>=224).astype(np.uint8),cv2.DIST_L2,5)
                cdepth=cv2.distanceTransform((cuff>=224).astype(np.uint8),cv2.DIST_L2,5)
                values=picture.astype(float)
                warm=(values[:,:,0]-values[:,:,1]>8)&(values[:,:,1]>=values[:,:,2]-3)
                # A semantic selection and the previous estimated alpha are
                # NOT real-edge ground truth. Sample only deep warm skin and
                # independently selected opaque cuff material for synthetic F.
                skin=(hdepth>16)&warm&(hsv[:,:,2]<240)&(alpha>=254)
                cloth=(cdepth>14)&(hsv[:,:,1]<80)&(hsv[:,:,2]>80)&(alpha>=254)
                A=(skin|cloth).astype(np.uint8)
            A=cv2.erode(A,np.ones((5,5),np.uint8))[y0:y1,x0:x1]
            if A.sum()<128:continue
            C=picture[y0:y1,x0:x1].astype(np.float32)/255
            _,nearest=distance_transform_edt(A==0,return_indices=True)
            F=C[nearest[0],nearest[1]]
            material_count=int(A.sum())
            if args.independent_shape_target:
                # Clean material samples and SYNTHETIC object geometry have
                # different jobs. Do not train a silhouette made only of deep
                # palm/cuff cores; restore the tracked fingers as synthetic
                # shape while never treating their real mixed RGB as clean F.
                A=((hand>=192)|(cuff>=192)).astype(np.uint8)[y0:y1,x0:x1]
            samples.append((F,A.astype(np.float32)))
            provenance.append({'sourceFrame':index,'component':ci,'sourceRgbSha256':sha(rgbdir/f'rgb_{index:04d}.png'),
                'sourceAlphaSha256':sha(alphadir/f'matte_{index:04d}.png'),'opaqueMaterialPixels':material_count,'syntheticShapePixels':int(A.sum())})
    first=np.array(Image.open(rgbdir/'rgb_0000.png').convert('RGB')).astype(np.float32)/255
    backgrounds=[first[30:280,1170:1420],first[60:310,35:285],first[10:260,420:670]]
    photographed_background=None
    if args.source_background_patches:
        photo_root=Path('reports/background-replacement-20261101/private/coupled-photo-motion-r143-20261105')
        reference=np.array(Image.open(photo_root/'actual-photographed-reference.png')).astype(np.float32)/255
        observed=np.array(Image.open(photo_root/'actual-photographed-support.png'))>0
        backgrounds=[];patch_rows=[]
        for y in [80,160,240,320,400]:
            for x in [80,160,240,320,380,400,480,560,640,1200,1280,1350]:
                x0,x1=max(0,x-80),min(1430,x+80);y0,y1=max(0,y-80),min(1000,y+80)
                if (x1-x0,y1-y0)!=(160,160) or not observed[y0:y1,x0:x1].all():continue
                backgrounds.append(reference[y0:y1,x0:x1]);patch_rows.append([x0,y0,x1,y1])
        if len(backgrounds)<12:raise ValueError('Not enough actually observed photographed background patches')
        photographed_background={'referenceSha256':sha(photo_root/'actual-photographed-reference.png'),
            'observedSupportSha256':sha(photo_root/'actual-photographed-support.png'),'fullyObservedPatchBoxes':patch_rows,
            'unobservedPixelsFilled':False}
    assert len(samples)>=20 and all(min(p['sourceFrame'],37)>=26 for p in provenance)
    write_json(args.out/'training-source.json',{'parentModelSha256':sha(model_path),'license':'MIT',
        'licenseSha256':sha(model_path.parent/'LICENSE'),'actualTrainingSourceFrames':list(range(26,38)),
        'actualHeldOutFailureFrames':[10,17],'syntheticOnlySupervision':True,'samples':provenance,
        'physicalLinearBt709Exposure':args.physical_exposure,
        'fullyPhotographedSourceBackgroundPatches':photographed_background,
        'softBoundaryFocusedLoss':args.focus_soft_boundaries,'resumedPrivateModel':resumed,
        'independentlyTrackedDeepMaterialsOnly':args.independent_material_supervision,
        'syntheticTrackedShapeSeparatedFromCleanRgbSeeds':args.independent_shape_target,
        'registeredModelChanged':False,'nativeAdmission':False,'visualPass':False})

    def decode(v):
        return np.where(v<.081,v/4.5,((v+.099)/1.099)**(1/.45))

    def encode(v):
        return np.where(v<.018,v*4.5,1.099*np.maximum(v,0)**.45-.099)

    def example():
        foreground,alpha=samples[int(rng.integers(len(samples)))]
        size=160;scale=float(rng.uniform(.4,1.1))
        shape=(max(40,round(foreground.shape[1]*scale)),max(40,round(foreground.shape[0]*scale)))
        f=cv2.resize(foreground,shape);a=cv2.resize(alpha,shape,interpolation=cv2.INTER_NEAREST)
        pad=100;f=np.pad(f,((pad,pad),(pad,pad),(0,0)),mode='edge');a=np.pad(a,((pad,pad),(pad,pad)))
        x=int(rng.integers(max(1,f.shape[1]-size)));y=int(rng.integers(max(1,f.shape[0]-size)))
        f=f[y:y+size,x:x+size];a=a[y:y+size,x:x+size]
        if rng.random()<.5:f=f[:,::-1].copy();a=a[:,::-1].copy()
        f=np.clip(f*float(rng.uniform(.75,1.15)),0,1)
        kernel=np.zeros((41,41),np.float32);length=int(rng.integers(1,36));angle=float(rng.uniform(0,np.pi))
        dx,dy=int(np.cos(angle)*length/2),int(np.sin(angle)*length/2)
        cv2.line(kernel,(20-dx,20-dy),(20+dx,20+dy),1,1);kernel/=kernel.sum()
        aa=cv2.filter2D(a,-1,kernel)
        exposure_f=decode(f) if args.physical_exposure else f
        premul=cv2.filter2D(exposure_f*a[...,None],-1,kernel)
        ff=premul/np.maximum(aa[...,None],1e-5)
        plate=backgrounds[int(rng.integers(len(backgrounds)))];b=cv2.resize(plate,(size,size)).copy()
        if rng.random()<.5:b=b[:,::-1].copy()
        if args.physical_exposure:
            C=encode(premul+decode(b)*(1-aa[...,None]))
            ff=encode(ff)
        else:C=premul+b*(1-aa[...,None])
        # A lossy YUV round-trip emulates the actual source's soft chroma edge.
        if rng.random()<.7:
            C=cv2.cvtColor(cv2.cvtColor(np.rint(np.clip(C,0,1)*255).astype(np.uint8),cv2.COLOR_RGB2YUV_I420),cv2.COLOR_YUV2RGB_I420).astype(np.float32)/255
        noise=.012 if args.unfreeze_backbone else .004
        C=np.clip(C+rng.normal(0,noise,C.shape),0,1).astype(np.float32)
        B=np.clip(b+rng.normal(0,noise*.75,b.shape),0,1).astype(np.float32)
        return C,B,aa,ff

    started=time.monotonic();history=[]
    for step in range(args.steps):
        examples=[example() for _ in range(4)]
        def batch(column):
            values=np.stack([r[column] for r in examples]);values=values[:,None] if values.ndim==3 else values.transpose(0,3,1,2)
            return torch.from_numpy(values.copy()).to('cuda')
        C,B,A,F=batch(0),batch(1),batch(2),batch(3)
        predicted_alpha,predicted_fg,*_=model(C,B)
        unknown=((A>.01)&(A<.99)).float()
        loss_weight=1+(12 if args.focus_soft_boundaries else 3)*unknown
        aloss=((predicted_alpha-A).abs()*loss_weight).sum()/loss_weight.sum() if args.focus_soft_boundaries else ((predicted_alpha-A).abs()*loss_weight).mean()
        floss=((predicted_fg-F).abs()*A).mean()
        if args.physical_exposure:
            def tensor_decode(v):
                return torch.where(v<.081,v/4.5,((v+.099)/1.099).clamp(min=0).pow(1/.45))
            composite=(predicted_alpha*tensor_decode(predicted_fg)+(1-predicted_alpha)*tensor_decode(B)-tensor_decode(C)).abs().mean()
        else:composite=(predicted_alpha*predicted_fg+(1-predicted_alpha)*B-C).abs().mean()
        edge=((predicted_alpha[:,:,:,1:]-predicted_alpha[:,:,:,:-1])-(A[:,:,:,1:]-A[:,:,:,:-1])).abs().mean()
        edge+=((predicted_alpha[:,:,1:]-predicted_alpha[:,:,:-1])-(A[:,:,1:]-A[:,:,:-1])).abs().mean()
        loss=aloss+floss+.5*composite+.5*edge
        if not torch.isfinite(loss):raise ValueError('Nonfinite private training loss')
        optimizer.zero_grad(set_to_none=True);loss.backward();torch.nn.utils.clip_grad_norm_([v for n,v in selected],1);optimizer.step()
        if step%50==0 or step==args.steps-1:
            row={'step':step+1,'syntheticAlphaLoss':float(aloss.detach()),'syntheticForegroundLoss':float(floss.detach()),
                'elapsedSeconds':time.monotonic()-started,'visualPass':False}
            history.append(row);write_json(args.out/'progress.json',row);print(json.dumps(row),flush=True)
        if time.monotonic()-started>900:raise RuntimeError('Private training exceeded15-minute bound')
    checkpoint=args.out/'private-decoder-adapter.pth'
    torch.save({n:v.detach().cpu() for n,v in selected},checkpoint)
    write_json(args.out/'receipt.json',{'sourceTraining':sha(args.out/'training-source.json'),
        'parentModelSha256':sha(model_path),'adapterSha256':sha(checkpoint),'steps':args.steps,'history':history,
        'elapsedSeconds':time.monotonic()-started,'gpuPeakBytes':torch.cuda.max_memory_allocated(),
        'physicalLinearBt709Exposure':args.physical_exposure,
        'fullyPhotographedSourceBackgroundPatches':photographed_background,
        'softBoundaryFocusedLoss':args.focus_soft_boundaries,'resumedPrivateModel':resumed,
        'independentlyTrackedDeepMaterialsOnly':args.independent_material_supervision,
        'syntheticTrackedShapeSeparatedFromCleanRgbSeeds':args.independent_shape_target,
        'newPretrainedWeightsDownloaded':False,'paidCloudInference':False,'providerUpload':False,
        'sourceSpecificUnapprovedAdapter':True,'nativeAdmission':False,'visualPass':False})


if __name__=='__main__':
    main()
