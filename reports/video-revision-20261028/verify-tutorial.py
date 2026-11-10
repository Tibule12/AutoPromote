"""Inspect the native movie; never substitute a video or create a final edit."""
from pathlib import Path
import hashlib, json, subprocess, sys
import numpy as np

folder = Path(__file__).resolve().parent / 'proof/reading-lesson' / (sys.argv[1] if len(sys.argv) > 1 else 'corrected-tutorial')
movie = folder / 'final/final.mp4'
voice = folder.parent / 'narration-v2/narration.wav'
probe = json.loads(subprocess.check_output([
    'ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(movie)]))
video = next(s for s in probe['streams'] if s['codec_type'] == 'video')
assert (video['width'], video['height'], video['avg_frame_rate'], int(video['nb_frames'])) == (720, 1280, '24/1', 1440)
assert abs(float(probe['format']['duration']) - 60) <= 1 / 24
subprocess.run(['ffmpeg', '-v', 'error', '-i', str(movie), '-f', 'null', '-'], check=True)

def samples(source):
    return np.frombuffer(subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(source),
        '-vn', '-ar', '24000', '-ac', '1', '-f', 'f32le', '-']), dtype='<f4').astype(np.float64)

source, decoded = samples(voice), samples(movie)
n = min(len(source), len(decoded))
correlation = float(np.corrcoef(source[:n], decoded[:n])[0, 1])
assert correlation > .98, 'The export must preserve the intended zero-offset spoken track.'
gain = float(np.dot(source[:n], decoded[:n]) / np.dot(source[:n], source[:n]))
measure = subprocess.run(['ffmpeg', '-hide_banner', '-i', str(movie), '-af',
    'loudnorm=I=-17:TP=-2:LRA=7:print_format=json', '-f', 'null', '-'], capture_output=True, text=True, check=True).stderr
loudness = json.loads(measure[measure.rfind('{'):measure.rfind('}') + 1])
assert -23 <= float(loudness['input_i']) <= -14
assert float(loudness['input_tp']) <= 0

frames = []
for index, time in enumerate([0, 1, 2.5, 6, 10.4, 13, 22, 32, 39, 48, 55, 59]):
    target = folder / f'final/frame-{time}.png'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(time), '-i', str(movie),
        '-frames:v', '1', '-update', '1', str(target)], check=True)
    frames.append({'time': time, 'file': target.name})

thumbnail = folder / 'thumbnail.png'
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', '2.5', '-i', str(movie),
    '-frames:v', '1', '-update', '1', str(thumbnail)], check=True)
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(movie), '-vf',
    'fps=1/5,scale=240:-2,tile=6x2', '-frames:v', '1', '-update', '1', str(folder/'final/contact-sheet.png')], check=True)
receipt = dict(nativeMovieSha256=hashlib.sha256(movie.read_bytes()).hexdigest(),
    duration=60, dimensions=[720, 1280], fps=24, frames=1440, independentFullDecode=True,
    narrationSourceSha256=hashlib.sha256(voice.read_bytes()).hexdigest(),
    decodedAudioSamples=len(decoded), sampleRate=24000, zeroOffsetVoiceCorrelation=correlation,
    voiceGain=gain, loudness=loudness, musicBed=False,
    thumbnail=dict(file='thumbnail.png', nativeFrameTime=2.5, sha256=hashlib.sha256(thumbnail.read_bytes()).hexdigest()),
    inspectedFrameFiles=frames, physicalIPhoneExternalPlatformCheck=False,
    limits='Decoded waveform and later offline ASR checks do not establish human listening quality, platform safety certification or whole predictive preview parity.')
(folder/'final/independent-validation.json').write_text(json.dumps(receipt, indent=2)+'\n')
print(json.dumps({k: receipt[k] for k in ['duration', 'dimensions', 'zeroOffsetVoiceCorrelation', 'loudness']}))
