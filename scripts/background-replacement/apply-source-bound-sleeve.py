"""Apply reviewed additive sleeve and observed-background corrections, retaining clock/audio."""
from pathlib import Path
import argparse,json,subprocess,importlib.util,time,hashlib
import cv2,numpy as np
from PIL import Image
s=importlib.util.spec_from_file_location('holdout',Path(__file__).with_name('repair-source-bound-sleeve.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
p=argparse.ArgumentParser();p.add_argument('input');p.add_argument('output');a=p.parse_args();inp=Path(a.input);out=Path(a.output);out.mkdir(exist_ok=False);assert json.load(open(inp/'assembly-verification.json'))['frames']==5760;holdout=m.SleeveRepair();cv2.setNumThreads(1);reg=json.load(open('reports/background-replacement-20261101/private/long-podcast-r7/registration.json'))['rows'];cuts=json.load(open('reports/background-replacement-20261101/private/long-podcast-r7/frame-camera-verification.json'))['exactTransitions'];cam=np.zeros(5760,np.uint8)
for j,c in enumerate(cuts):cam[c['frame']:cuts[j+1]['frame'] if j+1<len(cuts) else 5760]=c['angle']
def decode(file,pix,source=False):
 cmd=['ffmpeg','-nostdin','-v','error','-threads','1','-i',str(file),'-t','240'];cmd+=['-vf','fps=24'] if source else [];return subprocess.Popen(cmd+['-an','-pix_fmt',pix,'-f','rawvideo','pipe:1'],stdout=subprocess.PIPE)
def encode(file,pix,codec):return subprocess.Popen(['ffmpeg','-nostdin','-v','error','-f','rawvideo','-pix_fmt',pix,'-s','1430x1000','-r','24','-i','pipe:0','-an','-c:v',codec,'-threads','2',*(['-level','3','-g','1'] if codec=='ffv1' else ['-preset','fast','-crf','16','-pix_fmt','yuv420p','-movflags','+faststart']),str(file)],stdin=subprocess.PIPE)
source=decode('/home/tibule12/Videos/cam-combiner-5050c706-a6cb-48bc-ac43-8fa54f21bc1a.mp4','rgb24',True);picture=decode(inp/'Four-minute repaired preview.mp4','rgb24');matte=decode(inp/'Full alpha matte - lossless.mkv','gray');writer=encode(out/'picture.mp4','rgb24','libx264');alpha_writer=encode(out/'Full alpha matte - lossless.mkv','gray','ffv1');rows=[];start=time.monotonic();alpha_digest=hashlib.sha256();(out/'samples').mkdir()
try:
 for i in range(5760):
  raw=source.stdout.read(6220800);base=picture.stdout.read(4290000);mat=matte.stdout.read(1430000);assert len(raw)==6220800 and len(base)==4290000 and len(mat)==1430000,('Full footage clock lost',i);frame=np.frombuffer(base,np.uint8).reshape(1000,1430,3).copy();alpha=np.frombuffer(mat,np.uint8).reshape(1000,1430).copy();changed=0
  if cam[i]==1:
   rgb=cv2.warpAffine(np.frombuffer(raw,np.uint8).reshape(1080,1920,3),np.array(reg[i//6]['matrix']),(1440,1000),flags=cv2.INTER_LANCZOS4);frame,alpha,changed=holdout.repair(rgb,frame,alpha,i,i==0 or cam[i-1]!=1)
  writer.stdin.write(frame.tobytes());alpha_writer.stdin.write(alpha.tobytes());alpha_digest.update(alpha.tobytes());rows.append({'frame':i,'angle':int(cam[i]),'sourceBoundSleeveRepair':changed})
  if i%24==0 or i==5759:
   Image.fromarray(frame).save(out/'samples'/f'after-{i:05d}.jpg',quality=96);(out/'progress.json').write_text(json.dumps({'completedFrames':i+1,'totalFrames':5760,'elapsedSeconds':time.monotonic()-start,'visualGate':False}));print('SOURCE_BOUND_SLEEVE',i+1,flush=True)
 for proc in [source,picture,matte]:assert not proc.stdout.read(1);assert proc.wait()==0
 for proc in [writer,alpha_writer]:proc.stdin.close();assert proc.wait()==0
 final=out/'Four-minute repaired preview.mp4';subprocess.run(['ffmpeg','-nostdin','-v','error','-i',str(out/'picture.mp4'),'-i',str(inp/'Four-minute repaired preview.mp4'),'-map','0:v:0','-map','1:a:0','-c','copy','-t','240','-movflags','+faststart',str(final)],check=True)
 digest=subprocess.check_output(['ffmpeg','-nostdin','-v','error','-threads','1','-i',str(out/'Full alpha matte - lossless.mkv'),'-pix_fmt','gray','-f','hash','-hash','sha256','-']).decode().strip().split('=')[-1];assert digest==alpha_digest.hexdigest(),'Lossless alpha decoded bytes differ';probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-show_streams','-of','json',str(final)]));video=next(v for v in probe['streams'] if v['codec_type']=='video');assert int(video['nb_read_frames'])==5760 and float(video['duration'])==240
 receipt={**json.load(open(inp/'assembly-verification.json')),'previewSha256':hashlib.file_digest(final.open('rb'),'sha256').hexdigest(),'fullPrecisionAlphaDecodedSha256':digest,'sourceBoundSleeveCorrection':{'foregroundReferenceSeconds':[50,89],'backgroundReferenceSeconds':214.70833333333334,'type':'Secondary SAM2 corrective foreground from 50s, current recurrent person evidence, source-colour/pose agreement, protected foreground priority and actually exposed background observations; current opaque cloth pixels only','foregroundTolerance':50,'backgroundTolerance':18,'sourceRgbAlwaysCurrent':True,'foregroundRgbFrozen':False,'privateRvmGuidanceNotProductRegistry':True,'rows':rows},'visualGate':False};(out/'assembly-verification.json').write_text(json.dumps(receipt,indent=2));(out/'picture.mp4').unlink();print('FULL_SOURCE_BOUND_SLEEVE_CORRECTION_COMPLETE',flush=True)
finally:
 for proc in [source,picture,matte,writer,alpha_writer]:
  if proc.poll() is None:proc.kill();proc.wait()
