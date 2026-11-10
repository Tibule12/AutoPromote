"""Private source-derived small-rig matte diagnostic, no authored contour.

The inspection rectangle is explicit. The plate under one-pixel coils is an
ESTIMATED local closing, not a photographed empty plate. Compare it with the
actual source and native preview before considering any integration.
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

from model_workers.common import sha,write_json
from python_media_worker.studio_source_background import load_evidence
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
from recovered_motion_inputs import PRIVATE,RECOVERED,original


def main():
    out=PRIVATE/'source-rig-unmix-r324-20261107';out.mkdir(mode=0o700,exist_ok=False)
    (out/'implementation.py').write_bytes(Path(__file__).read_bytes())
    matte=Path('/dev/shm/autopromote-posterior-posterior-photo-unmix-r314-20261107')
    manifest=json.loads((matte/'manifest.json').read_text());evidence=load_evidence(matte,manifest)
    effects=json.loads((PRIVATE/'native-source-click-footprint-r312-20261107/preview-model-project.autopromote.json').read_text())['snapshot']['subjectVfxScenes'][0]['scene']['effects']
    # Inspection crop only, not delivered support or a hand-authored alpha.
    box=(230,744,490,789);x0,y0,x1,y1=box;sl=np.s_[y0:y1,x0:x1]
    source0=np.array(original(0));samples=[]
    for point in manifest['components'][3]['points']:
        if point['label']:
            x,y=round(point['position'][0]*1430),round(point['position'][1]*1000)
            samples.append(source0[y,x])
    material=np.median(samples,axis=0)/255
    rows=[];started=time.monotonic();cv2.setNumThreads(2)
    for index in [6,10,47]:
        image=original(index);rgb=np.array(image);raw=np.array(Image.open(matte/f'matte_{index:04d}.png'))
        identity=hashlib.sha256(raw.tobytes()).hexdigest()
        cache=SimpleNamespace(manifest=manifest,artifact_sha256=identity,observed_background=evidence,frame=lambda _:raw)
        renderer=VfxFrameRenderer({'version':1,'source_sha256':manifest['source_sha256'],'matte_sha256':identity,'effects':copy.deepcopy(effects)},cache,lambda _:PRIVATE/'replacement.png');renderer.foreground_cache.root=None
        active=[e for e in effects if e['start']<=index/24<e['end']]
        foreground,alpha=renderer._prepare_foreground(image,Image.fromarray(raw),active,1430,1000)
        basef=np.array(foreground).astype(float)/255;basea=np.array(alpha).astype(float)/255
        pictures=[]
        for diameter in [9,17,25]:
            kernel=cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(diameter,diameter))
            background=cv2.morphologyEx(rgb,cv2.MORPH_CLOSE,kernel).astype(float)/255
            C=rgb[sl].astype(float)/255;B=background[sl];vector=B-material
            A=(np.sum((B-C)*vector,axis=2)/np.maximum(np.sum(vector*vector,axis=2),.002)).clip(0,1)
            residual=np.sqrt(np.mean((C-(A[...,None]*material+(1-A[...,None])*B))**2,axis=2))
            # Reject a contradictory local plate estimate; preserve the old
            # result there rather than asserting a new matte from bad colour.
            confidence=np.clip((14/255-residual)/(10/255),0,1)
            near=np.ones(A.shape,np.uint8);near[[0,-1]]=0;near[:,[0,-1]]=0
            weight=np.minimum(cv2.distanceTransform(near,cv2.DIST_L2,5)/3,1)*confidence
            newa=basea.copy();newf=basef.copy();prior=basea[sl]
            pure=(C-(1-A[...,None])*B)/np.maximum(A[...,None],.001)
            nexta=prior*(1-weight)+A*weight
            P=basef[sl]*prior[...,None]*(1-weight[...,None])+pure.clip(0,1)*A[...,None]*weight[...,None]
            newa[sl]=nexta;newf[sl]=P/np.maximum(nexta[...,None],.001)
            f=Image.fromarray(np.rint(newf.clip(0,1)*255).astype(np.uint8));a=Image.fromarray(np.rint(newa.clip(0,1)*255).astype(np.uint8))
            renderer._prepare_foreground=lambda *unused,f=f,a=a:(f,a)
            result=renderer.render(image,index);pictures.append(result)
            result.save(out/f'actual-{diameter}-{index:04d}.png');a.save(out/f'alpha-{diameter}-{index:04d}.png')
            Image.fromarray(np.rint(B*255).astype(np.uint8)).save(out/f'ESTIMATED-background-{diameter}-{index:04d}.png')
            rows.append({'frame':index,'localClosingDiameter':diameter,'materialRgb':(material*255).tolist(),'meanResidualCodeValues':float(residual.mean()*255),'changedAlphaPixels':int(np.count_nonzero(np.rint(newa*255)!=np.rint(basea*255)))})
        before=Image.open(PRIVATE/f'native-source-click-footprint-r312-20261107/actual-native-frame-review/actual-preview-{index:04d}.png')
        region=(230,730,490,810);w,h=260,80;sheet=Image.new('RGB',(w*5,h+24))
        for n,(label,picture)in enumerate(zip(['Source','Native current','Source B estimate /9','Source B estimate /17','Source B estimate /25'],[image,before,*pictures])):
            sheet.paste(picture.crop(region),(n*w,24));ImageDraw.Draw(sheet).text((n*w+3,4),label,fill='white')
        sheet.resize((2600,208)).save(out/f'spring-{index:04d}.jpg',quality=98)
        print(json.dumps({'frame':index,'seconds':time.monotonic()-started}),flush=True)
    write_json(out/'receipt.json',{'rows':rows,'inspectionRectangle':box,'noAuthoredAlphaContours':True,
        'backgroundEstimateNotPhotographed':True,'nativeAdmission':False,'visualReviewPending':True,
        'registeredImplementationChanged':False,'fourMinuteProof':False,'paidCloudInference':False,'providerUpload':False})


if __name__=='__main__':main()
