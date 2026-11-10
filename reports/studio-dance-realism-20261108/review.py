from pathlib import Path
import json,subprocess,hashlib,sys,io
import numpy as np
from scipy.signal import correlate,correlation_lags
from PIL import Image,ImageDraw
r=Path(__file__).resolve().parent;word=sys.argv[1];p=r/'private'/word;film=p/'native-motion-flow/final.mp4';prep=json.loads((r/(word+'-preparation.json')).read_text());source=Path('/home/tibule12/Videos')/prep['sourceName'];working=r/'prepared'/prep['sourceName'];start=prep['sourceStart'];duration=prep['seconds'];frame_count=round(duration*24)
def run(args):return subprocess.check_output(['ffmpeg','-v','error','-threads','2',*map(str,args)])
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-show_streams','-show_format','-of','json',str(film)]));v=next(s for s in probe['streams']if s['codec_type']=='video');a=next(s for s in probe['streams']if s['codec_type']=='audio');assert(v['width'],v['height'],int(v['nb_read_frames']),v['r_frame_rate'])==(576,1024,frame_count,'24/1');assert v['codec_name']=='h264' and a['codec_name']=='aac';assert abs(float(v['duration'])-duration)<.001
subprocess.run(['ffmpeg','-v','error','-threads','2','-i',str(film),'-f','null','-'],check=True)
# Decode the exact chosen interval from the full original and stream-copy input.
def raw(f):return run(['-ss',start,'-i',f,'-t',duration,'-vf','fps=30,scale=144:256','-an','-pix_fmt','rgb24','-f','rawvideo','-'])
original_frames=raw(source);working_frames=raw(working);assert original_frames==working_frames,'Working stream-copy source changed decoded selected frames'
# Compare the original musical waveform to the final re-encoded source music.
def audio(f,t=0):return np.frombuffer(run(['-ss',t,'-i',f,'-t',duration,'-vn','-ac','1','-ar','16000','-f','f32le','-']),dtype='<f4').astype(np.float64)
x=audio(source,start);y=audio(film);corr=correlate(y,x,mode='full',method='fft');lags=correlation_lags(len(y),len(x),mode='full');allowed=np.abs(lags)<=800;lag=int(lags[allowed][np.argmax(corr[allowed])]);
if lag>=0:xx=x[:min(len(x),len(y)-lag)];yy=y[lag:lag+len(xx)]
else:yy=y[:min(len(y),len(x)+lag)];xx=x[-lag:-lag+len(yy)]
pearson=float(np.corrcoef(xx,yy)[0,1]);gain=float(xx.dot(yy)/xx.dot(xx));assert pearson>.97,('Original soundtrack correlation',pearson,lag)
def frame(t):return Image.open(io.BytesIO(run(['-ss',t,'-i',film,'-frames:v',1,'-f','image2pipe','-vcodec','png','-']))).convert('RGB')
times=[0,.5,1.5,3,4.5,duration-.5,duration-.125,(frame_count-1)/24];pairs=[];thumbs=[]
for t in times:
 im=frame(t);out=p/('export-'+format(t,'.3f')+'.png');im.save(out);small=im.resize((216,384));tile=Image.new('RGB',(216,408),(15,15,20));tile.paste(small,(0,24));ImageDraw.Draw(tile).text((6,5),f'{word} / {t:.3f}s',fill='white');thumbs.append(tile)
 live=p/('live-'+format(t,'.3f')+'.png')
 if live.exists():
  original=Image.open(live).convert('RGB');resized=im.resize(original.size,Image.Resampling.LANCZOS);mse=float(np.mean((np.asarray(original,dtype=float)-np.asarray(resized,dtype=float))**2));psnr=float(10*np.log10(255**2/max(1e-10,mse)));pairs.append({'time':t,'diagnosticPsnrDb':psnr,'liveSize':list(original.size),'exportSize':[576,1024]})
contact=Image.new('RGB',(4*216,2*408),(15,15,20))
for i,tile in enumerate(thumbs):contact.paste(tile,((i%4)*216,(i//4)*408))
contact.save(p/'Film contact.jpg',quality=92)
# Diagnostic comparison is packaging only; both panels use already verified bytes.
comparison=Image.new('RGB',(3*432,432),(15,15,20))
for i,t in enumerate([1.5,3,min(6,duration-.125)]):
 live=Image.open(p/('live-'+format(t,'.3f')+'.png')).convert('RGB').resize((216,384));exp=frame(t).resize((216,384));comparison.paste(live,(i*432,40));comparison.paste(exp,(i*432+216,40));d=ImageDraw.Draw(comparison);d.text((i*432+8,8),f'{t}s / actual live',fill='white');d.text((i*432+224,8),'native export',fill='white')
comparison.save(p/'Live vs export.jpg',quality=90)
frames=np.frombuffer(run(['-i',film,'-vf','scale=36:64','-an','-pix_fmt','rgb24','-f','rawvideo','-']),dtype=np.uint8).reshape(frame_count,64,36,3);differences=np.mean(np.abs(np.diff(frames.astype(float),axis=0)),axis=(1,2,3));means=frames.mean(axis=(1,2,3))
backup=json.loads((p/'Editable Project.autopromote.json').read_text());assert not any('light arc' in o.get('name','').lower() for o in backup['snapshot']['overlays']);assert not any(k['property'].startswith('stroke') for k in backup['snapshot']['motionKeyframes'])
result={'seconds':duration,'frames':frame_count,'fps':24,'size':[576,1024],'fullDecodePassed':True,'originalSelectedRange':[start,start+duration],'originalSourceSha256':hashlib.file_digest(source.open('rb'),'sha256').hexdigest(),'workingSelectedDecodedFramesExactlyMatchOriginal':True,'audio':{'source':'original video soundtrack','durationSeconds':len(y)/16000,'bestLagSamplesAt16k':lag,'bestLagMilliseconds':lag/16,'waveformCorrelation':pearson,'fittedGain':gain,'humanListeningQualified':False,'musicReplacement':False,'speedChange':False},'pairedDiagnostics':pairs,'minimumDiagnosticPsnrDb':min(z['diagnosticPsnrDb']for z in pairs),'strictPictureAudioParityQualified':False,'minimumFrameMean':float(means.min()),'minimumConsecutiveFrameMeanDifference':float(differences.min()),'identicalConsecutiveDownscaledFrames':int(np.count_nonzero(differences==0)),'noAddedLineLayers':True,'reviewScope':'All frames decode; inspect contact, cue frames and final frame. Diagnostic resized RGB comparison does not qualify full pixel/colour/edge or realtime parity.'}
(p/'picture-and-audio-review.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'word':word,'frames':frame_count,'audioCorrelation':pearson,'audioLagMs':lag/16,'minimumDiagnosticPsnrDb':result['minimumDiagnosticPsnrDb']}))
