from pathlib import Path
import json,subprocess,hashlib,time
import numpy as np,cv2,onnxruntime as ort
from PIL import Image,ImageDraw
r=Path(__file__).resolve().parent;out=r/'prepared';out.mkdir(exist_ok=True)
model=Path.home()/'.cache/autopromote-model-runtime/rvm-private-cpu-evaluation-v1/rvm_mobilenetv3_fp32.onnx'
assert hashlib.sha256(model.read_bytes()).hexdigest()=='88d4531297118f595bf2fd60f6f566aec2e559393802d1f436c380f0cbbd2828'
o=ort.SessionOptions();o.intra_op_num_threads=2;o.inter_op_num_threads=1
session=ort.InferenceSession(str(model),sess_options=o,providers=['CPUExecutionProvider'])
plans=[('one',6)]
for word,start in plans:
 src=Path('/home/tibule12/Videos')/f'number {word} dance.mp4';working=out/src.name
 if not working.exists():subprocess.run(['ffmpeg','-v','error','-threads','2','-i',str(src),'-t','24','-c','copy','-movflags','+faststart',str(working)],check=True)
 wav=subprocess.check_output(['ffmpeg','-v','error','-ss',str(start),'-t','8','-i',str(src),'-vn','-ac','1','-ar','16000','-f','f32le','-'])
 sound=np.frombuffer(wav,dtype='<f4');hop=160;win=512;frames=np.array([sound[i:i+win] for i in range(0,len(sound)-win,hop)]);spec=np.abs(np.fft.rfft(frames*np.hanning(win),axis=1));flux=np.maximum(0,np.diff(np.log1p(spec*10),axis=0)).sum(axis=1);energy=np.sqrt((frames**2).mean(axis=1));nov=flux/np.maximum(.001,np.percentile(flux,90));peaks=[]
 for i in np.argsort(nov)[::-1]:
  t=(i+1)*.01
  if .18<t<7.75 and all(abs(t-a)>.28 for a in peaks):peaks.append(round(t*30)/30)
  if len(peaks)>=12:break
 beats=sorted(peaks)
 matte=out/f'number {word} - subject matte.mp4';begin=time.monotonic();state=[np.zeros((1,1,1,1),np.float32)for _ in range(4)]
 decode=subprocess.Popen(['ffmpeg','-v','error','-threads','2','-ss',str(start),'-i',str(src),'-t','8','-vf','fps=30,scale=288:512','-f','rawvideo','-pix_fmt','rgb24','-'],stdout=subprocess.PIPE)
 enc=subprocess.Popen(['ffmpeg','-v','error','-f','rawvideo','-pix_fmt','gray','-s','288x512','-r','30','-i','pipe:0','-an','-threads','2','-c:v','libx264','-preset','fast','-crf','10','-pix_fmt','yuv420p','-movflags','+faststart',str(matte)],stdin=subprocess.PIPE)
 board=Image.new('RGB',(864,1056),'#11121b');draw=ImageDraw.Draw(board);tracks=[]
 try:
  for i in range(240):
   data=decode.stdout.read(288*512*3);assert len(data)==288*512*3,(word,i)
   rgb=np.frombuffer(data,dtype=np.uint8).reshape(512,288,3);tensor=np.transpose(rgb.astype(np.float32)/255,(2,0,1))[None]
   _,alpha,*state=session.run(None,dict(src=tensor,**{f'r{j+1}i':v for j,v in enumerate(state)},downsample_ratio=np.array([.5],np.float32)))
   a=alpha[0,0];a=np.clip((a-.04)/.94,0,1)
   # Keep the predicted people, excluding isolated tiny matte noise and embedded
   # watermarks; this is source preparation, never a finished effect movie.
   support=(a>.25).astype('uint8');n,labels,stats,_=cv2.connectedComponentsWithStats(support)
   keep=np.zeros_like(support)
   for label in range(1,n):
    x,y,w,h,area=stats[label]
    if area>260 and h>55:keep[labels==label]=1
   keep=cv2.dilate(keep,np.ones((5,5),np.uint8));a*=keep
   enc.stdin.write((a*255).astype('uint8').tobytes())
   ys,xs=np.where(a>.5)
   if len(xs):
    foot=ys>np.quantile(ys,.94);tracks.append({'frame':i,'t':i/30,'centre':[float(xs.mean()/288*100),float(ys.mean()/512*100)],'foot':[float(np.median(xs[foot])/288*100),float(np.quantile(ys,.98)/512*100)],'coverage':float(a.mean())})
   if i in [0,45,90,135,180,225]:
    slot=[0,45,90,135,180,225].index(i);preview=(rgb*a[:,:,None]+np.array([15,17,24])*(1-a[:,:,None])).astype('uint8');board.paste(Image.fromarray(preview),(slot%3*288,slot//3*528+16));draw.text((slot%3*288+5,slot//3*528),f'{word} {start+i/30:.2f}s',fill='white')
   if i%60==0:print(word,'matte frame',i,'wall',round(time.monotonic()-begin),flush=True)
   if time.monotonic()-begin>300:raise RuntimeError('Per-source 300-second CPU preparation bound')
 finally:
  decode.stdout.close();decode.wait();enc.stdin.close();assert enc.wait()==0
 board.save(r/'private'/f'{word}-matte-review.jpg',quality=90)
 report={'word':word,'sourceName':src.name,'sourceSha256':hashlib.sha256(src.read_bytes()).hexdigest(),'workingSha256':hashlib.sha256(working.read_bytes()).hexdigest(),'sourceStart':start,'seconds':8,'fps':30,'frames':240,'matteSha256':hashlib.sha256(matte.read_bytes()).hexdigest(),'matteStart':0,'modelSha256':hashlib.sha256(model.read_bytes()).hexdigest(),'cpuSecondsNotMeasured':True,'wallSeconds':time.monotonic()-begin,'automaticProductSegmentation':False,'preparedInputOnly':True,'originalMusicRetained':True,'onsets':beats,'onsetMethod':'Positive spectral flux, 10ms hop; manually selected strongest separated accents, not a verified tempo grid.','tracks':tracks}
 (r/f'{word}-preparation.json').write_text(json.dumps(report,indent=2)+'\n');print(word,'complete',report['wallSeconds'],'accents',beats,flush=True)
