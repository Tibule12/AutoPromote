"""Package actual recordings with original offline narration, transcripts and assets.
This never fabricates Studio frames or renders a creative result outside Studio.
"""
import json,subprocess,wave,hashlib,zipfile,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];WORK=Path('/home/tibule12/.local/share/autopromote-qa/education-20261124');ASSETS=ROOT/'frontend/public/education/it-studio-v1'
def duration(p):return float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=nk=1:nw=1',str(p)]))
def stamp(t):
 ms=round(t*1000);return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02}.{ms%1000:03}'
catalog=json.loads((ROOT/'frontend/src/education/lessons.json').read_text());report=[]
latest=json.loads((WORK/'narration.json').read_text())['chapters']
for lesson in catalog['lessons']:
 if lesson['number']>5:continue
 folder=WORK/lesson['id'];proof=folder/'lesson-proof.json'
 if not proof.exists():continue
 native=json.loads(proof.read_text());chapters=json.loads((folder/'chapters.json').read_text());recording=folder/'actual-controls.mp4'
 # Updated wording must match the regenerated audio; retain real capture times.
 for i,c in enumerate(chapters):
  current=next(x for x in latest if x['lessonId']==lesson['id'] and x['chapter']==i)
  c.update(text=current['text'],file=current['file'],duration=current['duration'])
  if i+1<len(chapters):assert c['start']+c['duration']<=chapters[i+1]['start']+.2,'Narration overlaps next action'
 if not recording.exists():continue
 tutorial=ASSETS/(lesson['id']+'-tutorial.mp4');inputs=['-i',str(recording)];parts=[];mix=[]
 for i,chapter in enumerate(chapters):
  inputs+=['-i',chapter['file']];label='a'+str(i);delay=round(chapter['start']*1000);parts.append(f'[{i+1}:a]adelay={delay}:all=1[{label}]');mix.append('['+label+']')
 parts.append(''.join(mix)+f'amix=inputs={len(mix)}:duration=longest:normalize=0,apad=whole_dur={duration(recording)},alimiter=limit=0.94[audio]')
 subprocess.run(['ffmpeg','-v','error','-y',*inputs,'-filter_complex',';'.join(parts),'-map','0:v:0','-map','[audio]','-c:v','copy','-c:a','aac','-b:a','128k','-t',str(duration(recording)),'-movflags','+faststart',str(tutorial)],check=True)
 vtt='WEBVTT\n\n'+''.join(f'{i+1}\n{stamp(c["start"])} --> {stamp(c["start"]+c["duration"])}\n{c["text"]}\n\n'for i,c in enumerate(chapters))
 (folder/(lesson['id']+'-en.vtt')).write_text(vtt)
 transcript=lesson['title']+'\n\nOriginal teaching script, read using disclosed standard synthetic narration.\n\n'+'\n\n'.join(c['text']for c in chapters)
 (ASSETS/(lesson['id']+'-transcript.txt')).write_text(transcript)
 recipe={'format':'autopromote-education-practice','version':1,'lessonId':lesson['id'],'projectName':f'IT practice {lesson["number"]} · Explain a byte','sourceFiles':[a['file']for a in lesson['assets']],'openInStudio':f'/?tab=viral_clip_studio&educationLesson={lesson["id"]}','accountBinding':'Upload practice media through the normal authenticated Studio entry. The starter is fresh and belongs to that account. This recipe transfers no owner, Storage path, cloud allowance or completed render.','startingSettings':{'aspect':'16:9','captions':False,'resolution':'720p','fps':24},'steps':lesson['steps']}
 project=lesson['id']+'-practice.json';(ASSETS/project).write_text(json.dumps(recipe,indent=2)+'\n')
 bundle=lesson['id']+'-practice-kit.zip'
 with zipfile.ZipFile(ASSETS/bundle,'w',zipfile.ZIP_DEFLATED)as z:
  names={a['file']for a in lesson['assets']}|{project,'byteLabAlgorithm.mjs','byte-lab.html','ASSET-PERMISSIONS.txt','TEACHER-BRIEF.txt'}
  for name in sorted(names):z.write(ASSETS/name,name)
 lesson['media']={'source':'normal-input.mp4','result':lesson['id']+'-result.mp4','tutorial':tutorial.name,'transcript':lesson['id']+'-transcript.txt','screenshot':lesson['id']+'-studio.jpg','poster':'normal-input.jpg','project':project,'bundle':bundle}
 lesson['evidence']={'nativeControls':True,'realMovingSource':True,'canonicalExport':True,'fullDurationInspected':False,'previewExportReviewed':False,'independentReproduction':False,'teacherReview':False,'reference':'reports/education-phase1-20261124/lesson-verification.json'}
 lesson['languages']['en']['status']='private-review'
 report.append({'lessonId':lesson['id'],'resultSha256':hashlib.sha256((ASSETS/lesson['media']['result']).read_bytes()).hexdigest(),'tutorialSha256':hashlib.sha256(tutorial.read_bytes()).hexdigest(),'tutorialSeconds':duration(tutorial),'resultSeconds':duration(ASSETS/lesson['media']['result']),'nativeProjectHash':native['canonicalHash'],'teacherReview':False,'releaseStatus':'review'})
(ROOT/'frontend/src/education/lessons.json').write_text(json.dumps(catalog,indent=2)+'\n');(ROOT/'reports/education-phase1-20261124/media-package.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'packaged':len(report),'released':0}))
