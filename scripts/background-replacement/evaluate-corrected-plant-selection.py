"""Inspect source-pixel prop corrections with the existing pinned SAM2 model.

Private diagnostic only: no registered artifacts, project mutation or export.
"""
import argparse, copy, json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from model_workers.adapters.component_segmentation import ComponentVideoTracker

p=argparse.ArgumentParser();p.add_argument('out',type=Path);a=p.parse_args();a.out.mkdir(exist_ok=False)
root=Path('/tmp/autopromote-application-demo-YU8K0a/model-jobs/fd3f4307c8152d220474a78e6dd04fac41862d8329d0b5bbfc7d1b5dfbb8d1ed/f6d3ffa0-b7a4-43df-a224-d9080cdfaaae')
spec=json.loads((root/'spec.json').read_text());original=spec['request']['parameters']['components'][-1]
rgb=np.asarray(Image.open('/dev/shm/autopromote-native-motion-review-r31-20261104/source/0000.png'))
params=spec['request']['parameters'];params['components']=[copy.deepcopy(original)];params['shotPrompts']=[]
params['points']=[{'position':[.6,.6],'label':1}];params['initialBox']=[.5,.4,.8,.9]
model=None
for variant in ['original','corrected-leaf','corrected-tv']:
 c=copy.deepcopy(original)
 if variant!='original':
  # Existing negative click 13 visibly hits a real leaf at (150,980).
  c['points']=[point for i,point in enumerate(c['points']) if i!=13]
  c['points'].extend({'position':[x/1430,y/1000],'label':1} for x,y in [(150,980),(150,967),(115,915),(20,940)])
 if variant=='corrected-tv':
  c['points'].extend({'position':[x/1430,y/1000],'label':0} for x,y in [(180,925),(130,930),(175,892),(120,886),(90,878)])
 params['components']=[c]
 tracker=ComponentVideoTracker(spec,{'width':1430,'height':1000},Path('/home/tibule12/.cache/autopromote-model-runtime/sam21-small-pinned'),model=model)
 model=tracker.model;_,planes=tracker.frame(rgb,0);mask=planes[1]
 Image.fromarray(mask).save(a.out/f'{variant}-alpha.png')
 bg=np.full_like(rgb,135);comp=np.rint(rgb*(mask[...,None]/255)+bg*(1-mask[...,None]/255)).astype(np.uint8)
 canvas=Image.new('RGB',(1050,864));canvas.paste(Image.fromarray(comp).crop((0,720,350,1000)).resize((1050,840)),(0,24));d=ImageDraw.Draw(canvas);d.text((0,0),f'Actual SAM2 {variant}: source 224.0s; diagnostic grey background',fill='white');canvas.save(a.out/f'{variant}.jpg',quality=97)
 (a.out/f'{variant}-selection.json').write_text(json.dumps(c,indent=2));print(variant,flush=True)
