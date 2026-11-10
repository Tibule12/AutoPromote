from pathlib import Path
import json,hashlib,subprocess,sys,re
import numpy as np
from PIL import Image,ImageDraw
from scipy.signal import correlate,correlation_lags
r=Path(__file__).resolve().parent;word=sys.argv[1];p=r/'private'/word;prep=json.loads((r/(word+'-preparation.json')).read_text());duration=prep['seconds'];count=round(duration*24);movie=p/'native-motion-flow/final.mp4';original=Path('/home/tibule12/Videos')/f'number {word} dance.mp4'
sha=lambda f:hashlib.file_digest(f.open('rb'),'sha256').hexdigest()
assert sha(original)==prep['sourceSha256']
def run(args):return subprocess.check_output(['ffmpeg','-v','error','-threads','2',*map(str,args)])
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-show_streams','-show_format','-of','json',str(movie)]));v=next(x for x in probe['streams']if x['codec_type']=='video');a=next(x for x in probe['streams']if x['codec_type']=='audio');assert(v['width'],v['height'],int(v['nb_read_frames']),v['r_frame_rate'])==(576,1024,count,'24/1');assert abs(float(v['duration'])-duration)<.001
subprocess.run(['ffmpeg','-v','error','-i',str(movie),'-f','null','-'],check=True)
timestamps=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','json',str(movie)]))['frames'];assert len(timestamps)==count;assert all(abs(float(x['best_effort_timestamp_time'])-i/24)<1e-5 for i,x in enumerate(timestamps))
frames=np.frombuffer(run(['-i',movie,'-an','-pix_fmt','rgb24','-f','rawvideo','-']),np.uint8).reshape(count,1024,576,3)
for page in range((count+23)//24):
 board=Image.new('RGB',(6*144,4*278),'#10151c');draw=ImageDraw.Draw(board)
 for j in range(24):
  i=page*24+j
  if i>=count:break
  x=j%6*144;y=j//6*278;board.paste(Image.fromarray(frames[i]).resize((144,256)),(x,y+22));draw.text((x+3,y+3),f'{i} / {i/24:.3f}',fill='white')
 board.save(p/f'all-frames-{page+1}.jpg',quality=94)
times=[0,.75,1.5,2.5,4,5.5,duration-.5,duration-1/24];board=Image.new('RGB',(4*216,2*408),'#10151c');draw=ImageDraw.Draw(board)
for j,t in enumerate(times):
 i=round(t*24);x=j%4*216;y=j//4*408;board.paste(Image.fromarray(frames[i]).resize((216,384)),(x,y+24));draw.text((x+3,y+3),f'{i} / {t:.3f}s',fill='white');Image.fromarray(frames[i]).save(p/f'export-{t:.3f}.png')
board.save(r/(word+' - film contact.jpg'),quality=95)
def pcm(f,start):return run(['-ss',start,'-i',f,'-t',duration,'-vn','-ar','48000','-ac','2','-f','f32le','-'])
sound=pcm(movie,0);source=pcm(original,prep['sourceStart']);audio=np.frombuffer(sound,'<f4').reshape(-1,2);raw=np.frombuffer(source,'<f4').reshape(-1,2);target_samples=round(duration*48000);assert abs(len(audio)-target_samples)<=1024,('Audio tail exceeds one AAC frame',len(audio),target_samples)
x=raw[:len(audio)].mean(1).astype(float);y=audio.mean(1).astype(float);c=correlate(y,x,method='fft');lags=correlation_lags(len(y),len(x));pick=np.abs(lags)<2400;lag=int(lags[pick][np.argmax(c[pick])]);corr=float(np.corrcoef(x,y)[0,1]);assert abs(lag)<=1 and corr>.97
log=subprocess.run(['ffmpeg','-hide_banner','-f','f32le','-ar','48000','-ac','2','-i','pipe:0','-af','ebur128=peak=true','-f','null','-'],input=sound,capture_output=True,check=True).stderr.decode();(p/'loudness.log').write_text(log);summary=log.rsplit('Summary:',1)[1];peak=float(re.search(r'Peak:\s*([\d.-]+) dBFS',summary)[1]);lufs=float(re.search(r'I:\s*([\d.-]+) LUFS',summary)[1]);assert peak<=-1.5;assert -24<=lufs<=-12,('Music level outside final delivery target',lufs)
pairs=[]
for t in [1.5,4,duration-.5]:
 live=Image.open(p/f'live-{t:.3f}.png').convert('RGB');export=Image.fromarray(frames[round(t*24)]).resize(live.size);mse=float(np.mean((np.asarray(live,dtype=float)-np.asarray(export,dtype=float))**2));pairs.append({'time':t,'diagnosticPsnrDb':float(10*np.log10(255**2/max(mse,1e-9))),'strictParity':False})
backup=json.loads((p/'Editable Project.autopromote.json').read_text());s=backup['snapshot'];result={'word':word,'movieSha256':sha(movie),'sourceSha256':sha(original),'sourceInterval':[prep['sourceStart'],prep['sourceStart']+duration],'seconds':duration,'frames':count,'fps':24,'size':[576,1024],'fullDecode':True,'allFrameTimestamps24fps':True,'videoCodec':v['codec_name'],'audioCodec':a['codec_name'],'colourMatrix':v.get('color_space'),'ordinaryLayers':len(s['overlays']),'motionKeys':len(s['motionKeyframes']),'audio':{'sourceMusicRetained':True,'decodedSamplesPerChannel':len(audio),'targetSamplesPerChannel':target_samples,'tailDifferenceMilliseconds':(target_samples-len(audio))/48,'aacTailBoundSamples':1024,'speedUnchanged':True,'waveformCorrelation':corr,'lagSamplesAt48k':lag,'integratedLufs':lufs,'truePeakDbtp':peak,'decodedSamplesAtOrAboveFullScale':int(np.count_nonzero(np.abs(audio)>=1)),'humanListeningQualified':False},'actualLiveExportPairs':pairs,'strictPictureAudioParity':False,'nativeJobId':json.loads((p/'native-motion-flow/render-receipt.json').read_text())['submittedJobId'],'pictureApprovalFromNumbers':False};(r/(word+'-verification.json')).write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
