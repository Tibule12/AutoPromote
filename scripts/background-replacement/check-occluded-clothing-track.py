"""Actual SAM2 corrective-person run, retaining the failed source and inputs.

Foreground clicks are on photographed clothing, not on original-TV gaps or
wire. They are submitted to the existing tracker on their source frames and
propagated by its video memory; no frame is a held source still or roto mask.
This diagnostic is not an admitted Studio model artifact.
"""
import copy
import json
import time
from pathlib import Path

import numpy as np
from PIL import Image

from model_workers.common import sha,write_json
from model_workers.adapters.component_segmentation import ComponentVideoTracker
from recovered_motion_inputs import PRIVATE,RECOVERED,original


def main():
    out=PRIVATE/'occluded-clothing-track-r352-20261107';out.mkdir(mode=0o700,exist_ok=False)
    (out/'implementation.py').write_bytes(Path(__file__).read_bytes())
    m=json.loads(Path('/dev/shm/autopromote-posterior-posterior-photo-unmix-r314-20261107/manifest.json').read_text())
    primary=copy.deepcopy(m['components'][0])
    additions=[{'label':1,'position':[x/1430,y/1000]}for x,y in [(410,820),(450,775),(520,820)]]
    primary['points']+=additions
    # Source-frame23 has the same visible clothing under the fixed arm. This
    # is a real second correction, not an unchanged old click stamped forever.
    correction=next((c for c in primary['shotPrompts']if c['frameIndex']==23),None)
    if correction is None:primary['shotPrompts'].append({'frameIndex':23,'points':copy.deepcopy(additions)})
    else:correction['points']+=copy.deepcopy(additions)
    registry=json.loads(Path('config/model-runtime/registry.v1.json').read_text())
    model=next(x for x in registry['models']if x['id']=='sam21-multiobject-cpu-v2')
    params={'subjectId':primary['id'],'initialBox':primary['box'],'points':primary['points'],'shotPrompts':primary['shotPrompts'],'components':[]}
    spec={'model':model,'request':{'parameters':params}}
    write_json(out/'input.json',{'sourceRangeSeconds':[224,226],'modelId':model['id'],
        'weights':model['weights'],'parameters':params,'handAuthoredAlphaContour':False,
        'nativeAdmission':False,'paidCloudInference':False,'providerUpload':False})
    tracker=ComponentVideoTracker(spec,{'width':1430,'height':1000},Path('/home/tibule12/.cache/autopromote-model-runtime/sam21-small-pinned'))
    rows=[];started=time.monotonic()
    for index in range(48):
        rgb=np.array(original(index));union,parts=tracker.frame(rgb,index)
        file=out/f'primary-{index:04d}.png';Image.fromarray(parts[0]).save(file)
        row={'frame':index,'sourceSha256':sha(RECOVERED/f'rgb/rgb_{index:04d}.png'),'maskSha256':sha(file),'seconds':time.monotonic()-started}
        rows.append(row);write_json(out/'receipt.json',{'rows':rows,'actualNeuralFrames':len(rows),
            'modelId':model['id'],'weightsUnchanged':True,'nativeAdmission':False,
            'sourceFramesHeld':False,'fourMinuteProof':False,'visualReviewPending':True,
            'paidCloudInference':False,'providerUpload':False})
        print(json.dumps(row),flush=True)


if __name__=='__main__':main()
