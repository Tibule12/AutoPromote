"""Pinned local CPU segmentation creates an input matte, never a composited film."""
from pathlib import Path
import hashlib,json,time,subprocess
import cv2,numpy as np,onnxruntime as ort
from PIL import Image,ImageDraw
root=Path(__file__).resolve().parents[2]
out=root/'reports/studio-make-your-move-20261102/episode';out.mkdir(exist_ok=True)
source=root/'reports/studio-motion-flow-takeover-20261031/video-texture/open-world-sources/City.mp4'
model=Path.home()/'.cache/autopromote-model-runtime/rvm-private-cpu-evaluation-v1/rvm_mobilenetv3_fp32.onnx'
assert hashlib.sha256(model.read_bytes()).hexdigest()=='88d4531297118f595bf2fd60f6f566aec2e559393802d1f436c380f0cbbd2828'
options=ort.SessionOptions();options.intra_op_num_threads=2;options.inter_op_num_threads=1
session=ort.InferenceSession(str(model),sess_options=options,providers=['CPUExecutionProvider'])
capture=cv2.VideoCapture(str(source));capture.set(cv2.CAP_PROP_POS_FRAMES,72)
state=[np.zeros((1,1,1,1),np.float32) for _ in range(4)]
target=out/'City - source-bound luma matte.mp4'
encoder=subprocess.Popen(['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','gray','-s','640x360','-r','24','-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','10','-pix_fmt','yuv420p','-movflags','+faststart',str(target)],stdin=subprocess.PIPE)
board=Image.new('RGB',(1280,760),'#101114');draw=ImageDraw.Draw(board);began=time.monotonic();frames=0
try:
    for index in range(72,192):
        ok,bgr=capture.read();assert ok
        rgb=cv2.cvtColor(cv2.resize(bgr,(640,360)),cv2.COLOR_BGR2RGB)
        tensor=np.transpose(rgb.astype(np.float32)/255,(2,0,1))[None]
        _,alpha,*state=session.run(None,dict(src=tensor,**{f'r{i+1}i':v for i,v in enumerate(state)},downsample_ratio=np.array([1],np.float32)))
        if index<96:continue
        a=alpha[0,0]
        roi=np.zeros_like(a);roi[25:310,240:415]=1
        support=((a>.55)*roi).astype('uint8')
        contours,_=cv2.findContours(support,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
        clean=np.zeros_like(support)
        if contours:cv2.drawContours(clean,[max(contours,key=cv2.contourArea)],-1,1,-1)
        clean=cv2.dilate(clean,np.ones((5,5),np.uint8))
        # Fill interior confidence holes while retaining the model's soft edge.
        core=cv2.erode(clean,np.ones((7,7),np.uint8))
        a=np.clip(np.maximum(a,core)*clean,0,1)
        encoder.stdin.write((a*255).astype('uint8').tobytes());frames+=1
        if index in [96,120,144,168]:
            slot=[96,120,144,168].index(index)
            preview=(rgb.astype(float)*a[:,:,None]+np.array([16,17,20])*(1-a[:,:,None])).astype('uint8')
            board.paste(Image.fromarray(preview),(slot%2*640,slot//2*380+20));draw.text((slot%2*640+8,slot//2*380),f'Source {index}/24 — input matte review',fill='white')
        if time.monotonic()-began>240:raise RuntimeError('Bounded CPU matte analysis exceeded 240 seconds')
finally:
    capture.release();encoder.stdin.close();assert encoder.wait()==0
assert frames==96
board.save(out/'city-matte-review.jpg')
report=dict(sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),sourceRange=[4,8],matteFrames=frames,matteSeconds=4,matteSha256=hashlib.sha256(target.read_bytes()).hexdigest(),modelSha256=hashlib.sha256(model.read_bytes()).hexdigest(),runtime='Pinned cached RVM, CPU only, 640x360 internal, no downloads',elapsedSeconds=time.monotonic()-began,productSegmentationIntegration=False,scope='Grayscale source-bound analysis input for ordinary Studio luma track matte; no foreground RGB movie or external effects composite.',paidCalls=0)
(out/'city-matte-provenance.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
