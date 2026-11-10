"""Independent decode, declared audio sources and exact owned native receipts."""
import json,subprocess,hashlib,sys
from pathlib import Path
import numpy as np
ROOT=Path('/dev/shm/autopromote-three-films')
def run(args):return subprocess.check_output(args)
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def audio(path,voice_preparation=False):
    # FFmpeg's default stereo-to-mono matrix adds ~3dB to a duplicated mono
    # narration. Compare explicit equal-channel averages, preserving mono.
    streams=json.loads(run(['ffprobe','-v','error','-select_streams','a:0','-show_entries','stream=channels','-of','json',str(path)]))['streams']
    channels=streams[0]['channels'];assert channels in (1,2),channels
    # Canonical prepare_voiceover_samples intentionally uses FFmpeg -ac1,
    # then write_sound_mix repeats that mono bus into both output channels.
    # Model that documented preparation; use an equal-channel average for
    # the final stereo mix and music. Do not raise the gain/error thresholds.
    filters=['-af','pan=mono|c0=0.5*c0+0.5*c1'] if channels==2 and not voice_preparation else []
    return np.frombuffer(run(['ffmpeg','-v','error','-i',str(path),'-vn',*filters,'-ar','12000','-ac','1','-f','f32le','-']),dtype='<f4').astype(np.float64)
def main(identity):
    folder=ROOT/identity/'episode';plan=json.loads((folder/'lesson-plan.json').read_text());movie=folder/'final/final.mp4'
    probe=json.loads(run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(movie)]));video=next(s for s in probe['streams'] if s['codec_type']=='video')
    assert (video['width'],video['height'],video['avg_frame_rate'])==(1600,1000,'24/1'),video
    assert int(video['nb_frames'])==round(plan['duration']*24)
    assert abs(float(video['duration'])-plan['duration'])<=1/24+.0001
    subprocess.run(['ffmpeg','-v','error','-i',str(movie),'-f','null','-'],check=True)
    voice,score,decoded=audio(folder/'narration.mp3',voice_preparation=True),audio(folder/'original-score.mp3'),audio(movie)
    n=min(len(voice),len(score),len(decoded));stems=np.column_stack([voice[:n],score[:n]])
    gains=np.linalg.lstsq(stems,decoded[:n],rcond=None)[0];expected=stems@gains
    residual=float(np.sqrt(np.mean((decoded[:n]-expected)**2)));voice_rms=float(np.sqrt(np.mean((voice[:n]*gains[0])**2)))
    correlation=float(np.corrcoef(expected,decoded[:n])[0,1])
    assert correlation>.98,(correlation,gains,residual)
    assert .65<gains[0]<1.35,gains
    assert residual/max(voice_rms,1e-9)<.2,(residual,voice_rms)
    measure=subprocess.run(['ffmpeg','-hide_banner','-i',str(movie),'-af','loudnorm=I=-17:TP=-2:LRA=7:print_format=json','-f','null','-'],capture_output=True,text=True,check=True).stderr
    loudness=json.loads(measure[measure.rfind('{'):measure.rfind('}')+1]);assert -23<=float(loudness['input_i'])<=-12;assert float(loudness['input_tp'])<=0
    receipt=json.loads((folder/'final/render-receipt.json').read_text());assert sha(movie)==receipt['outputSha256']==receipt['serverOutputSha256']
    thumbnail=folder/'thumbnail.png';subprocess.run(['ffmpeg','-v','error','-y','-ss','4.4','-i',str(movie),'-frames:v','1',str(thumbnail)],check=True)
    images=[]
    for row in plan['rows']:
        target=folder/'final'/('review-'+row['id']+'.png');at=row['start']+min(3,row['duration']/2)
        subprocess.run(['ffmpeg','-v','error','-y','-ss',str(at),'-i',str(movie),'-frames:v','1',str(target)],check=True)
        images.append({'chapter':row['id'],'time':at,'file':target.name})
    subprocess.run(['ffmpeg','-v','error','-y','-i',str(movie),'-vf',f'fps=12/{plan["duration"]},scale=400:250,tile=4x3','-frames:v','1',str(folder/'final/contact-sheet.png')],check=True)
    report=dict(identity=identity,durationSeconds=plan['duration'],frames=int(video['nb_frames']),dimensions=[1600,1000],fps=24,sha256=sha(movie),nativeProjectHash=receipt['projectHash'],nativeOutputMatchesOwnedReceipt=True,fullDecode=True,
                sound=dict(voiceGain=float(gains[0]),scoreGain=float(gains[1]),voiceReference='Canonical prepare_voiceover_samples FFmpeg stereo-to-mono matrix, then repeated mono output; gain is relative to that actual prepared bus, not the raw stereo source.',declaredStemCorrelation=correlation,residualRelativeToVoice=residual/max(voice_rms,1e-9),loudness=loudness,syntheticPresetNarration=True,originalSynthesizedScore=True,humanListeningApproval=False),
                thumbnail=dict(actualNativeMovieTime=4.4,sha256=sha(thumbnail)),reviewFrames=images,sourceScreenCropping=False,ownerApproved=False,scheduled=False,productionReadinessPromoted=False)
    (folder/'final/independent-validation.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:report[k] for k in ['identity','durationSeconds','frames','dimensions','sha256']}),flush=True)
if __name__=='__main__':main(sys.argv[1])
