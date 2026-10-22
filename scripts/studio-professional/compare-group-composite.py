#!/usr/bin/env python3
"""Declared-frame occlusion geometry of the actual nested native magenta image.

This qualifies the visible masked/blended image footprint in the real mixed-layer movie.
It does not qualify motion/title glyph raster, full color or 3D rendering.
"""
import hashlib
import json
from pathlib import Path
import subprocess

import numpy as np
from PIL import Image
from scipy.ndimage import binary_erosion, distance_transform_edt

root = Path(__file__).resolve().parents[2]
folder = root / 'reports/studio-professional-group-composite-20261014/proof'
rows = []
for variant in ['composite']:
    case = folder / variant
    receipt = json.loads((case / 'render-receipt.json').read_text())
    live = json.loads((case / 'native-live.json').read_text())
    assert live['canonicalHash'] == receipt['projectHash'] and live['projectId'] == receipt['projectId']
    assert hashlib.sha256((case / 'final.mp4').read_bytes()).hexdigest() == receipt['outputSha256']
    request = json.loads((folder / f'{variant}-render-request.private.json').read_text())['options']['viralData']
    edit = json.loads((folder / f'{variant}-native-edit.json').read_text())
    assert request['composition_plan']['order'] == edit['order']
    expected_groups = []
    for group in edit['groups']:
        keys = [{k:v for k,v in key.items() if k != 'targetId'} for key in edit['masterKeys'] if key['targetId'] == group['id']]
        expected_groups.append({**group, **({'motion_keyframes': keys} if keys else {})})
    assert request['composition_plan']['groups'] == expected_groups
    for index, sample in enumerate(live['samples']):
        time = sample['time']
        assert time * 24 == round(time * 24) == sample['sampling']['frameIndex']
        assert sample['sampling']['mode'] == 'accurate-paused'
        assert sample['sampling']['sourceContentHash'] == hashlib.sha256((root / 'reports/studio-professional-masked-effects-20261013/proof/source-grid.mp4').read_bytes()).hexdigest()
        final = case / f'final-{index}.png'
        subprocess.run(['ffmpeg','-v','error','-threads','1','-i',str(case / 'final.mp4'),
                        '-vf',f'select=eq(n\\,{round(time*24)})','-frames:v','1','-y',str(final)],check=True)
        native = Image.open(case / f'live-{index}.png').convert('RGB')
        assert native.size == (720,1280), 'Native stage must use declared delivery geometry'
        images = [np.asarray(native), np.asarray(Image.open(final).convert('RGB'))]
        masks = [(a[...,0]>140)&(a[...,1]<90)&(a[...,2]>140) for a in images]
        assert min(m.sum() for m in masks) > 100, 'Visible original artwork is required'
        intersection = int((masks[0]&masks[1]).sum()); union = int((masks[0]|masks[1]).sum())
        edges = [m & ~binary_erosion(m) for m in masks]
        distances = np.concatenate([distance_transform_edt(~edges[1])[edges[0]], distance_transform_edt(~edges[0])[edges[1]]])
        p95 = float(np.percentile(distances,95)); iou = intersection/union
        solid=(distance_transform_edt(masks[0])>6)&(distance_transform_edt(masks[1])>6)
        assert solid.sum()>100, 'A declared six-pixel interior margin must retain original artwork'
        rmse=float(np.sqrt(np.mean((images[0][solid].astype(float)-images[1][solid].astype(float))**2)))
        rows.append({'variant':variant,'time':time,'nativePixels':int(masks[0].sum()),'finalPixels':int(masks[1].sum()),
                     'visibleImageIou':iou,'boundaryP95Pixels':p95,'interiorRgbRmse':rmse,'interiorPixels':int(solid.sum()),'passed':p95<=2 and iou>=.95 and rmse<=4})
result={'comparisons':rows,'boundaryP95TolerancePixels':2,'visibleImageIouMinimum':.95,
        'interiorRgbRmseTolerance':4,'interiorMarginPixels':6,
        'passed':all(r['passed'] for r in rows),'gpuJobs':0,
        'scope':'Masked/blended magenta artwork interiors use the existing S02 RGB RMSE 4.0 limit and a six-pixel boundary margin declared before color measurement. Four declared exact paused samples of one native image/two-motion stack with 16 nested group keys, eight animated channels and a custom X curve. The visible magenta classifier R>140,G<90,B>140 and existing 2px/0.95 limits are retained from the static group proof, declared before measurement. Original artwork geometry/occlusion and bounded masked/blended image-interior color only, no fitted spatial/time alignment. Full glyph/mask-alpha/raster/live sound/owned3D, broader curves/retiming/stacks and continuous parity remain unqualified.'}
(folder / 'paired-group-composite.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
assert result['passed'], 'Native/final visible image occlusion exceeds declared bounds'
