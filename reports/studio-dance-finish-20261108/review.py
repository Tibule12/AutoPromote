from pathlib import Path
import json,hashlib,subprocess,numpy as np
from scipy.signal import correlate,correlation_lags
from PIL import Image,ImageDraw
r=Path(__file__).resolve().parent;p=r/'private/two';movie=p/'native-motion-flow/final.mp4';old=Path('/home/tibule12/Videos/Studio - Grounded Dance Revision - 2026-11-08/Grounded doubles.mp4');original=Path('/home/tibule12/Videos/number two dance.mp4');sha=lambda f:hashlib.file_digest(f.open('rb'),'sha256').hexdigest()
def run(args):return subprocess.check_output(['ffmpeg','-v','error','-threads','2',*map(str,args)])
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-show_streams','-show_format','-of','json',str(movie)]));v=next(x for x in probe['streams']if x['codec_type']=='video');a=next(x for x in probe['streams']if x['codec_type']=='audio');assert(v['width'],v['height'],v['nb_read_frames'],v['r_frame_rate'])==(576,1024,'144','24/1');assert float(v['duration'])==6
assert sha(original)=='23c1471a631c832965411eb7564c4518633f80aef89b67481493ffa85566342d'
assert all(v.get(field)=='bt709' for field in ['color_space','color_transfer','color_primaries'])
timestamps=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','json',str(movie)]))['frames'];assert all(abs(float(frame['best_effort_timestamp_time'])-i/24)<1e-5 for i,frame in enumerate(timestamps))
subprocess.run(['ffmpeg','-v','error','-i',str(movie),'-f','null','-'],check=True)
frames=np.frombuffer(run(['-i',movie,'-an','-pix_fmt','rgb24','-f','rawvideo','-']),np.uint8).reshape(144,1024,576,3);prior=np.frombuffer(run(['-i',old,'-an','-pix_fmt','rgb24','-f','rawvideo','-']),np.uint8).reshape(144,1024,576,3)
for group,box in {'full':(0,0,576,1024),'corner':(430,740,576,910),'edges':(0,230,576,910)}.items():
    x0,y0,x1,y1=box;tw=144 if group=='full' else 216;th=round(tw*(y1-y0)/(x1-x0))
    for page in range(6):
        board=Image.new('RGB',(6*tw,4*(th+22)),'#11151c');d=ImageDraw.Draw(board)
        for j in range(24):
            i=page*24+j;x=j%6*tw;y=j//6*(th+22);im=Image.fromarray(frames[i,y0:y1,x0:x1]).resize((tw,th));board.paste(im,(x,y+22));d.text((x+3,y+3),f'{i} / {i/24:.4f}s',fill='white')
        board.save(p/f'{group}-{page+1}.jpg',quality=94)
times=[.875,1.5,3,4.5,5.75,143/24];board=Image.new('RGB',(4*216,3*408),'#11151c');d=ImageDraw.Draw(board)
for j,t in enumerate(times):
    index=round(t*24)
    for k,data in enumerate([prior,frames]):
        x=(j%2*2+k)*216;y=j//2*408;board.paste(Image.fromarray(data[index]).resize((216,384)),(x,y+24));d.text((x+4,y+4),f'{t:.3f}s / '+('prior'if k==0 else'corrected'),fill='white')
board.save(r/'Before and corrected.jpg',quality=95)
corner=Image.new('RGB',(4*292,3*382),'#11151c');d=ImageDraw.Draw(corner)
for j,t in enumerate([1.5,3,4.5,5.75,5.875,143/24]):
    index=round(t*24)
    for k,data in enumerate([prior,frames]):
        x=(j%2*2+k)*292;y=j//2*382;corner.paste(Image.fromarray(data[index,740:910,430:576]).resize((292,340)),(x,y+42));d.text((x+4,y+5),f'{t:.3f}s / '+('prior'if k==0 else'corrected'),fill='white')
corner.save(r/'Corner correction comparison.jpg',quality=95)
def pcm(f,start=0):return run(['-ss',start,'-i',f,'-t','6','-vn','-ar','48000','-ac','2','-f','f32le','-'])
sound=pcm(movie);source=pcm(original,8);assert len(sound)==len(source)==288000*2*4
audio=np.frombuffer(sound,'<f4').reshape(-1,2);source_audio=np.frombuffer(source,'<f4').reshape(-1,2);x=source_audio.mean(1).astype(float);y=audio.mean(1).astype(float);c=correlate(y,x,method='fft');lags=correlation_lags(len(y),len(x));pick=np.abs(lags)<2400;lag=int(lags[pick][np.argmax(c[pick])]);corr=float(np.corrcoef(x,y)[0,1]);gain=float(np.dot(x,y)/np.dot(x,x));assert lag==0 and corr>.97
log=subprocess.run(['ffmpeg','-hide_banner','-f','f32le','-ar','48000','-ac','2','-i','pipe:0','-af','ebur128=peak=true','-f','null','-'],input=sound,capture_output=True,check=True).stderr.decode();(r/'private/encoded-loudness.log').write_text(log)
import re
summary=log.rsplit('Summary:',1)[1];peak=float(re.search(r'Peak:\s*([\d.-]+) dBFS',summary)[1]);lufs=float(re.search(r'I:\s*([\d.-]+) LUFS',summary)[1]);assert peak<=-1.5,peak
manifest=json.loads((old.parent/'SHA256.json').read_text());assert all(sha(old.parent/name)==digest for name,digest in manifest.items())
result={'movieSha256':sha(movie),'oldMovieSha256':sha(old),'fullDecodePassed':True,'seconds':6,'frames':144,'fps':24,'size':[576,1024],'videoCodec':v['codec_name'],'pixelFormat':v['pix_fmt'],'colourMatrix':v.get('color_space'),'colourTransfer':v.get('color_transfer'),'colourPrimaries':v.get('color_primaries'),'audio':{'codec':a['codec_name'],'rate':48000,'channels':2,'seconds':6,'waveformCorrelation':corr,'bestLagSamples':lag,'originalGainDb':float(20*np.log10(gain)),'integratedLufs':lufs,'truePeakDbtp':peak,'decodedSamplesAtOrAboveFullScale':int(np.count_nonzero(np.abs(audio)>=1)),'humanListeningQualified':False,'originalSongAndSpeedRetained':True},'oldDeliveryFilesExact':len(manifest),'allFramesDecodedAndDiagnosticSheetsCreated':144,'visualQualityApprovalFromMetrics':False,'newNativeJob':json.loads((p/'native-motion-flow/render-receipt.json').read_text())['submittedJobId'],'scheduled':False,'published':False}
(r/'verification.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
