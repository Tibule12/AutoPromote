"""Read-only verification of the actual native movie and spoken source."""
from pathlib import Path
import json,subprocess,hashlib
import numpy as np
ROOT=Path(__file__).resolve().parent;folder=ROOT/'proof/lesson-r2';movie=folder/'final/final.mp4'
plan=json.loads((folder/'lesson-plan.json').read_text())
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(movie)]))
video=next(s for s in probe['streams'] if s['codec_type']=='video')
assert (video['width'],video['height'],video['avg_frame_rate'])==(1600,900,'24/1')
assert int(video['nb_frames'])==round(plan['duration']*24)
assert abs(float(probe['format']['duration'])-plan['duration'])<=1/24
subprocess.run(['ffmpeg','-v','error','-i',str(movie),'-f','null','-'],check=True)
def samples(file):return np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-i',str(file),'-vn','-ar','24000','-ac','1','-f','f32le','-']),dtype='<f4').astype(np.float64)
source,decoded=samples(folder/'narration.mp3'),samples(movie);n=min(len(source),len(decoded));corr=float(np.corrcoef(source[:n],decoded[:n])[0,1]);assert corr>.98,corr
gain=float(np.dot(source[:n],decoded[:n])/np.dot(source[:n],source[:n]))
result=subprocess.run(['ffmpeg','-hide_banner','-i',str(movie),'-af','loudnorm=I=-17:TP=-2:LRA=7:print_format=json','-f','null','-'],capture_output=True,text=True,check=True).stderr
loudness=json.loads(result[result.rfind('{'):result.rfind('}')+1]);assert -23<=float(loudness['input_i'])<=-14;assert float(loudness['input_tp'])<=0
frames=[]
for row in plan['rows']:
 t=row['start']+min(2,row['duration']/2);target=folder/'final'/('frame-'+row['id']+'.png')
 subprocess.run(['ffmpeg','-v','error','-y','-ss',str(t),'-i',str(movie),'-frames:v','1','-update','1',str(target)],check=True);frames.append(dict(id=row['id'],time=t,file=target.name))
thumbnail=folder/'thumbnail.png';subprocess.run(['ffmpeg','-v','error','-y','-ss','2.5','-i',str(movie),'-frames:v','1','-update','1',str(thumbnail)],check=True)
subprocess.run(['ffmpeg','-v','error','-y','-i',str(movie),'-vf',f'fps=1/{plan["duration"]/16},scale=400:225,tile=4x4','-frames:v','1','-update','1',str(folder/'final/contact-sheet.png')],check=True)
receipt=json.loads((folder/'final/render-receipt.json').read_text());sha=hashlib.sha256(movie.read_bytes()).hexdigest();assert sha==receipt['outputSha256']
report=dict(durationSeconds=plan['duration'],frames=int(video['nb_frames']),dimensions=[1600,900],fps=24,nativeMovieSha256=sha,canonicalHash=receipt['projectHash'],fullDecode=True,zeroOffsetSpeechCorrelation=corr,observedSpeechGain=gain,loudness=loudness,wholeWorkspaceChapters=11,renderedResultShots=5,sourceScreenCropping=False,musicBed=False,syntheticPresetNarration=True,thumbnail=dict(file='thumbnail.png',actualNativeFrameTime=2.5,sha256=hashlib.sha256(thumbnail.read_bytes()).hexdigest()),framesInspected=frames,physicalIPhoneVerified=False,ownerApproved=False,scheduled=False,limits='Complete native export and decoded speech do not establish human listening acceptance, external-platform crop qualification or whole predictive preview/render parity.')
(folder/'final/independent-validation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:report[k] for k in ['durationSeconds','frames','dimensions','zeroOffsetSpeechCorrelation','observedSpeechGain','loudness','nativeMovieSha256']}))
