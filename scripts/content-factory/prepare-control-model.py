"""CPU-only official VACE preparation; retain all existing models untouched."""
import argparse,hashlib,json,shutil,time
from pathlib import Path
from huggingface_hub import HfApi,snapshot_download
MODEL='Wan-AI/Wan2.1-VACE-1.3B-diffusers'
REVISION='ec4d2cb062b548996b179d493fdd05340de702a1'
p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);p.add_argument('--source-text',type=Path,required=True);p.add_argument('--deadline',type=float,required=True);a=p.parse_args()
if time.time()+1500>=a.deadline:raise RuntimeError('Insufficient authorized preparation/qualification window')
api=HfApi(token=False);info=api.model_info(MODEL,revision=REVISION,files_metadata=True)
if info.gated or info.sha!=REVISION or info.card_data.get('license')!='apache-2.0':raise RuntimeError('Pinned public Apache model required')
parts=['model_index.json','scheduler/','tokenizer/','vae/','transformer/']
files=[f for f in info.siblings if any(f.rfilename==part or f.rfilename.startswith(part) for part in parts)]
text=[f for f in info.siblings if f.rfilename.startswith('text_encoder/') and f.lfs]
def sha(file):
 h=hashlib.sha256()
 with file.open('rb') as stream:
  while chunk:=stream.read(8*1024*1024):h.update(chunk)
 return h.hexdigest()
for file in text:
 local=a.source_text/Path(file.rfilename).name
 if local.stat().st_size!=file.size or sha(local)!=file.lfs.sha256:raise RuntimeError('Retained text encoder is not byte-identical to official VACE component')
required=sum(f.size or 0 for f in files);a.output.parent.mkdir(parents=True,exist_ok=True)
if shutil.disk_usage(a.output.parent).free<required+10*1024**3:raise RuntimeError('Insufficient storage preserving existing models')
print(json.dumps({'event':'control_model_download','model':MODEL,'revision':REVISION,'bytes':required,'reusedTextEncoderBytes':sum(f.size for f in text)}),flush=True)
started=time.monotonic()
snapshot_download(MODEL,revision=REVISION,local_dir=a.output,token=False,max_workers=4,
 allow_patterns=['model_index.json','scheduler/*','tokenizer/*','vae/*','transformer/*','text_encoder/config.json','text_encoder/model.safetensors.index.json','README*','LICENSE*'])
for file in files:
 local=a.output/file.rfilename
 if local.stat().st_size!=file.size or (file.lfs and sha(local)!=file.lfs.sha256):raise RuntimeError('Downloaded control component hash/size mismatch')
receipt={'model':MODEL,'revision':REVISION,'source':'https://huggingface.co/'+MODEL,'license':'Apache-2.0','status':'PREPARED_NOT_INFERENCE_QUALIFIED',
 'files':[{'file':f.rfilename,'bytes':f.size,'sha256':f.lfs.sha256 if f.lfs else None} for f in files],
 'reusedTextEncoder':{'path':str(a.source_text),'validation':'All official VACE text-encoder tensor SHA values match retained bytes','files':[{'file':f.rfilename,'sha256':f.lfs.sha256} for f in text]},
 'seconds':time.monotonic()-started,'preparedAtEpoch':time.time()}
(a.output/'model-receipt.json').write_text(json.dumps(receipt,indent=2));print(json.dumps({'event':'control_model_prepared','seconds':receipt['seconds']}),flush=True)
