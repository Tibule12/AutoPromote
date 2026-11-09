"""Verify native output and package an explicitly labelled raw/edit comparison."""
import hashlib,json,subprocess,sys
from pathlib import Path
import numpy as np
from scipy import signal
from PIL import Image,ImageDraw
proof=Path(sys.argv[1]);source=Path('/dev/shm/autopromote-premium-edit/presenter-source-proxy.mp4');final=proof/'final.mp4'
def run(args):return subprocess.check_output(args)
def h(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def probe(p):return json.loads(run(['ffprobe','-v','error','-count_frames','-show_streams','-show_format','-of','json',str(p)]))
info=probe(final);v=next(s for s in info['streams']if s['codec_type']=='video')
assert v['r_frame_rate']=='24/1' and int(v['nb_read_frames'])==384
assert abs(float(v['duration'])-16)<1e-5
subprocess.run(['ffmpeg','-v','error','-xerror','-i',str(final),'-f','null','-'],check=True)
raw=run(['ffmpeg','-v','error','-i',str(final),'-an','-vf','scale=160:90','-pix_fmt','rgb24','-f','rawvideo','-'])
frames=np.frombuffer(raw,dtype=np.uint8).reshape(-1,90,160,3)
assert len(frames)==384
changes=np.abs(frames[1:].astype(float)-frames[:-1].astype(float)).mean(axis=(1,2,3))
def pcm(p):return np.frombuffer(run(['ffmpeg','-v','error','-i',str(p),'-vn','-ar','48000','-ac','1','-f','f32le','-']),np.float32)
a,b=pcm(source),pcm(final);count=min(len(a),len(b));a=a[:count];b=b[:count]
corr=float(np.corrcoef(a,b)[0,1]);gain=float(np.dot(a,b)/np.dot(a,a))
correlation=signal.correlate(b,a,mode='full',method='fft');lags=signal.correlation_lags(len(b),len(a),mode='full');window=np.abs(lags)<=4800
lag=int(lags[window][np.argmax(correlation[window])])
if lag>=0:aligned_a,aligned_b=a[:len(a)-lag or None],b[lag:]
else:aligned_a,aligned_b=a[-lag:],b[:len(b)+lag]
aligned_corr=float(np.corrcoef(aligned_a,aligned_b)[0,1]);aligned_gain=float(np.dot(aligned_a,aligned_b)/np.dot(aligned_a,aligned_a))
assert abs(lag)/48000<1/24 and aligned_corr>.98, 'Audio differs or shifts by at least one output frame.'
stills=proof/'export-stills';stills.mkdir(exist_ok=True)
times=[0,1.3,3.6,5.4,6.4,7.8,9.3,11.4,13.8,15.6];sheet=Image.new('RGB',(1280,5*390),(12,14,18));draw=ImageDraw.Draw(sheet);pairs=[]
for i,t in enumerate(times):
 n=round(t*24);p=stills/f'{n:04}.png'
 subprocess.run(['ffmpeg','-v','error','-n','-i',str(final),'-vf',f'select=eq(n\\,{n})','-frames:v','1',str(p)],check=True)
 shot=Image.open(p).convert('RGB');sheet.paste(shot.resize((640,360)),((i%2)*640,(i//2)*390+30));draw.text(((i%2)*640+12,(i//2)*390+8),f'{n/24:.3f}s',fill='#f1ede4')
 live=proof/f'live-{t:g}.png'
 if live.exists():
  before=Image.open(live).convert('RGB');pair=Image.new('RGB',(1280,390),(12,14,18));pd=ImageDraw.Draw(pair)
  pair.paste(before.resize((640,360)),(0,30));pair.paste(shot.resize((640,360)),(640,30));pd.text((12,8),f'STUDIO / requested {t:g}s',fill='white');pd.text((652,8),f'NATIVE EXPORT / {n/24:.3f}s',fill='white');pair.save(stills/f'pair-{t:g}.png');pairs.append({'requestedStudioTime':t,'outputFrame':n,'outputTime':n/24})
sheet.save(proof/'Frames.png')
comparison=proof/'raw-vs-native.mp4'
subprocess.run(['ffmpeg','-v','error','-n','-i',str(source),'-i',str(final),'-filter_complex',"[0:v]scale=640:360,drawtext=text='RAW':fontcolor=white:fontsize=18:x=16:y=16[a];[1:v]scale=640:360,drawtext=text='NATIVE EDIT':fontcolor=white:fontsize=18:x=16:y=16[b];[a][b]hstack=inputs=2[v]",'-map','[v]','-map','1:a','-t','16','-r','24','-c:v','libx264','-preset','fast','-crf','20','-c:a','copy','-movflags','+faststart',str(comparison)],check=True)
record={'nativeOutputSha256':h(final),'nativeOutputBytes':final.stat().st_size,'video':{'codec':v['codec_name'],'width':v['width'],'height':v['height'],'fps':24,'frames':384,'seconds':16},'fullDecodePassed':True,'identicalAdjacentDownsampledFrames':int(np.sum(changes==0)),'maximumDownsampledFrameDifference':float(max(changes)),'sourceAudioZeroOffsetCorrelation':corr,'zeroOffsetAudioTestPassed':False,'measuredAudioLagSeconds':lag/48000,'sourceAudioAlignedCorrelation':aligned_corr,'sourceAudioAlignedGain':aligned_gain,'audioSampleAlignmentWithinOneOutputFrame':abs(lag)/48000<1/24,'audioCorrelationIsNotPerceptualLipSyncApproval':True,'pairedPausedTimes':pairs,'wholePictureParityQualified':False,'comparisonPackaging':'Utility hstack of raw source and already-native-rendered movie; no evaluated effects originate in this packaging.','newGenerationRequests':0,'creativeApproval':False}
(proof/'verification.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record,indent=2))
