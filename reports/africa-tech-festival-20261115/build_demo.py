from pathlib import Path
import concurrent.futures, hashlib, json, math, subprocess
from PIL import Image,ImageDraw,ImageFont
HERE=Path(__file__).resolve().parent;P=HERE/'private';OUT=Path('/home/tibule12/Documents/AutoPromote — Africa Tech Festival 2026');ASSETS=OUT/'assets';N=P/'narration';NARRATION=json.loads((N/'durations.json').read_text())
FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';BOLD='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
segments=json.loads((P/'selected-videos.json').read_text())
for name in ['intro','outro']:
 image=Image.new('RGB',(1280,720),'#0b1020');d=ImageDraw.Draw(image);d.rectangle((0,0,1280,8),fill='#773dff');logo=Image.open(ASSETS/'logo.png').convert('RGBA');logo.thumbnail((380,90));d.rounded_rectangle((62,58,482,178),radius=15,fill='#ffffff');image.paste(logo,(82,75),logo)
 title='Real Studio work.'if name=='intro'else'Let’s talk.';d.text((65,245),title,fill='white',font=ImageFont.truetype(BOLD,76));d.text((70,355),'Africa Tech Festival 2026'if name=='intro'else'Thulani Mtshwelo · Founder & CEO',fill='#24d2e0',font=ImageFont.truetype(FONT,30));d.text((70,445),'Existing films from Videos • original sound'if name=='intro'else'thulani@autopromote.org  |  autopromote.org',fill='#b3bed6',font=ImageFont.truetype(FONT,27));d.text((70,635),'PRELAUNCH • FOUNDER TESTING • RECORDED DEVELOPMENT EXAMPLES',fill='#b3bed6',font=ImageFont.truetype(FONT,18));image.save(P/(name+'-card.png'))
intro={'name':'AutoPromote — real Studio work','path':str(P/'intro-card.png'),'start':0,'end':math.ceil(NARRATION['intro']['seconds']+1),'card':True,'voice':'intro','label':'Recorded examples • selected from Videos'}
outro={'name':'Continue the conversation','path':str(P/'outro-card.png'),'start':0,'end':math.ceil(NARRATION['outro']['seconds']+1),'card':True,'voice':'outro','label':'Prelaunch • founder testing'}
segments=[intro]+segments+[outro]
for i,s in enumerate(segments):
 if s.get('silent'):s['voice']='controls'
 s['index']=i;s['duration']=s['end']-s['start']
 if s.get('voice'):assert NARRATION[s['voice']]['seconds']<=s['duration'],(s['name'],'Narration must fit')

def encode(s):
 target=P/f"demo-segment-{s['index']:02}.mp4";args=['ffmpeg','-v','error','-y']
 if s.get('card'):args+=['-loop','1','-i',s['path']]
 else:args+=['-ss',str(s['start']),'-i',s['path']]
 if s.get('voice'):args+=['-i',str(N/(s['voice']+'.wav'))]
 audio='1:a'if s.get('voice')else'0:a'
 if s.get('card'):vf='scale=1280:720,setsar=1,fps=30'
 else:
  # Preserve the whole source frame: scale/letterbox only. No new VFX or UI.
  title=s['name'].replace('—','-').replace(':',' -').replace("'",'')
  label=s['label'].replace('•','/').replace(':',' -').replace("'",'')
  vf=f"scale=1200:620:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:70+(620-ih)/2:color=0x0b1020,setsar=1,fps=30,drawtext=fontfile={BOLD}:text='{title}':x=40:y=12:fontsize=25:fontcolor=white,drawtext=fontfile={FONT}:text='{label}':x=40:y=44:fontsize=15:fontcolor=0x24d2e0,drawtext=fontfile={FONT}:text='PRELAUNCH / RECORDED EXISTING STUDIO EXAMPLE':x=40:y=696:fontsize=13:fontcolor=0xaab6d3"
 args+=['-map','0:v','-map',audio,'-vf',vf,'-af','aresample=48000,apad','-t',str(s['duration']),'-c:v','libx264','-threads','2','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-ac','2','-ar','48000','-b:a','192k','-movflags','+faststart',str(target)]
 subprocess.run(args,check=True);return target

with concurrent.futures.ThreadPoolExecutor(max_workers=2)as pool:files=list(pool.map(encode,segments))
concat=P/'demo.ffconcat';concat.write_text('ffconcat version 1.0\n'+''.join("file '"+str(f)+"'\n"for f in files))
result=OUT/'02 Demo/AutoPromote — festival showcase.mp4'
subprocess.run(['ffmpeg','-v','error','-y','-safe','0','-f','concat','-i',str(concat),'-c','copy','-movflags','+faststart',str(result)],check=True)
subprocess.run(['ffmpeg','-v','error','-i',str(result),'-f','null','-'],check=True)
time=0;chapters=[]
for s in segments:
 chapters.append({'seconds':time,'title':s['name'],'duration':s['duration'],'source':s['path']});time+=s['duration']
(P/'demo-chapters.json').write_text(json.dumps(chapters,indent=2));(OUT/'02 Demo/Showcase chapters.txt').write_text('\n'.join(f"{int(c['seconds'])//60:02}:{int(c['seconds'])%60:02}  {c['title']}"for c in chapters)+'\n\nExisting source-film audio is retained. The native authoring capture was silent and has local synthetic explanation. Editorial joins and title cards are presentation assembly, not a new Studio render. The complete full movies are included separately with unchanged bytes.\n')
source=Path(segments[4]['path'])
# Copy the complete actual control recording separately for deeper questions.
import shutil
shutil.copy2(source,OUT/'02 Demo/Glass Current — complete native control recording.mp4')
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(result)]));summary={'file':str(result),'seconds':float(probe['format']['duration']),'sha256':hashlib.sha256(result.read_bytes()).hexdigest(),'sourceFilms':4,'nativeControlRecordings':1,'originalSpeed':True,'fullDecode':True,'videoCodec':next(s['codec_name']for s in probe['streams']if s['codec_type']=='video'),'audioCodec':next(s['codec_name']for s in probe['streams']if s['codec_type']=='audio'),'newPaidJobs':0,'newStudioRenders':0}
(P/'demo-verification.json').write_text(json.dumps(summary,indent=2));print(json.dumps(summary,indent=2))
