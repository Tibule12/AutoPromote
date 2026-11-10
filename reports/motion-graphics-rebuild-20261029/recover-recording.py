"""Recover authentic source captures from retained whole-viewport raw video.
This trims capture setup only. It cannot generate UI or compose a final lesson.
"""
from pathlib import Path
import json,subprocess,hashlib,shutil,sys
ROOT=Path(__file__).resolve().parent/'proof'
for story in sys.argv[1:] or ['logo','product','transition']:
 f=ROOT/story/'visible-controls';receipt=f/'polish-recording-recovery.json'
 if receipt.exists():continue
 sources=list((f/'raw-controls').glob('*.webm'))
 stamps=json.loads(subprocess.check_output(['node','-e','const fs=require("fs");console.log(JSON.stringify(process.argv.slice(1).map(p=>({file:p,birth:fs.statSync(p).birthtimeMs/1000}))))',*[str(p) for p in sources]],text=True))
 copied=float(subprocess.check_output(['node','-e','console.log(require("fs").statSync(process.argv[1]).birthtimeMs/1000)',str(f/'PRE-POLISH.autopromote.json')],text=True))
 captures=[int(p.name.split('-')[2].split('.')[0])/1000 for p in f.glob('editing-frames-*.private')]
 origin=min(captures,key=lambda t:abs(t-copied));assert abs(origin-copied)<2
 raw=max([r for r in stamps if r['birth']<origin],key=lambda r:r['birth'])
 offset=origin-raw['birth'];actions=json.loads((f/'polish-actions.json').read_text())['actions'];duration=actions[-1]['end']
 raw_duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',raw['file']],text=True))
 assert offset+duration<=raw_duration+.1
 movie=f/'polish-editing-in-studio.mp4';shutil.copy2(movie,f/'original-cdp-polish-capture.mp4')
 subprocess.run(['ffmpeg','-v','error','-y','-ss',str(offset),'-i',raw['file'],'-t',str(duration),'-vf','fps=24','-c:v','libx264','-preset','fast','-crf','24','-pix_fmt','yuv420p','-movflags','+faststart',str(movie)],check=True)
 receipt.write_text(json.dumps(dict(actualWholeViewportSource=True,viewport=[1600,1100],
  rawSourceFile=Path(raw['file']).name,rawSourceSha256=hashlib.sha256(Path(raw['file']).read_bytes()).hexdigest(),
  recordingStartClockSeconds=origin,setupExcludedSeconds=offset,duration=duration,
  actualNativeActions=True,graphInjection=False,sha256=hashlib.sha256(movie.read_bytes()).hexdigest(),
  limitation='Approximate file-creation and capture-start wall clocks align this source. Full raw source and native action clocks remain retained; no exact source-frame synchronization claim.'),indent=2)+'\n')
 print(story,offset,duration,flush=True)
