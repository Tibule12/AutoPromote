"""Exercise the product alpha function against all48 actual reviewed inputs.

This is actual local worker-function evidence, not native admission. Compare
its raw result after the SAME existing authored strip exclusion; that existing
scene operation is not smuggled into model masks or applied to other scenes.
"""
import json,time
from pathlib import Path

import cv2,numpy as np
from PIL import Image

from model_workers.common import sha,write_json
from model_workers.adapters.photographed_opacity import refine_photographed_opacity
from python_media_worker.studio_source_background import load_evidence
from recovered_motion_inputs import PRIVATE,RECOVERED,original,load_components


def main():
    out=PRIVATE/'product-photographed-opacity-r340-20261107';out.mkdir(mode=0o700,exist_ok=False)
    matte=Path('/dev/shm/autopromote-posterior-posterior-photo-unmix-r314-20261107');m=json.loads((matte/'manifest.json').read_text());B,observed=load_evidence(matte,m)
    parent=PRIVATE/'spatial-motion-sequence-r333-20261107';review=json.loads((parent/'actual-encoded-review/receipt.json').read_text())
    assert len(review['rows'])==48
    started=time.monotonic();rows=[];cv2.setNumThreads(2)
    for i in range(48):
        raw=np.array(Image.open(matte/f'matte_{i:04d}.png'));C=np.array(original(i));parts=load_components(i)
        result,diagnostic=refine_photographed_opacity(C,raw,B,observed,parts[0],parts[1:3])
        before_effect=result.copy();result[992:]=0
        expected=np.array(Image.open(parent/f'alpha-{i:04d}.png'))
        difference=np.abs(result.astype(np.int16)-expected.astype(np.int16))
        row={'frame':i,'sourceSha256':sha(RECOVERED/f'rgb/rgb_{i:04d}.png'),
            'exactAgainstReviewedDerivedAlphaAfterSameSceneExclusion':bool(np.array_equal(result,expected)),
            'maximumAlphaDifference':int(difference.max()),'differingPixels':int(np.count_nonzero(difference)),
            'unobservedAlphaExact':bool(np.array_equal(before_effect[~observed],raw[~observed])),
            'addedForegroundPixels':int(np.count_nonzero(before_effect>raw)),
            'diagnostic':diagnostic,'seconds':time.monotonic()-started}
        rows.append(row);print(json.dumps({k:v for k,v in row.items()if k!='diagnostic'}),flush=True)
        write_json(out/'receipt.json',{'rows':rows,'registeredAlgorithmVersion':'2.5.15',
            'newLearnedWeights':False,'all48DecodedComparisonMovieSha256':review['movieSha256'],
            'sourceCodeSha256':sha(Path('model_workers/adapters/photographed_opacity.py')),
            'nativeProjectFlow':False,'nativeAdmission':False,'fourMinuteProof':False,
            'privateHistoricalComponentGuidance':True,'visualReviewPending':True,
            'paidCloudInference':False,'providerUpload':False})


if __name__=='__main__':main()
