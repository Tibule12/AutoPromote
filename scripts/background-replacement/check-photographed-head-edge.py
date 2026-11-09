"""Private source-bound head-edge posterior comparison; no pose synthesis.

This uses an explicit inspection ROI and the same photographed B support.
Unknown original-room pixels, opaque head interiors and all other regions stay
unchanged. It is not an automatically tracked head feature or native artifact.
"""
import argparse,copy,hashlib,json,time
from pathlib import Path
from types import SimpleNamespace

import cv2,numpy as np
from PIL import Image,ImageDraw

from model_workers.common import sha,write_json
from python_media_worker.studio_source_background import load_evidence
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
from recovered_motion_inputs import PRIVATE,RECOVERED,original
from importlib.util import spec_from_file_location,module_from_spec


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('out',type=Path);args=parser.parse_args();args.out.mkdir(mode=0o700,exist_ok=False)
    file=Path('scripts/background-replacement/check-posterior-photographed-unmix.py');spec=spec_from_file_location('private_joint_posterior',file);helper=module_from_spec(spec);spec.loader.exec_module(helper)
    matte=Path('/dev/shm/autopromote-posterior-posterior-photo-unmix-r314-20261107');m=json.loads((matte/'manifest.json').read_text());B,observed=load_evidence(matte,m)
    effects=json.loads((PRIVATE/'native-source-click-footprint-r312-20261107/preview-model-project.autopromote.json').read_text())['snapshot']['subjectVfxScenes'][0]['scene']['effects']
    roi=np.zeros((1000,1430),bool);roi[45:480,660:1040]=True
    rows=[];started=time.monotonic();cv2.setNumThreads(2)
    for index in [6,15,17,47]:
        image=original(index);rgb=np.array(image);raw=np.array(Image.open(matte/f'matte_{index:04d}.png'))
        distance=cv2.distanceTransform((raw>=254).astype(np.uint8),cv2.DIST_L2,5)
        seeds=roi&(distance>8)&(raw>=254)
        near=cv2.dilate((raw>0).astype(np.uint8),np.ones((7,7),np.uint8))>0
        scope=roi&observed&(distance<8)&near
        assert seeds.sum()>64
        posterior,_,variance,diag=helper.material_posterior(rgb[scope]/255,B[scope]/255,rgb[seeds][::10]/255)
        prior=raw/255;target=prior.copy();target[scope]=np.minimum(prior[scope],posterior)
        uncertainty=np.zeros(raw.shape);uncertainty[scope]=variance
        alpha=helper.regularize_opacity(target,prior,scope,rgb,uncertainty,4)
        alpha[scope]=np.minimum(alpha[scope],prior[scope]);alpha=np.rint(alpha*255).astype(np.uint8)
        assert np.array_equal(alpha[~scope],raw[~scope])
        identity=hashlib.sha256(alpha.tobytes()).hexdigest();cache=SimpleNamespace(manifest=m,artifact_sha256=identity,observed_background=(B,observed),frame=lambda _:alpha)
        r=VfxFrameRenderer({'version':1,'source_sha256':m['source_sha256'],'matte_sha256':identity,'effects':copy.deepcopy(effects)},cache,lambda _:PRIVATE/'replacement.png');r.foreground_cache.root=None
        result=r.render(image,index);result.save(args.out/f'actual-composite-{index:04d}.png');Image.fromarray(alpha).save(args.out/f'alpha-{index:04d}.png')
        before=Image.open(PRIVATE/f'native-source-click-footprint-r312-20261107/actual-native-frame-review/actual-preview-{index:04d}.png');box=(660,45,1040,480);w,h=380,435;sheet=Image.new('RGB',(w*3,h+24))
        for n,(label,picture)in enumerate([('Actual source',image),('Native current',before),('Observed B head edge',result)]):sheet.paste(picture.crop(box),(w*n,24));ImageDraw.Draw(sheet).text((w*n+3,4),label,fill='white')
        sheet.save(args.out/f'head-{index:04d}.jpg',quality=98)
        rows.append({'frame':index,'sourceSha256':sha(RECOVERED/f'rgb/rgb_{index:04d}.png'),'opaqueCoreAndUnsupportedAlphaExact':True,'changedPixels':int(np.count_nonzero(alpha!=raw)),'seconds':time.monotonic()-started,'posterior':diag})
        print(json.dumps({'frame':index,'seconds':time.monotonic()-started}),flush=True)
        write_json(args.out/'receipt.json',{'rows':rows,'headInspectionBox':[660,45,1040,480],'currentOpaqueSamples':True,'nativeAdmission':False,'registeredImplementationChanged':False,'visualReviewPending':True,'fourMinuteProof':False,'paidCloudInference':False,'providerUpload':False})


if __name__=='__main__':main()
