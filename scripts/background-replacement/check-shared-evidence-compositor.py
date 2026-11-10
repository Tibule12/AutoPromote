"""Internal actual-source check of the shared compositor; no native admission."""
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import resource
import socket
import time

import cv2
import numpy as np
from PIL import Image, ImageDraw

from model_workers.common import sha, write_json
from python_media_worker.studio_source_background import FILES, load_evidence
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
from recovered_motion_inputs import PrivatePairedCache, PRIVATE, RECOVERED, PAIR, original


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('out',type=Path)
    p.add_argument('--parent',type=Path,default=PRIVATE/'shared-moving-policy-r217-20261106')
    p.add_argument('--all-frames',action='store_true')
    p.add_argument('--indices',default='7,10,15,17,23,35,39')
    a=p.parse_args();a.out.mkdir(exist_ok=False)
    (a.out/'implementation.py').write_bytes(Path(__file__).read_bytes())
    resource.setrlimit(resource.RLIMIT_CPU,(900,900));cv2.setNumThreads(2)
    socket.socket.connect=lambda *args,**kw:(_ for _ in ()).throw(RuntimeError('Private composition networking disabled'))
    inputs={'rgb':PAIR/'actual-photographed-reference.png','support':PAIR/'actual-photographed-support.png'}
    for key,name in FILES.items():os.link(inputs[key],a.out/name)
    cache=PrivatePairedCache()
    cache.manifest['shot_cuts']=[]
    cache.manifest['observed_background']={'version':1,'source_sha256':cache.manifest['source_sha256'],
        'method':'separated_unselected_source_rgb_v1',
        'files':{key:{'file':name,'sha256':sha(a.out/name)}for key,name in FILES.items()}}
    cache.observed_background=load_evidence(a.out,cache.manifest)
    cache.frame=lambda index:np.array(Image.open(a.parent/f'alpha-{index:04d}.png'))
    cache.artifact_sha256=hashlib.sha256(json.dumps(cache.manifest,sort_keys=True).encode()+
        ''.join(sha(a.parent/f'alpha-{i:04d}.png')for i in range(48)).encode()).hexdigest()
    effects=copy.deepcopy(json.loads((PRIVATE/'long-podcast-r7/scene-1.json').read_text())['effects'])
    for effect in effects:effect['end']=2
    plan={'version':1,'source_sha256':cache.manifest['source_sha256'],'matte_sha256':cache.artifact_sha256,'effects':effects}
    write_json(a.out/'private-cache-description.json',cache.manifest)
    write_json(a.out/'actual-plan.json',plan)
    render=VfxFrameRenderer(plan,cache,lambda _:PRIVATE/'replacement.png');render.foreground_cache.root=None
    prepare=render._prepare_foreground;captured=[]
    def capture(*args):
        pair=prepare(*args);captured[:]=pair;return pair
    render._prepare_foreground=capture
    start=time.monotonic();rows=[]
    for index in (range(48)if a.all_frames else map(int,a.indices.split(','))):
        picture=original(index);output=render.render(picture,index)
        fg,alpha=captured
        fg.save(a.out/f'foreground-{index:04d}.png');alpha.save(a.out/f'alpha-{index:04d}.png')
        output.save(a.out/f'actual-composite-{index:04d}.png')
        for side,box in [('left',(280,240,700,720)),('right',(1040,170,1430,760)),('rig',(100,690,900,925))]:
            w,h=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(w*2,h+24))
            for column,(title,frame)in enumerate([('Actual original',picture),('Shared compositor / photographed evidence',output)]):
                sheet.paste(frame.crop(box),(column*w,24));ImageDraw.Draw(sheet).text((column*w+3,4),title,fill='white')
            sheet.save(a.out/f'actual-{side}-comparison-{index:04d}.jpg',quality=98)
        rows.append({'frame':index,'visualPass':False})
        print(json.dumps({'frame':index,'seconds':time.monotonic()-start}),flush=True)
    write_json(a.out/'receipt.json',{'rows':rows,'allFrames':a.all_frames,'sourceSha256':cache.manifest['source_sha256'],
        'sourceRecoveryReceiptSha256':sha(RECOVERED/'receipt.json'),'parentReceiptSha256':sha(a.parent/'receipt.json'),
        'canonicalForegroundPreparationCalled':True,'privateForegroundPixelOverride':False,
        'actualSharedEvidenceValidation':True,'elapsedSeconds':time.monotonic()-start,
        'implementationSha256':{name:sha(Path(name))for name in ['python_media_worker/studio_vfx_plan.py','python_media_worker/studio_source_background.py']},
        'nativeAdmission':False,'nativeSaveReopenExportQualified':False,'fourMinuteProof':False,
        'visualPass':False,'providerUpload':False,'paidCloudInference':False})


if __name__=='__main__':main()
