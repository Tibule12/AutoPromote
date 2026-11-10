"""Private identical-input source-classifier ablation for the retained spring.

Compare actual current code with a separately retained candidate. Inputs are
the real retained alpha and historical independent component evidence; this is
not a fresh native pipeline result or an admitted model artifact.
"""
import copy
import hashlib
import json
from pathlib import Path
import time
from types import SimpleNamespace

import cv2
import numpy as np
from PIL import Image, ImageDraw

from model_workers.adapters import source_edge_alpha as edge
from model_workers.common import sha, write_json
from python_media_worker.studio_source_background import load_evidence
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
from recovered_motion_inputs import PRIVATE, RECOVERED, original, load_components


def main():
    out = PRIVATE/'fixed-seed-release-r320-20261107'
    candidate_file = out/'candidate-source-edge-alpha.py'
    namespace = dict(vars(edge))
    exec(compile(candidate_file.read_text(),str(candidate_file),'exec'),namespace)
    candidate = namespace['classify_corrected_fixed_object']
    matte = Path('/dev/shm/autopromote-posterior-posterior-photo-unmix-r314-20261107')
    manifest = json.loads((matte/'manifest.json').read_text())
    evidence = load_evidence(matte, manifest)
    effects = json.loads((PRIVATE/'native-source-click-footprint-r312-20261107/preview-model-project.autopromote.json').read_text())['snapshot']['subjectVfxScenes'][0]['scene']['effects']
    reference = np.array(original(0))
    component = manifest['components'][3]
    box = [round(v*s) for v,s in zip(component['box'],[1430,1000,1430,1000])]
    cv2.setNumThreads(2)
    started = time.monotonic()
    rows = []
    for index in [6,10,47]:
        image = original(index)
        rgb = np.array(image)
        planes = load_components(index)
        protect = cv2.dilate((planes[0]>=24).astype(np.uint8),np.ones((7,7),np.uint8))
        for number,plane in enumerate(planes[1:],1):
            if number!=3:
                protect |= cv2.dilate((plane>=128).astype(np.uint8),np.ones((7,7),np.uint8))
        raw = np.array(Image.open(matte/f'matte_{index:04d}.png'))
        outputs = []
        alphas = []
        for name,algorithm in [('before',edge.classify_corrected_fixed_object),('after',candidate)]:
            alpha = algorithm(rgb,raw,reference,component['points'],box,planes[3],protect)
            if alpha is None:
                raise ValueError('Selected actual correction did not run')
            Image.fromarray(alpha).save(out/f'{name}-alpha-{index:04d}.png')
            alphas.append(alpha)
            identity = hashlib.sha256(alpha.tobytes()).hexdigest()
            cache = SimpleNamespace(manifest=manifest,artifact_sha256=identity,
                observed_background=evidence,frame=lambda _:alpha)
            renderer = VfxFrameRenderer({'version':1,'source_sha256':manifest['source_sha256'],
                'matte_sha256':identity,'effects':copy.deepcopy(effects)},cache,lambda _:PRIVATE/'replacement.png')
            renderer.foreground_cache.root = None
            result = renderer.render(image,index)
            result.save(out/f'{name}-composite-{index:04d}.png')
            outputs.append(result)
        for name,region in [('rig',(100,690,950,925)),('lower',(430,810,1250,1000)),('spring',(230,730,430,800))]:
            w,h=region[2]-region[0],region[3]-region[1]
            sheet=Image.new('RGB',(w*3,h+24))
            for n,(label,picture) in enumerate(zip(['Actual source','Same input / current classifier','Same input / seed support candidate'],[image,*outputs])):
                sheet.paste(picture.crop(region),(w*n,24));ImageDraw.Draw(sheet).text((w*n+3,4),label,fill='white')
            if name=='spring':sheet=sheet.resize((1800,282))
            sheet.save(out/f'{name}-{index:04d}.jpg',quality=98)
        rows.append({'frame':index,'sourceSha256':sha(RECOVERED/f'rgb/rgb_{index:04d}.png'),
            'sameSourceAndAlphaAndGuidance':True,'changedAlphaPixels':int(np.count_nonzero(alphas[0]!=alphas[1])),
            'protectedAlphaPreserved':bool(np.array_equal(alphas[1][protect>0],raw[protect>0])),
            'orangeAlphaBeforeAfter':[[int(v[757,352]),int(v[786,370])]for v in alphas],
            'seconds':time.monotonic()-started})
        print(json.dumps(rows[-1]),flush=True)
        write_json(out/'receipt.json',{'rows':rows,'beforeCodeSha256':sha(out/'before-source-edge-alpha.py'),
            'afterCodeSha256':sha(candidate_file),'privateHistoricalGuidance':True,'registeredImplementationChanged':False,
            'nativeAdmission':False,'visualReviewPending':True,'fourMinuteProof':False,
            'paidCloudInference':False,'providerUpload':False})


if __name__=='__main__':
    main()
