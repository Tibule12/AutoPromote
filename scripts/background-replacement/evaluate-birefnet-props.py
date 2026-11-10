"""Pinned MIT BiRefNet HR-matting, CPU-only visual evaluation on retained footage."""
from pathlib import Path
import json,time,hashlib,sys,socket
import numpy as np,torch
from PIL import Image,ImageDraw
from safetensors.torch import load_file
from transformers import AutoConfig,AutoModelForImageSegmentation
R=Path('reports/background-replacement-20261101/private/four-minute-r9');M=Path('/home/tibule12/.cache/autopromote-model-runtime/birefnet-hr-matting-evaluation')
assert hashlib.file_digest((M/'model.safetensors').open('rb'),'sha256').hexdigest()=='a5a4de698739ea5e0e8bbab28e1b293dde95092b87a442d566cbc585c53cef55'
torch.set_num_threads(4);torch.set_num_interop_threads(1)
config=AutoConfig.from_pretrained(str(M),trust_remote_code=True,local_files_only=True)
model=AutoModelForImageSegmentation.from_config(config,trust_remote_code=True).float().eval();model.load_state_dict(load_file(str(M/'model.safetensors')),strict=True);socket.socket.connect=lambda *a,**k:(_ for _ in ()).throw(RuntimeError('Local evaluation network disabled'))
mean=torch.tensor([.485,.456,.406])[None,:,None,None];std=torch.tensor([.229,.224,.225])[None,:,None,None]
rows=[]
for t,box,size in [(115,(940,420,1430,850),1024),(55,(0,700,390,1000),1024),(115,(0,0,1430,1000),1024),(115,(940,420,1430,850),2048)]:
 image=Image.open(R/f'source-{t:03d}.png').convert('RGB').crop(box);tensor=torch.from_numpy(np.asarray(image.resize((size,size),Image.Resampling.LANCZOS)).copy()).permute(2,0,1)[None].float()/255;start=time.monotonic()
 with torch.inference_mode():alpha=model((tensor-mean)/std)[-1].sigmoid()[0,0].numpy()
 matte=Image.fromarray(np.rint(alpha.clip(0,1)*255).astype(np.uint8)).resize(image.size,Image.Resampling.LANCZOS);name=f'birefnet-{t:03d}-{box[0]}-{size}';matte.save(R/(name+'-alpha.png'));background=Image.new('RGB',image.size,(110,110,110));background.paste(image,mask=matte);background.save(R/(name+'-composite.png'));sheet=Image.new('RGB',(image.width*2,image.height+30),(15,15,15));sheet.paste(image,(0,30));sheet.paste(background,(image.width,30));ImageDraw.Draw(sheet).text((8,8),f'Actual source / model evaluation | {t}s | {size}px',fill='white');sheet.save(R/(name+'-pair.jpg'),quality=97);row={'sourceSeconds':t,'sourceBox':box,'inputSize':size,'runtimeSeconds':time.monotonic()-start,'alphaFile':name+'-alpha.png'};rows.append(row);(R/'birefnet-evaluation.json').write_text(json.dumps({'license':'MIT','modelRevision':'5d6b6f8adcb5b417c871b1d84ceaae9871355b7f','weightSha256':'a5a4de698739ea5e0e8bbab28e1b293dde95092b87a442d566cbc585c53cef55','device':'cpu','paidCloud':False,'productIntegration':False,'rows':rows},indent=2));print(json.dumps(row),flush=True)
