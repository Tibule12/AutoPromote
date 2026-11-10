"""Private current-source prop-matting review using actual corrective labels.

No source RGB is replaced and no tracked person or neighboring microphone may
be removed by this plant-region classifier. This is not native model admission.
"""
import argparse
import json
from pathlib import Path
import time

import cv2
import numpy as np
from PIL import Image, ImageDraw
from pymatting import estimate_alpha_cf
from pymatting.preconditioner.ichol import ichol

from model_workers.common import sha, write_json
from python_media_worker.studio_subject_matte import CachedSubjectMatte
from python_media_worker.studio_vfx_plan import VfxFrameRenderer


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('out',type=Path)
    parser.add_argument('--frames',type=int,choices=[1,48],default=1)
    parser.add_argument('--reviewed-rig-scope',action='store_true')
    parser.add_argument('--connected-bezel-correction',action='store_true')
    parser.add_argument('--stationary-prop-correction',action='store_true')
    parser.add_argument('--authored-bezel-path',action='store_true')
    args=parser.parse_args()
    args.out.mkdir(exist_ok=False)
    (args.out/'implementation.py').write_bytes(Path(__file__).read_bytes())
    cv2.setNumThreads(2)
    root=Path('reports/background-replacement-20261101/private')
    prep=Path('/dev/shm/autopromote-foreground-recovery-r95-20261105')
    work=Path('/dev/shm/autopromote-foreground-alpha-r95-20261105')
    source=prep/'source.mkv'
    old=CachedSubjectMatte(work/'alpha-work/outputs/subject_masks',source)
    directory=prep/'segmentation/component_masks'
    components=json.loads((directory/'manifest.json').read_text())['components']
    revised=json.loads((root/'reviewed-small-props-r96-20261105/actual-reviewed-selection.json').read_text())
    foreground=[];background=[]
    for selection in [*revised['components'],components[7]['selection']]:
        for point in selection['points']:
            (foreground if point['label'] else background).append(point['position'])
    # Actual source inspection identifies this as the TV's black lower bezel,
    # behind the right-hand plant/stand. It is not a foreground leaf material.
    background += [[1410/1430,.700],[1390/1430,.680],[1400/1430,.735]]
    reference=np.asarray(Image.open(work/'alpha-work/outputs/rgb/rgb_0000.png'))
    plan=json.loads((work/'actual-plan.json').read_text())
    if args.authored_bezel_path:
        # Existing Studio "Remove background fragments" authoring command,
        # restricted to the photographed gap beyond the rightmost real leaves.
        # This is an explicit static-camera garbage matte, not inferred data.
        layer=next(e for e in reversed(plan['effects']) if e['type']=='foreground_refine' and e.get('clear_paths'))
        layer['clear_paths'].append([[1380/1430,.654],[1,.654],[1,.754],[1380/1430,.752]])
    renderer=VfxFrameRenderer(plan,old,lambda _:root/'replacement.png')
    prepare=renderer._prepare_foreground
    started=time.monotonic();rows=[]
    box=(1050,450,1430,780);x0,y0,x1,y1=box
    for index in range(args.frames):
        image=Image.open(work/f'alpha-work/outputs/rgb/rgb_{index:04d}.png').convert('RGB')
        rgb=np.asarray(image);local=rgb[y0:y1,x0:x1].copy()
        planes=[np.asarray(Image.open(directory/c['frames'][index]['file'])) for c in components]
        prior=np.maximum(planes[4],planes[7])[y0:y1,x0:x1]
        labels=np.full(prior.shape,cv2.GC_PR_BGD,np.uint8)
        labels[prior>=64]=cv2.GC_PR_FGD;labels[:2]=cv2.GC_BGD
        authored=[]
        for group,label in [(foreground,cv2.GC_FGD),(background,cv2.GC_BGD)]:
            for px,py in group:
                sx,sy=round(px*1430),round(py*1000);x,y=sx-x0,sy-y0
                if not(0<=x<x1-x0 and 0<=y<y1-y0):continue
                if np.max(np.abs(rgb[sy,sx].astype(np.int16)-reference[sy,sx].astype(np.int16)))>12:continue
                cv2.circle(labels,(x,y),2,label,-1);authored.append((x,y,label))
        if sum(label==cv2.GC_FGD for x,y,label in authored)<3 or sum(label==cv2.GC_BGD for x,y,label in authored)<3:
            raise ValueError('Current source no longer agrees with the reviewed material examples')
        cv2.setRNGSeed(0)
        cv2.grabCut(local,labels,None,np.zeros((1,65)),np.zeros((1,65)),5,cv2.GC_INIT_WITH_MASK)
        selected=np.isin(labels,[cv2.GC_FGD,cv2.GC_PR_FGD]).astype(np.uint8)
        if args.connected_bezel_correction:
            # Propagate the three reviewed background clicks through their
            # connected photographed bezel material. Tiny forced BG circles
            # alone cannot revoke a large wrong opaque model seed. The actual
            # stand footprint is outside this source-camera correction domain.
            for sx,sy in [(1405,y) for y in [660,676,692,708,724,740]]:
                mask=np.zeros((local.shape[0]+2,local.shape[1]+2),np.uint8)
                cv2.floodFill(local.copy(),mask,(sx-x0,sy-y0),(0,0,0),
                    loDiff=(12,12,12),upDiff=(12,12,12),
                    flags=4|cv2.FLOODFILL_FIXED_RANGE|cv2.FLOODFILL_MASK_ONLY|(1<<8))
                bg=mask[1:-1,1:-1]>0
                bg[:200]=False;bg[:,:290]=False
                selected[bg]=0
        # Retain the independently selected top bud/stem scaffold; the material
        # solve alone erases its pale photographic colours. Existing authored
        # TV-line exclusions still run through the canonical compositor.
        selected[15:110,125:185]|=(prior[15:110,125:185]>=224).astype(np.uint8)
        tri=np.full(prior.shape,.5);tri[cv2.erode(selected,np.ones((3,3),np.uint8))>0]=1
        tri[cv2.dilate(selected,np.ones((5,5),np.uint8))==0]=0
        for x,y,label in authored:cv2.circle(tri,(x,y),1,float(label==cv2.GC_FGD),-1)
        alpha=estimate_alpha_cf(local.astype(float)/255,tri,laplacian_kwargs={'epsilon':1e-6},
            preconditioner=lambda matrix:ichol(matrix,shifts=[.01,.1,1,10,100,1000]),
            cg_kwargs={'rtol':1e-6,'maxiter':1000})
        if not np.isfinite(alpha).all():raise ValueError('Nonfinite material alpha')
        values=old.frame(index).copy();candidate=np.rint(alpha.clip(0,1)*255).astype(np.uint8)
        protected_planes=planes[:3]
        if args.reviewed_rig_scope:
            # Actual source review: the right-stand mask also contains the TV's
            # black bezel. That false neighboring-object evidence vetoed the
            # very background correction meant to remove it. Keep the actual
            # vertical stand footprint below its housing; the upper boom stays
            # protected. This is an explicit source-camera authoring correction,
            # not a claimed automatic stand reconstruction.
            right=planes[2].copy()
            yy,xx=np.indices(right.shape)
            right[(yy>=650)&((xx<1280)|(xx>1330))]=0
            count,labels,stats,_=cv2.connectedComponentsWithStats((planes[0]>=128).astype(np.uint8),8)
            main=np.zeros(right.shape,np.uint8)
            if count>1:
                largest=1+int(np.argmax(stats[1:,cv2.CC_STAT_AREA]));main[labels==largest]=255
            protected_planes=[main,planes[1],right]
        protect=cv2.dilate((np.maximum.reduce(protected_planes)>=128).astype(np.uint8),np.ones((7,7),np.uint8))>0
        allowed=~protect[y0:y1,x0:x1]
        if args.stationary_prop_correction:
            # This explicitly reviewed source-camera region contains only the
            # fixed plant/rig at the reference pose. Permit its correction only
            # where the CURRENT photographed 7x7 neighborhood still agrees.
            # A moving person/hand/prop invalidates it rather than being held
            # at an earlier pose. This also avoids a remote false "person"
            # prediction on the TV vetoing removal of the bezel.
            change=np.max(np.abs(rgb.astype(np.int16)-reference.astype(np.int16)),axis=2).astype(np.uint8)
            stationary=cv2.dilate(change,np.ones((7,7),np.uint8))<=12
            protected_rig=np.maximum(protected_planes[1],protected_planes[2])>=128
            allowed=stationary[y0:y1,x0:x1]&~protected_rig[y0:y1,x0:x1]
        values[y0:y1,x0:x1][allowed]=candidate[allowed]
        # The canonical colour recovery uses this corrected alpha. The source
        # itself stays current-frame photographed RGB throughout.
        def corrected_prepare(frame,_alpha,active,width,height,v=values):
            return prepare(frame,Image.fromarray(v),active,width,height)
        renderer._prepare_foreground=corrected_prepare
        result=renderer.render(image,index)
        renderer._prepare_foreground=prepare
        Image.fromarray(values).save(args.out/f'alpha-{index:04d}.png')
        result.save(args.out/f'actual-render-{index:04d}.jpg',quality=98)
        if index in [0,1,9,23,24,36,47]:
            capture=cv2.VideoCapture(str(work/'replacement.mp4'))
            capture.set(cv2.CAP_PROP_POS_FRAMES,index)
            ok,bgr=capture.read();capture.release()
            if not ok:raise ValueError('Prior encoded comparison frame missing')
            previous=Image.fromarray(cv2.cvtColor(bgr,cv2.COLOR_BGR2RGB))
            sheet=Image.new('RGB',(1520,350))
            for number,(title,picture) in enumerate([('Original source',image),('Previous encoded preview',previous),
                ('Current source material matte',result),('Revised alpha',Image.fromarray(values).convert('RGB'))]):
                sheet.paste(picture.crop(box),(380*number,20));ImageDraw.Draw(sheet).text((380*number+3,3),title,fill='white')
            sheet.save(args.out/f'actual-source-prop-review-{index:04d}.jpg',quality=98)
        rows.append({'frame':index,'photographedSourceRgbUsed':True,'correctedMaterialPixels':int(allowed.sum()),'visualPass':False})
        print(json.dumps({'frame':index,'elapsedSeconds':time.monotonic()-started}),flush=True)
    write_json(args.out/'receipt.json',{'sourceSha256':sha(source),'actualFrames':args.frames,'rows':rows,
        'explicitReviewedRigScope':args.reviewed_rig_scope,
        'connectedPhotographedBezelCorrection':args.connected_bezel_correction,
        'stationaryPhotographedNeighborhoodGate':args.stationary_prop_correction,
        'authoredCanonicalBezelGarbagePath':args.authored_bezel_path,
        'sourceRegion':box,'newModelWeights':False,'elapsedSeconds':time.monotonic()-started,
        'nativeAdmission':False,'fourMinuteProof':False,'visualPass':False})


if __name__=='__main__':
    main()
