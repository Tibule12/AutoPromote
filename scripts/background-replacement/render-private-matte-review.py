"""Render a labelled, unadmitted diagnostic derivative with the shared compositor.

This never creates model-job IDs or changes Studio admission, limits or projects.
"""
import argparse
import copy
import json
import os
from pathlib import Path

import numpy as np
from PIL import Image

from model_workers.common import sha, write_json
from python_media_worker.studio_subject_matte import CachedSubjectMatte, mask_geometry
from python_media_worker.studio_vfx_plan import render_vfx


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('review',type=Path)
    args=parser.parse_args()
    root=Path('reports/background-replacement-20261101/private')
    source=Path('/dev/shm/autopromote-foreground-recovery-r95-20261105/source.mkv')
    parent=Path('/dev/shm/autopromote-foreground-alpha-r95-20261105/alpha-work/outputs/subject_masks')
    verified=CachedSubjectMatte(parent,source)
    receipt=json.loads((args.review/'receipt.json').read_text())
    if receipt['sourceSha256']!=sha(source) or receipt['actualFrames']!=48:
        raise ValueError('Review is not for the current exact source and clock')
    target=args.review/'private-corrected-alpha'
    target.mkdir(exist_ok=False)
    data=copy.deepcopy(verified.manifest)
    data['upstream_source_model']={k:data.pop(k) for k in ['model','model_version','model_revision','model_weights_sha256']}
    data['model']='PRIVATE_SOURCE_CAMERA_CORRECTION_NOT_ADMITTED'
    data['model_version']=args.review.name
    data['alpha_semantics']='Current per-frame neural subject alpha plus explicitly reviewed prop alpha tracked with current photographs; source-camera authoring, not a new admitted neural inference.'
    data['matting_stage']={'mode':'PRIVATE_DIAGNOSTIC_DERIVATIVE','modelInferencePerformed':False,
        'parent_manifest_sha256':sha(parent/'manifest.json'),'correction_receipt_sha256':sha(args.review/'receipt.json')}
    data['quality']='INTERNAL, UNAPPROVED, NOT NATIVE ADMISSION OR FOUR-MINUTE PROOF'
    if data.get('quality_warnings'):raise ValueError('Upstream warnings are unresolved')
    for index,row in enumerate(data['frames']):
        original=args.review/f'alpha-{index:04d}.png'
        with Image.open(original) as image:
            if image.mode!='L' or image.size!=(data['width'],data['height']):raise ValueError('Wrong alpha geometry')
            geometry=mask_geometry(np.array(image))
        destination=target/f'matte_{index:04d}.png'
        os.link(original,destination)
        row.update(file=destination.name,sha256=sha(destination),**geometry)
    write_json(target/'manifest.json',data)
    plan=copy.deepcopy(receipt['canonicalPlan'])
    plan['matte_sha256']=sha(target/'manifest.json')
    write_json(args.review/'private-render-plan.json',plan)
    (args.review/'render-review-implementation.py').write_bytes(Path(__file__).read_bytes())
    result=render_vfx(source,target,plan,args.review/'internal-moving-preview.mp4',encoder='cpu',
        asset_resolver=lambda _:root/'replacement.png',
        audio_source=Path('/home/tibule12/Videos/cam-combiner-5050c706-a6cb-48bc-ac43-8fa54f21bc1a.mp4'),audio_start=0)
    write_json(args.review/'canonical-render-receipt.json',result)
    print(json.dumps({'frames':result['frames'],'sha256':result['output_sha256'],
        'nativeAdmission':False,'fourMinuteProof':False,'visualPass':False}),flush=True)


if __name__=='__main__':
    main()
