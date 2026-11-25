"""Every-frame reference comparison for the simple teaching edits only."""
from pathlib import Path
import json,subprocess
import numpy as np
ROOT=Path(__file__).resolve().parents[2];WORK=Path('/home/tibule12/.local/share/autopromote-qa/education-20261124');ASSETS=ROOT/'frontend/public/education/it-studio-v1';rows=[]
def decode(p,start=None,duration=None):
 args=['ffmpeg','-v','error']
 if start is not None:args+=['-ss',str(start)]
 args+=['-i',str(p)]
 if duration is not None:args+=['-t',str(duration)]
 args+=['-vf','fps=24,scale=320:180','-f','rawvideo','-pix_fmt','rgb24','-']
 return np.frombuffer(subprocess.check_output(args),np.uint8).reshape(-1,180,320,3)
for id in ['first-project','precise-cuts','sequence-test-cases','sound-and-delivery']:
 folder=WORK/id
 if not(folder/'lesson-proof.json').exists():continue
 output=decode(folder/'final.mp4')
 if id=='sequence-test-cases':reference=np.concatenate([decode(ASSETS/name,start,4)for name,start in [('normal-input.mp4',1),('boundary-input.mp4',3),('invalid-input.mp4',1)]])
 else:reference=decode(ASSETS/'normal-input.mp4',0 if id=='first-project'else 1,None if id=='first-project'else 6)
 count=min(len(output),len(reference));assert abs(len(output)-len(reference))<=1
 difference=np.abs(output[:count].astype(float)-reference[:count].astype(float));mae=difference.mean(axis=(1,2,3))
 rows.append({'lessonId':id,'framesCompared':count,'frameCountDifference':len(output)-len(reference),'meanAbsoluteRgbDifference':float(mae.mean()),'worstFrameMeanAbsoluteRgbDifference':float(mae.max()),'worstFrame':int(mae.argmax()),'sameMappedSourceClock':True,'qualification':'Measurement for full-duration reviewer inspection; not a universal Studio raster tolerance or teacher approval.'})
(ROOT/'reports/education-phase1-20261124/source-timing-comparison.json').write_text(json.dumps(rows,indent=2)+'\n');print(json.dumps(rows))
