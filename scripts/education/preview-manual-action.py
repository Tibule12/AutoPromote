"""A short review clip of one actual completed control action, not a target movie."""
import json,subprocess,sys
from pathlib import Path
W=Path('/home/tibule12/.local/share/autopromote-qa/education-20261124/click-by-click');identity=sys.argv[1];steps=json.loads((W/'steps.json').read_text());s=next(x for x in steps if x['id']==identity);line=next(x for x in json.loads((W/'narration.json').read_text())if x['id']==identity)
files=sorted((W/'frames').glob('*.jpg'));first=files[0].stat().st_mtime;rows=[(p,p.stat().st_mtime-first)for p in files];chosen=[(p,t)for p,t in rows if s['start']-.1<=t<=s['end']];assert len(chosen)>5
concat=W/(identity+'-preview.ffconcat');concat.write_text('ffconcat version 1.0\n'+''.join(f"file '{p}'\nduration {max(.001,(chosen[i+1][1]if i+1<len(chosen)else s['end'])-t)}\n"for i,(p,t)in enumerate(chosen))+f"file '{chosen[-1][0]}'\n")
out=Path('/home/tibule12/Videos/AutoPromote Education - IT Concepts - 2026-11-24/00 - Clear click demonstration.mp4');seconds=s['end']-s['start']
subprocess.run(['ffmpeg','-v','error','-y','-safe','0','-i',str(concat),'-i',line['file'],'-filter_complex','[0:v]fps=24,pad=ceil(iw/2)*2:ceil(ih/2)*2,crop=iw:ih-52:0:52[v];[1:a]apad[a]','-map','[v]','-map','[a]','-t',str(seconds),'-c:v','libx264','-threads','2','-preset','fast','-crf','22','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-movflags','+faststart',str(out)],check=True)
print(out,round(seconds,1),'seconds. One fixed Studio view; one action; no inset, banner, subtitle or panel switch.')
