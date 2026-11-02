"""Compare native previews with final export using the exact common-canvas graph."""
from pathlib import Path
import argparse,json,re,subprocess
p=argparse.ArgumentParser();p.add_argument('directory');a=p.parse_args();out=Path(a.directory);rows=[]
fit='scale=1430:1000:force_original_aspect_ratio=decrease,pad=1430:1000:(ow-iw)/2:(oh-ih)/2,fps=24,setsar=1,scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1'
for angle in [1,2]:
 log=out/f'angle-{angle}-canonical-ssim.log'
 graph=f'[0:v]{fit},setpts=PTS-STARTPTS[p];[1:v]trim=start={(angle-1)*3}:end={angle*3},setpts=PTS-STARTPTS[e];[p][e]ssim=stats_file={log}[v]'
 subprocess.run(['ffmpeg','-v','error','-i',str(out/f'angle-{angle}-preview.mp4'),'-i',str(out/'two-speaker-native-export.mp4'),'-filter_complex',graph,'-map','[v]','-an','-f','null','-'],check=True)
 values=[float(x) for x in re.findall(r'All:([0-9.]+)',log.read_text())];assert len(values)==72
 rows.append({'angle':angle,'frames':72,'meanSSIM':sum(values)/72,'minimumSSIM':min(values),'geometry':'Actual native common 1430x1000 canvas followed by Fit full 1920x1080, including second-angle vertical padding.','scope':'Scaling/encoding comparison, not pixel identity or creative/ground-truth qualification.'})
(out/'preview-export-comparison-canonical.json').write_text(json.dumps(rows,indent=2)+'\n');print(json.dumps(rows,indent=2))
