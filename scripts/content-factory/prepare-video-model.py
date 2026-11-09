"""Prepare the official pinned larger image-to-video model on retained storage.

Downloads are CPU work. Inference uses a separate offline NVIDIA container.
Existing models are preserved; no credentials or third-party quantizations.
"""
import argparse,json,shutil,time
from pathlib import Path
from huggingface_hub import HfApi,snapshot_download
MODEL='Wan-AI/Wan2.2-I2V-A14B-Diffusers'
REVISION='596658fd9ca6b7b71d5057529bbf319ecbc61d74'
p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);p.add_argument('--deadline',type=float,required=True);a=p.parse_args()
if time.time()+1800>=a.deadline:raise RuntimeError('Insufficient authorized time to prepare and qualify a new model')
info=HfApi(token=False).model_info(MODEL,revision=REVISION,files_metadata=True)
if info.gated or info.sha!=REVISION:raise RuntimeError('Pinned public official model required')
files=[x for x in info.siblings if x.rfilename.endswith(('.json','.safetensors','.txt','.model')) or x.rfilename.startswith(('LICENSE','README'))]
required=sum(x.size or 0 for x in files);a.output.parent.mkdir(parents=True,exist_ok=True)
if shutil.disk_usage(a.output.parent).free<required+16*1024**3:raise RuntimeError('Not enough retained storage without touching existing models')
print(json.dumps({'stage':'MODEL_DOWNLOAD','model':MODEL,'revision':REVISION,'bytes':required}),flush=True)
started=time.monotonic()
snapshot_download(MODEL,revision=REVISION,local_dir=a.output,token=False,max_workers=4,
 allow_patterns=['*.json','*.safetensors','*.txt','*.model','LICENSE*','README*'])
for x in files:
 if (a.output/x.rfilename).stat().st_size!=x.size:raise RuntimeError('Model file size mismatch')
receipt={'model':MODEL,'revision':REVISION,'source':'https://huggingface.co/'+MODEL,'license':'Apache-2.0',
 'files':[{'file':x.rfilename,'bytes':x.size} for x in files],'downloaded_bytes':required,'seconds':time.monotonic()-started,
 'status':'PREPARED_NOT_INFERENCE_QUALIFIED','preparedAtEpoch':time.time()}
(a.output/'model-receipt.json').write_text(json.dumps(receipt,indent=2));print(json.dumps({'stage':'MODEL_READY','seconds':receipt['seconds']}),flush=True)
