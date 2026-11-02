"""Compare measured live Studio stills to exact decoded export frame indices.
Diagnostic packaging only; no evaluated effect is built by this utility.
"""
import json,math,subprocess,sys,os,re
from pathlib import Path
import cv2
import numpy as np
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[2]
variant=sys.argv[1]
folder=ROOT/'reports/studio-cinematic-episode-20261101'
explicit=os.environ.get('STUDIO_QA_REPORT_DIR')
if explicit:
    folder=(ROOT/explicit).resolve()
    if not folder.is_relative_to(ROOT/'reports'):raise ValueError('Use a retained report below reports/')
review=os.environ.get('STUDIO_QA_EPISODE_REVIEW_DIR')
if review:
    if variant!='episode' or not re.fullmatch('[a-z0-9-]+',review):raise ValueError('Invalid review directory')
    folder=folder/review
elif variant!='episode':folder=folder/'compositions'/variant
movie=folder/'native-motion-flow/final.mp4'
samples=json.loads((folder/'preview-samples.json').read_text())
out=folder/'paired-frames';out.mkdir(exist_ok=True)
indices=sorted(set(round(float(s['programmeTime'])*24) for s in samples))
select='+'.join(f'eq(n,{i})' for i in indices)
subprocess.run(['ffmpeg','-v','error','-y','-i',str(movie),'-vf',"select='"+select+"'",'-fps_mode','vfr',str(out/'decoded-%03d.png')],check=True)
def ssim(a,b):
    # Standard 11x11, sigma1.5 local structural comparison; no calibrated
    # whole-picture pass threshold is inferred from this diagnostic number.
    a,b=a.astype(np.float64),b.astype(np.float64)
    mu1=cv2.GaussianBlur(a,(11,11),1.5);mu2=cv2.GaussianBlur(b,(11,11),1.5)
    v1=cv2.GaussianBlur(a*a,(11,11),1.5)-mu1*mu1
    v2=cv2.GaussianBlur(b*b,(11,11),1.5)-mu2*mu2
    cov=cv2.GaussianBlur(a*b,(11,11),1.5)-mu1*mu2
    score=((2*mu1*mu2+6.5025)*(2*cov+58.5225))/((mu1*mu1+mu2*mu2+6.5025)*(v1+v2+58.5225))
    return float(score[5:-5,5:-5].mean())
rows=[]
contact=Image.new('RGB',(1280,380*len(samples)),'#10131c');draw=ImageDraw.Draw(contact)
for slot,sample in enumerate(samples):
    time=float(sample['programmeTime']);index=round(time*24)
    preview=Image.open(folder/f"preview-{float(sample['requested']):.2f}.png").convert('RGB')
    export=Image.open(out/f'decoded-{indices.index(index)+1:03d}.png').convert('RGB').resize(preview.size,Image.Resampling.LANCZOS)
    a,b=np.asarray(preview).astype(float),np.asarray(export).astype(float);error=np.abs(a-b)
    rmse=float(np.sqrt(np.mean((a-b)**2)));psnr=20*math.log10(255/max(rmse,1e-12))
    prefix=f'{time:.5f}'
    preview.save(out/f'{prefix}-live.png');export.save(out/f'{prefix}-export.png')
    Image.fromarray(np.clip(error*4,0,255).astype(np.uint8)).save(out/f'{prefix}-difference-x4.png')
    row={'time':time,'exportFrame':index,'liveSampling':sample.get('sourceSampling'),'sourceFrame':sample.get('sourceFrameIndex'),
         'mae':float(error.mean()),'psnr':psnr,'ssim':ssim(a,b),'size':preview.size}
    rows.append(row)
    for side,im in enumerate([preview,export]):
        im=im.copy();im.thumbnail((640,360));contact.paste(im,(side*640,slot*380+20))
    draw.text((8,slot*380+3),f"{time:.5f}s / LIVE STUDIO",fill='white')
    draw.text((648,slot*380+3),f"EXPORT FRAME {index} / SSIM {row['ssim']:.4f} / PSNR {psnr:.2f}",fill='white')
contact.save(folder/'paired-contact.jpg')
(folder/'paired-measurements.json').write_text(json.dumps({'movie':str(movie.relative_to(ROOT)),
 'fps':24,'comparison':'Exact measured live programme time to decoded CFR frame; export resized once to live monitor size.',
 'assessment':'Diagnostic measurements, not a calibrated whole-scene passing threshold or creative approval.', 'samples':rows},indent=2))
print(json.dumps({'variant':variant,'pairs':len(rows),'minSsim':min(r['ssim'] for r in rows),'minPsnr':min(r['psnr'] for r in rows)}))
