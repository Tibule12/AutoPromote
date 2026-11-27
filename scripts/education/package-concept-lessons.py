"""Narrate real control capture, preserve native concept exports byte-for-byte."""
import json,wave,hashlib,subprocess,zipfile,sys
from pathlib import Path
from piper import PiperVoice
from piper.config import SynthesisConfig
ROOT=Path(__file__).resolve().parents[2];WORK=Path('/home/tibule12/.local/share/autopromote-qa/education-20261124');ASSETS=ROOT/'frontend/public/education/it-studio-v1'
voice=PiperVoice.load('/home/tibule12/.cache/autopromote-education-20261124/voices/en_US-ljspeech-high.onnx',use_cuda=False)
def duration(p):return float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=nk=1:nw=1',str(p)]))
def stamp(t):
 ms=round(t*1000);return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02}.{ms%1000:03}'
def excerpt_wait(source,target,start):
 total=duration(source);cut=start+8;resume=total-34
 if resume<=cut+5:return source
 # Keep the real render action/early progress and complete final playback.
 # Only unattended waiting is abbreviated; originals stay intact.
 subprocess.run(['ffmpeg','-v','error','-y','-i',str(source),'-filter_complex',f'[0:v]trim=end={cut},setpts=PTS-STARTPTS[a];[0:v]trim=start={resume},setpts=PTS-STARTPTS[b];[a][b]concat=n=2:v=1:a=0[v]','-map','[v]','-c:v','libx264','-threads','3','-preset','fast','-crf','22','-pix_fmt','yuv420p','-movflags','+faststart',str(target)],check=True)
 return target
catalog=json.loads((ROOT/'frontend/src/education/lessons.json').read_text());report=[]
for lesson in catalog['lessons']:
 if lesson['number']<=5 or (len(sys.argv)>1 and lesson['id']!=sys.argv[1]):continue
 folder=WORK/lesson['id']
 if not (folder/'lesson-proof.json').exists():continue
 proof=json.loads((folder/'lesson-proof.json').read_text());script=json.loads((folder/'chapters-script.json').read_text());capture=folder/'actual-controls.mp4'
 if (folder/'render-continuation/actual-controls.mp4').exists():
  # Both captures are actual Studio footage. Preserve the failed attempt and
  # render continuation as separate originals; concat only the viewing guide.
  continuation=excerpt_wait(folder/'render-continuation/actual-controls.mp4',folder/'render-continuation/teaching-excerpt.mp4',0)
  # End the authored lesson before its retained refused render attempt. Failure
  # evidence remains private; the teaching guide proceeds to the verified take.
  authored=folder/'successful-authoring-controls.mp4';end=min(duration(capture),script[-1]['start']+20)
  subprocess.run(['ffmpeg','-v','error','-y','-i',str(capture),'-t',str(end),'-c','copy',str(authored)],check=True)
  capture=authored
  join=folder/'tutorial-captures.txt';join.write_text(f"file '{capture}'\nfile '{continuation}'\n")
  combined=folder/'combined-controls.mp4';subprocess.run(['ffmpeg','-v','error','-y','-f','concat','-safe','0','-i',str(join),'-c','copy',str(combined)],check=True)
  script.append({'start':duration(capture),'text':'Choose seven twenty p and twenty-four frames per second. Render. The wait is cut; here is the finished movie.'});capture=combined
 elif script:
  capture=excerpt_wait(capture,folder/'controls-wait-abbreviated.mp4',script[-1]['start'])
 total=duration(capture);inputs=['-i',str(capture)];filters=[];mix=[];chapters=[]
 for i,c in enumerate(script):
  wav=folder/f'concept-narration-{i:02}.wav'
  with wave.open(str(wav),'wb')as f:voice.synthesize_wav(c['text'],f,SynthesisConfig(length_scale=.97))
  with wave.open(str(wav),'rb')as f:seconds=f.getnframes()/f.getframerate()
  end=script[i+1]['start']if i+1<len(script)else total
  if c['start']+seconds>end+.2:raise ValueError(f'Narration overlaps next action: {lesson["id"]} chapter {i}, {seconds} vs {end-c["start"]}')
  chapters.append({**c,'duration':seconds,'file':str(wav)});inputs+=['-i',str(wav)];filters.append(f'[{i+1}:a]adelay={round(c["start"]*1000)}:all=1[a{i}]');mix.append(f'[a{i}]')
 filters.append(''.join(mix)+f'amix=inputs={len(mix)}:duration=longest:normalize=0,apad=whole_dur={total},alimiter=limit=0.94[audio]')
 tutorial=ASSETS/(lesson['id']+'-tutorial.mp4');subprocess.run(['ffmpeg','-v','error','-y',*inputs,'-filter_complex',';'.join(filters),'-map','0:v:0','-map','[audio]','-c:v','copy','-c:a','aac','-b:a','128k','-t',str(total),'-movflags','+faststart',str(tutorial)],check=True)
 (folder/'chapters.json').write_text(json.dumps(chapters,indent=2)+'\n')
 (folder/(lesson['id']+'-en.vtt')).write_text('WEBVTT\n\n'+''.join(f'{i+1}\n{stamp(c["start"])} --> {stamp(c["start"]+c["duration"])}\n{c["text"]}\n\n'for i,c in enumerate(chapters)))
 (ASSETS/(lesson['id']+'-transcript.txt')).write_text(lesson['title']+'\n\nOriginal narration read by a disclosed standard synthetic voice. Native result is a silent teacher-led visual. Studio controls and full matching final playback are actual recordings. Unattended render waiting is abbreviated; original complete capture and timing receipts are retained privately.\n\n'+'\n\n'.join(c['text']for c in chapters))
 poster=lesson['id']+'-poster.jpg';subprocess.run(['ffmpeg','-v','error','-y','-ss','2','-i',str(ASSETS/(lesson['id']+'-result.mp4')),'-frames:v','1',str(ASSETS/poster)],check=True)
 project=lesson['id']+'-practice.json';recipe={'format':'autopromote-education-practice','version':1,'lessonId':lesson['id'],'projectName':lesson['title'],'sourceFiles':[a['file']for a in lesson['assets']],'openInStudio':'/?tab=viral_clip_studio&educationLesson='+lesson['id'],'accountBinding':'Fresh stage upload through existing account. Import the graphics composition separately in Graphics. This recipe transfers no owner, credential, Storage path, credits or render.','startingSettings':{'aspect':'16:9','captions':False,'resolution':'720p','fps':24},'steps':lesson['steps']};(ASSETS/project).write_text(json.dumps(recipe,indent=2)+'\n')
 bundle=lesson['id']+'-practice-kit.zip'
 with zipfile.ZipFile(ASSETS/bundle,'w',zipfile.ZIP_DEFLATED)as z:
  for name in sorted({a['file']for a in lesson['assets']}|{project,'ASSET-PERMISSIONS.txt','TEACHER-BRIEF.txt','CURRICULUM-AND-ASSESSMENT.txt'}):z.write(ASSETS/name,name)
 lesson['media']={'source':'algorithm-stage.mp4','result':lesson['id']+'-result.mp4','tutorial':tutorial.name,'transcript':lesson['id']+'-transcript.txt','screenshot':lesson['id']+'-studio.jpg','poster':poster,'project':project,'bundle':bundle}
 lesson['evidence'].update(nativeControls=True,nativeMotionScene=True,realMovingPreview=True,canonicalExport=True,reference='reports/education-phase1-20261124/concept-verification.json')
 report.append({'lessonId':lesson['id'],'nativeResultSha256':hashlib.sha256((ASSETS/lesson['media']['result']).read_bytes()).hexdigest(),'tutorialSha256':hashlib.sha256(tutorial.read_bytes()).hexdigest(),'tutorialSeconds':total,'nativeProjectHash':proof['canonicalHash'],'resultSilentTeacherLed':True,'teacherReview':False,'releaseStatus':'review'})
(ROOT/'frontend/src/education/lessons.json').write_text(json.dumps(catalog,indent=2)+'\n');(ROOT/'reports/education-phase1-20261124/concept-media-package.json').write_text(json.dumps(report,indent=2)+'\n');print('Packaged',len(report),'real native concept lessons; public release remains blocked.')
