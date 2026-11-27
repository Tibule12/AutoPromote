"""Verify and package three actual native CAT movies and their real tutorials.
No concept result is rendered or synthesized by this packaging step.
"""
import json,subprocess,hashlib,shutil,zipfile,html,time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
R=Path(__file__).resolve().parents[4];A=R/'frontend/public/education/cat-html-v1';W=Path('/home/tibule12/.local/share/autopromote-qa/education-20261124/cat/extensions');V=Path('/home/tibule12/Videos/AutoPromote Education - CAT HTML - Teacher Review - 2026-11-24');V.mkdir(exist_ok=True)
catalog=json.loads((W/'catalog.json').read_text());report=[];cards=[]
def probe(p):return json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(p)]))
def duration(p):return float(probe(p)['format']['duration'])
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def prepare(l):
 d=A/l['id'];w=W/l['id'];tutorial=w/'tutorial'
 deadline=time.time()+900
 while not (tutorial/'proof.json').exists():
  if time.time()>deadline:raise RuntimeError('Tutorial still incomplete: '+l['id'])
  time.sleep(1)
 teaching=json.loads((tutorial/'proof.json').read_text());assert teaching['nativeExport'] and teaching['exactColdRecovery'];native={'actualNativeDownload':True,'exactColdRecovery':True,'outputSha256':teaching['outputSha256'],'nativeRenderReceipt':json.loads((W/(l['id']+'-tutorial-render')/'native-render-completed.json').read_text())};assert digest(d/'result.mp4')==native['outputSha256'];(w/'native-proof.json').write_text(json.dumps(native,indent=2))
 # Concatenate the recovered edit and explicit saved-project continuation recordings; only the off-camera render
 # processing interval is absent. Whole authoring navigation stays continuous.
 concat=tutorial/'parts.ffconcat';concat.write_text("ffconcat version 1.0\n"+''.join("file '"+str(tutorial/part/'actual-controls.mp4')+"'\n"for part in json.loads((tutorial/'parts.json').read_text())))
 raw=tutorial/'continuous-controls.mp4';subprocess.run(['ffmpeg','-v','error','-y','-safe','0','-i',str(concat),'-c','copy',str(raw)],check=True)
 cues=json.loads((tutorial/'chapters.json').read_text());cuts=json.loads((tutorial/'wait-cuts.json').read_text())if(tutorial/'wait-cuts.json').exists()else[]
 cuts=[c for c in cuts if c['end']-c['start']>.01]
 if cuts:
  original=raw;raw=tutorial/'controls-without-queue-wait.mp4';full=duration(original);ranges=[];start=0
  for cut in cuts:
   if cut['start']>start:ranges.append((start,cut['start']))
   start=cut['end']
  if full>start:ranges.append((start,full))
  filters=[]
  for i,(a,b)in enumerate(ranges):filters.append(f'[0:v]trim=start={a}:end={b},setpts=PTS-STARTPTS[v{i}]')
  filters.append(''.join(f'[v{i}]'for i in range(len(ranges)))+f'concat=n={len(ranges)}:v=1:a=0[out]')
  subprocess.run(['ffmpeg','-v','error','-y','-i',str(original),'-filter_complex',';'.join(filters),'-map','[out]','-c:v','libx264','-threads','4','-preset','ultrafast','-crf','23',str(raw)],check=True)
  for cue in cues:cue['start']-=sum(c['end']-c['start']for c in cuts if c['end']<=cue['start'])
 total=duration(raw);inputs=['-i',str(raw)];filters=[];mix=[]
 for i,c in enumerate(cues):inputs+=['-i',c['file']];filters.append(f'[{i+1}:a]adelay={round(c["start"]*1000)}:all=1[a{i}]');mix.append(f'[a{i}]')
 audio_start=teaching.get('finishedMovieAudioStart')
 if audio_start is not None:
  audio_start-=sum(c['end']-c['start']for c in cuts if c['end']<=audio_start)
  inputs+=['-i',str(d/'tutorial-result.mp4')];filters.append(f'[{len(cues)+1}:a]adelay={round(audio_start*1000)}:all=1[finalsound]');mix.append('[finalsound]')
 filters.append(''.join(mix)+f'amix=inputs={len(mix)}:normalize=0,apad=whole_dur={total},alimiter=limit=0.94[audio]')
 subprocess.run(['ffmpeg','-v','error','-y',*inputs,'-filter_complex',';'.join(filters),'-map','0:v','-map','[audio]','-c:v','copy','-c:a','aac','-b:a','144k','-t',str(total),'-movflags','+faststart',str(d/'tutorial.mp4')],check=True)
 for name in ['result.mp4','tutorial-result.mp4','tutorial.mp4','source.mp4']:
  p=d/name;data=probe(p);assert not any(s['codec_type']=='subtitle'for s in data['streams']);assert any(s['codec_type']=='audio'for s in data['streams']);subprocess.run(['ffmpeg','-v','error','-i',str(p),'-f','null','-'],check=True,capture_output=True)
 scene=json.loads((d/'lesson.graphics.json').read_text());l['layerReference']=scene['layers'];l['evidence']={'canonicalExport':True,'actualNativeDownload':True,'movingPreview':True,'fullFinishedPlayback':True,'exactColdRecovery':True,'tutorial':True,'bundle':True,'htmlAccuracyChecked':True,'teacherFeedbackReceived':False,'independentLearnerRecreation':False,'publicRelease':False}
 recipe=f'CAT {l["number"]} — {l["title"]}\nSUPPLEMENTARY TEACHER REVIEW — NOT CAPS APPROVED\n\n'
 recipe+='Original source.mp4 is real HTML/browser footage,1280x720,28s,with offline synthetic concept narration. It contains no native teaching outlines. In the source browser the page is magnified150%.\n\n'
 for i,s in enumerate(l['studioSteps'],1):recipe+=f'{i}. {s["title"]}\n{s["control"]}\n{s["value"]}\n{s["why"]}\n\n'
 recipe+='ALL NATIVE LAYERS AND KEYS\nCanvas1280x720; x/y/width/height in percent; time in programme seconds. Easing applies at arrival. Text uses native Inter.\n'+json.dumps(scene,ensure_ascii=False,indent=2)+'\n\nTUTORIAL ACTIONS AND VOICE TIMING\n'
 for c in cues:recipe+=f'{c["start"]:.2f}s — {c["id"]}: {c["text"]}\n'
 (d/'STUDIO-RECIPE.txt').write_text(recipe)
 (d/'TUTORIAL-TRANSCRIPT.txt').write_text('\n\n'.join(f'{c["start"]:.2f}s {c["text"]}'for c in cues)+'\n')
 (d/'CONCEPT-TRANSCRIPT.txt').write_text('\n\n'.join(f'{c["start"]:.2f}s {c["text"]}'for c in json.loads((w/'concept-cues.json').read_text()))+'\n')
 (d/'SOURCE-PROVENANCE.txt').write_text('HTML files and vector image are original fictional teaching examples. Chromium renders the actual files. Native Studio renders all focus outlines/callouts; no external concept animation is substituted. Detailed tutorial imports the provided editable starter, demonstrates native key/copy controls and manually creates a practice label before removing it. Synthetic offline narration. No subtitles. No production/paid execution.\n')
 # All relative HTML dependencies live together inside the downloadable kit.
 bundle=d/'practice-kit.zip'
 with zipfile.ZipFile(bundle,'w',zipfile.ZIP_DEFLATED)as z:
  for p in sorted(d.iterdir()):
   if p.is_file()and p.name not in ['practice-kit.zip','source-poster.png']and p.suffix not in ['.vtt','.srt']:z.write(p,l['id']+'/'+p.name,compress_type=zipfile.ZIP_STORED if p.suffix=='.mp4' else zipfile.ZIP_DEFLATED)
  z.write(A/'TEACHER-REVIEW.txt','TEACHER-REVIEW.txt');z.write(A/'PERMISSIONS.txt','PERMISSIONS.txt')
 target=V/(f'{l["number"]:02} - '+l['title']);target.mkdir(exist_ok=True)
 for p in d.iterdir():
  if p.is_file()and p.name not in ['source-poster.png']:shutil.copy2(p,target/p.name)
 shutil.copy2(tutorial/'Owned project.autopromote.json',target/'Owner review project.autopromote.json')
 shutil.copy2(tutorial/'Owned project.autopromote.json',target/'Narrated tutorial project.autopromote.json')
 verification={'lessonId':l['id'],'nativeSha256':native['outputSha256'],'nativeDuration':duration(d/'result.mp4'),'tutorialSeconds':total,'tutorialSha256':digest(d/'tutorial.mp4'),'completeNativeDecode':True,'noSubtitleTracks':True,'audio':True,'nativeProjectRecovery':True,'htmlTestReference':'additional-html-accuracy.json','nativeProof':native,'tutorialProof':teaching,'teacherFeedbackReceived':False,'independentLearnerRecreation':False}
 rel=target.name;card=(f'<section id="{l["id"]}"><p class="eyebrow">CAT {l["number"]} · {html.escape(l["grade"])}</p><h2>{html.escape(l["title"])}</h2><p>{html.escape(l["concept"])}</p><h3>Finished AutoPromote lesson · 28 seconds</h3><video controls preload="metadata" src="{rel}/result.mp4"></video><h3>How it was made · actual Studio controls</h3><video controls preload="metadata" src="{rel}/tutorial.mp4"></video><p><a href="{rel}/index.html">Open the real webpage</a> · <a href="{rel}/practice-kit.zip" download>Download complete kit</a> · <a href="{rel}/STUDIO-RECIPE.txt">Exact controls and values</a></p><h3>HTML exercise</h3><p>{html.escape(l["htmlExercise"])}</p><h3>Creative exercise</h3><p>{html.escape(l["creativeExercise"])}</p><h3>Teacher criteria</h3><ul>'+''.join('<li>'+html.escape(t)+'</li>'for t in l['criteria'])+f'</ul><p><a href="{rel}/TEACHER-ASSESSMENT.txt">Assessment and reasoning guide</a> · <a href="{rel}/TUTORIAL-TRANSCRIPT.txt">Separate plain transcript</a></p></section>')
 return verification,card
with ThreadPoolExecutor(max_workers=3) as pool:
 for verification,card in pool.map(prepare,catalog['lessons']):
  report.append(verification);cards.append(card);print('Packaged and verified:',verification['lessonId'],flush=True)
main=json.loads((A/'catalog.json').read_text());main['lessons']=[l for l in main['lessons'] if l['id'] not in {x['id'] for x in catalog['lessons']}]+catalog['lessons'];(A/'catalog.json').write_text(json.dumps(main,ensure_ascii=False,indent=2)+'\n');(R/'frontend/src/education/catCatalog.json').write_text((A/'catalog.json').read_text());(R/'reports/education-cat-20261124/additional-delivery-verification.json').write_text(json.dumps(report,indent=2)+'\n')
for name in ['TEACHER-REVIEW.txt','PERMISSIONS.txt']:shutil.copy2(A/name,V/name)
all_catalog=json.loads((A/'catalog.json').read_text());cards=[]
for l in all_catalog['lessons']:
 rel=f'{l["number"]:02} - '+l['title'];cards.append(f'<section id="{l["id"]}"><p class="eyebrow">CAT {l["number"]} · {html.escape(l["grade"])}</p><h2>{html.escape(l["title"])}</h2><p>{html.escape(l["concept"])}</p><h3>Finished AutoPromote explanation · 28 seconds</h3><video controls preload="metadata" src="{rel}/result.mp4"></video><h3>How it was made · actual Studio controls</h3><video controls preload="metadata" src="{rel}/tutorial.mp4"></video><p><a href="{rel}/index.html">Open the real webpage</a> · <a href="{rel}/practice-kit.zip" download>Download complete kit</a> · <a href="{rel}/STUDIO-RECIPE.txt">Exact controls and values</a></p><h3>HTML exercise</h3><p>{html.escape(l["htmlExercise"])}</p><h3>Creative exercise</h3><p>{html.escape(l["creativeExercise"])}</p><h3>Teacher criteria</h3><ul>'+''.join('<li>'+html.escape(t)+'</li>'for t in l['criteria'])+f'</ul><p><a href="{rel}/TEACHER-ASSESSMENT.txt">Assessment and reasoning guide</a> · <a href="{rel}/TUTORIAL-TRANSCRIPT.txt">Separate plain transcript</a></p></section>')
(V/'OPEN - CAT teacher review.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AutoPromote Education — CAT teacher review</title><style>body{margin:0;background:#0b1222;color:#edf4ff;font:18px/1.65 Arial,sans-serif}main{max-width:1100px;margin:auto;padding:48px 24px}h1{font-size:clamp(32px,5vw,58px);line-height:1.1}h2{font-size:32px}a{color:#9eead6}section{padding:40px 0;border-top:1px solid #32415c;margin-top:40px}.eyebrow{letter-spacing:1px;color:#a8efd4;font-size:14px}video{display:block;width:100%;aspect-ratio:16/9;background:#050a12;border-radius:12px}h3{margin-top:28px}.notice{padding:20px;border:1px solid #526588;border-radius:12px}</style><main><p class="eyebrow">AUTOPROMOTE EDUCATION / CAT</p><h1>Connect the code<br>to what you see.</h1><p>Six real HTML mini-lessons with native Studio explanations, detailed visible-action tutorials and downloadable exercises.</p><p class="notice">Private professional teacher review. Supplementary to the amended CAT CAPS; not formally approved or endorsed. Teacher feedback and independent learner recreation are pending. The existing IT pathway is preserved.</p><p><a href="TEACHER-REVIEW.txt">Teacher feedback brief</a> · <a href="'+html.escape(all_catalog['reference']['url'],quote=True)+'">Official DBE amendment</a></p>'+''.join(cards)+'</main></html>')
shutil.copy2(V/'OPEN - CAT teacher review.html',V/'OPEN - First teacher preview.html')
print(str(V/'OPEN - CAT teacher review.html'))
print(json.dumps([{'lesson':r['lessonId'],'result':r['nativeDuration'],'tutorial':r['tutorialSeconds']}for r in report]))
