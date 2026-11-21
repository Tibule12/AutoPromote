import tempfile,json,subprocess
from pathlib import Path
import numpy as np
from studio_selective_mask import write_recolor_cube

def test_worker_recolor_cube_matches_actual_frontend_tables():
    repo=Path(__file__).resolve().parents[1]
    script="""const fs=require('fs'),vm=require('vm');let science=fs.readFileSync('frontend/src/components/studioColorScience.js','utf8').replace(/export /g,'');const c={};vm.createContext(c);vm.runInContext(science+';this.convert={rgbToHsl,hslToRgb,hexToHsl};',c);const s={color:'#bc2c73',strength:.63},target=c.convert.hexToHsl(s.color),out=[];for(let b=0;b<5;b++)for(let g=0;g<5;g++)for(let r=0;r<5;r++){let [h,sat,l]=c.convert.rgbToHsl(r/4,g/4,b/4);let d=target[0]-h;if(d>.5)d-=1;if(d<-.5)d+=1;out.push(c.convert.hslToRgb(((h+d*.63)%1+1)%1,sat+(target[1]-sat)*.63,l));}process.stdout.write(JSON.stringify(out));"""
    expected=np.asarray(json.loads(subprocess.check_output(['node','-e',script],cwd=repo)))
    with tempfile.TemporaryDirectory()as d:
        file=Path(d)/'recolor.cube';write_recolor_cube({'color':'#bc2c73','strength':.63},file,size=5)
        actual=np.asarray([[float(v)for v in line.split()]for line in file.read_text().splitlines()if not line.startswith(('LUT','DOMAIN'))]);assert np.max(np.abs(actual-expected))<1e-6
