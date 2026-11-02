"""Actual local CPU proof; same adapter as the integrated worker, no mock inference."""
import argparse,json,time
from pathlib import Path
from model_workers.common import probe,write_json,sha
from model_workers.adapters.component_segmentation import segment
p=argparse.ArgumentParser();p.add_argument('selection');p.add_argument('source');p.add_argument('output');a=p.parse_args()
out=Path(a.output);out.mkdir(parents=True,exist_ok=False)
registry=json.load(open('config/model-runtime/registry.v1.json'))
spec={'model':next(m for m in registry['models'] if m['id']=='sam21-multiobject-cpu-v2'),'request':json.load(open(a.selection))}
t=time.monotonic();result=segment(spec,Path(a.source),probe(a.source),Path('/home/tibule12/.cache/autopromote-model-runtime/sam21-small-pinned'),out)
write_json(out/'proof.json',{'result':result,'source':sha(a.source),'wallSeconds':time.monotonic()-t,'execution':'actual local CPU; CLI proof is not a native Studio qualification'})
