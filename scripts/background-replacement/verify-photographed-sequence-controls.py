"""Actual saved-sequence correction integration; not native model admission.

The original native alpha and actual RGB are immutable. Retained independent
historical component masks are explicitly identified; this does not fabricate
the lost native segmentation dependency or browser save/export evidence.
"""
import copy
import json
from pathlib import Path
import shutil
import tarfile
import time

import cv2
import numpy as np
from PIL import Image

from model_workers.common import sha,write_json
from model_workers.adapters.photographed_opacity import refine_photographed_sequence
from model_workers.adapters.temporal_alpha import condition_trimap_clicks
from python_media_worker.studio_source_background import load_evidence
from recovered_motion_inputs import PRIVATE,RECOVERED,original


def main():
    out=PRIVATE/'saved-sequence-controls-r343-20261107';out.mkdir(mode=0o700,exist_ok=False)
    work=Path('/dev/shm/autopromote-saved-sequence-controls-r343-20261107');work.mkdir(mode=0o700,exist_ok=False)
    masks=work/'masks';masks.mkdir()
    parent=Path('/dev/shm/autopromote-posterior-posterior-photo-unmix-r314-20261107')
    manifest=json.loads((parent/'manifest.json').read_text());B,support=load_evidence(parent,manifest)
    directory=RECOVERED/'component_dependency';guide=json.loads((directory/'manifest.json').read_text())
    guide['_reference_rgb']=np.array(original(0))
    assert len(guide['components'])==len(manifest['components']) and manifest['frame_count']==48
    for component,selection in zip(guide['components'],manifest['components']):
        component['selection']=copy.deepcopy(selection)
    before=[]
    for index in range(48):
        name=f'matte_{index:04d}.png';before.append(sha(parent/name));shutil.copyfile(parent/name,masks/name)
    implementation=Path('model_workers/adapters/photographed_opacity.py')
    code=sha(implementation);started=time.monotonic();cv2.setNumThreads(2)
    diagnostic=refine_photographed_sequence(RECOVERED/'rgb',masks,(directory,guide),B,support,
        np.zeros(support.shape,bool),count=48)
    assert sha(implementation)==code,'Implementation changed during saved sequence verification'
    rows=[]
    for index in range(48):
        name=f'matte_{index:04d}.png';assert sha(parent/name)==before[index]
        rgb=np.array(original(index));parts=[]
        for component in guide['components']:
            file=directory/component['frames'][index]['file']
            assert sha(file)==component['frames'][index]['sha256']
            parts.append((component['selection'],np.array(Image.open(file))))
        after=np.array(Image.open(masks/name));again=condition_trimap_clicks(after,rgb,guide['_reference_rgb'],parts,index)
        assert np.array_equal(after,again),'Final saved mask violates authored source constraints'
        prior=np.array(Image.open(parent/name));outside=~support
        # Explicit corrective clicks can change unknown pixels by user intent;
        # the photometric operation itself cannot authorize those changes.
        prior_conditioned=condition_trimap_clicks(prior,rgb,guide['_reference_rgb'],parts,index)
        assert np.array_equal(after[outside],prior_conditioned[outside])
        rows.append({'frame':index,'sourceSha256':sha(RECOVERED/f'rgb/rgb_{index:04d}.png'),
            'parentAlphaSha256':before[index],'savedAlphaSha256':sha(masks/name),
            'authoredConstraintsExact':True,'unobservedPixelsExactExceptAuthoredIntent':True,
            'changedAlphaPixels':int(np.count_nonzero(after!=prior))})
    bundle=out/'actual-corrected-alpha-diagnostic.tar.gz'
    with tarfile.open(bundle,'w:gz')as archive:
        for index in range(48):archive.add(masks/f'matte_{index:04d}.png',arcname=f'matte_{index:04d}.png')
    write_json(out/'receipt.json',{'rows':rows,'diagnostic':diagnostic,'seconds':time.monotonic()-started,
        'implementationSha256':code,'bundleSha256':sha(bundle),'privateHistoricalComponentGuidance':True,
        'currentNativeSelectionMetadata':True,'originalRgbAndNativeAlphaPreserved':True,
        'nativeModelAdmission':False,'browserSaveReopenExport':False,'fourMinuteProof':False,
        'paidCloudInference':False,'providerUpload':False,'visualReviewPending':True})
    print(json.dumps({'frames':48,'savedSequenceControlsExact':True,'seconds':time.monotonic()-started}),flush=True)


if __name__=='__main__':main()
