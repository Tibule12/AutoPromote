"""Source-detail ViTMatte refinement using the already pinned native checkpoint.

Only the reviewed head/earring ROI changes; body/equipment selections stay exact.
Colour recovery calls the existing Composite foreground renderer. No web/GPU I/O.
"""
from pathlib import Path
import hashlib,json,os,sys,time
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,'/home/tibule12/.cache/autopromote-model-runtime/sam-cpu-eval-deps')
sys.path.insert(0,str(ROOT/'private/native-edge-deps'))
sys.path.insert(0,str(ROOT.parents[2]))
os.environ.update(HF_HUB_OFFLINE='1',TRANSFORMERS_OFFLINE='1',HF_HUB_DISABLE_TELEMETRY='1',CUDA_VISIBLE_DEVICES='',
    OMP_NUM_THREADS='4',OPENBLAS_NUM_THREADS='1',NUMBA_NUM_THREADS='2',NUMBA_CACHE_DIR=str(ROOT/'private/numba-cache'))
import cv2,numpy as np,torch
from PIL import Image
from transformers import VitMatteForImageMatting
from python_media_worker.studio_subject_matte import CachedSubjectMatte,sha256
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
torch.set_num_threads(4);torch.set_num_interop_threads(1);cv2.setNumThreads(1)
MODEL=Path('/home/tibule12/.cache/autopromote-model-runtime/vitmatte-small-pinned')
assert sha256(MODEL/'model.safetensors')=='bda9289db1bb6762d978b42d1c62ae3f34daf7497171a347a1d09657efd788cb'
WORK=ROOT/'private/head-model';WORK.mkdir(exist_ok=True)
cache=CachedSubjectMatte(ROOT/'private/native-composite-cleanup/matte',ROOT/'private/native-composite-cleanup/source.mkv')
plan=json.loads((ROOT/'private/native-composite-cleanup/radius-0/plan.json').read_text())
renderer=VfxFrameRenderer(plan,cache)
model=VitMatteForImageMatting.from_pretrained(MODEL,local_files_only=True).to('cpu').eval()
started=time.monotonic();records=[]
for index in (range(72) if '--all' in sys.argv else [0,36,71]):
    rgb=np.array(Image.open(ROOT/'private/attempt-2/raw'/f'{index+1:06d}.png').convert('RGB'))
    original=cache.frame(index);alpha=original.astype(np.float32)/255
    # Fixed camera ROI includes scalp, both earrings and collar context at every
    # sampled pose. Full source detail is retained rather than resizing the head.
    x0,y0,x1,y1=385,115,670,405
    selected=(original[y0:y1,x0:x1]>=128).astype(np.uint8)
    kernel=cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(9,9))
    inside=cv2.erode(selected,kernel)>0;outside=cv2.dilate(selected,kernel)==0
    tri=np.full(selected.shape,128,np.uint8);tri[inside]=255;tri[outside]=0
    pixels=torch.from_numpy(rgb[y0:y1,x0:x1].copy()).permute(2,0,1).float()/127.5-1
    tensor=torch.cat((pixels,torch.from_numpy(tri)[None].float()/255),dim=0)[None]
    h,w=selected.shape;tensor=torch.nn.functional.pad(tensor,(0,(-w)%32,0,(-h)%32))
    with torch.inference_mode():refined=model(pixel_values=tensor).alphas[0,0,:h,:w].numpy()
    assert np.isfinite(refined).all()
    refined=np.clip(refined,0,1);refined[inside]=1;refined[outside]=0
    # Blend the unchanged mask at the ROI boundary; only its uncertain band is
    # refined. No rectangular cut may appear through the collar or shoulder.
    yy,xx=np.mgrid[:h,:w]
    weight=np.minimum.reduce([np.clip(xx/12,0,1),np.clip((w-1-xx)/12,0,1),np.clip(yy/12,0,1),np.clip((h-1-yy)/12,0,1)])
    alpha[y0:y1,x0:x1]=alpha[y0:y1,x0:x1]*(1-weight)+refined*weight
    matte=Image.fromarray(np.rint(alpha*255).astype(np.uint8))
    clean,kept=renderer._prepare_foreground(Image.fromarray(rgb),matte,plan['effects'],1110,1000)
    assert np.array_equal(np.array(matte),np.array(kept))
    color=np.array(clean)
    yy,xx=np.mgrid[:1000,:1110]
    metal=(xx>650)&(yy>420)&(yy<620)&(color.max(2)<120)&((color.max(2).astype(float)-color.min(2))<65)
    neutral=np.rint(color[metal].astype(float)@np.array([.2126,.7152,.0722])).astype(np.uint8);color[metal]=neutral[:,None]
    col=color.astype(np.float32)/255;luma=(col*np.array([.2126,.7152,.0722])).sum(2,keepdims=True)
    col=np.clip((luma+(col-luma)*.88-.025)*1.025,0,1)
    out=WORK/'presenter';out.mkdir(exist_ok=True)
    Image.fromarray(np.dstack([np.rint(col*255).astype(np.uint8),np.array(kept)])).save(out/f'{index+1:06d}.png')
    if index in [0,36,71]:
        p=col*alpha[:,:,None]+np.array([.15,.13,.15])*(1-alpha[:,:,None])
        Image.fromarray(np.rint(p*255).astype(np.uint8)).save(WORK/f'review-{index:03d}.png')
    row={'frame':index,'seconds':time.monotonic()-started};records.append(row)
    if '--all' not in sys.argv or (index+1)%12==0:print(json.dumps(row),flush=True)
(WORK/('receipt-all.json' if '--all' in sys.argv else 'receipt-samples.json')).write_text(json.dumps({'modelSha256':sha256(MODEL/'model.safetensors'),
    'roi':[385,115,670,405],'radius':4,'device':'cpu','torch':torch.__version__,'records':records,'cloudJobs':0,
    'sourceBoundImportedMatte':True,'authenticatedNativeJob':False,'matteSemantics':'Source-specific image-conditioned detail refinement; no missing person geometry reconstructed'},indent=2)+'\n')
