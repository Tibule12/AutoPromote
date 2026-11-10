"""Verified persistent diagnostic inputs after RAM scratch loss.

This binds restored source pixels and retained private paired estimates. It does
not manufacture a native model artifact or bypass model admission in Studio.
"""
import copy
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image
from model_workers.common import sha
from python_media_worker.studio_vfx_plan import VfxFrameRenderer

PRIVATE=Path('reports/background-replacement-20261101/private')
RECOVERED=PRIVATE/'recovered-gesture-r180-20261105'
PAIR=PRIVATE/'coupled-photo-motion-r143-20261105'


class PrivatePairedCache:
    def __init__(self):
        recovery=json.loads((RECOVERED/'receipt.json').read_text())
        if not recovery['allExactRecordedR83PngMatch'] or len(recovery['rows'])!=48:
            raise ValueError('Recovered source is not the previous actual source')
        for row in recovery['rows']:
            if sha(RECOVERED/f"rgb/rgb_{row['frame']:04d}.png")!=row['recordedR83Sha256']:
                raise ValueError('Recovered source RGB bytes changed')
        self.manifest={'width':1430,'height':1000,'fps':24,'frame_count':48,
            'source_sha256':recovery['sourceSha256'],'privatePairedEstimateNotNativeArtifact':True}
        hashes=[sha(PAIR/f'alpha-{i:04d}.png')+sha(PAIR/f'foreground-{i:04d}.png')for i in range(48)]
        self.artifact_sha256=hashlib.sha256(''.join(hashes).encode()).hexdigest()

    def frame(self,index):
        return np.array(Image.open(PAIR/f'alpha-{index:04d}.png').convert('L'))


def renderer():
    cache=PrivatePairedCache()
    scene=json.loads((PRIVATE/'long-podcast-r7/scene-1.json').read_text())
    effects=[copy.deepcopy(e)for e in scene['effects']if e['type']in {'background_replace','foreground_grade'}]
    for e in effects:e['end']=2
    plan={'version':1,'source_sha256':cache.manifest['source_sha256'],
        'matte_sha256':cache.artifact_sha256,'effects':effects}
    result=VfxFrameRenderer(plan,cache,lambda _:PRIVATE/'replacement.png')
    result.foreground_cache.root=None
    return result


def original(index):
    return Image.open(RECOVERED/f'rgb/rgb_{index:04d}.png').convert('RGB')


def pair(index):
    return Image.open(PAIR/f'foreground-{index:04d}.png').convert('RGB'),Image.open(PAIR/f'alpha-{index:04d}.png').convert('L')


def load_components(index):
    manifest=json.loads((RECOVERED/'component_dependency/manifest.json').read_text())
    output=[]
    for component in manifest['components']:
        row=component['frames'][index];file=RECOVERED/'component_dependency'/row['file']
        if sha(file)!=row['sha256']:raise ValueError('Restored component bytes changed')
        output.append(np.array(Image.open(file).convert('L')))
    return output
