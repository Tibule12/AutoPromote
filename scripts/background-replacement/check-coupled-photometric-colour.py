"""Actual derived alpha with alternate observed-background F regularization."""
import copy, hashlib, json, time, types
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from model_workers.common import sha, write_json
from python_media_worker.studio_source_background import recover_foreground
from python_media_worker.studio_subject_matte import CachedSubjectMatte
from python_media_worker.studio_vfx_plan import VfxFrameRenderer


def main():
    private = Path('reports/background-replacement-20261101/private'); out = private/'coupled-photometric-colour-r274-20261106'; out.mkdir(exist_ok=False)
    work = Path('/tmp/autopromote-application-demo-FDokC2/subject-previews/608ba066-166e-49c1-ba79-b1c28940c569')
    parent = CachedSubjectMatte(work/'matte', work/'source.mp4'); planes = {i: np.asarray(Image.open(private/f'spatial-photometric-weight-r273-20261106/alpha-{i:04d}.png')) for i in [15,6,23]}
    identity = hashlib.sha256(b''.join(planes[i].tobytes() for i in sorted(planes))).hexdigest()
    cache = types.SimpleNamespace(manifest=parent.manifest, artifact_sha256=identity, observed_background=parent.observed_background, frame=lambda i:planes[i])
    effects = json.loads((work/'spec.json').read_text())['spec']['scene']['effects']; plan={'version':1,'source_sha256':parent.manifest['source_sha256'],'matte_sha256':identity,'effects':copy.deepcopy(effects)}
    renderer=VfxFrameRenderer(plan,cache,lambda _:private/'replacement.png'); renderer.foreground_cache.root=None; prepare=renderer._prepare_foreground
    baseline=VfxFrameRenderer({**plan,'matte_sha256':parent.artifact_sha256},parent,lambda _:private/'replacement.png');baseline.foreground_cache.root=None
    background,observed=parent.observed_background; rows=[]; started=time.monotonic()
    for index in [15,6,23]:
        source=private/f'recovered-gesture-r180-20261105/rgb/rgb_{index:04d}.png'; rgb=Image.open(source).convert('RGB'); active=[e for e in effects if e['start']<=index/24<e['end']]
        foreground,alpha=prepare(rgb,Image.fromarray(planes[index]),active,1430,1000); renderer._prepare_foreground=lambda *args:(foreground,alpha)
        current=renderer.render(rgb,index); old=baseline.render(rgb,index); variants=[]
        for strength in [.02,.005]:
            clean=recover_foreground(np.asarray(rgb),np.asarray(alpha),background,observed,np.asarray(foreground,dtype=float)/255,strength=strength)
            f=Image.fromarray(np.rint(clean.clip(0,1)*255).astype(np.uint8));renderer._prepare_foreground=lambda *args:(f,alpha); picture=renderer.render(rgb,index);picture.save(out/f'actual-{strength}-{index:04d}.png');variants.append(picture)
            rows.append({'frame':index,'strength':strength,'sourceSha256':sha(source),'rawAlpha':int(planes[index][329,1250]),'effectiveAlpha':alpha.getpixel((1250,329)),'recoveredForegroundAtGap':f.getpixel((1250,329)),'seconds':time.monotonic()-started})
        renderer._prepare_foreground=prepare
        for side,box in [('left',(280,230,720,730)),('right',(1020,150,1430,760))]:
            w,h=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(w*5,h+24));draw=ImageDraw.Draw(sheet)
            for n,(label,picture)in enumerate(zip(['Exact source','Native parent','Revised alpha / F weight.7','Revised alpha / F weight.02','Revised alpha / F weight.005'],[rgb,old,current,*variants])):
                sheet.paste(picture.crop(box),(n*w,24));draw.text((n*w+3,4),label,fill='white')
            sheet.save(out/f'{side}-{index:04d}.jpg',quality=98)
        print(json.dumps(rows[-2:]),flush=True)
    write_json(out/'receipt.json',{'rows':rows,'derivedMaskIdentity':identity,'nativeAdmission':False,'registeredImplementationChanged':False,'visualReviewPending':True,'fourMinuteProof':False})


if __name__=='__main__':main()
