"""Private pinned withoutBG source/matte comparison, local CPU only.

Built with DINOv3. Publisher notices and the Apache-2.0 + DINOv3 terms are
retained beside the reviewed source and verified ONNX weights. No cloud SDK
or downloader is imported, and this does not register a product model.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import resource
import socket
import sys
import time
import types

import cv2
import numpy as np
import onnxruntime as ort
from PIL import Image,ImageDraw

from model_workers.common import sha,write_json
from recovered_motion_inputs import PRIVATE,RECOVERED,PAIR,original,renderer,load_components


CACHE=Path('/home/tibule12/.cache/autopromote-model-runtime/withoutbg-private-eval-20261106')


def load_reviewed_module(package,name):
    path=CACHE/'source/src/withoutbg'/f'{name}.py'
    lock=json.loads((CACHE/'source-lock.json').read_text())
    expected=next(v['sha256']for v in lock['reviewFiles']if v['file']==f'source/src/withoutbg/{name}.py')
    if sha(path)!=expected:
        raise ValueError('Reviewed publisher source changed')
    spec=importlib.util.spec_from_file_location(f'{package}.{name}',path)
    module=importlib.util.module_from_spec(spec)
    sys.modules[spec.name]=module
    spec.loader.exec_module(module)
    return module


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('out',type=Path)
    parser.add_argument('--indices',default='15,10')
    parser.add_argument('--detail-crops',action='store_true')
    parser.add_argument('--stroke-guidance',action='store_true')
    parser.add_argument('--corrections',type=Path)
    args=parser.parse_args()
    args.out.mkdir(exist_ok=False)
    (args.out/'implementation.py').write_bytes(Path(__file__).read_bytes())
    # This bound applies to this child only, never the app or another process.
    resource.setrlimit(resource.RLIMIT_AS,(8*1024**3,8*1024**3))
    resource.setrlimit(resource.RLIMIT_CPU,(240,240))
    socket.socket.connect=lambda *a,**k:(_ for _ in ()).throw(RuntimeError('Private inference networking disabled'))
    cv2.setNumThreads(2)
    package='autopromote_private_withoutbg'
    namespace=types.ModuleType(package)
    namespace.__path__=[str(CACHE/'source/src/withoutbg')]
    sys.modules[package]=namespace
    module=load_reviewed_module(package,'routed')
    load_reviewed_module(package,'edit')
    sidecar=json.loads((CACHE/'withoutbg-open-weights.onnx.json').read_text())
    def local(filename):
        file=CACHE/filename
        if file.resolve().parent!=CACHE or not file.is_file():
            raise ValueError('Only the explicitly downloaded local graphs are allowed')
        return file
    def factory(path,*,providers):
        options=ort.SessionOptions()
        options.intra_op_num_threads=2;options.inter_op_num_threads=1
        options.enable_cpu_mem_arena=False
        return ort.InferenceSession(path,sess_options=options,providers=providers)
    pipeline=module.RoutedPipeline(sidecar,local,session_factory=factory)
    parent=PRIVATE/'photographic-material-motion-r201-20261106'
    bg=np.array(Image.open(PAIR/'actual-photographed-reference.png'))
    observed=np.array(Image.open(PAIR/'actual-photographed-support.png'))>0
    corrections=json.loads(args.corrections.read_text())if args.corrections else None
    if corrections:
        if corrections['sourceSha256']!=json.loads((RECOVERED/'receipt.json').read_text())['sourceSha256']:
            raise ValueError('Corrective marks belong to another source')
        if corrections['size']!=[1430,1000]or len(corrections['points'])>128:
            raise ValueError('Corrective mark geometry or bounds differ')
        write_json(args.out/'authored-source-corrections.json',corrections)
    recovery_spec=importlib.util.spec_from_file_location('private_current_foreground_recovery',Path(__file__).with_name('check-soft-foreground-recovery.py'))
    recovery=importlib.util.module_from_spec(recovery_spec);recovery_spec.loader.exec_module(recovery)
    render=renderer();prepare=render._prepare_foreground;rows=[];start=time.monotonic()
    for index in map(int,args.indices.split(',')):
        image=original(index);rgb=np.array(image);planes=load_components(index)
        base_a=np.array(Image.open(parent/f'alpha-{index:04d}.png')).astype(float)/255
        base_f=np.array(Image.open(parent/f'foreground-{index:04d}.png')).astype(float)/255
        A=base_a.copy();F=base_f.copy();diagnostics=[]
        scopes=[]
        if args.detail_crops:
            for ci in [1,2]:
                ys,xs=np.where(planes[ci]>=64)
                if not len(xs):continue
                box=(max(0,int(xs.min())-70),max(0,int(ys.min())-85),min(1430,int(xs.max())+71),min(1000,int(ys.max())+100))
                scopes.append((ci,box))
        else:scopes=[(0,(0,0,1430,1000))]
        for ci,box in scopes:
            x0,y0,x1,y1=box;sl=np.s_[y0:y1,x0:x1]
            picture=image.crop(box);picture_rgb=np.array(picture,dtype=np.float32)/255
            category,feeds,features=pipeline._route(picture_rgb)
            coarse,depth=pipeline._coarse(picture_rgb,feeds,features,with_depth=True)
            raw=np.clip(module.resize_bilinear(coarse,y1-y0,x1-x0),0,1)[0]
            # The matting branch is explicitly evaluated even if this crop's
            # router selects opaque objects; no BiRefNet download or fallback.
            if args.stroke_guidance:
                prior=base_a[sl].astype(np.float32)
                strokes=np.full(prior.shape,.5,np.float32)
                hand=planes[ci][sl]if ci else np.maximum(planes[1],planes[2])[sl]
                primary=planes[0][sl]
                keep=(prior>=.995)&(cv2.erode((hand>=224).astype(np.uint8),np.ones((13,13),np.uint8))>0)
                difference=np.max(abs(rgb[sl].astype(np.int16)-bg[sl].astype(np.int16)),axis=2)
                remove=observed[sl]&(difference<8)&(primary<8)&(hand<8)
                # Sparse reviewed-evidence marks, rather than passing every
                # semantic foreground/background pixel as an opaque truth.
                for mask,label in [(keep,1.),(remove,0.)]:
                    dist=cv2.distanceTransform(mask.astype(np.uint8),cv2.DIST_L2,5)
                    if dist.max()<4:raise ValueError('No reliable current stroke anchor')
                    _,_,_,point=cv2.minMaxLoc(dist)
                    cv2.circle(strokes,point,4,label,-1)
                if corrections:
                    for point in corrections['points']:
                        if point['frame']!=index or point['component']!=ci:continue
                        x,y=point['position'];label=point['label']
                        if label not in [0,1]or not(0<=x<1430 and 0<=y<1000):
                            raise ValueError('Invalid source corrective mark')
                        if not(x0<=x<x1 and y0<=y<y1):
                            raise ValueError('Corrective mark is outside its selected object crop')
                        cv2.circle(strokes,(x-x0,y-y0),2,float(label),-1)
                from importlib import import_module
                edit=import_module(package+'.edit')
                raw=edit.edit_alpha(picture_rgb,prior,strokes,depth,sidecar['stroke_edit'],pipeline._run_editor,module.resize_bilinear)
                Image.fromarray(np.rint(strokes*255).astype(np.uint8)).save(args.out/f'strokes-{index:04d}-{ci}.png')
            Image.fromarray(np.rint(raw*255).astype(np.uint8)).save(args.out/f'model-alpha-{index:04d}-{ci}.png')
            if ci:
                domain=cv2.dilate((planes[ci][sl]>=64).astype(np.uint8),np.ones((31,31),np.uint8))>0
                weight=np.minimum(cv2.distanceTransform(domain.astype(np.uint8),cv2.DIST_L2,5)/8,1)
                weight[(planes[0][sl]>=128)&(planes[ci][sl]<32)]=0
            else:weight=np.ones(raw.shape)
            next_a=base_a[sl]*(1-weight)+raw*weight
            new_f,diag=recovery.recover(rgb[sl],bg[sl],next_a,F[sl],observed[sl])
            F[sl]=F[sl]*(1-weight[:,:,None])+new_f*weight[:,:,None]
            A[sl]=next_a
            diagnostics.append({'component':ci,'box':box,'routerCategory':category,'explicitBranch':'matting','correctiveStrokeNetwork':args.stroke_guidance,**diag})
        if args.detail_crops:
            hand=np.maximum(planes[1],planes[2]);outside=cv2.dilate((hand>=64).astype(np.uint8),np.ones((31,31),np.uint8))==0
            protected=outside|((planes[0]>=128)&(hand<32));F[protected]=base_f[protected];A[protected]=base_a[protected]
        fg=Image.fromarray(np.rint(F.clip(0,1)*255).astype(np.uint8));alpha=Image.fromarray(np.rint(A.clip(0,1)*255).astype(np.uint8))
        render._prepare_foreground=lambda *unused,f=fg,a=alpha:(f,a)
        output=render.render(image,index);render._prepare_foreground=prepare
        fg.save(args.out/f'foreground-{index:04d}.png');alpha.save(args.out/f'alpha-{index:04d}.png');output.save(args.out/f'actual-composite-{index:04d}.png')
        for side,box in [('left',(280,240,700,720)),('right',(1040,170,1430,760))]:
            w,h=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(w*3,h+24))
            for col,(title,picture)in enumerate([('Actual source',image),('Earlier paired candidate',Image.open(parent/f'actual-composite-{index:04d}.png')),('Pinned local withoutBG matte comparison',output)]):
                sheet.paste(picture.crop(box),(col*w,24));ImageDraw.Draw(sheet).text((col*w+3,4),title,fill='white')
            sheet.save(args.out/f'actual-{side}-comparison-{index:04d}.jpg',quality=98)
        rows.append({'frame':index,'modelTiles':diagnostics,'visualPass':False})
        print(json.dumps({'frame':index,'seconds':time.monotonic()-start,'peakRssKiB':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss}),flush=True)
    write_json(args.out/'receipt.json',{'rows':rows,'sourceSha256':json.loads((RECOVERED/'receipt.json').read_text())['sourceSha256'],
        'sourceRecoveryReceiptSha256':sha(RECOVERED/'receipt.json'),'modelDownloadReceiptSha256':sha(CACHE/'model-download-receipt.json'),
        'publisherSourceLockSha256':sha(CACHE/'source-lock.json'),'builtWith':'DINOv3','elapsedSeconds':time.monotonic()-start,
        'detailCrops':args.detail_crops,'strokeGuidance':args.stroke_guidance,'peakRssKiB':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
        'authoredCorrectionSha256':sha(args.corrections)if args.corrections else None,
        'nativeAdmission':False,'fourMinuteProof':False,'visualPass':False,'paidCloudInference':False,'providerUpload':False})


if __name__=='__main__':main()
