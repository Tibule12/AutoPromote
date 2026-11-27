"""Add aligned narration to one continuous real Studio screen recording."""
import json,subprocess,shutil,hashlib
from pathlib import Path
R=Path(__file__).resolve().parents[2];W=Path('/home/tibule12/.local/share/autopromote-qa/education-20261124/steady-navigation');A=R/'frontend/public/education/it-studio-v1';V=Path('/home/tibule12/Videos/AutoPromote Education - IT Concepts - 2026-11-24')
assert (W/'proof.json').exists();raw=W/'actual-controls.mp4';chapters=json.loads((W/'chapters.json').read_text());latest={c['id']:c for c in json.loads((W/'narration.json').read_text())};
for c in chapters:c.update({k:latest[c['id']][k]for k in ['file','text','duration']})
total=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=nk=1:nw=1',str(raw)]));inputs=['-i',str(raw)];filters=[];mix=[]
for i,c in enumerate(chapters):inputs+=['-i',c['file']];filters.append(f'[{i+1}:a]adelay={round(c["start"]*1000)}:all=1[a{i}]');mix.append(f'[a{i}]')
filters.append(''.join(mix)+f'amix=inputs={len(mix)}:duration=longest:normalize=0,apad=whole_dur={total},alimiter=limit=0.94[audio]')
out=A/'first-swap-continuous-navigation.mp4';subprocess.run(['ffmpeg','-v','error','-y',*inputs,'-filter_complex',';'.join(filters),'-map','0:v:0','-map','[audio]','-c:v','copy','-c:a','aac','-b:a','128k','-t',str(total),'-movflags','+faststart',str(out)],check=True)
subprocess.run(['ffmpeg','-v','error','-i',str(out),'-f','null','-'],check=True,capture_output=True)
data=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-of','json',str(out)]));assert not any(s['codec_type']=='subtitle'for s in data['streams'])
dest=V/'01 - Small lesson - Find Graphics and set a value.mp4';shutil.copy2(out,dest)
old=V/'00 - Clear click demonstration.mp4';ret=W/'superseded-single-control.mp4'
if old.exists()and not ret.exists():shutil.copy2(old,ret)
shutil.copy2(out,old)
# The current first lesson is the small, continuously navigated take. Earlier
# jumps remain retained privately instead of being recommended to students.
folder=V/'00 - Start Here - Manual Studio Guide';archive=W/'superseded-long-guide';archive.mkdir(exist_ok=True)
for p in folder.glob('*.mp4'):
 if p.name not in ['first-swap-stage.mp4','first-swap-result.mp4']:shutil.move(p,archive/p.name)
shutil.copy2(out,folder/'02 - Create a number card.mp4')
(folder/'START-HERE.txt').write_text('CURRENT SMALL TUTORIAL\n02 - Create a number card.mp4 shows the actual workspace entry, file selection, Studio entry, left tool click, visible right-panel scrolling, Headline, Play/Pause, further scrolling, Copy edit and visible result. The voice follows the actions. No subtitles, added banner, duplicated panel, local-demo badge or render wait.\nEarlier long/jumping guides are preserved privately and are not recommended to students. The native example result and six-second practice source remain unchanged.\n')
p=R/'frontend/src/education/lessons.json';catalog=json.loads(p.read_text());lesson=next(l for l in catalog['lessons']if l['id']=='bubble-sort');lesson['media']['demonstrationSample']=out.name;controls={'workspace':'Workspace → Viral Clip Studio','upload':'Choose videos → algorithm-stage.mp4','open':'Open Creator Studio','pause':'Pause → beginning of playback bar','view':'After','graphics':'Graphics','scroll_titles':'Scroll the right-hand Graphics panel','headline':'Headline','show':'Play → Pause','scroll_copy':'Scroll the same panel to Copy','type':'Copy → select existing words → type 5','result':'Preview the changed value'};lesson['navigationSteps']=[{'id':c['id'],'control':controls[c['id']],'text':c['text']}for c in chapters];p.write_text(json.dumps(catalog,indent=2)+'\n')
proof=json.loads((W/'proof.json').read_text());proof.update(durationSeconds=total,sha256=hashlib.sha256(out.read_bytes()).hexdigest(),nativeConceptMoviesChanged=False,ownerTeachingApproval=False,teacherReview=False)
(R/'reports/education-phase1-20261124/steady-navigation.json').write_text(json.dumps(proof,indent=2)+'\n');print(str(dest));print('Seconds:',round(total,1),'visible wheel events:',proof['visibleWheelEvents'],'no captions, no badge, no hidden jumps.')
