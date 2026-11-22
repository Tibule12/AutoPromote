"""Source-bound, temporally transported facial restoration for the shared renderer.

AI reconstructs plausible detail; it does not recover ground-truth facial pores.
No runtime downloads, source-specific coordinates, or independent edit engine.
"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
import importlib.util

import cv2
import numpy as np

MODEL_SHA256 = 'e2cd4703ab14f4d01fd1383a8a8b266f9a5833dacee8e6a79d3bf21a1b6be5ad'
MODEL_ID = 'gfpgan-v1.4-temporal-v1'
NATURAL_MODEL_ID = 'gfpgan-v1.4-natural-v2'
TEMPLATE = np.array([[192.98138,239.94708],[318.90277,240.1936],
    [256.63416,314.01935],[201.26117,371.41043],[313.08905,371.15118]],np.float32)


def validate_settings(settings):
    if not settings or not settings.get('enabled'):
        return None
    if settings.get('model',MODEL_ID) not in (MODEL_ID,NATURAL_MODEL_ID):
        raise ValueError('Unsupported facial restoration model')
    strength=settings.get('strength',.85)
    stability=settings.get('stability',.65)
    for name,value in [('strength',strength),('stability',stability)]:
        if type(value)not in(int,float)or not math.isfinite(value)or not 0<=value<=1:
            raise ValueError('Invalid facial restoration '+name)
    return {'enabled':True,'model':settings.get('model',MODEL_ID),'strength':strength,'stability':stability}


def preserve_source_structure(source,reconstructed):
    """Keep broad source anatomy/lighting and bound reconstructed microdetail.

    The original supplies low spatial frequencies; model detail supplies the
    clean fine structure. No random grain or per-episode coordinates are used.
    Strong feature boundaries are excluded from the extra microcontrast.
    """
    source=source.astype(np.float32);reconstructed=reconstructed.astype(np.float32)
    structure=cv2.GaussianBlur(source,(0,0),2.5)-cv2.GaussianBlur(reconstructed,(0,0),2.5)
    fine=reconstructed-cv2.GaussianBlur(reconstructed,(0,0),.8)
    gray=cv2.cvtColor(reconstructed,cv2.COLOR_BGR2GRAY)
    edges=cv2.magnitude(cv2.Sobel(gray,cv2.CV_32F,1,0),cv2.Sobel(gray,cv2.CV_32F,0,1))
    protect=np.exp(-(edges/40)**2)[:,:,None]
    return np.clip(reconstructed+structure*.30+np.clip(fine*.35,-2,2)*protect,0,255)


@lru_cache(maxsize=1)
def model_path():
    path=Path(os.environ.get('STUDIO_FACE_RESTORATION_MODEL','') or
        Path(__file__).parent/'models'/'face-restoration'/'GFPGANv1.4.pth')
    if not path.is_file():
        raise RuntimeError('Facial restoration is unavailable: the verified model is not installed')
    with path.open('rb')as file:
        digest=hashlib.file_digest(file,'sha256').hexdigest()
    if digest!=MODEL_SHA256:
        raise RuntimeError('Facial restoration model verification failed')
    return path


def available():
    try:
        model_path()
        return importlib.util.find_spec('torch') is not None
    except RuntimeError:
        return False


@lru_cache(maxsize=1)
def capability_version():
    if not available():return 0
    try:
        filters=subprocess.run(['ffmpeg','-hide_banner','-filters'],capture_output=True,text=True,timeout=10,check=True).stdout
        return 2 if any(line.split()[1:2]==['cas'] for line in filters.splitlines())else 1
    except (OSError,subprocess.SubprocessError):
        return 1


def soft_face_mask():
    y,x=np.mgrid[:512,:512].astype(np.float32)
    # Feather entirely inside the aligned crop, including the hairline. No
    # rectangular patch boundary can be pasted over the surrounding shot.
    radius=((x-256)/226)**2+((y-253)/252)**2
    mask=np.clip((1-radius)/.24,0,1)
    return (mask*mask*(3-2*mask)).astype(np.float32)


def transport_residual(current,reference,residual):
    gray=lambda image:cv2.resize(cv2.cvtColor(image,cv2.COLOR_BGR2GRAY),(192,192))
    flow=cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_FAST).calc(gray(current),gray(reference),None)
    flow=cv2.resize(flow,(512,512))* (512/192)
    y,x=np.mgrid[:512,:512].astype(np.float32);mx=x+flow[:,:,0];my=y+flow[:,:,1]
    warped=cv2.remap(residual,mx,my,cv2.INTER_LINEAR,borderMode=cv2.BORDER_REFLECT_101)
    appearance=cv2.remap(reference,mx,my,cv2.INTER_LINEAR,borderMode=cv2.BORDER_REFLECT_101)
    error=np.mean(np.abs(appearance.astype(np.float32)-current),axis=2)
    confidence=np.exp(-(error/14)**2).astype(np.float32)
    return warped,confidence


class FaceRestorer:
    def __init__(self,settings,device='auto'):
        import torch
        try:
            from .third_party.gfpgan_clean.gfpganv1_clean_arch import GFPGANv1Clean
        except ImportError:
            from third_party.gfpgan_clean.gfpganv1_clean_arch import GFPGANv1Clean
        self.torch=torch;torch.set_num_threads(2)
        if device not in ('auto','cpu','cuda'):raise ValueError('Choose an available restoration device')
        self.device='cuda'if device!='cpu'and torch.cuda.is_available()else'cpu'
        if device=='cuda'and self.device!='cuda':raise RuntimeError('Requested restoration GPU is unavailable')
        self.settings=validate_settings(settings)
        self.model=GFPGANv1Clean(out_size=512,num_style_feat=512,channel_multiplier=2,
            decoder_load_path=None,fix_decoder=False,num_mlp=8,input_is_latent=True,
            different_w=True,narrow=1,sft_half=True)
        self.model.load_state_dict(torch.load(model_path(),map_location='cpu',weights_only=True)['params_ema'],strict=True)
        self.fallback_reason=None
        self.model.eval()
        try:self.model.to(self.device)
        except RuntimeError as error:
            if device=='cuda' or self.device!='cuda':raise
            self.model.to('cpu');self.device='cpu';self.fallback_reason=type(error).__name__
            torch.cuda.empty_cache()
        self.detector=cv2.FaceDetectorYN.create(str(Path(__file__).parent/'models'/'yunet'/'face_detection_yunet_2023mar.onnx'),'',(640,360),score_threshold=.7)
        self.mask=soft_face_mask();self.calls=0

    def align(self,frame):
        h,w=frame.shape[:2];_,faces=self.detector.detect(cv2.resize(frame,(640,360)))
        if faces is None:return None
        # The main face, not a tiny reaction inset. Selection is measured from
        # each source picture; there are no episode-specific face coordinates.
        face=max(faces,key=lambda f:f[2]*f[3])
        if face[2]*face[3]<640*360*.0015:return None
        pts=face[4:14].reshape(5,2)*np.array([w/640,h/360])
        matrix,_=cv2.estimateAffinePartial2D(pts,TEMPLATE,method=cv2.LMEDS)
        if matrix is None or not np.all(np.isfinite(matrix)):return None
        aligned=cv2.warpAffine(frame,matrix,(512,512),flags=cv2.INTER_CUBIC,borderMode=cv2.BORDER_REFLECT_101)
        return {'image':aligned,'matrix':matrix,'face':face[:4].copy(),
                'scene':cv2.resize(frame,(48,27)).astype(np.float32)}

    def infer(self,aligned):
        torch=self.torch
        tensor=torch.from_numpy(aligned[:,:,::-1].copy()).permute(2,0,1).float().div(127.5).sub(1).unsqueeze(0).to(self.device)
        with torch.inference_mode():
            try:output=self.model(tensor,return_rgb=False,randomize_noise=False)[0]
            except RuntimeError as error:
                if self.device!='cuda':raise
                # The same loaded parameters and current frame continue on
                # CPU if CUDA becomes unavailable; no new edit/job is made.
                self.model.to('cpu');self.device='cpu';self.fallback_reason=type(error).__name__
                tensor=tensor.cpu();torch.cuda.empty_cache()
                output=self.model(tensor,return_rgb=False,randomize_noise=False)[0]
        restored=((output.squeeze(0).clamp(-1,1).cpu().permute(1,2,0).numpy()+1)*127.5)[:,:,::-1]
        if self.settings['model']==NATURAL_MODEL_ID:
            restored=preserve_source_structure(aligned,restored)
        self.calls+=1
        return restored-aligned.astype(np.float32)

    def paste(self,frame,aligned,residual,confidence=None):
        h,w=frame.shape[:2];alpha=self.mask*self.settings['strength']
        if confidence is not None:alpha=alpha*confidence
        inverse=cv2.invertAffineTransform(aligned['matrix'])
        # Warp premultiplied correction, not a replacement rectangular image.
        delta=cv2.warpAffine(residual*alpha[:,:,None],inverse,(w,h),flags=cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)
        return np.clip(frame.astype(np.float32)+delta,0,255).round().astype(np.uint8)


def same_shot(a,b):
    if not a or not b:return False
    if a.get('scene') is not None and b.get('scene') is not None and np.mean(np.abs(a['scene']-b['scene']))>20:
        return False
    aa,bb=a['face'],b['face']
    size=max(aa[2],aa[3],bb[2],bb[3]);shift=np.linalg.norm((aa[:2]+aa[2:]/2)-(bb[:2]+bb[2:]/2))
    return shift<size and .55<bb[2]*bb[3]/max(1,aa[2]*aa[3])<1.8


class SourcePictures:
    """FFmpeg owns colour decoding as well as programme timestamps.

    OpenCV VideoCapture converts Rec.709 with its legacy601 matrix on the
    qualified runtime. Raw FFmpeg BGR avoids that visible colour shift.
    """
    def __init__(self,path):
        info=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0',
            '-show_entries','stream=width,height,avg_frame_rate,nb_frames','-of','json',str(path)]))['streams'][0]
        numerator,denominator=map(float,info['avg_frame_rate'].split('/'))
        self.fps=numerator/denominator;self.width=int(info['width']);self.height=int(info['height'])
        self.count=int(info['nb_frames'])if str(info.get('nb_frames','')).isdigit()else None
        self.position=0;self.ended=False;self.bytes=self.width*self.height*3
        self.process=subprocess.Popen(['ffmpeg','-nostdin','-v','error','-threads','1','-i',str(path),
            '-map','0:v:0','-an','-sn','-dn','-fps_mode','passthrough','-f','rawvideo','-pix_fmt','bgr24','pipe:1'],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
    def read(self):
        data=bytearray()
        while len(data)<self.bytes:
            block=self.process.stdout.read(self.bytes-len(data))
            if not block:break
            data.extend(block)
        if not data:self.ended=True;return False,None
        if len(data)!=self.bytes:raise RuntimeError('The source video ended with an incomplete picture')
        self.position+=1
        return True,np.frombuffer(data,np.uint8).reshape(self.height,self.width,3)
    def release(self):
        self.process.stdout.close()
        if self.process.poll()is None:self.process.terminate()
        self.process.wait(timeout=30)


def restore_video(input_path,output_path,settings,device='auto',progress_path=None):
    settings=validate_settings(settings)
    if not settings:raise ValueError('Enable facial restoration before preparing a video')
    restorer=FaceRestorer(settings,device);cap=SourcePictures(input_path)
    fps=cap.fps;w=cap.width;h=cap.height
    if not all(math.isfinite(x)and x>0 for x in (fps,w,h)):raise ValueError('Facial restoration requires a verified video clock')
    stride=max(1,round(fps/4));frames=0;unrestored=0;started=time.monotonic();previous=None
    picture_filter='scale=out_color_matrix=bt709:out_range=tv,format=yuv444p,setparams=range=limited:colorspace=bt709'
    if settings['model']==NATURAL_MODEL_ID and settings['strength']>0:
        # The natural finish keeps original fabric/room texture instead of
        # sending those surfaces through a generative smoothing model.
        picture_filter=f"format=gbrp,cas=strength={settings['strength']*.2:.6f},"+picture_filter
    command=['ffmpeg','-nostdin','-v','error','-y','-f','rawvideo','-pix_fmt','bgr24','-s',f'{w}x{h}','-r',f'{fps:.10f}','-i','pipe:0',
        '-i',str(input_path),'-map','0:v:0','-map','1:a?',
        '-vf',picture_filter,
        '-c:v','libx264','-preset','veryfast','-crf','10','-threads','2','-pix_fmt','yuv444p',
        '-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-color_range','tv','-c:a','copy','-movflags','+faststart',str(output_path)]
    log_path=Path(str(output_path)+'.ffmpeg.log')
    with log_path.open('wb')as log:
        process=subprocess.Popen(command,stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,stderr=log)
        # One bounded prefetch overlaps GPU inference with CPU optical-flow
        # transport/encoding. At most two small frame windows are resident.
        pool=ThreadPoolExecutor(max_workers=1,thread_name_prefix='studio-face-prepare')
        def prepare(previous):
            batch=[]
            for _ in range(stride+1 if previous is None else stride):
                ok,frame=cap.read()
                if not ok:break
                batch.append((frame,restorer.align(frame)))
            if not batch:
                return ([previous],previous[2],previous[2],True)if previous is not None else None
            if previous is not None:batch.insert(0,previous)
            first,last=batch[0][1],batch[-1][1]
            left=previous[2]if previous is not None else(restorer.infer(first['image'])if first else None)
            right=restorer.infer(last['image'])if last else None
            if left is not None and right is not None and same_shot(first,last):
                transported,confidence=transport_residual(last['image'],first['image'],left)
                temporal=settings['stability']*.28*confidence[:,:,None]
                right=right*(1-temporal)+transported*temporal
            final_batch=cap.ended or (cap.count is not None and cap.position>=cap.count)
            return batch,left,right,final_batch
        pending=pool.submit(prepare,None)
        try:
            while True:
                prepared=pending.result()
                if prepared is None:break
                batch,left,right,final_batch=prepared
                first,last=batch[0][1],batch[-1][1]
                if not final_batch:
                    pending=pool.submit(prepare,(*batch[-1][:2],right))
                count=len(batch)if final_batch else len(batch)-1
                for index,(frame,current,*_)in enumerate(batch[:count]):
                    if current is None:output=frame;unrestored+=1
                    else:
                        deltas=[];weights=[];fraction=index/max(1,len(batch)-1)
                        for endpoint,residual,weight in [(first,left,1-fraction),(last,right,fraction)]:
                            if residual is None or weight<=0 or not same_shot(current,endpoint):continue
                            delta,confidence=transport_residual(current['image'],endpoint['image'],residual)
                            deltas.append(delta);weights.append(confidence*weight)
                        if deltas:
                            total=np.sum(weights,axis=0);delta=sum(d*q[:,:,None]for d,q in zip(deltas,weights))/np.maximum(total,.0001)[:,:,None]
                            output=restorer.paste(frame,current,delta,np.clip(total,0,1))
                        else:output=frame;unrestored+=1
                    process.stdin.write(output.tobytes());frames+=1
                if progress_path:Path(progress_path).write_text(json.dumps({'frames':frames,'modelSamples':restorer.calls,'fps':fps,'seconds':time.monotonic()-started}))
                if final_batch:break
            process.stdin.close();code=process.wait(timeout=120)
            if code:raise RuntimeError('Facial restoration encode failed: '+log_path.read_text()[-1000:])
        except BaseException:
            process.kill();process.wait();raise
        finally:
            pool.shutdown(wait=True,cancel_futures=True)
            cap.release()
    if not frames or unrestored>=frames:raise RuntimeError('No suitable face was restored; keep the source and choose clearer footage')
    receipt={'model':settings['model'],'modelSha256':MODEL_SHA256,'device':restorer.device,'frames':frames,'unrestoredFrames':unrestored,
        'modelSamples':restorer.calls,'fps':fps,'decoder':'ffmpeg-source-rgb-v1','strength':settings['strength'],'stability':settings['stability'],
        'elapsedSeconds':time.monotonic()-started,'generativeDetail':True,'originalAudioPreserved':True}
    receipt['fallbackReason']=restorer.fallback_reason
    Path(str(output_path)+'.receipt.json').write_text(json.dumps(receipt,indent=2));return receipt


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--input',required=True);parser.add_argument('--output',required=True)
    parser.add_argument('--strength',type=float,default=.85);parser.add_argument('--stability',type=float,default=.65)
    parser.add_argument('--device',default='auto');parser.add_argument('--progress')
    parser.add_argument('--model',choices=[MODEL_ID,NATURAL_MODEL_ID],default=MODEL_ID)
    args=parser.parse_args();print(json.dumps(restore_video(args.input,args.output,{'enabled':True,'model':args.model,'strength':args.strength,'stability':args.stability},args.device,args.progress)),flush=True)
