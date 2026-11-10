"""Private four-minute source-clock recomposition with measured registration.

Uses retained corrective alpha and the existing compositor. Current RGB always
decodes from the original. Static reference alpha is eligible only in authored
equipment/furniture regions where current source colour actually agrees and
independent current person evidence is absent. This is not a new editor engine
or an accepted model artifact. Preserve earlier movies and keep review internal.
"""
import argparse,copy,json,subprocess,time,shutil,hashlib,socket
from pathlib import Path
import cv2,numpy as np,onnxruntime as ort
from PIL import Image,ImageDraw
from scipy.ndimage import distance_transform_edt
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
p=argparse.ArgumentParser();p.add_argument('out',type=Path);p.add_argument('--sample-only',action='store_true');a=p.parse_args();a.out.mkdir(exist_ok=False);cv2.setNumThreads(2)
root=Path('reports/background-replacement-20261101/private');data=json.load(open(root/'full-rate-registration-20261104/smoothed-registration.json'));rows=data['rows'];assert len(rows)==5760 and all(r['accepted'] for r in rows)
old=json.load(open(root/'long-podcast-r7/registration.json'))['rows'];references=[np.asarray(Image.open(root/'four-minute-r9/source-115.png')),np.asarray(Image.open(root/'four-minute-r9/source-055.png'))]
static=[np.asarray(Image.open(root/'fine-props-r8/native-effective-alpha/effective-alpha/alpha_0000.png')),np.asarray(Image.open(root/'piece-review-r6/effective-alpha-second/effective-alpha/alpha_0000.png'))]
session=ort.SessionOptions();session.intra_op_num_threads=2;session.inter_op_num_threads=1
checkpoint=Path('/home/tibule12/.cache/autopromote-model-runtime/rvm-private-cpu-evaluation-v1/rvm_mobilenetv3_fp32.onnx')
assert hashlib.file_digest(checkpoint.open('rb'),'sha256').hexdigest()=='88d4531297118f595bf2fd60f6f566aec2e559393802d1f436c380f0cbbd2828'
recurrent=ort.InferenceSession(str(checkpoint),sess_options=session,providers=['CPUExecutionProvider'])
socket.socket.connect=lambda *args,**kwargs:(_ for _ in ()).throw(RuntimeError('Private inference networking disabled'))
face=cv2.FaceDetectorYN_create('/home/tibule12/Projects/AutoPromte/AutoPromote/python_media_worker/models/yunet/face_detection_yunet_2023mar.onnx','',(1430,1000),.6,.3,5000)
scenes=json.load(open(root/'piece-review-r6/final-detail-pass/native-final/two-speaker-final-project.autopromote.json'))['snapshot']['subjectVfxScenes']
class FrameCache:
    artifact_sha256='0'*64;directory=None
    def __init__(self,w):self.manifest={'width':w,'height':1000,'frame_count':5760,'fps':24,'fps_fraction':'24/1','source_sha256':'0'*64}
    def frame(self,index):return self.value
caches=[FrameCache(w) for w in [1430,1440]];renderers=[]
for angle,cache in enumerate(caches):
    # The retained effective alpha already includes its original corrections.
    # Do not repeat old held body polygons or colour keys over that result.
    effects=copy.deepcopy([e for e in scenes[angle]['scene']['effects'] if e['type'] in ['background_replace','foreground_grade']])
    for e in effects:e['start']=0;e['end']=240
    renderers.append(VfxFrameRenderer({'version':1,'source_sha256':'0'*64,'matte_sha256':'0'*64,'effects':effects},cache,lambda _:root/'replacement.png'))
source=Path(data['source']);matte=Path('/home/tibule12/Videos/AutoPromote Background Replacement - 2026-11-01/Four-minute repair - 2026-11-03/Full alpha matte - lossless.mkv')
decoder=subprocess.Popen(['ffmpeg','-nostdin','-v','error','-threads','1','-i',str(source),'-t','240','-vf','fps=24','-an','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],stdout=subprocess.PIPE)
maskdecoder=subprocess.Popen(['ffmpeg','-nostdin','-v','error','-threads','1','-i',str(matte),'-an','-pix_fmt','gray','-f','rawvideo','pipe:1'],stdout=subprocess.PIPE)
sample_frames={0,132,194,1188,1284,2058,2202,2760,2784,4800,5154,5376,5382,5385,5399,5412,5759};records=[];previous_angle=None;states=None;start=time.monotonic()
def writer(file,pix,codec):
    return subprocess.Popen(['ffmpeg','-nostdin','-v','error','-threads','1','-f','rawvideo','-pix_fmt',pix,'-s','1430x1000','-r','24','-i','pipe:0','-an','-c:v',codec,'-threads','2',*(['-level','3','-g','1'] if codec=='ffv1' else ['-preset','fast','-crf','16','-pix_fmt','yuv420p','-movflags','+frag_keyframe+empty_moov+default_base_moof']),str(file)],stdin=subprocess.PIPE)
picture_writer=None if a.sample_only else writer(a.out/'picture.mp4','rgb24','libx264');alpha_writer=None if a.sample_only else writer(a.out/'alpha.mkv','gray','ffv1')
(a.out/'samples').mkdir()
try:
    for index in range(5760):
        raw=decoder.stdout.read(1920*1080*3);maskraw=maskdecoder.stdout.read(1430*1000);assert len(raw)==1920*1080*3 and len(maskraw)==1430*1000,index
        if a.sample_only and index not in sample_frames:continue
        if index%24==0 and shutil.disk_usage(a.out).free<1024**3:raise RuntimeError('Preserve 1GiB temporary-volume reserve')
        tick=time.monotonic();angle=rows[index]['angle'];w=[1430,1440][angle];matrix=np.asarray(rows[index]['smoothedMatrix']);prior_matrix=np.asarray(old[index//6]['matrix'])
        current=cv2.warpAffine(np.frombuffer(raw,np.uint8).reshape(1080,1920,3),matrix,(w,1000),flags=cv2.INTER_LANCZOS4)
        prior=np.frombuffer(maskraw,np.uint8).reshape(1000,1430).copy()
        if w!=1430:prior=cv2.resize(prior,(w,1000),interpolation=cv2.INTER_LANCZOS4)
        transform=(np.vstack([matrix,[0,0,1]])@np.linalg.inv(np.vstack([prior_matrix,[0,0,1]])))[:2]
        values=cv2.warpAffine(prior,transform,(w,1000),flags=cv2.INTER_LINEAR)
        if a.sample_only or angle!=previous_angle:states={f'r{n}i':np.zeros((1,1,1,1),np.float32) for n in range(1,5)}
        _,person,*nextstates=recurrent.run(None,{'src':current.transpose(2,0,1)[None].astype(np.float32)/255,'downsample_ratio':np.array([.35],np.float32),**states});states={f'r{n}i':v for n,v in enumerate(nextstates,1)};person=person[0,0]
        stable=np.max(np.abs(current.astype(np.int16)-references[angle].astype(np.int16)),axis=2)<=10
        eligible=np.zeros((1000,w),bool)
        if angle==0:eligible[430:,730:]=True;eligible[610:,:120]=True
        else:eligible[650:,:440]=True
        eligible&=stable&(cv2.dilate((person>.035).astype(np.uint8),np.ones((15,15),np.uint8))==0)
        values[eligible]=static[angle][eligible]
        # The original head is never replaced by a held shape or source still.
        # Contract the retained head edge by half a pixel, preserving cap/face
        # interiors, then recover boundary colour from the same current RGB.
        face.setInputSize((w,1000));_,faces=face.detect(cv2.cvtColor(current,cv2.COLOR_RGB2BGR));head_box=None
        if faces is not None:
            fx,fy,fw,fh=max(faces,key=lambda q:q[2]*q[3])[:4];head_box=(max(0,round(fx-fw*.7)),max(0,round(fy-fh*.85)),min(w,round(fx+fw*1.65)),min(1000,round(fy+fh*1.3)))
            x0,y0,x1,y1=head_box;sl=np.s_[y0:y1,x0:x1];patch=values[sl];values[sl]=np.rint((patch.astype(float)+cv2.erode(patch,np.ones((3,3),np.uint8)))/2).astype(np.uint8)
        from pymatting import estimate_foreground_ml
        alpha=values.astype(float)/255;clean=estimate_foreground_ml(current.astype(float)/255,alpha).clip(0,1)
        clean[(values==0)|(values==255)]=current[(values==0)|(values==255)]/255
        caches[angle].value=values;result=renderers[angle].render(Image.fromarray(np.rint(clean*255).astype(np.uint8)),index)
        delivered=result.resize((1430,1000),Image.Resampling.LANCZOS) if w!=1430 else result;delivered_alpha=Image.fromarray(values).resize((1430,1000),Image.Resampling.LANCZOS) if w!=1430 else Image.fromarray(values)
        if picture_writer:picture_writer.stdin.write(delivered.tobytes());alpha_writer.stdin.write(delivered_alpha.tobytes())
        if index in sample_frames or (not a.sample_only and index%240==0):
            delivered.save(a.out/'samples'/f'after-{index:05d}.png');Image.fromarray(current).resize((1430,1000)).save(a.out/'samples'/f'source-{index:05d}.jpg',quality=96);delivered_alpha.save(a.out/'samples'/f'alpha-{index:05d}.png')
        records.append({'frame':index,'angle':angle,'staticEligiblePixels':int(eligible.sum()),'headBox':head_box,'frameSeconds':time.monotonic()-tick});previous_angle=angle
        if a.sample_only or index%24==0 or index==5759:
            progress={'processedFrames':len(records),'sourceFrame':index,'totalSourceFrames':5760,'sampleOnly':a.sample_only,'elapsedSeconds':time.monotonic()-start,'visualPass':False};(a.out/'progress.json').write_text(json.dumps(progress)+'\n');print(json.dumps(progress),flush=True)
    assert not decoder.stdout.read(1) and not maskdecoder.stdout.read(1);assert decoder.wait()==0 and maskdecoder.wait()==0
    for process in [picture_writer,alpha_writer]:
        if process:process.stdin.close();assert process.wait()==0
    if not a.sample_only:
        subprocess.run(['ffmpeg','-nostdin','-v','error','-i',str(a.out/'picture.mp4'),'-i',str(source),'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','192k','-t','240','-movflags','+faststart',str(a.out/'replacement.mp4')],check=True)
    (a.out/'receipt.json').write_text(json.dumps({'source':str(source),'sourceFrameCount':5760,'sampleOnly':a.sample_only,'records':records,'currentRgbAlwaysDecoded':True,'actualNativeModelArtifact':False,'newNativeFourMinuteExport':False,'visualPass':False,'paidCloud':False},indent=2)+'\n')
finally:
    for process in [decoder,maskdecoder,picture_writer,alpha_writer]:
        if process and process.poll() is None:process.kill();process.wait()
