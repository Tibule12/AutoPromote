"""Private joint alpha/colour posterior on the retained real movement.

Unlike a nearest-palette winner, marginalize photographed opaque material
clusters and opacity together. Unknown plate pixels cannot authorize a change.
This is diagnostic evidence, never a native artifact or delivery path.
"""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import tarfile
import time
from types import SimpleNamespace

import cv2
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt
from model_workers.adapters.photographed_opacity import material_posterior,regularize_opacity

from model_workers.common import sha, write_json
from python_media_worker.studio_source_background import load_evidence
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
from recovered_motion_inputs import PRIVATE, RECOVERED, load_components, original


def restore_native(root):
    retained = PRIVATE/'native-source-click-footprint-r312-20261107/retained-native-model-artifact'
    proof = json.loads((retained.parent/'native-model-retention.json').read_text())
    for row in proof['savedPublishedFiles']:
        assert sha(retained/row['name']) == row['sha256']
    root.mkdir(mode=0o700, exist_ok=False)
    with tarfile.open(retained/'subject_masks.tar.gz') as archive:
        members = archive.getmembers()
        assert all(m.isfile() and Path(m.name).name == m.name and m.size < 8*1024**2 for m in members)
        archive.extractall(root, members=members, filter='data')
    manifest = json.loads((root/'manifest.json').read_text())
    assert manifest['frame_count'] == 48 and manifest['source_sha256'] == sha(retained/'normalized_source.mp4')
    for row in manifest['frames']:
        assert sha(root/row['file']) == row['sha256']
    evidence = load_evidence(root, manifest)
    document = json.loads((retained.parent/'preview-model-project.autopromote.json').read_text())
    effects = document['snapshot']['subjectVfxScenes'][0]['scene']['effects']
    return manifest, evidence, effects






def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('out', type=Path)
    parser.add_argument('--indices', default='10,17,15,6,23')
    parser.add_argument('--noise', type=float, default=4)
    parser.add_argument('--subtract-only', action='store_true')
    parser.add_argument('--support-not-confidence', action='store_true')
    parser.add_argument('--native-alpha', action='store_true')
    parser.add_argument('--current-recovery', action='store_true')
    parser.add_argument('--smooth-alpha', type=float, default=0)
    parser.add_argument('--posterior-spatial',type=float,default=0)
    parser.add_argument('--repair-weak-primary',action='store_true')
    parser.add_argument('--all-frames',action='store_true')
    parser.add_argument('--prepare-only',action='store_true')
    parser.add_argument('--resume',action='store_true')
    parser.add_argument('--linear-posterior',action='store_true')
    parser.add_argument('--chroma-noise',type=float,default=1)
    args = parser.parse_args()
    assert not args.posterior_spatial or args.current_recovery
    if args.chroma_noise!=1:
        assert args.current_recovery and not args.linear_posterior and not args.resume
        assert 1<args.chroma_noise<=8
    if args.linear_posterior:assert not args.current_recovery and not args.resume
    args.out.mkdir(mode=0o700, exist_ok=args.resume)
    (args.out/('resumed-implementation.py'if args.resume else 'implementation.py')).write_bytes(Path(__file__).read_bytes())
    runtime = Path('/dev/shm')/('autopromote-posterior-'+args.out.name)
    if args.resume:
        manifest=json.loads((runtime/'manifest.json').read_text())
        for row in manifest['frames']:assert sha(runtime/row['file'])==row['sha256']
        background,observed=load_evidence(runtime,manifest)
        document=json.loads((PRIVATE/'native-source-click-footprint-r312-20261107/preview-model-project.autopromote.json').read_text())
        effects=document['snapshot']['subjectVfxScenes'][0]['scene']['effects']
    else:manifest, (background, observed), effects = restore_native(runtime)
    parent = PRIVATE/'joint-source-motion-r308-20261107'
    rows = []
    if args.resume:
        previous=json.loads((args.out/'receipt.json').read_text())
        for key,value in [('nativeAlphaPrior',args.native_alpha),('usesCurrentForegroundRecovery',args.current_recovery),('posteriorSpatialStrength',args.posterior_spatial),('weakPrimaryOnlyDeepCoreProtected',args.repair_weak_primary),('allFrames',args.all_frames),('noiseCodeValues',args.noise),('subtractOnly',args.subtract_only),('photographedSupportIsEvidenceNotBoundaryConfidence',args.support_not_confidence)]:assert previous[key]==value,key
        rows=previous['rows'];assert [r['frame']for r in rows]==list(range(len(rows)))
        verified=[]
        for row in rows:
            i=row['frame'];assert sha(RECOVERED/f'rgb/rgb_{i:04d}.png')==row['sourceSha256']
            files={}
            for prefix in ['alpha','foreground','actual-composite']:
                file=args.out/f'{prefix}-{i:04d}.png'
                with Image.open(file)as picture:assert picture.size==(1430,1000);picture.load()
                files[prefix]=sha(file)
            verified.append({'frame':i,'outputs':files})
        (args.out/'before-empty-domain-resume-receipt.json').write_text(json.dumps(previous,indent=2)+'\n')
        write_json(args.out/'resume-preservation.json',{'completedFramesPreserved':verified,'resumeAfterFrame':len(rows)-1,'change':'No photographed background in a tracked hand is a no-op, not an empty solve.','noFramesSkippedFromFinalClock':True})
    started = time.monotonic()
    cv2.setNumThreads(2)
    for index in (range(48) if args.all_frames else map(int, args.indices.split(','))):
        if args.resume and index<len(rows):continue
        image = original(index)
        rgb = np.asarray(image)
        components = load_components(index)
        alpha_file = runtime/f'matte_{index:04d}.png' if args.native_alpha else parent/f'P3M-local-hand-alpha-{index:04d}.png'
        raw = np.array(Image.open(alpha_file))
        identity = sha(alpha_file)
        cache = SimpleNamespace(manifest=manifest, artifact_sha256=identity,
            observed_background=(background, observed), frame=lambda _: raw)
        plan = {'version': 1, 'source_sha256': manifest['source_sha256'],
                'matte_sha256': identity, 'effects': copy.deepcopy(effects)}
        renderer = VfxFrameRenderer(plan, cache, lambda _: PRIVATE/'replacement.png')
        renderer.foreground_cache.root = None
        active = [e for e in effects if e['start'] <= index/24 < e['end']]
        # The joint calculation consumes alpha, not the old recovered RGB.
        # When the final foreground is recomputed below, omit this redundant
        # first colour solve; every alpha operation and its ordering is exact.
        initial_active=copy.deepcopy(active)
        if args.current_recovery:
            for e in initial_active:
                if e['type']=='foreground_refine':e['decontaminate']=0
        fg, effective = renderer._prepare_foreground(image, Image.fromarray(raw), initial_active, 1430, 1000)
        A = np.array(effective).astype(np.float64)/255
        F = np.array(fg).astype(np.float64)/255
        decode=lambda v:np.where(v<.081,v/4.5,((v+.099)/1.099)**(1/.45))
        encode=lambda v:np.where(v<.018,v*4.5,1.099*np.maximum(v,0)**.45-.099)
        if args.linear_posterior:F=decode(F)
        diag = []
        corrected_scope = np.zeros(raw.shape, bool)
        for ci in (1, 2):
            hand = components[ci]
            depth = cv2.distanceTransform((hand >= 224).astype(np.uint8), cv2.DIST_L2, 5)
            C, B = rgb.astype(np.float64)/255, background.astype(np.float64)/255
            skin = (depth > 10) & (raw >= 254) & (C[..., 0]-C[..., 2] > .025)
            skin &= (C[..., 1]-C[..., 2] > -.01) & (C.sum(2) > .12)
            if skin.sum() < 64:
                raise ValueError('Insufficient current opaque hand material')
            scope = cv2.dilate((hand >= 64).astype(np.uint8), np.ones((31, 31), np.uint8)) > 0
            hand_scope = scope.copy()
            # Keep unrelated current primary pixels and unobserved source B.
            other_primary=(components[0] >= 128) & (hand < 32)
            if args.repair_weak_primary:
                deep=cv2.distanceTransform((components[0]>=128).astype(np.uint8),cv2.DIST_L2,5)>32
                other_primary &= deep
            scope &= observed & ~other_primary
            scope &= (depth < 32)
            yy, xx = np.where(scope)
            if not len(xx):
                diag.append({'component':ci,'eligiblePixels':0,'status':'no_photographed_background_no_change'})
                continue
            if args.linear_posterior:
                newa,newf,variance,detail=material_posterior(decode(C[scope]),decode(B[scope]),decode(C[skin][::3]),noise=2/255)
            elif args.chroma_noise!=1:
                # Private observation-noise ablation: compressed 4:2:0 colour
                # near a fast edge is less reliable than its luminance. This
                # changes only the opacity likelihood, not source RGB or the
                # canonical final compositor's colour space.
                y=np.array([.2126,.7152,.0722]);u=(np.array([0,0,1])-y)/1.8556
                v=(np.array([1,0,0])-y)/1.5748
                transform=np.stack([y,u/args.chroma_noise,v/args.chroma_noise])
                newa,newf,variance,detail=material_posterior(C[scope]@transform.T,B[scope]@transform.T,C[skin][::3]@transform.T,noise=args.noise/255)
            else:newa, newf, variance, detail = material_posterior(C[scope], B[scope], C[skin][::3], noise=args.noise/255)
            if args.posterior_spatial:
                plane=A.copy();plane[scope]=newa
                uncertainty=np.zeros(raw.shape);uncertainty[scope]=variance
                plane=regularize_opacity(plane,A,scope,rgb,uncertainty,args.posterior_spatial)
                newa=plane[scope]
            # Conservative spatial boundary blending, not an alpha eroder.
            weight_domain = hand_scope if args.support_not_confidence else scope
            weight = np.minimum(cv2.distanceTransform(weight_domain.astype(np.uint8), cv2.DIST_L2, 5)[scope]/8, 1)
            weight *= np.clip((32-depth[scope])/12, 0, 1)
            prior = A[scope].copy()
            if args.subtract_only:
                weight *= np.clip((prior-newa)/.06, 0, 1)
                newa = np.minimum(prior, newa)
            nexta = prior*(1-weight)+newa*weight
            premul = F[scope]*prior[:, None]*(1-weight[:, None])+newf*newa[:, None]*weight[:, None]
            F[scope] = premul/np.maximum(nexta[:, None], .001)
            A[scope] = nexta
            corrected_scope |= scope
            diag.append({'component': ci, 'opaqueMaterialPixels': int(skin.sum()),
                         'eligiblePixels': len(xx), **detail})
        if args.smooth_alpha:
            assert args.current_recovery and 0 < args.smooth_alpha <= 2
            smoothed = cv2.GaussianBlur(A,(0,0),args.smooth_alpha)
            A[corrected_scope] = np.minimum(np.array(effective)[corrected_scope]/255,smoothed[corrected_scope])
        f = Image.fromarray(np.rint((encode(F)if args.linear_posterior else F).clip(0, 1)*255).astype(np.uint8))
        a = Image.fromarray(np.rint(A.clip(0, 1)*255).astype(np.uint8))
        if args.current_recovery:
            f, a = renderer._prepare_foreground(image, a, active, 1430, 1000)
        renderer._prepare_foreground = lambda *unused: (f, a)
        if args.linear_posterior:
            import inspect,textwrap,types
            from python_media_worker import studio_vfx_plan as renderer_module
            def linear_over(bg,subject):
                b=np.asarray(bg.convert('RGB'),float)/255
                colour=np.asarray(subject.convert('RGB'),float)/255
                opacity=np.asarray(subject.getchannel('A'),float)[...,None]/255
                mixed=encode(decode(colour)*opacity+decode(b)*(1-opacity)).clip(0,1)
                return Image.fromarray(np.rint(mixed*255).astype(np.uint8)).convert('RGBA')
            code=textwrap.dedent(inspect.getsource(VfxFrameRenderer.render))
            assert code.count('background.alpha_composite(subject)')==1
            code=code.replace('background.alpha_composite(subject)','background = linear_over(background,subject)')
            namespace={**vars(renderer_module),'linear_over':linear_over}
            exec(code,namespace);renderer.render=types.MethodType(namespace['render'],renderer)
        result = renderer.render(image, index)
        f.save(args.out/f'foreground-{index:04d}.png')
        a.save(args.out/f'alpha-{index:04d}.png')
        result.save(args.out/f'actual-composite-{index:04d}.png')
        before_file = PRIVATE/f'native-source-click-footprint-r312-20261107/actual-native-frame-review/actual-preview-{index:04d}.png' if args.native_alpha else parent/f'P3M-local-hand-actual-{index:04d}.png'
        if not before_file.is_file():
            # Decode actual parent bytes for a comparison only, never a new
            # candidate or a frame silently borrowed from another time.
            import subprocess,io
            command=['ffmpeg','-nostdin','-v','error','-threads','1','-i',str(PRIVATE/'native-source-click-footprint-r312-20261107/preview.mp4'),'-vf',f'select=eq(n\\,{index})','-frames:v','1','-f','image2pipe','-c:v','png','pipe:1']
            data=__import__('subprocess').run(command,check=True,capture_output=True,timeout=30).stdout
            before=Image.open(io.BytesIO(data)).convert('RGB')
        else:before = Image.open(before_file).convert('RGB')
        for side, box in ([]if args.prepare_only else [('left', (280, 240, 700, 720)), ('right', (1040, 170, 1430, 760))]):
            w, h = box[2]-box[0], box[3]-box[1]
            sheet = Image.new('RGB', (w*3, h+24))
            for number, (label, picture) in enumerate([('Actual source', image), ('Native parent' if args.native_alpha else 'Prior combined diagnostic', before), ('New alpha / current F solve' if args.current_recovery else 'Joint photographed posterior', result)]):
                sheet.paste(picture.crop(box), (number*w, 24))
                ImageDraw.Draw(sheet).text((number*w+3, 4), label, fill='white')
            sheet.save(args.out/f'{side}-{index:04d}.jpg', quality=98)
        rows.append({'frame': index, 'sourceSha256': sha(RECOVERED/f'rgb/rgb_{index:04d}.png'),
                     'priorAlphaSha256': identity, 'components': diag, 'elapsedSeconds': time.monotonic()-started})
        print(json.dumps({'frame': index, 'elapsedSeconds': time.monotonic()-started}), flush=True)
        write_json(args.out/'receipt.json', {'rows': rows, 'newModelWeights': False,
            'nativeAdmission': False, 'fourMinuteProof': False, 'visualReviewPending': True,
            'providerUpload': False, 'paidCloudInference': False,
            'noiseCodeValues': args.noise, 'retainedNativeParent': 'r312',
            'subtractOnly': args.subtract_only,
            'photographedSupportIsEvidenceNotBoundaryConfidence': args.support_not_confidence,
            'privateAlphaPrior': None if args.native_alpha else 'r308',
            'nativeAlphaPrior': args.native_alpha, 'usesCurrentForegroundRecovery': args.current_recovery,
            'sourcePixelAlphaSmoothingSigma': args.smooth_alpha,
            'posteriorSpatialStrength':args.posterior_spatial,
            'weakPrimaryOnlyDeepCoreProtected':args.repair_weak_primary,
            'allFrames':args.all_frames,
            'jointPhotographicExposureAndCompositeInLinearBt709':args.linear_posterior,
            'privatePosteriorChromaNoiseMultiplier':args.chroma_noise,
            'registeredImplementationChanged': False})


if __name__ == '__main__':
    main()
