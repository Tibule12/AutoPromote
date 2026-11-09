"""CPU-only download of the official, pinned instrumental music model."""
import argparse,json,shutil,time
from pathlib import Path
from huggingface_hub import HfApi,snapshot_download
MODEL='ACE-Step/ACE-Step-v1-3.5B'
REVISION='82cd0d7b6322bd28cd4e830fe675ddb6180ce36c'
p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);p.add_argument('--deadline',type=float,required=True);a=p.parse_args()
if time.time()+900>=a.deadline:raise RuntimeError('Insufficient authorized preparation time')
info=HfApi(token=False).model_info(MODEL,revision=REVISION,files_metadata=True)
if info.gated or info.sha!=REVISION:raise RuntimeError('Pinned public official model required')
files=[f for f in info.siblings if f.rfilename.endswith(('.json','.safetensors')) or f.rfilename.startswith(('LICENSE','README'))]
required=sum(f.size or 0 for f in files);a.output.parent.mkdir(parents=True,exist_ok=True)
if shutil.disk_usage(a.output.parent).free<required+16*1024**3:raise RuntimeError('Insufficient storage while preserving existing models')
print(json.dumps({'stage':'MUSIC_MODEL_DOWNLOAD','bytes':required}),flush=True)
started=time.monotonic();snapshot_download(MODEL,revision=REVISION,local_dir=a.output,token=False,max_workers=4,allow_patterns=['*.json','*.safetensors','LICENSE*','README*'])
for f in files:
 if (a.output/f.rfilename).stat().st_size!=f.size:raise RuntimeError('Model file size mismatch')
receipt={'model':MODEL,'revision':REVISION,'license':'Apache-2.0','source':'https://huggingface.co/'+MODEL,'status':'PREPARED_NOT_INFERENCE_QUALIFIED','files':[{'file':f.rfilename,'bytes':f.size} for f in files],'seconds':time.monotonic()-started}
(a.output/'model-receipt.json').write_text(json.dumps(receipt,indent=2));print(json.dumps({'stage':'MUSIC_MODEL_READY','seconds':receipt['seconds']}),flush=True)
