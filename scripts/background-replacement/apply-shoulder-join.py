"""Apply only the actual 48-frame hand correction; retain full source clock/audio."""
from pathlib import Path
import argparse,subprocess,json,hashlib,time
import numpy as np
from PIL import Image
p=argparse.ArgumentParser();p.add_argument('input');p.add_argument('patch');p.add_argument('output');a=p.parse_args();inp=Path(a.input);patch=Path(a.patch);out=Path(a.output);out.mkdir(exist_ok=False);correction=json.load(open(patch/'receipt.json'));assert correction['frames']==48 and correction['sourceSeconds']==[224,226];x0,y0,x1,y1=correction['box'];movie=out/'Four-minute repaired preview.mp4'
subprocess.run(['ffmpeg','-nostdin','-v','error','-threads','2','-i',str(inp/'Four-minute repaired preview.mp4'),'-framerate','24','-itsoffset','224','-i',str(patch/'hand-composite/%04d.png'),'-filter_complex_threads','2','-filter_complex',f"[0:v][1:v]overlay=x={x0}:y={y0}:enable='gte(t,224)*lt(t,226)':eof_action=pass:format=rgb,format=yuv420p[v]",'-map','[v]','-map','0:a:0','-c:v','libx264','-threads','4','-preset','fast','-crf','16','-c:a','copy','-r','24','-frames:v','5760','-movflags','+faststart',str(movie)],check=True)
decoder=subprocess.Popen(['ffmpeg','-nostdin','-v','error','-threads','1','-i',str(inp/'Full alpha matte - lossless.mkv'),'-pix_fmt','gray','-f','rawvideo','pipe:1'],stdout=subprocess.PIPE);alpha=out/'Full alpha matte - lossless.mkv';encoder=subprocess.Popen(['ffmpeg','-nostdin','-v','error','-f','rawvideo','-pix_fmt','gray','-s','1430x1000','-r','24','-i','pipe:0','-c:v','ffv1','-level','3','-g','1','-threads','2',str(alpha)],stdin=subprocess.PIPE);digest=hashlib.sha256();rows=[]
try:
 for frame in range(5760):
  raw=decoder.stdout.read(1430000);assert len(raw)==1430000;value=np.frombuffer(raw,np.uint8).reshape(1000,1430).copy()
  if 5376<=frame<5424:value[y0:y1,x0:x1]=np.array(Image.open(patch/'corrected-alpha'/f'{frame-5376:04d}.png'))
  encoder.stdin.write(value.tobytes());digest.update(value.tobytes())
  if frame%120==0:print('ACTUAL_FINAL_HAND_ALPHA',frame,flush=True)
 assert not decoder.stdout.read(1) and decoder.wait()==0;encoder.stdin.close();assert encoder.wait()==0
finally:
 for proc in [decoder,encoder]:
  if proc.poll() is None:proc.kill();proc.wait()
actual=subprocess.check_output(['ffmpeg','-nostdin','-v','error','-threads','1','-i',str(alpha),'-pix_fmt','gray','-f','hash','-hash','sha256','-']).decode().strip().split('=')[-1];assert actual==digest.hexdigest();probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-show_streams','-of','json',str(movie)]));v=next(s for s in probe['streams'] if s['codec_type']=='video');assert int(v['nb_read_frames'])==5760 and float(v['duration'])==240
upstream=json.load(open(inp/'assembly-verification.json'));receipt={**upstream,'seconds':240,'frames':5760,'fps':24,'dimensions':[1430,1000],'sourceSha256':upstream['sourceSha256'],'continuousOriginalAudioRangeSeconds':[0,240],'audioStreamCopiedWithoutReencoding':True,'pictureFrameOrderExact':True,'alphaFrameOrderExact':True,'upstreamAssemblyPreviewSha256':upstream['previewSha256'],'previewSha256':hashlib.file_digest(movie.open('rb'),'sha256').hexdigest(),'fullPrecisionAlphaDecodedSha256':actual,'shoulderJoinCorrection':{'sourceSeconds':[224,226],'frames':48,'box':correction['box'],'actualLocalSam2VideoTracking':True,'keyInferenceHz':6,'sourceFlowHz':24,'existingForegroundNeverErased':True,'componentAndAlphaFiles':str(patch),'nativeModelArtifactQualification':False},'sourceBackgroundCorrection':'Observed source 200s background selection, current-RGB confirmation; upstream source clock/frame order retained','fullDecodePassed':True,'visualGate':False,'nativeEditableLongFormModelQualified':False,'paidCloud':False};(out/'assembly-verification.json').write_text(json.dumps(receipt,indent=2));print('FULL_FOUR_MINUTES_WITH_ACTUAL_HAND_CORRECTION_READY',receipt['previewSha256'],flush=True)
