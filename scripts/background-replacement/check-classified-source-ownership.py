"""Source-classifier ownership ablation, preserving actual current outputs."""
import copy,hashlib,json,time
from pathlib import Path
from types import SimpleNamespace

import cv2,numpy as np
from PIL import Image,ImageDraw

from model_workers.adapters import source_edge_alpha as edge
from model_workers.common import sha,write_json
from python_media_worker.studio_source_background import load_evidence
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
from recovered_motion_inputs import PRIVATE,RECOVERED,original


def main():
    out=PRIVATE/'fixed-source-ownership-r339-20261107'
    namespace=dict(vars(edge));file=out/'candidate.py';exec(compile(file.read_text(),str(file),'exec'),namespace)
    guide=RECOVERED/'component_dependency';g=json.loads((guide/'manifest.json').read_text())
    g['_reference_rgb']=np.array(original(0))
    matte=Path('/dev/shm/autopromote-posterior-posterior-photo-unmix-r314-20261107');m=json.loads((matte/'manifest.json').read_text());evidence=load_evidence(matte,m)
    for component,current in zip(g['components'],m['components']):component['selection']=copy.deepcopy(current)
    ids=[c['selection']['id']for c in g['components']if not c['selection']['propagate']]
    effects=json.loads((PRIVATE/'native-source-click-footprint-r312-20261107/preview-model-project.autopromote.json').read_text())['snapshot']['subjectVfxScenes'][0]['scene']['effects']
    rows=[];start=time.monotonic();cv2.setNumThreads(2)
    for i in [6,10,47]:
        source=original(i);rgb=np.array(source);prior=np.array(Image.open(matte/f'matte_{i:04d}.png'))
        pics=[];alphas=[]
        for name,fn in [('before',edge.refine_source_edge),('after',namespace['refine_source_edge'])]:
            alpha=fn(rgb,prior,(guide,g),i,colour_component_ids=ids,classify_fixed_objects=True)
            identity=hashlib.sha256(alpha.tobytes()).hexdigest();cache=SimpleNamespace(manifest=m,artifact_sha256=identity,observed_background=evidence,frame=lambda _:alpha)
            r=VfxFrameRenderer({'version':1,'source_sha256':m['source_sha256'],'matte_sha256':identity,'effects':copy.deepcopy(effects)},cache,lambda _:PRIVATE/'replacement.png');r.foreground_cache.root=None
            result=r.render(source,i);result.save(out/f'{name}-composite-{i:04d}.png');Image.fromarray(alpha).save(out/f'{name}-alpha-{i:04d}.png');pics.append(result);alphas.append(alpha)
        for name,box in [('rig',(100,690,950,925)),('lower',(430,810,1250,1000)),('plant',(0,760,210,1000))]:
            w,h=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(w*3,h+24))
            for n,(label,pic)in enumerate(zip(['Actual source','Repeated current classifier','Changed source ownership'],[source,*pics])):sheet.paste(pic.crop(box),(w*n,24));ImageDraw.Draw(sheet).text((w*n+3,4),label,fill='white')
            sheet.save(out/f'{name}-{i:04d}.jpg',quality=98)
        rows.append({'frame':i,'changedPixels':int(np.count_nonzero(alphas[0]!=alphas[1])),'sourceSha256':sha(RECOVERED/f'rgb/rgb_{i:04d}.png'),'seconds':time.monotonic()-start})
        print(json.dumps(rows[-1]),flush=True)
        write_json(out/'receipt.json',{'rows':rows,'privateHistoricalSegmentationGuidance':True,'native2_5_14AlphaParent':True,'nativeAdmission':False,'registeredImplementationChanged':False,'fourMinuteProof':False,'paidCloudInference':False,'providerUpload':False,'visualReviewPending':True})


if __name__=='__main__':main()
