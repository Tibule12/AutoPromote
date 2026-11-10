from pathlib import Path
import subprocess,json,numpy as np
from PIL import Image
from python_media_worker.studio_matte_surface import surface_filters
r=Path(__file__).resolve().parent;im=Image.new('RGBA',(64,128));a=np.array(im);a[34:70,16:48]=[20,210,255,255];Image.fromarray(a).save(r/'private/surface-input.png')
s=dict(enabled=True,glowColor='#20dfff',glowRadius=12,glowIntensity=.65,reflectionEnabled=True,floorY=70/128*100,reflectionOpacity=.5,fadeHeight=30)
parts,pad=surface_filters('source',s,64,128,1,24,'p');graph='[0:v]format=rgba[source];'+''.join(parts)+f'[{pad}]format=rgba[out]'
subprocess.run(['ffmpeg','-v','error','-y','-filter_complex_threads','1','-loop','1','-i',str(r/'private/surface-input.png'),'-filter_complex',graph,'-map','[out]','-frames:v','1',str(r/'private/surface-cpu.png')],check=True)
(r/'private/surface-spec.json').write_text(json.dumps(s));print('Canonical CPU surface fixture produced.')
