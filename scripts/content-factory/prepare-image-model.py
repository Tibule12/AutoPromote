"""Download only official, public model files. No credentials or gated mirrors."""
import json,time
from pathlib import Path
from huggingface_hub import HfApi,snapshot_download
model="stabilityai/stable-diffusion-xl-base-1.0"
info=HfApi(token=False).model_info(model)
if info.gated:raise RuntimeError("Model requires separate access authorization")
out=Path("/work/models/sdxl")
snapshot_download(model,revision=info.sha,local_dir=out,token=False,
 allow_patterns=["model_index.json","README.md","LICENSE*","*/config.json","*/scheduler_config.json","tokenizer/*","tokenizer_2/*","*/*.fp16.safetensors"])
(out/"model-receipt.json").write_text(json.dumps({"model":model,"revision":info.sha,"source":"https://huggingface.co/"+model,"license":"CreativeML Open RAIL++-M","preparedAtEpoch":time.time()},indent=2))
print(json.dumps({"event":"image_model_prepared","revision":info.sha}),flush=True)
