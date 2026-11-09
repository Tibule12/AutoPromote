"""Local first-frame proof: real person, chair, equipment and plant overlaps."""
from pathlib import Path
import os,sys,json,subprocess
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'private/native-edge-deps'))
sys.path.insert(0,str(ROOT.parents[2]))
os.environ.update(NUMBA_CACHE_DIR=str(ROOT/'private/numba-cache'),NUMBA_NUM_THREADS='2',
    OMP_NUM_THREADS='2',OPENBLAS_NUM_THREADS='1')
import numpy as np
from PIL import Image
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
WORK=ROOT/'private/source-matched-20261101'
verified='--verified' in sys.argv
fixed_colour='--fixed-colour' in sys.argv
source=WORK/'source.png'
if not source.exists():
    subprocess.run(['ffmpeg','-v','error','-i',str(WORK/'selection.mkv'),'-frames:v','1',str(source)],check=True)
rgb=Image.open(source).convert('RGB')
raw=np.array(rgb)
assert np.array_equal(raw[:,:1110],np.array(Image.open(ROOT/'private/attempt-2/raw/000001.png').convert('RGB')))
base=np.zeros((1000,1430),np.uint8)
base[:,:1110]=np.array(Image.open(ROOT/'private/continuity/presenter/000001.png').getchannel('A'))[:,170:]
props=Image.open(WORK/('props-verified-points' if verified else 'props')/'subject_masks/matte_0000.png')
import cv2
values=np.array(props)
hsv=cv2.cvtColor(raw,cv2.COLOR_RGB2HSV)
# The model selected pieces of the blue/orange illustration on the old TV.
# Those are background, never real plant/equipment pixels. Apply this source-
# colour rejection to the prop selection before alpha estimation; the person's
# independently selected blue clothing is added separately and stays intact.
digital_blue=(hsv[:,:,0]>=88)&(hsv[:,:,0]<=135)&(hsv[:,:,1]>45)&(hsv[:,:,2]>100)
color=raw.astype(np.float32)
digital_red=(color[:,:,0]>175)&(color[:,:,0]>2*color[:,:,1])&(color[:,:,0]>2*color[:,:,2])
values[digital_blue|digital_red]=0
props=Image.fromarray(values)
effect=json.loads((ROOT/'private/native-composite-cleanup/radius-0/plan.json').read_text())['effects'][0]
_,soft_props=VfxFrameRenderer._prepare_foreground(None,rgb,props,[{**effect,'edge_radius':2,'decontaminate':0}],1430,1000)
alpha=Image.fromarray(np.maximum(base,np.array(soft_props)))
clean,alpha=VfxFrameRenderer._prepare_foreground(None,rgb,alpha,[effect],1430,1000)
label='colour-fixed' if fixed_colour else 'verified' if verified else 'first'
rgba=clean.convert('RGBA');rgba.putalpha(alpha);rgba.save(WORK/f'foreground-{label}.png')
back=Image.new('RGB',rgba.size,'#aca59e');back.paste(clean,mask=alpha);back.save(WORK/f'foreground-{label}-on-neutral.png')
print('First source bundle ready; photographed gear/occluder pixels retained',flush=True)
