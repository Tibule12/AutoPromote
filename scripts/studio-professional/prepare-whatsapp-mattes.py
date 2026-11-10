"""Bounded cached CPU source masks only. All RGB composition stays in native Studio."""
from pathlib import Path
import cv2,numpy as np,onnxruntime as ort,subprocess,hashlib,json,time
from PIL import Image,ImageDraw
root=Path(__file__).resolve().parents[2];out=root/'reports/studio-whatsapp-director-20261103/revision-2';out.mkdir(exist_ok=True)
model=Path.home()/'.cache/autopromote-model-runtime/rvm-private-cpu-evaluation-v1/rvm_mobilenetv3_fp32.onnx'
assert hashlib.sha256(model.read_bytes()).hexdigest()=='88d4531297118f595bf2fd60f6f566aec2e559393802d1f436c380f0cbbd2828'
opt=ort.SessionOptions();opt.intra_op_num_threads=2;opt.inter_op_num_threads=1;session=ort.InferenceSession(str(model),sess_options=opt,providers=['CPUExecutionProvider']);reports=[]
for name,file,start,seconds,size in [('Portrait mask','WhatsApp Video 2026-11-03 at 04.58.10 (1).mp4',.25,3,(360,646)),('Seated mask','WhatsApp Video 2026-11-03 at 04.58.10.mp4',7,7,(360,640))]:
 target=out/(name+'.mp4');source=Path('/home/tibule12/Videos')/file
 if target.exists():continue
 w,h=size;frames=round(seconds*24);began=time.monotonic();state=[np.zeros((1,1,1,1),np.float32) for _ in range(4)]
 decoder=subprocess.Popen(['ffmpeg','-v','error','-ss',str(start),'-i',str(source),'-t',str(seconds),'-vf',f'fps=24:round=up,scale={w}:{h}','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],stdout=subprocess.PIPE)
 encoder=subprocess.Popen(['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','gray','-s',f'{w}x{h}','-r','24','-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','10','-pix_fmt','yuv420p','-movflags','+faststart',str(target)],stdin=subprocess.PIPE)
 board=Image.new('RGB',(1280,760),'#ece8dc');draw=ImageDraw.Draw(board);samples=[0,frames//3,frames*2//3,frames-1]
 try:
  for i in range(frames):
   raw=decoder.stdout.read(w*h*3);assert len(raw)==w*h*3;rgb=np.frombuffer(raw,np.uint8).reshape(h,w,3);tensor=np.transpose(rgb.astype(np.float32)/255,(2,0,1))[None]
   _,alpha,*state=session.run(None,dict(src=tensor,**{f'r{j+1}i':v for j,v in enumerate(state)},downsample_ratio=np.array([.5 if h>400 else 1],np.float32)))
   a=alpha[0,0];binary=(a>.55).astype('uint8');n,labels,stats,cent=cv2.connectedComponentsWithStats(binary)
   if n>1:
    keep=1+np.argmax(stats[1:,cv2.CC_STAT_AREA]);support=(labels==keep).astype('uint8');support=cv2.dilate(support,np.ones((7,7),np.uint8));core=cv2.erode(support,np.ones((9,9),np.uint8));a=np.maximum(a,core)*support
   a=np.clip(a,0,1);encoder.stdin.write((a*255).astype('uint8').tobytes())
   if i in samples:
    j=samples.index(i);comp=(rgb*a[:,:,None]+np.array([236,232,220])*(1-a[:,:,None])).clip(0,255).astype('uint8');im=Image.fromarray(comp);im.thumbnail((620,340));board.paste(im,(j%2*640+(640-im.width)//2,j//2*380+25));draw.text((j%2*640+10,j//2*380+5),f'{name} source {start+i/24:.3f}s',fill='#15191a')
   if time.monotonic()-began>360:raise RuntimeError('CPU input mask budget exceeded')
 finally:
  decoder.stdout.close();encoder.stdin.close();assert decoder.wait()==0;assert encoder.wait()==0
 board.save(out/(name+' review.jpg'));report=dict(name=name,source=str(source),sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),sourceRange=[start,start+seconds],frames=frames,fps=24,size=size,matteSha256=hashlib.sha256(target.read_bytes()).hexdigest(),modelSha256=hashlib.sha256(model.read_bytes()).hexdigest(),elapsedSeconds=time.monotonic()-began,CPUOnly=True,paidCalls=0,productSegmentationIntegration=False,scope='Grayscale input alpha; no composed RGB effects movie')
 reports.append(report);print(json.dumps(report),flush=True)
previous=json.loads((out/'Rejected initial seated-mask geometry/input-matte-provenance.json').read_text()) if (out/'Rejected initial seated-mask geometry/input-matte-provenance.json').exists() else [];reports=[r for r in previous if r['name']=='Portrait mask']+reports;(out/'input-matte-provenance.json').write_text(json.dumps(reports,indent=2))
