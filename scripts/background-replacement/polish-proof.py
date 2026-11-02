from pathlib import Path
import os,json,time
import numpy as np
from PIL import Image
from model_workers.adapters.temporal_alpha import polish_trimap,stabilize
from model_workers.common import sha
p=Path('reports/background-replacement-20261101/private/temporal-polish-proof');p.mkdir();masks=p/'masks';tri=p/'trimaps';masks.mkdir();tri.mkdir()
source=Path('/tmp/autopromote-application-demo-DmTyGn/model-jobs/d87518085d423fb431f94495c04af261e60833d1e5aa65fc4a0ba5431bc06b14/18476c51-af5d-4fc7-8534-eccf97db6428/outputs')
t=time.monotonic()
for index in range(72):
 name=f'matte_{index:04d}.png';os.link(source/'subject_masks'/name,masks/name);Image.fromarray(polish_trimap(np.array(Image.open(masks/name)),12)).save(tri/f'trimap_{index:04d}.png')
r=stabilize(source/'rgb',masks,tri,72,[36],repair_outliers=True);r['wallSeconds']=time.monotonic()-t;r['sourceAlphaManifestSha256']=sha(source/'subject_masks/manifest.json');(p/'proof.json').write_text(json.dumps(r,indent=2))
