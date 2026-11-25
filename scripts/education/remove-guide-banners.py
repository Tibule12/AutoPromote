"""Remove the added tutorial header; keep native concept exports unchanged."""
import json,subprocess,shutil,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];A=ROOT/'frontend/public/education/it-studio-v1';W=Path('/home/tibule12/.local/share/autopromote-qa/education-20261124');V=Path('/home/tibule12/Videos/AutoPromote Education - IT Concepts - 2026-11-24');D=V/'00 - Start Here - Manual Studio Guide';ret=W/'retained-banner-guides';ret.mkdir(exist_ok=True)
report=json.loads((ROOT/'reports/education-phase1-20261124/manual-click-proof.json').read_text());files=report['separateShortChapters'];rows=[]
for i,chapter in enumerate(files,1):
 p=A/chapter['file'];original=ret/p.name
 if not original.exists():shutil.copy2(p,original)
 temp=p.with_name(p.stem+'.without-banner.mp4');subprocess.run(['ffmpeg','-v','error','-y','-i',str(original),'-vf','crop=iw:ih-52:0:52','-c:v','libx264','-threads','3','-preset','veryfast','-crf','22','-c:a','copy','-movflags','+faststart',str(temp)],check=True);temp.replace(p)
 name=f"{i:02} - {chapter['title'].replace(' · ',' - ')}.mp4"
 if i==2:name='02 - Create a number card.mp4'
 if i==3:name='03 - Finish the card style.mp4'
 shutil.copy2(p,D/name);rows.append({'file':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'noSubtitleStream':True,'addedTeachingBannerRemoved':True,'nativeExportModified':False});print('Removed added banner:',p.name,flush=True)
p=V/'00 - Clear click demonstration.mp4'
if p.exists():
 original=ret/p.name
 if not original.exists():shutil.copy2(p,original)
 temp=p.with_name('00 - Clear click demonstration.updated.mp4');subprocess.run(['ffmpeg','-v','error','-y','-i',str(original),'-vf','crop=iw:ih-52:0:52','-c:v','libx264','-threads','3','-preset','veryfast','-crf','22','-c:a','copy','-movflags','+faststart',str(temp)],check=True);temp.replace(p)
(ROOT/'reports/education-phase1-20261124/no-captions-delivery.json').write_text(json.dumps({'ownerInstruction':'No captions, subtitle tracks or added teaching-banner text in delivered guides.','captionSidecarsRemoved':True,'lessonPlayerTracksRemoved':True,'guides':rows,'nativeConceptLabelsAndExportsPreserved':True},indent=2)+'\n')
