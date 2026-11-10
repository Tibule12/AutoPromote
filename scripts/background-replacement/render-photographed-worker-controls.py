"""Review final saved masks through the existing shared compositor.

Only changed inputs need a new foreground solve. Other derived frames are
reused only after exact effective-alpha and source identity checks. This is
an internal source/worker-function check, not Studio admission or final export.
"""
import copy
import hashlib
import json
from pathlib import Path
import os
import time
from types import SimpleNamespace

import numpy as np
from PIL import Image,ImageDraw

from model_workers.common import sha,write_json
from python_media_worker.studio_source_background import load_evidence
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
from recovered_motion_inputs import PRIVATE,RECOVERED,original


def main():
    out=PRIVATE/'product-controls-compositor-r349-20261107';out.mkdir(mode=0o700,exist_ok=False)
    parent=PRIVATE/'spatial-motion-sequence-r333-20261107'
    model=Path('/dev/shm/autopromote-posterior-posterior-photo-unmix-r314-20261107')
    masks=Path('/dev/shm/autopromote-saved-sequence-reference-guard-r346-20261107/masks')
    manifest=json.loads((model/'manifest.json').read_text());evidence=load_evidence(model,manifest)
    checked=json.loads((PRIVATE/'saved-sequence-reference-guard-r346-20261107/receipt.json').read_text())
    previous=json.loads((parent/'receipt.json').read_text())
    effects=json.loads((PRIVATE/'native-source-click-footprint-r312-20261107/preview-model-project.autopromote.json').read_text())['snapshot']['subjectVfxScenes'][0]['scene']['effects']
    rows=[];started=time.monotonic()
    for index in range(48):
        assert sha(masks/f'matte_{index:04d}.png')==checked['rows'][index]['savedAlphaSha256']
        assert sha(RECOVERED/f'rgb/rgb_{index:04d}.png')==previous['rows'][index]['sourceSha256']
        values=np.array(Image.open(masks/f'matte_{index:04d}.png'));effective=values.copy();effective[992:]=0
        expected=np.array(Image.open(parent/f'alpha-{index:04d}.png'))
        same=np.array_equal(effective,expected)
        if same:
            for prefix in ['alpha','foreground','actual-composite']:
                os.link(parent/f'{prefix}-{index:04d}.png',out/f'{prefix}-{index:04d}.png')
        else:
            image=original(index);identity=hashlib.sha256(values.tobytes()).hexdigest()
            cache=SimpleNamespace(manifest=manifest,artifact_sha256=identity,observed_background=evidence,frame=lambda _:values)
            renderer=VfxFrameRenderer({'version':1,'source_sha256':manifest['source_sha256'],'matte_sha256':identity,'effects':copy.deepcopy(effects)},cache,lambda _:PRIVATE/'replacement.png');renderer.foreground_cache.root=None
            active=[e for e in effects if e['start']<=index/24<e['end']]
            f,a=renderer._prepare_foreground(image,Image.fromarray(values),active,1430,1000)
            assert np.array_equal(np.array(a),effective)
            renderer._prepare_foreground=lambda *unused,f=f,a=a:(f,a)
            result=renderer.render(image,index)
            f.save(out/f'foreground-{index:04d}.png');a.save(out/f'alpha-{index:04d}.png');result.save(out/f'actual-composite-{index:04d}.png')
            box=(280,170,1430,760);w,h=box[2]-box[0],box[3]-box[1]
            sheet=Image.new('RGB',(w*3,h+24))
            for n,(label,picture)in enumerate([('Actual source',image),('Prior derived review',Image.open(parent/f'actual-composite-{index:04d}.png')),('Actual saved controls / shared compositor',result)]):
                sheet.paste(picture.crop(box),(n*w,24));ImageDraw.Draw(sheet).text((n*w+3,4),label,fill='white')
            sheet.save(out/f'changed-controls-{index:04d}.jpg',quality=98)
        row={'frame':index,'sourceSha256':sha(RECOVERED/f'rgb/rgb_{index:04d}.png'),
             'sameEffectiveAlphaAndSourceReuse':same,'newSharedCompositorSolve':not same,
             'outputs':{p:sha(out/f'{p}-{index:04d}.png')for p in ['alpha','foreground','actual-composite']},
             'seconds':time.monotonic()-started}
        rows.append(row);print(json.dumps({'frame':index,'newSolve':not same,'seconds':row['seconds']}),flush=True)
        write_json(out/'receipt.json',{'rows':rows,'newNativeAdmission':False,'privateHistoricalComponentGuidance':True,
            'savedWorkerMasksChecked':True,'photographedWorkerImplementationSha256':checked['implementationSha256'],
            'sameExistingSceneExclusionPreservedForComparison':True,'fourMinuteProof':False,
            'browserSaveReopenExport':False,'paidCloudInference':False,'providerUpload':False,'visualReviewPending':True})


if __name__=='__main__':main()
