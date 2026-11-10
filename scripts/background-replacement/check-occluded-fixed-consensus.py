"""Private fixed-object opacity consensus, excluding real moving occluders.

The source RGB remains current. This tests whether requiring identical RGB for
fixed ALPHA wrongly excludes gaps in a stationary rig over a moving TV image.
No inference, native artifact admission, or full-video claim is made.
"""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import time
from types import SimpleNamespace

import cv2
import numpy as np
from PIL import Image, ImageDraw

from model_workers.common import sha, write_json
from model_workers.adapters.temporal_alpha import source_click_footprint
from python_media_worker.studio_source_background import load_evidence
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
from recovered_motion_inputs import PRIVATE, RECOVERED, original, load_components


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('out', type=Path)
    parser.add_argument('--indices', default='6,10,47')
    args = parser.parse_args()
    args.out.mkdir(mode=0o700, exist_ok=False)
    (args.out/'implementation.py').write_bytes(Path(__file__).read_bytes())
    matte = Path('/dev/shm/autopromote-posterior-posterior-photo-unmix-r314-20261107')
    manifest = json.loads((matte/'manifest.json').read_text())
    assert manifest['frame_count'] == 48 and manifest['shot_cuts'] == []
    evidence = load_evidence(matte, manifest)
    doc = json.loads((PRIVATE/'native-source-click-footprint-r312-20261107/preview-model-project.autopromote.json').read_text())
    effects = doc['snapshot']['subjectVfxScenes'][0]['scene']['effects']
    planes = []
    allowed = []
    moving = []
    started = time.monotonic()
    cv2.setNumThreads(2)
    for i in range(48):
        row = manifest['frames'][i]
        assert sha(matte/row['file']) == row['sha256']
        planes.append(np.array(Image.open(matte/row['file'])))
        components = load_components(i)
        person = np.maximum.reduce(components[:3])
        moving.append(cv2.dilate((person >= 24).astype(np.uint8), np.ones((7, 7), np.uint8)) > 0)
        fixed = np.maximum.reduce(components[3:])
        allowed.append(fixed >= 24)
    values = np.stack(planes).astype(np.float32)
    moving = np.stack(moving)
    fixed_scope = np.stack(allowed)
    values[moving | ~fixed_scope] = np.nan
    observations = np.isfinite(values).sum(0)
    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter('ignore', RuntimeWarning)
        median = np.nanmedian(values, axis=0)
    median = np.nan_to_num(median)
    Image.fromarray(np.rint(median).astype(np.uint8)).save(args.out/'unoccluded-median-alpha.png')
    Image.fromarray(np.minimum(observations, 48).astype(np.uint8)*5).save(args.out/'observation-count.png')
    reference = np.array(original(0))
    rows = []
    for index in map(int, args.indices.split(',')):
        image = original(index)
        rgb = np.array(image)
        prior = planes[index]
        use = fixed_scope[index] & ~moving[index] & (observations >= 24)
        candidate = np.rint(median).astype(np.uint8)
        alpha = np.where(use, candidate, prior).astype(np.uint8)
        # Retain explicitly clicked foreground/background in each fixed object
        # where the original click still describes the current source pixel.
        for component in manifest['components'][3:]:
            assert not component['propagate']
            for point in component['points']:
                x = min(1429, round(point['position'][0]*1430))
                y = min(999, round(point['position'][1]*1000))
                if np.max(abs(rgb[y,x].astype(np.int16)-reference[y,x].astype(np.int16))) > 12:
                    continue
                x0,y0,x1,y1,footprint = source_click_footprint(reference,x,y,1,point['label']==1)
                region = alpha[y0:y1,x0:x1]
                selected = footprint & ~moving[index,y0:y1,x0:x1]
                region[selected] = 255 if point['label'] else 0
        identity = hashlib.sha256(alpha.tobytes()).hexdigest()
        cache = SimpleNamespace(manifest=manifest,artifact_sha256=identity,
            observed_background=evidence,frame=lambda _:alpha)
        renderer = VfxFrameRenderer({'version':1,'source_sha256':manifest['source_sha256'],
            'matte_sha256':identity,'effects':copy.deepcopy(effects)}, cache, lambda _:PRIVATE/'replacement.png')
        renderer.foreground_cache.root = None
        result = renderer.render(image,index)
        result.save(args.out/f'actual-composite-{index:04d}.png')
        Image.fromarray(alpha).save(args.out/f'alpha-{index:04d}.png')
        old = Image.open(PRIVATE/f'native-source-click-footprint-r312-20261107/actual-native-frame-review/actual-preview-{index:04d}.png')
        for name,box in [('rig',(100,690,950,925)),('plant',(0,760,210,1000)),('lower',(430,810,1250,1000))]:
            w,h=box[2]-box[0],box[3]-box[1]
            sheet=Image.new('RGB',(w*3,h+24))
            for n,(label,picture) in enumerate([('Actual source',image),('Current native',old),('Unoccluded fixed alpha median',result)]):
                sheet.paste(picture.crop(box),(n*w,24));ImageDraw.Draw(sheet).text((n*w+3,4),label,fill='white')
            sheet.save(args.out/f'{name}-{index:04d}.jpg',quality=98)
        rows.append({'frame':index,'changedPixels':int(np.count_nonzero(alpha!=prior)),
            'movingOccludersPreserved':bool(np.array_equal(alpha[moving[index]],prior[moving[index]])),
            'outsideFixedObjectsPreserved':bool(np.array_equal(alpha[~fixed_scope[index]],prior[~fixed_scope[index]])),
            'sourceSha256':sha(RECOVERED/f'rgb/rgb_{index:04d}.png'),'seconds':time.monotonic()-started})
        print(json.dumps(rows[-1]),flush=True)
        write_json(args.out/'receipt.json',{'rows':rows,'minimumUnoccludedObservations':24,
            'nativeAdmission':False,'registeredImplementationChanged':False,'newWeights':False,
            'visualReviewPending':True,'fourMinuteProof':False,'sourceRgbHeld':False,
            'privateComponentGuidance':'recovered-r180 (historical; not new r312 segmentation dependency)',
            'paidCloudInference':False,'providerUpload':False})


if __name__ == '__main__':
    main()
