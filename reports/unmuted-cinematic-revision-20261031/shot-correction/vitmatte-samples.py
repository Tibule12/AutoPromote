"""Inspect cached native ViTMatte on the three actual troublesome frames."""
from pathlib import Path
import hashlib,json,os,sys,time
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,'/home/tibule12/.cache/autopromote-model-runtime/sam-cpu-eval-deps')
os.environ.update(HF_HUB_OFFLINE='1',TRANSFORMERS_OFFLINE='1',HF_HUB_DISABLE_TELEMETRY='1',CUDA_VISIBLE_DEVICES='',OMP_NUM_THREADS='4',OPENBLAS_NUM_THREADS='1')
import cv2,numpy as np,torch
from PIL import Image
from transformers import VitMatteForImageMatting
torch.set_num_threads(4);torch.set_num_interop_threads(1);cv2.setNumThreads(1)
MODEL=Path('/home/tibule12/.cache/autopromote-model-runtime/vitmatte-small-pinned')
assert hashlib.sha256((MODEL/'model.safetensors').read_bytes()).hexdigest()=='bda9289db1bb6762d978b42d1c62ae3f34daf7497171a347a1d09657efd788cb'
work=ROOT/'private/vitmatte';work.mkdir(exist_ok=True)
model=VitMatteForImageMatting.from_pretrained(MODEL,local_files_only=True).to('cpu').eval()
start=time.monotonic();results=[]
for n in [1,37,72]:
    rgb=np.array(Image.open(ROOT/'private/attempt-2/raw'/f'{n:06d}.png').convert('RGB'))
    alpha=np.array(Image.open(ROOT/'private/attempt-2/presenter'/f'{n:06d}.png').getchannel('A'))
    selected=(alpha>=128).astype(np.uint8)
    kernel=cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(13,13))
    inside=cv2.erode(selected,kernel)>0;outside=cv2.dilate(selected,kernel)==0
    trimap=np.full(selected.shape,128,np.uint8);trimap[inside]=255;trimap[outside]=0
    pixels=torch.from_numpy(rgb).permute(2,0,1).float()/127.5-1
    inputs=torch.cat((pixels,torch.from_numpy(trimap)[None].float()/255),dim=0)[None]
    inputs=torch.nn.functional.pad(inputs,(0,(-1110)%32,0,(-1000)%32))
    with torch.inference_mode():values=model(pixel_values=inputs).alphas[0,0,:1000,:1110].numpy()
    assert np.isfinite(values).all()
    values=np.clip(values,0,1);values[inside]=1;values[outside]=0
    rgba=Image.fromarray(rgb).convert('RGBA');rgba.putalpha(Image.fromarray(np.rint(values*255).astype(np.uint8)))
    rgba.save(work/f'foreground-{n:03d}.png')
    preview=rgb/255*values[:,:,None]+np.array([.15,.13,.15])*(1-values[:,:,None])
    Image.fromarray(np.rint(preview*255).astype(np.uint8)).save(work/f'review-{n:03d}.png')
    row={'frame':n-1,'seconds':time.monotonic()-start};results.append(row);print(json.dumps(row),flush=True)
(work/'receipt.json').write_text(json.dumps({'modelSha256':'bda9289db1bb6762d978b42d1c62ae3f34daf7497171a347a1d09657efd788cb',
    'radius':6,'device':'cpu','torch':torch.__version__,'results':results,'cloudJobs':0,'modelDownloads':0},indent=2)+'\n')
