"""Run the existing Composite pixel renderer on three real shot frames locally.

Imports the existing foreground-cleanup method with a verified source-bound
cache. This is not an authenticated UI job or a SAM model-artifact attachment.
"""
from pathlib import Path
import json,os,subprocess,sys,time
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'private/native-edge-deps'))
sys.path.insert(0,str(ROOT.parents[2]))
os.environ.update(NUMBA_CACHE_DIR=str(ROOT/'private/numba-cache'),OMP_NUM_THREADS='2',OPENBLAS_NUM_THREADS='1',NUMBA_NUM_THREADS='2')
import numpy as np
from PIL import Image
from python_media_worker.studio_subject_matte import sha256,canonical_hash,mask_geometry,CachedSubjectMatte,video_geometry
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
WORK=ROOT/'private/native-composite-cleanup';WORK.mkdir(exist_ok=True)
radius=int(sys.argv[1]) if len(sys.argv)>1 else 2
RESULT=WORK/f'radius-{radius}';RESULT.mkdir(exist_ok=True)
source=WORK/'source.mkv'
if not source.exists():
    subprocess.run(['ffmpeg','-v','error','-framerate','24','-i',str(ROOT/'private/attempt-2/raw/%06d.png'),
        '-frames:v','72','-c:v','ffv1','-threads','2','-pix_fmt','bgr0',str(source)],check=True)
geometry=video_geometry(source)
mattes=WORK/'matte';mattes.mkdir(exist_ok=True)
rows=[]
for index in range(72):
    alpha=Image.open(ROOT/'private/attempt-2/presenter'/f'{index+1:06d}.png').getchannel('A')
    path=mattes/f'matte_{index:04d}.png';alpha.save(path)
    rows.append({'index':index,'time':index/24,'file':path.name,'sha256':sha256(path),**mask_geometry(np.array(alpha))})
prompt={'version':1,'source_sha256':sha256(source),'points':[[510,450]],'labels':[1]}
manifest={'version':1,'kind':'source_bound_subject_matte','source_sha256':sha256(source),**geometry,
    'prompt':prompt,'prompt_sha256':canonical_hash(prompt),'shot_cuts':[],'frames':rows,
    'provenance':'Private imported RVM/source-guided alpha; not a native SAM inference job',
    'original_source_sha256':'7a16b8ba2eba836eac74bcfb1f830313907ac0e19f314e636d4b7f833643578c',
    'original_source_interval':[539/24,611/24]}
(mattes/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
cache=CachedSubjectMatte(mattes,source)
effect={'id':'background-edge-cleanup','type':'foreground_refine','start':0,'end':3,
    'choke':0,'feather':0,'edge_radius':radius,'decontaminate':1,
    'recover_box':[0,0,0,0],'recover_hue':210,'hue_tolerance':30,'saturation_min':.25,
    'detail_box':[0,0,0,0],'dark_max':.24,'clear_box':[0,0,0,0],
    'reject_hue':15,'reject_tolerance':25,'reject_saturation':.7,'reject_value':.6}
plan={'version':1,'source_sha256':sha256(source),'matte_sha256':cache.artifact_sha256,'effects':[effect]}
(RESULT/'plan.json').write_text(json.dumps(plan,indent=2)+'\n')
renderer=VfxFrameRenderer(plan,cache)
started=time.monotonic();results=[]
all_frames='--all' in sys.argv
if all_frames:(RESULT/'presenter').mkdir(exist_ok=True)
for index in (range(72) if all_frames else [0,36,71]):
    frame=Image.open(ROOT/'private/attempt-2/raw'/f'{index+1:06d}.png').convert('RGB')
    alpha=Image.fromarray(cache.frame(index))
    rgb,refined=renderer._prepare_foreground(frame,alpha,[effect],1110,1000)
    rgba=rgb.convert('RGBA');rgba.putalpha(refined);rgba.save(RESULT/f'foreground-{index:03d}.png')
    if all_frames:
        assert radius==0 and np.array_equal(np.array(alpha),np.array(refined))
        pixels=np.array(rgb)
        yy,xx=np.mgrid[:1000,:1110]
        hardware=(xx>650)&(yy>420)&(yy<620)&(pixels.max(2)<120)&((pixels.max(2).astype(float)-pixels.min(2))<65)
        neutral=np.rint(pixels[hardware].astype(float)@np.array([.2126,.7152,.0722])).astype(np.uint8)
        pixels[hardware]=neutral[:,None]
        col=pixels.astype(np.float32)/255
        luma=(col*np.array([.2126,.7152,.0722])).sum(2,keepdims=True)
        col=np.clip((luma+(col-luma)*.88-.025)*1.025,0,1)
        Image.fromarray(np.dstack([np.rint(col*255).astype(np.uint8),np.array(refined)])).save(RESULT/'presenter'/f'{index+1:06d}.png')
    values=np.array(refined)/255
    preview=np.array(rgb)/255*values[:,:,None]+np.array([.15,.13,.15])*(1-values[:,:,None])
    if index in [0,36,71]:Image.fromarray(np.rint(preview*255).astype(np.uint8)).save(RESULT/f'review-{index:03d}.png')
    row={'frame':index,'seconds':time.monotonic()-started,'alphaChangedPixels':int(np.count_nonzero(np.array(alpha)!=np.array(refined)))}
    results.append(row)
    if not all_frames or (index+1)%12==0:print(json.dumps(row),flush=True)
(RESULT/('receipt-all.json' if all_frames else 'receipt.json')).write_text(json.dumps({'rendererFile':'python_media_worker/studio_vfx_plan.py','rendererSha256':sha256(ROOT.parents[2]/'python_media_worker/studio_vfx_plan.py'),
    'pymatting':'1.1.16','effect':effect,'results':results,'authenticatedStudioJob':False,'cloudJobs':0},indent=2)+'\n')
