"""Encode only short actual-control chapters; omit unattended render waiting."""
import json,subprocess,hashlib,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];WORK=Path('/home/tibule12/.local/share/autopromote-qa/education-20261124');F=WORK/'click-by-click';A=ROOT/'frontend/public/education/it-studio-v1'
def duration(p):return float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=nk=1:nw=1',str(p)]))
def stamp(t):
 ms=round(t*1000);return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02}.{ms%1000:03}'
assert (F/'proof.json').exists(),'The complete actual manual capture must finish first.'
banner_crop=',crop=iw:ih-52:0:52'if json.loads((F/'proof.json').read_text()).get('addedTeachingBanner')else''
chapters=json.loads((F/'chapters.json').read_text());latest={c['id']:c for c in json.loads((F/'narration.json').read_text())}
for c in chapters:c.update({k:latest[c['id']][k]for k in ['text','file','duration']})
steps=json.loads((F/'steps.json').read_text())
for s in steps:s['instruction']=latest[s['id']]['text']
raw=F/'actual-controls.mp4';original_total=duration(raw);export=next(s for s in steps if s['id']=='export');cut=export['actionAt']+6;resume=export['end']-3;removed=max(0,resume-cut)if resume>cut+2 else 0
if removed:
 for c in chapters:
  if c['start']>=resume:c['start']-=removed
 for s in steps:
  for key in ['start','actionAt','end']:
   if s[key]>=resume:s[key]-=removed
edited_total=original_total-removed
parts=[('setup','Upload and set up the canvas','source','graphics'),('create-card','Create a number card','graphics','motion5'),('animate-five','Animate the first value','motion5','graphics1'),('create-one','Create the second card','graphics1','motion1'),('animate-one','Animate the second value','motion1','play'),('review-export','Explain, save and export','play',None)]
outputs=[]
for name,title,startid,endid in parts:
 start=next(s['start']for s in steps if s['id']==startid);end=next(s['start']for s in steps if s['id']==endid)if endid else edited_total
 cuts=[start]
 while end-cuts[-1]>120:
  boundaries=[s['start']for s in steps if cuts[-1]+1<s['start']<=cuts[-1]+110 and s['start']<end];assert boundaries;cuts.append(max(boundaries))
 cuts.append(end)
 for index,(begin,finish)in enumerate(zip(cuts,cuts[1:])):
  suffix=('-'+str(index+1))if len(cuts)>2 else '';target=A/('first-swap-'+name+suffix+'.mp4');selected=[c for c in chapters if c['start']<finish and c['start']+c['duration']>begin]
  inputs=['-ss',str(begin if begin<cut or not removed else begin+removed),'-i',str(raw)];filters=[];mix=[]
  if removed and begin<cut<finish:
   filters.append(f'[0:v]split[pre][post];[pre]trim=end={cut-begin},setpts=PTS-STARTPTS[a];[post]trim=start={resume-begin}:end={finish+removed-begin},setpts=PTS-STARTPTS[b];[a][b]concat=n=2:v=1:a=0{banner_crop}[v]')
  else:filters.append(f'[0:v]trim=duration={finish-begin},setpts=PTS-STARTPTS{banner_crop}[v]')
  for i,c in enumerate(selected):inputs+=['-i',c['file']];delay=max(0,round((c['start']-begin)*1000));filters.append(f'[{i+1}:a]adelay={delay}:all=1[a{i}]');mix.append(f'[a{i}]')
  filters.append(''.join(mix)+f'amix=inputs={len(mix)}:duration=longest:normalize=0,apad=whole_dur={finish-begin},alimiter=limit=0.94[audio]')
  subprocess.run(['ffmpeg','-v','error','-y',*inputs,'-filter_complex',';'.join(filters),'-map','[v]','-map','[audio]','-t',str(finish-begin),'-c:v','libx264','-threads','3','-preset','veryfast','-crf','22','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-movflags','+faststart',str(target)],check=True)
  captions=target.stem+'-en.vtt';(F/captions).write_text('WEBVTT\n\n'+''.join(f'{j+1}\n{stamp(max(0,c["start"]-begin))} --> {stamp(min(finish-begin,c["start"]+c["duration"]-begin))}\n{c["text"]}\n\n'for j,c in enumerate(selected)))
  outputs.append({'title':title+(f' · {index+1}'if len(cuts)>2 else ''),'file':target.name,'seconds':duration(target),'start':begin,'end':finish});print('Packaged short chapter:',target.name,round(finish-begin,1),'seconds',flush=True)
transcript='MANUAL FIRST SWAP — ACTUAL STUDIO CONTROLS\nOriginal script, standard synthetic narration. Pointer, mint outlines and WALKTHROUGH GUIDE labels are tutorial annotations. No composition was imported. Unattended render waiting is removed. Select a short chapter; no compulsory long movie is delivered.\n\n'+'\n\n'.join(c['title']+'\n'+c['text']for c in chapters)
(A/'first-swap-click-by-click-transcript.txt').write_text(transcript)
catalog=json.loads((ROOT/'frontend/src/education/lessons.json').read_text());lesson=next(l for l in catalog['lessons']if l['id']=='bubble-sort');lesson['visualSteps']=steps;lesson['manualChapters']=outputs
lesson['media'].update(manualSource='first-swap-stage.mp4',manualResult='first-swap-result.mp4',manualTutorial=outputs[0]['file'],manualTranscript='first-swap-click-by-click-transcript.txt')
if not any(a['file']=='first-swap-stage.mp4'for a in lesson['assets']):lesson['assets'].append({'file':'first-swap-stage.mp4','label':'Manual first-swap stage · six seconds','description':'Use for the short control-by-control exercise; the complete four-value composition uses the separate 28-second stage.'})
if not any('1 and 5' in q['question']for q in lesson['knowledgeChecks']):lesson['knowledgeChecks'].append({'question':'If the left and right values become 1 and 5, should you keep the same swap animation?','expectedAnswer':'No. The left value is already smaller. Ascending bubble sort holds this pair. Changing labels without changing the animation would teach the wrong algorithm.','marks':3})
for p in outputs:lesson['media']['manualChapter'+p['file'].removeprefix('first-swap-').removesuffix('.mp4').replace('-','')]=p['file']
lesson['evidence']['teachingClarityReviewed']=False
manual='MANUAL FIRST SWAP — FOLLOW ONE ACTION AT A TIME\nUse first-swap-stage.mp4 (6 seconds), not algorithm-stage.mp4 (28 seconds).\nOpen /?tab=viral_clip_studio&educationLesson=bubble-sort&educationExercise=first-swap through an existing authorised account. Opening the lesson starts no render.\n\n'+'\n\n'.join(f'{i+1}. {s["title"]}\n{s["instruction"]}'for i,s in enumerate(steps))+'\n\nPosition keys (seconds, X%, Y%), Ease In Out into the arriving key:\n5: (0,30,50); (1,30,50); (1.75,50,35); (2.5,70,50).\n1: (0,70,50); (1,70,50); (1.75,50,65); (2.5,30,50).\nResult: [1,5]. If [1,5] is the INPUT, do not swap. Explain the condition before changing any animation.\n'
(A/'MANUAL-FIRST-SWAP.txt').write_text(manual)
with zipfile.ZipFile(A/'bubble-sort-practice-kit.zip','a',zipfile.ZIP_DEFLATED)as kit:
 for name in ['first-swap-stage.mp4','MANUAL-FIRST-SWAP.txt']:
  if name not in kit.namelist():kit.write(A/name,name)
(ROOT/'frontend/src/education/lessons.json').write_text(json.dumps(catalog,indent=2)+'\n')
(ROOT/'reports/education-phase1-20261124/manual-click-proof.json').write_text(json.dumps({'actualStudioControls':True,'manuallyCreated':True,'compositionImported':False,'nativeResultSha256':hashlib.sha256((A/'first-swap-result.mp4').read_bytes()).hexdigest(),'renderWaitingRemovedSeconds':removed,'visibleSteps':len(steps),'separateShortChapters':outputs,'teacherReview':False,'independentReproduction':False},indent=2)+'\n')
print('Packaged short actual-control chapters; each is at most two minutes. No render waiting.',flush=True)
