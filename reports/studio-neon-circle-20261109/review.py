from pathlib import Path
import json,hashlib,subprocess,numpy as np,re
from scipy.signal import correlate,correlation_lags
from PIL import Image,ImageDraw
r=Path(__file__).resolve().parent;p=r/'private/one';movie=p/'native-motion-flow/final.mp4';original=Path('/home/tibule12/Videos/number one dance.mp4');sha=lambda path:hashlib.file_digest(path.open('rb'),'sha256').hexdigest();prep=json.loads((r/'one-preparation.json').read_text())
assert sha(original)==prep['sourceSha256']
def run(args):return subprocess.check_output(['ffmpeg','-v','error','-threads','2',*map(str,args)])
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-show_streams','-show_format','-of','json',str(movie)]));v=next(x for x in probe['streams']if x['codec_type']=='video');a=next(x for x in probe['streams']if x['codec_type']=='audio');assert(v['width'],v['height'],v['nb_read_frames'],v['r_frame_rate'])==(576,1024,'192','24/1');assert float(v['duration'])==8
subprocess.run(['ffmpeg','-v','error','-i',str(movie),'-f','null','-'],check=True)
times=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','json',str(movie)]))['frames'];assert all(abs(float(frame['best_effort_timestamp_time'])-i/24)<1e-5 for i,frame in enumerate(times))
frames=np.frombuffer(run(['-i',movie,'-an','-pix_fmt','rgb24','-f','rawvideo','-']),np.uint8).reshape(192,1024,576,3)
for group,box in {'full':(0,0,576,1024),'edges':(0,120,576,850),'corner':(430,850,576,1024)}.items():
 x0,y0,x1,y1=box;tw=144 if group=='full' else 216;th=round(tw*(y1-y0)/(x1-x0))
 for page in range(8):
  board=Image.new('RGB',(6*tw,4*(th+22)),'#10151c');d=ImageDraw.Draw(board)
  for j in range(24):
   i=page*24+j;x=j%6*tw;y=j//6*(th+22);im=Image.fromarray(frames[i,y0:y1,x0:x1]).resize((tw,th));board.paste(im,(x,y+22));d.text((x+3,y+3),f'{i} / {i/24:.4f}s',fill='white')
  board.save(p/f'{group}-{page+1}.jpg',quality=94)
board=Image.new('RGB',(4*216,2*408),'#10151c');d=ImageDraw.Draw(board)
for j,t in enumerate([0,.75,1.5,2.5,4,5.5,7,191/24]):
 x=j%4*216;y=j//4*408;board.paste(Image.fromarray(frames[round(t*24)]).resize((216,384)),(x,y+24));d.text((x+4,y+4),f'{t:.3f}s / native export',fill='white')
board.save(r/'Film contact.jpg',quality=95)
Image.fromarray(frames[60]).save(r/'Copy circle still.png')
pairs=[];comparison=Image.new('RGB',(3*432,432),'#10151c');d=ImageDraw.Draw(comparison)
for j,t in enumerate([1.5,4,7.5]):
 live=Image.open(p/f'live-{t:.3f}.png').convert('RGB');exp=Image.fromarray(frames[round(t*24)]);resized=exp.resize(live.size);mse=np.mean((np.asarray(live,dtype=float)-np.asarray(resized,dtype=float))**2);psnr=float(10*np.log10(255**2/max(mse,1e-9)));pairs.append({'time':t,'diagnosticPsnrDb':psnr,'strictParity':False});comparison.paste(live.resize((216,384)),(j*432,40));comparison.paste(exp.resize((216,384)),(j*432+216,40));d.text((j*432+5,5),f'{t}s / live',fill='white');d.text((j*432+222,5),'native export',fill='white')
comparison.save(r/'Live vs native export.jpg',quality=93)
def pcm(f,start=0):return run(['-ss',start,'-i',f,'-t','8','-vn','-ar','48000','-ac','2','-f','f32le','-'])
sound=pcm(movie);source=pcm(original,6);audio=np.frombuffer(sound,'<f4').reshape(-1,2);raw=np.frombuffer(source,'<f4').reshape(-1,2);assert len(audio)==384000
x=raw[:len(audio)].mean(1).astype(float);y=audio.mean(1).astype(float);c=correlate(y,x,method='fft');lags=correlation_lags(len(y),len(x));pick=np.abs(lags)<2400;lag=int(lags[pick][np.argmax(c[pick])]);corr=float(np.corrcoef(x,y)[0,1]);gain=float(x.dot(y)/x.dot(x));assert abs(lag)<=1 and corr>.97
log=subprocess.run(['ffmpeg','-hide_banner','-f','f32le','-ar','48000','-ac','2','-i','pipe:0','-af','ebur128=peak=true','-f','null','-'],input=sound,capture_output=True,check=True).stderr.decode();(r/'private/loudness.log').write_text(log);summary=log.rsplit('Summary:',1)[1];peak=float(re.search(r'Peak:\s*([\d.-]+) dBFS',summary)[1]);lufs=float(re.search(r'I:\s*([\d.-]+) LUFS',summary)[1]);assert peak<=-1.5
small=frames[:,::16,::16].astype(float);diff=np.abs(np.diff(small,axis=0)).mean(axis=(1,2,3));backup=json.loads((p/'Editable Project.autopromote.json').read_text());snapshot=backup['snapshot'];assert len([o for o in snapshot['overlays']if o.get('name','').startswith('Circle / vivid double')])==6
result={'movieSha256':sha(movie),'sourceSha256':sha(original),'originalSourceInterval':[6,14],'normalSpeed':True,'seconds':8,'frames':192,'fps':24,'size':[576,1024],'fullDecode':True,'allFrameTimestamps24fps':True,'identicalConsecutiveDownscaledFrames':int(np.count_nonzero(diff==0)),'videoCodec':v['codec_name'],'audioCodec':a['codec_name'],'colourMatrix':v.get('color_space'),'layers':len(snapshot['overlays']),'motionKeys':len(snapshot['motionKeyframes']),'movingColouredCopies':6,'naturalLead':1,'audio':{'sourceMusicRetained':True,'samplesPerChannel':len(audio),'waveformCorrelation':corr,'lagSamplesAt48k':lag,'gainDb':float(20*np.log10(gain)),'integratedLufs':lufs,'truePeakDbtp':peak,'decodedSamplesAtOrAboveFullScale':int(np.count_nonzero(np.abs(audio)>=1)),'humanListeningQualified':False},'liveExportDiagnosticPairs':pairs,'strictPictureAudioParity':False,'nativeJobId':json.loads((p/'native-motion-flow/render-receipt.json').read_text())['submittedJobId'],'sourcePreparedMatteNotAutomaticProductIsolation':True,'noPaidProviderGpuExecution':True,'published':False,'scheduled':False,'pictureApprovalFromNumbers':False}
(r/'verification.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
