"""Prepare pinned first/last-frame or structural-control Wan weights on CPU.

Retain existing models; download and verify one new transformer shard at a time,
then store its floating tensors as bf16. The source hash and conversion hash are
recorded. Existing pinned UMT5 and byte-identical Wan VAE are reused explicitly.
"""
import argparse
import hashlib
import json
import shutil
import time
from pathlib import Path

from huggingface_hub import HfApi, hf_hub_download

MODEL = 'Wan-AI/Wan2.1-FLF2V-14B-720P-diffusers'
REVISION = '17c30769b1e0b5dcaa1799b117bf20a9c31f59d7'
VACE_MODEL = 'Wan-AI/Wan2.1-VACE-14B-diffusers'
VACE_REVISION = 'db79b90c60bbb45ceec9e41b9d5a4df934538ac4'
RETAINED_MODEL = 'Wan-AI/Wan2.2-I2V-A14B-Diffusers'
RETAINED_REVISION = '596658fd9ca6b7b71d5057529bbf319ecbc61d74'


def sha(file):
    h = hashlib.sha256()
    with file.open('rb') as stream:
        while block := stream.read(8*1024*1024):
            h.update(block)
    return h.hexdigest()


def run(a):
    import torch
    from safetensors import safe_open
    from safetensors.torch import save_file
    torch.set_num_threads(2)
    vace=getattr(a,'model_profile','flf2v')=='vace14b'
    model,revision=(VACE_MODEL,VACE_REVISION) if vace else (MODEL,REVISION)
    if time.time()+2400 >= a.deadline:
        raise RuntimeError('Insufficient authorized preparation and inference window')
    if a.output.exists() and (a.output/'model-receipt.json').exists():
        raise FileExistsError('Prepared model already exists; verify/reuse it instead')
    retained=json.loads((a.retained/'model-receipt.json').read_text())
    if (retained['model'],retained['revision'])!=(RETAINED_MODEL,RETAINED_REVISION):
        raise RuntimeError('Pinned retained encoder model required')
    api=HfApi(token=False);info=api.model_info(model,revision=revision,files_metadata=True)
    if info.gated or info.sha!=revision or info.card_data.get('license')!='apache-2.0':
        raise RuntimeError('Pinned public Apache first/last-frame model required')
    files={f.rfilename:f for f in info.siblings}
    a.output.mkdir(parents=True,exist_ok=True)
    source=a.output/'verified-downloads';source.mkdir(exist_ok=True)
    # bf16 transformer (~33 GB), image encoder (~1.3 GB), one fp32 source shard,
    # and a safety margin fit without touching the retained /data model library.
    required=sum(f.size for n,f in files.items() if n.startswith('transformer/') and n.endswith('.safetensors'))/2
    largest=max(f.size for n,f in files.items() if n.startswith('transformer/') and n.endswith('.safetensors'))
    image_bytes=files['image_encoder/model.safetensors'].size if not vace else 0
    if shutil.disk_usage(a.output).free < required+largest+image_bytes+6*1024**3:
        raise RuntimeError('Insufficient free storage preserving existing models')
    records=[];started=time.monotonic()

    def download(name, destination):
        if time.time()+1800>=a.deadline:
            raise RuntimeError('Preparation cutoff reached; leave time for inference')
        file=files[name]
        local=Path(hf_hub_download(model,name,revision=revision,token=False,local_dir=destination))
        if local.stat().st_size!=file.size or (file.lfs and sha(local)!=file.lfs.sha256):
            raise RuntimeError('Official component hash/size mismatch: '+name)
        return local

    small=[name for name in files if name=='model_index.json' or name.startswith(('scheduler/','tokenizer/','image_processor/')) or
           name in ('transformer/config.json','transformer/diffusion_pytorch_model.safetensors.index.json','image_encoder/config.json','text_encoder/config.json','vae/config.json')]
    for name in small:
        local=download(name,a.output)
        records.append({'file':name,'sha256':sha(local),'bytes':local.stat().st_size})
    text_config=json.loads((a.output/'text_encoder/config.json').read_text())
    prior_config=json.loads((a.retained/'text_encoder/config.json').read_text())
    for field in ['model_type','architectures','d_model','d_ff','d_kv','num_layers','num_heads','vocab_size','feed_forward_proj']:
        if text_config[field]!=prior_config[field]:
            raise RuntimeError('Retained UMT5 architecture mismatch: '+field)
    prior_info=api.model_info(RETAINED_MODEL,revision=RETAINED_REVISION,files_metadata=True)
    reused=[]
    for file in prior_info.siblings:
        if file.rfilename.startswith('text_encoder/') and file.lfs:
            local=a.retained/file.rfilename
            if local.stat().st_size!=file.size or sha(local)!=file.lfs.sha256:
                raise RuntimeError('Retained pinned encoder hash mismatch')
            reused.append({'file':file.rfilename,'sha256':file.lfs.sha256,'bytes':file.size})
    vae_file=a.retained/'vae/diffusion_pytorch_model.safetensors'
    if sha(vae_file)!=files['vae/diffusion_pytorch_model.safetensors'].lfs.sha256:
        raise RuntimeError('Retained VAE is not byte-identical to FLF component')
    if not vace:
        image=download('image_encoder/model.safetensors',a.output)
        records.append({'file':'image_encoder/model.safetensors','sha256':sha(image),'bytes':image.stat().st_size})
        print(json.dumps({'event':'flf_image_encoder_ready','seconds':time.monotonic()-started}),flush=True)
    manifest_file=a.output/'conversion-manifest.json'
    converted=json.loads(manifest_file.read_text()) if manifest_file.exists() else []
    prior={r['file']:r for r in converted}
    for name in sorted(n for n in files if n.startswith('transformer/') and n.endswith('.safetensors')):
        target=a.output/name
        if name in prior and target.is_file() and sha(target)==prior[name]['sha256']:
            continue
        print(json.dumps({'event':'flf_shard_download','file':name,'sourceBytes':files[name].size}),flush=True)
        original=download(name,source)
        with safe_open(original,framework='pt',device='cpu') as weights:
            metadata=weights.metadata()
            tensors={key:weights.get_tensor(key).to(torch.bfloat16) if weights.get_tensor(key).is_floating_point() else weights.get_tensor(key) for key in weights.keys()}
        target.parent.mkdir(parents=True,exist_ok=True);temp=target.with_suffix('.partial')
        save_file(tensors,str(temp),metadata=metadata);del tensors
        temp.replace(target)
        row={'file':name,'sourceSha256':files[name].lfs.sha256,'sourceBytes':files[name].size,
             'sha256':sha(target),'bytes':target.stat().st_size,'conversion':'floating tensor fp32 to bf16; keys/shapes retained'}
        converted=[r for r in converted if r['file']!=name]+[row]
        manifest_file.write_text(json.dumps(converted,indent=2))
        original.unlink()  # Only this newly downloaded, verified conversion input.
        print(json.dumps({'event':'flf_shard_prepared','file':name,'seconds':time.monotonic()-started}),flush=True)
    index_file=a.output/'transformer/diffusion_pytorch_model.safetensors.index.json'
    index=json.loads(index_file.read_text());index.setdefault('metadata',{})['total_size']=sum(r['bytes'] for r in converted)
    index_file.write_text(json.dumps(index,indent=2))
    for row in records:
        if row['file']=='transformer/diffusion_pytorch_model.safetensors.index.json':
            row.update(sha256=sha(index_file),bytes=index_file.stat().st_size,conversion='Updated bf16 index metadata; original weight map retained')
    result={'model':model,'revision':revision,'modelProfile':'vace14b' if vace else 'flf2v','license':'Apache-2.0','source':'https://huggingface.co/'+model,
            'status':'PREPARED_PENDING_NVIDIA_QUALIFICATION','settings':{'transformerDtype':'bfloat16','vaeDtype':'float32',**({} if vace else {'imageEncoderDtype':'float32'})},
            'files':records,'convertedTransformer':converted,'reusedComponents':{'model':RETAINED_MODEL,'revision':RETAINED_REVISION,
                'textEncoder':{'path':str(a.retained/'text_encoder'),'files':reused,'validation':'Pinned retained UMT5 weights and matching architecture; bf16 encoder reused explicitly'},
                'vae':{'path':str(vae_file.parent),'sha256':sha(vae_file),'validation':'Byte-identical to the selected official video model VAE weights'}},
            'preparedAtEpoch':time.time(),'seconds':time.monotonic()-started}
    (a.output/'model-receipt.json').write_text(json.dumps(result,indent=2))
    print(json.dumps({'event':'flf_model_prepared','seconds':result['seconds']}),flush=True)


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);p.add_argument('--retained',type=Path,required=True)
    p.add_argument('--deadline',type=float,required=True);p.add_argument('--model-profile',choices=['flf2v','vace14b'],default='flf2v');run(p.parse_args())
