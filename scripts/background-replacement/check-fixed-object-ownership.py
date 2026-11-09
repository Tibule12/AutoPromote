"""Same actual source/alpha, old versus scoped fixed-object correction.

This isolates an algorithm change. It is not a native model execution or a
complete temporal pipeline; final admission and moving-video review are separate.
"""
import copy, hashlib, json, time, types
from pathlib import Path
import cv2, numpy as np
from PIL import Image, ImageDraw
from model_workers.adapters import source_edge_alpha
from model_workers.common import sha, write_json
from python_media_worker.studio_subject_matte import CachedSubjectMatte
from python_media_worker.studio_vfx_plan import VfxFrameRenderer


def main():
    private=Path('reports/background-replacement-20261101/private')
    out=private/'fixed-object-ownership-r279-20261106'; baseline=out/'before-source-edge-alpha.py'
    namespace={'__name__':'private_baseline_source_edges','__file__':str(baseline)}
    exec(compile(baseline.read_text(),str(baseline),'exec'),namespace)
    job=Path('/tmp/autopromote-application-demo-FDokC2/model-jobs/18f335240ae4777cd864a862acd96d59d5cbd1d4452a637391956c98bdfa56cf/a59210fa-0254-4000-b1b6-0e92ac9535e8')
    guide=job/'component_dependency'; manifest=json.loads((guide/'manifest.json').read_text())
    manifest['_reference_rgb']=np.asarray(Image.open(private/'recovered-gesture-r180-20261105/rgb/rgb_0000.png'))
    ids=[c['selection']['id']for c in manifest['components'][1:]if not c['selection'].get('propagate',True)]
    work=Path('/tmp/autopromote-application-demo-FDokC2/subject-previews/608ba066-166e-49c1-ba79-b1c28940c569')
    parent=CachedSubjectMatte(work/'matte',work/'source.mp4');effects=json.loads((work/'spec.json').read_text())['spec']['scene']['effects']
    rows=[];start=time.monotonic();cv2.setNumThreads(2)
    for index in [47,6]:
        source=private/f'recovered-gesture-r180-20261105/rgb/rgb_{index:04d}.png';rgb=np.asarray(Image.open(source).convert('RGB'))
        input_file=job/f'outputs/independent_alphas/matte_{index:04d}.png';alpha=np.asarray(Image.open(input_file))
        for c in manifest['components']:
            frame=c['frames'][index];assert sha(guide/frame['file'])==frame['sha256']
        pictures=[];planes=[]
        for label,refine in [('before',namespace['refine_source_edge']),('after',source_edge_alpha.refine_source_edge)]:
            values=refine(rgb,alpha,(guide,manifest),index,colour_component_ids=ids,classify_fixed_objects=True)
            Image.fromarray(values).save(out/f'{label}-alpha-{index:04d}.png');planes.append(values)
            identity=hashlib.sha256(values.tobytes()).hexdigest()
            cache=types.SimpleNamespace(manifest=parent.manifest,artifact_sha256=identity,observed_background=parent.observed_background,frame=lambda _,plane=values:plane)
            plan={'version':1,'source_sha256':parent.manifest['source_sha256'],'matte_sha256':identity,'effects':copy.deepcopy(effects)}
            render=VfxFrameRenderer(plan,cache,lambda _:private/'replacement.png');render.foreground_cache.root=None
            picture=render.render(Image.fromarray(rgb),index);picture.save(out/f'{label}-actual-{index:04d}.png');pictures.append(picture)
        for name,box in [('rig',(100,690,950,925)),('clothes',(430,810,1250,1000))]:
            w,h=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(w*3,h+24));draw=ImageDraw.Draw(sheet)
            for n,(label,picture)in enumerate(zip(['Actual source','Same input / old prop classifier','Same input / ownership guard'],[Image.fromarray(rgb),*pictures])):
                sheet.paste(picture.crop(box),(n*w,24));draw.text((n*w+3,4),label,fill='white')
            sheet.save(out/f'actual-{name}-{index:04d}.jpg',quality=98)
        retained=(planes[0]<128)&(planes[1]>=230)&(alpha>=230)
        rows.append({'frame':index,'sourceSha256':sha(source),'inputAlphaSha256':sha(input_file),'retainedPriorOpaquePixels':int(retained.sum()),'retainedLowerClothingPixels':int(retained[810:991,430:1250].sum()),'changedPixels':int(np.count_nonzero(planes[0]!=planes[1])),'seconds':time.monotonic()-start})
        print(json.dumps(rows[-1]),flush=True)
        write_json(out/'actual-ab-receipt.json',{'rows':rows,'beforeCodeSha256':sha(baseline),'afterCodeSha256':sha(Path(source_edge_alpha.__file__)),'sameInputsBothAlgorithms':True,'sameSharedCompositor':True,'registeredWeightsChanged':False,'nativeAdmission':False,'fullTemporalPipeline':False,'visualReviewPending':True,'fourMinuteProof':False})


if __name__=='__main__':main()
