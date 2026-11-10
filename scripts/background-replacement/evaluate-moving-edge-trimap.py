"""Private actual ViTMatte test releasing measured moving finger-edge seeds.

Reuses the pinned product checkpoint. Separate current cuff/body selections
protect clothing; only current hand tiles are inferred. No model admission.
"""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import resource
import socket
import time

import cv2
import numpy as np
from PIL import Image,ImageDraw
import torch
from transformers import VitMatteForImageMatting

from model_workers.common import sha,write_json
from model_workers.adapters.temporal_alpha import polish_trimap,source_motion_radius
from recovered_motion_inputs import PRIVATE,RECOVERED,PAIR,original,renderer,load_components


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('out',type=Path);p.add_argument('--indices',default='15,10,7')
    p.add_argument('--all-frames',action='store_true')
    p.add_argument('--primary-cores',action='store_true')
    p.add_argument('--shared-moving-policy',action='store_true')
    p.add_argument('--corrections',type=Path,default=PRIVATE/'corrective-click-agreement-r66/authored-left-screen-correction-r211-20261106.json')
    args=p.parse_args();args.out.mkdir(exist_ok=False)
    (args.out/'implementation.py').write_bytes(Path(__file__).read_bytes())
    os.environ['HF_HUB_OFFLINE']='1';os.environ['TRANSFORMERS_OFFLINE']='1'
    socket.socket.connect=lambda *a,**k:(_ for _ in ()).throw(RuntimeError('Private inference networking disabled'))
    resource.setrlimit(resource.RLIMIT_CPU,(600,600))
    torch.set_num_threads(2);torch.set_num_interop_threads(1);cv2.setNumThreads(2)
    model_dir=Path('/home/tibule12/.cache/autopromote-model-runtime/vitmatte-small-pinned')
    expected='bda9289db1bb6762d978b42d1c62ae3f34daf7497171a347a1d09657efd788cb'
    if sha(model_dir/'model.safetensors')!=expected:raise ValueError('Pinned product model changed')
    model=VitMatteForImageMatting.from_pretrained(model_dir,local_files_only=True).to('cpu').eval()
    parent=PRIVATE/'photographic-material-motion-r201-20261106';garment=PRIVATE/'garment-tracks-r147-20261105'
    gm=json.loads((garment/'receipt.json').read_text())
    corrections=json.loads(args.corrections.read_text())
    if corrections['sourceSha256']!=json.loads((RECOVERED/'receipt.json').read_text())['sourceSha256']or corrections['size']!=[1430,1000]:
        raise ValueError('Authored corrections belong to a different source')
    write_json(args.out/'authored-source-corrections.json',corrections)
    bg=np.array(Image.open(PAIR/'actual-photographed-reference.png'));observed=np.array(Image.open(PAIR/'actual-photographed-support.png'))>0
    spec=importlib.util.spec_from_file_location('private_current_foreground_recovery',Path(__file__).with_name('check-soft-foreground-recovery.py'))
    solver=importlib.util.module_from_spec(spec);spec.loader.exec_module(solver)
    render=renderer();prepare=render._prepare_foreground;rows=[];start=time.monotonic()
    for index in (range(48)if args.all_frames else map(int,args.indices.split(','))):
        image=original(index);rgb=np.array(image);planes=load_components(index)
        prior=np.array(Image.open(parent/f'alpha-{index:04d}.png'));A=prior.astype(float)/255
        baseline=np.array(Image.open(parent/f'foreground-{index:04d}.png'));F=baseline.astype(float)/255
        motion=source_motion_radius(rgb,np.array(original(index-1 if index else 1)),1)
        stats=[]
        for ci in [1,2]:
            hand=planes[ci];ys,xs=np.where(hand>=64)
            if not len(xs):continue
            x0,y0=max(0,int(xs.min())-55),max(0,int(ys.min())-55)
            x1,y1=min(1430,int(xs.max())+56),min(1000,int(ys.max())+76);sl=np.s_[y0:y1,x0:x1]
            if not args.primary_cores:
                meta=gm['rows'][index]['components'][ci-1];path=garment/meta['file']
                if sha(path)!=meta['sha256']:raise ValueError('Current garment geometry changed')
                cuff=np.array(Image.open(path))[sl]
            tri=polish_trimap(prior[sl],8)
            before=tri.copy()
            domain=(cv2.dilate((hand[sl]>=64).astype(np.uint8),np.ones((31,31),np.uint8))>0)&observed[sl]
            depth=cv2.distanceTransform((hand[sl]>=224).astype(np.uint8),cv2.DIST_L2,5)
            release=domain&(motion[sl]>4)&(depth<np.maximum(24,motion[sl]+8))
            unrelated=(planes[0][sl]>=128)&(hand[sl]<32)
            release&=~unrelated
            tri[release]=128
            if args.primary_cores:
                body=(planes[0][sl]>=224).astype(np.uint8)
                body=cv2.morphologyEx(body,cv2.MORPH_CLOSE,np.ones((7,7),np.uint8))
                keep=(cv2.distanceTransform(body,cv2.DIST_L2,5)>48)&(prior[sl]>=254)
            else:
                cdepth=cv2.distanceTransform((cuff>=224).astype(np.uint8),cv2.DIST_L2,5)
                keep=(cdepth>8)&(prior[sl]>=254)
            tri[keep]=255
            delta=np.max(abs(rgb[sl].astype(np.int16)-bg[sl].astype(np.int16)),axis=2)
            empty=domain&(delta<8)&~keep
            tri[empty]=0
            if args.shared_moving_policy:
                from model_workers.adapters.moving_detail_alpha import measured_motion_trimap
                tri,domain=measured_motion_trimap(prior[sl],hand[sl],planes[0][sl],rgb[sl],bg[sl],observed[sl],motion[sl])
            # Authored marks are source-bound and precede actual inference.
            for point in corrections['points']:
                if point['frame']!=index or point['component']!=ci:continue
                x,y=point['position'];label=point['label']
                if label not in [0,1]or not(x0<=x<x1 and y0<=y<y1):
                    raise ValueError('Invalid authored mark or object crop')
                cv2.circle(tri,(x-x0,y-y0),2,int(label)*255,-1)
            Image.fromarray(before).save(args.out/f'old-trimap-{index:04d}-{ci}.png')
            Image.fromarray(tri).save(args.out/f'moving-trimap-{index:04d}-{ci}.png')
            height,width=tri.shape
            inp=torch.cat((torch.from_numpy(rgb[sl].copy()).permute(2,0,1).float()/127.5-1,
                torch.from_numpy(tri)[None].float()/255),0)[None]
            inp=torch.nn.functional.pad(inp,(0,(-width)%32,0,(-height)%32),mode='replicate')
            with torch.inference_mode():raw=model(pixel_values=inp).alphas[0,0,:height,:width].cpu().numpy().clip(0,1)
            raw[tri==0]=0;raw[tri==255]=1
            Image.fromarray(np.rint(raw*255).astype(np.uint8)).save(args.out/f'raw-model-alpha-{index:04d}-{ci}.png')
            weight=np.minimum(cv2.distanceTransform(domain.astype(np.uint8),cv2.DIST_L2,5)/8,1)
            weight[unrelated]=0
            next_a=A[sl]*(1-weight)+raw*weight
            if args.shared_moving_policy:
                from python_media_worker.studio_source_background import recover_foreground
                new_f=recover_foreground(rgb[sl],np.rint(next_a*255).astype(np.uint8),bg[sl],observed[sl],F[sl])
                diag={'sharedVerifiedPhotographicRecovery':True}
            else:
                new_f,diag=solver.recover(rgb[sl],bg[sl],next_a,F[sl],observed[sl])
            F[sl]=F[sl]*(1-weight[:,:,None])+new_f*weight[:,:,None];A[sl]=next_a
            stats.append({'component':ci,'crop':[x0,y0,x1,y1],
                'opaqueSeedsActuallyReleased':int(((before==255)&(tri!=255)).sum()),'clothingOpaqueSeedsKept':int(keep.sum()),**diag})
            print(json.dumps({'frame':index,'component':ci,'seconds':time.monotonic()-start}),flush=True)
        hand=np.maximum(planes[1],planes[2]);outside=cv2.dilate((hand>=64).astype(np.uint8),np.ones((31,31),np.uint8))==0
        protected=outside|((planes[0]>=128)&(hand<32));F[protected]=baseline[protected].astype(float)/255;A[protected]=prior[protected].astype(float)/255
        fg=Image.fromarray(np.rint(F.clip(0,1)*255).astype(np.uint8));alpha=Image.fromarray(np.rint(A.clip(0,1)*255).astype(np.uint8))
        render._prepare_foreground=lambda *unused,f=fg,a=alpha:(f,a)
        output=render.render(image,index);render._prepare_foreground=prepare
        fg.save(args.out/f'foreground-{index:04d}.png');alpha.save(args.out/f'alpha-{index:04d}.png');output.save(args.out/f'actual-composite-{index:04d}.png')
        for side,box in [('left',(280,240,700,720)),('right',(1040,170,1430,760))]:
            w,h=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(w*3,h+24))
            for col,(title,picture)in enumerate([('Actual source',image),('Earlier paired candidate',Image.open(parent/f'actual-composite-{index:04d}.png')),('Actual moving-edge trimap inference',output)]):
                sheet.paste(picture.crop(box),(col*w,24));ImageDraw.Draw(sheet).text((col*w+3,4),title,fill='white')
            sheet.save(args.out/f'actual-{side}-comparison-{index:04d}.jpg',quality=98)
        rows.append({'frame':index,'tiles':stats,'visualPass':False})
    write_json(args.out/'receipt.json',{'rows':rows,'allFrames':args.all_frames,'sourceSha256':json.loads((RECOVERED/'receipt.json').read_text())['sourceSha256'],
        'sourceRecoveryReceiptSha256':sha(RECOVERED/'receipt.json'),'modelWeightsSha256':expected,
        'elapsedSeconds':time.monotonic()-start,'peakRssKiB':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
        'authoredCorrectionSha256':sha(args.corrections),
        'onlyExistingPrimarySelectionForClothingProtection':args.primary_cores,
        'actualSharedMovingPolicyAndRecovery':args.shared_moving_policy,
        'nativeAdmission':False,'fourMinuteProof':False,'visualPass':False,'paidCloudInference':False,'providerUpload':False})


if __name__=='__main__':main()
