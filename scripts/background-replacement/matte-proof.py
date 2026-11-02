import argparse,json,time
from pathlib import Path
from model_workers.common import probe,write_json,sha
from model_workers.adapters.cpu_matting import refine
from python_media_worker.studio_subject_matte import CachedSubjectMatte
p=argparse.ArgumentParser();p.add_argument('selection');p.add_argument('source');p.add_argument('segmentation');p.add_argument('output');a=p.parse_args()
out=Path(a.output);out.mkdir(parents=True,exist_ok=False)
registry=json.load(open('config/model-runtime/registry.v1.json'));request=json.load(open(a.selection));request['parameters']['refinement']={'maskArtifactHash':sha(Path(a.segmentation)/'subject_masks_manifest.json'),'radius':24,'holdouts':[]}
spec={'model':next(m for m in registry['models'] if m['id']=='vitmatte-small-temporal-cpu-v2'),'request':request}
cache=CachedSubjectMatte(Path(a.segmentation)/'subject_masks',Path(a.source));t=time.monotonic()
result=refine(spec,Path(a.source),probe(a.source),Path('/home/tibule12/.cache/autopromote-model-runtime/vitmatte-small-pinned'),out,cache,{'artifactHash':request['parameters']['refinement']['maskArtifactHash']})
write_json(out/'proof.json',{'result':result,'wallSeconds':time.monotonic()-t,'execution':'actual local CPU alpha; CLI is not a native Studio qualification'})
