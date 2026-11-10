"""Package already-native effects, source evidence and comparison-only assemblies."""
from pathlib import Path
import subprocess,json,shutil,hashlib
root=Path(__file__).resolve().parents[2];p=root/'reports/studio-whatsapp-director-20261103/revision-2';parent=Path('/home/tibule12/Videos/WhatsApp Director - 2026-11-03');out=parent/'Revision 2 - Cut through';out.mkdir(exist_ok=True)
movie=p/'native-motion-flow/final.mp4';assert movie.exists();receipt=json.loads((p/'native-motion-flow/render-receipt.json').read_text());sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest();assert sha(movie)==receipt['outputSha256'];run=lambda a:subprocess.run(a,check=True,capture_output=True)
for old,label,name in [(parent/'OFF SCRIPT - Director.mp4','VERSION 1','Version 1 vs Revision 2.mp4'),(parent/'Raw source cuts.mp4','RAW','Raw vs Revision 2.mp4')]:
 run(['ffmpeg','-v','error','-threads','2','-i',str(old),'-i',str(movie),'-filter_complex_threads','2','-filter_complex',f'[0:v]scale=640:360,pad=640:390:0:30,drawtext=text={label}:fontcolor=white:fontsize=18:x=16:y=7[a];[1:v]scale=640:360,pad=640:390:0:30,drawtext=text=REVISION 2:fontcolor=white:fontsize=18:x=16:y=7[b];[a][b]hstack[v]','-map','[v]','-map','1:a','-frames:v','576','-t','24','-c:v','libx264','-threads','2','-preset','fast','-crf','21','-c:a','copy','-pix_fmt','yuv420p','-movflags','+faststart','-y',str(out/name)])
files={movie:'OFF SCRIPT - Cut through.mp4',p/'Editable Project.autopromote.json':'Editable Project.autopromote.json',p/'live-playback/editing-in-studio.mp4':'Live Studio playback.mp4',p/'finished-playback/editing-in-studio.mp4':'Finished video in Studio.mp4',p/'native-authoring/editing-in-studio.mp4':'Native Studio authoring.mp4',p/'Polished preview contact.jpg':'Creative preview.jpg',p/'Live vs export.jpg':'Live vs export.jpg'}
for f,name in files.items():assert f.exists(),f;shutil.copy2(f,out/name)
for f in p.glob('Export contact *.jpg'):shutil.copy2(f,out/f.name)
technical=out/'Technical';technical.mkdir(exist_ok=True)
for name in ['preflight.json','authoring.json','native-validation.json','paired-observations.json','reopen-controls.json','live-playback.json','finished-playback.json','finished-file-identity.json','exact-native-binding.json','input-matte-provenance.json','native-asset-upload-storage.json','upload-repair-build.json','native-worker-resource.json','upload-tests.log','kernel-check.log','final-runtime.json']:
 f=p/name
 if f.exists():shutil.copy2(f,technical/name)
shutil.copy2(p/'native-motion-flow/render-receipt.json',technical/'render-receipt.json')
inputs=out/'Source masks';inputs.mkdir(exist_ok=True)
for f in p.glob('* mask.mp4'):shutil.copy2(f,inputs/f.name)
sound=out/'Original sound';sound.mkdir(exist_ok=True);shutil.copy2(root/'reports/studio-make-your-move-20261102/Make your move - original score.wav',sound/'Score source.wav')
print(out)
