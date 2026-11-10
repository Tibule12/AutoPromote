"""Private joint opacity/colour bound from actual opaque material samples.

Unlike a closest-palette fit, select the greatest opacity whose recovered
foreground chromaticity lies in a measured material cone. This is diagnostic
only, with no new model, artifact admission or moving-result qualification.
"""
import json
import argparse
import time
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw
from scipy.spatial import ConvexHull

from model_workers.adapters.temporal_alpha import source_motion_radius
from model_workers.common import sha, write_json
from python_media_worker.studio_subject_matte import CachedSubjectMatte
from python_media_worker.studio_vfx_plan import VfxFrameRenderer


def material_normals(samples):
    chroma = samples / np.maximum(samples.sum(axis=1, keepdims=True), 1)
    center = np.median(chroma[:, :2], axis=0)
    spread = np.maximum(np.median(np.abs(chroma[:, :2]-center), axis=0)*1.4826, .007)
    chroma = chroma[np.all(np.abs(chroma[:, :2]-center) < 3*spread, axis=1)]
    if len(chroma) < 32:
        raise ValueError('Insufficient independently opaque material samples')
    hull = ConvexHull(chroma[:, :2])
    normals = []
    for x, y, offset in hull.equations:
        # Slightly widen the observed chromaticity hull for codec variation.
        offset -= .012
        normals.append([-x-offset, -y-offset, -offset])
    return np.asarray(normals)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--authored-colours', action='store_true')
    parser.add_argument('--soft-feasibility', action='store_true')
    args = parser.parse_args()
    if args.soft_feasibility and not args.authored_colours:
        raise ValueError('Soft feasibility requires reviewed authored material colours')
    cv2.setNumThreads(2)
    private = Path('reports/background-replacement-20261101/private')
    out = private/('soft-material-cone-r284-20261107' if args.soft_feasibility else
                   'authored-material-cone-r283-20261107' if args.authored_colours
                   else 'material-cone-opacity-r282-20261107')
    out.mkdir(mode=0o700, exist_ok=False)
    job = Path('/tmp/autopromote-application-demo-FDokC2/model-jobs/72d11d8677a384bf5e779d794978ec07f51e671c8759ebdaae6bd550ebd2ca67/a72eb85d-6a69-475c-96e3-9a82f934ff8c')
    guide = job/'component_dependency'
    manifest = json.loads((guide/'manifest.json').read_text())
    authored = {}
    if args.authored_colours:
        for number in [1, 2]:
            selection = manifest['components'][number]['selection']
            samples = []
            for prompt in [{'frameIndex': 0, 'points': selection['points']},
                           *selection.get('shotPrompts', [])]:
                index = prompt['frameIndex']
                image = np.asarray(Image.open(private/f'recovered-gesture-r180-20261105/rgb/rgb_{index:04d}.png'))
                evidence = np.asarray(Image.open(guide/manifest['components'][number]['frames'][index]['file']))
                depth = cv2.distanceTransform((evidence >= 224).astype(np.uint8), cv2.DIST_L2, 5)
                for point in prompt['points']:
                    if point['label'] != 1:
                        continue
                    x, y = round(point['position'][0]*1430), round(point['position'][1]*1000)
                    x, y = min(x, 1429), min(y, 999)
                    if depth[y, x] < 8:
                        continue
                    samples.extend(image[max(0, y-1):min(1000, y+2), max(0, x-1):min(1430, x+2)].reshape(-1, 3))
            authored[number] = np.asarray(samples, dtype=np.float64)/255
    work = Path('/tmp/autopromote-application-demo-FDokC2/subject-previews/0357ddba-d7bc-4d96-8fe1-b55bb7eab16d')
    cache = CachedSubjectMatte(work/'matte', work/'source.mp4')
    background, observed = cache.observed_background
    B = background.astype(np.float64)/255
    effects = json.loads((work/'spec.json').read_text())['spec']['scene']['effects']
    plan = {'version': 1, 'source_sha256': cache.manifest['source_sha256'],
            'matte_sha256': cache.artifact_sha256, 'effects': effects}
    renderer = VfxFrameRenderer(plan, cache, lambda _: private/'replacement.png')
    renderer.foreground_cache.root = None
    prepare = renderer._prepare_foreground
    rows = []
    started = time.monotonic()
    for index in [15, 6, 23]:
        source = private/f'recovered-gesture-r180-20261105/rgb/rgb_{index:04d}.png'
        rgb = Image.open(source).convert('RGB')
        C = np.asarray(rgb).astype(np.float64)/255
        raw = cache.frame(index)
        active = [e for e in effects if e['start'] <= index/24 < e['end']]
        foreground, effective = prepare(rgb, Image.fromarray(raw), active, 1430, 1000)
        before = renderer.render(rgb, index)
        prior = np.array(effective).astype(np.float64)/255
        alpha = prior.copy()
        F = np.array(foreground).astype(np.float64)/255
        primary = np.array(Image.open(guide/manifest['components'][0]['frames'][index]['file']))
        previous = np.array(Image.open(source.with_name(f'rgb_{index-1:04d}.png')))
        motion = source_motion_radius(np.array(rgb), previous, 1)
        for number in [1, 2]:
            hand = np.array(Image.open(guide/manifest['components'][number]['frames'][index]['file']))
            depth = cv2.distanceTransform((hand >= 224).astype(np.uint8), cv2.DIST_L2, 5)
            seeds = (depth > 24) & (raw >= 254) & (C.sum(axis=2) > .2)
            if seeds.sum() < 32:
                continue
            normals = material_normals(authored[number] if args.authored_colours else C[seeds])
            upper = np.ones(prior.shape)
            lower = np.zeros(prior.shape)
            delta = C-B
            for normal in normals:
                nb = B @ normal
                nd = delta @ normal
                np.minimum(upper, np.where(nb < -1e-6, nd/np.maximum(-nb, 1e-6), 1), out=upper)
                np.maximum(lower, np.where(nb > 1e-6, -nd/np.maximum(nb, 1e-6), 0), out=lower)
            # Recovered RGB must remain physical, including dark source detail.
            lower = np.maximum(lower, np.max(np.where(delta < 0, -delta/np.maximum(B, .001), delta/np.maximum(1-B, .001)), axis=2))
            feasible = (upper >= lower-.005) & (upper > .015)
            upper = np.clip(upper, 0, 1)
            domain = (cv2.dilate((hand >= 64).astype(np.uint8), np.ones((15, 15), np.uint8)) > 0) & observed
            domain &= ~((primary >= 128) & (hand < 32))
            domain &= (depth < np.maximum(32, motion+8)) & (motion > 4)
            use = domain & feasible & (upper < prior-.025)
            # Continuous bounds avoid switching between isolated palette entries.
            weight = np.minimum(cv2.distanceTransform(domain.astype(np.uint8), cv2.DIST_L2, 5)/6, 1)
            if args.soft_feasibility:
                # A binary feasible/infeasible switch amplifies codec noise
                # into alternating opaque and translucent boundary pixels.
                # Price small source reconstruction errors continuously;
                # reject other materials when the discrepancy is substantial.
                upper = cv2.medianBlur(upper.astype(np.float32), 3).astype(np.float64)
                upper = np.minimum(prior, upper)
                target = (C-(1-upper[..., None])*B)/np.maximum(upper[..., None], .015)
                physical_error = np.sqrt(np.mean(((target-target.clip(0, 1))*upper[..., None])**2, axis=2))
                violation = np.zeros(prior.shape)
                for normal in normals:
                    violation = np.maximum(violation, -(target @ normal)/np.linalg.norm(normal))
                error = np.maximum(physical_error, violation*upper)*255
                confidence = np.clip((8-error)/5, 0, 1)
                confidence = cv2.GaussianBlur(confidence, (0, 0), .8)
                blend = weight*confidence*domain
                next_alpha = prior*(1-blend)+upper*blend
                old_premultiplied = F*prior[..., None]
                new_premultiplied = target.clip(0, 1)*upper[..., None]
                recovered = (old_premultiplied*(1-blend[..., None])+new_premultiplied*blend[..., None])/np.maximum(next_alpha[..., None], .015)
                changed = next_alpha < alpha
                F[changed] = recovered.clip(0, 1)[changed]
                alpha[changed] = next_alpha[changed]
                continue
            next_alpha = np.where(use, prior*(1-weight)+upper*weight, alpha)
            changed = use & (next_alpha < alpha)
            recovered = (C-(1-next_alpha[..., None])*B)/np.maximum(next_alpha[..., None], .015)
            F[changed] = recovered.clip(0, 1)[changed]
            alpha[changed] = next_alpha[changed]
        matte = Image.fromarray(np.rint(alpha*255).astype(np.uint8))
        colour = Image.fromarray(np.rint(F.clip(0, 1)*255).astype(np.uint8))
        renderer._prepare_foreground = lambda *_, f=colour, a=matte: (f, a)
        after = renderer.render(rgb, index)
        renderer._prepare_foreground = prepare
        matte.save(out/f'alpha-{index:04d}.png')
        colour.save(out/f'foreground-{index:04d}.png')
        after.save(out/f'actual-{index:04d}.png')
        for side, box in [('right', (1020, 150, 1430, 760)), ('left', (280, 230, 720, 730))]:
            w, h = box[2]-box[0], box[3]-box[1]
            sheet = Image.new('RGB', (w*3, h+24))
            for n, (label, picture) in enumerate([('Actual source', rgb), ('Current native', before), ('Maximum feasible material opacity', after)]):
                sheet.paste(picture.crop(box), (n*w, 24))
                ImageDraw.Draw(sheet).text((n*w+3, 4), label, fill='white')
            sheet.save(out/f'{side}-{index:04d}.jpg', quality=98)
        rows.append({'frame': index, 'sourceSha256': sha(source), 'changedPixels': int(np.count_nonzero(alpha != prior)),
                     'gapAlpha': int(np.array(matte)[329, 1250]), 'seconds': time.monotonic()-started})
        print(json.dumps(rows[-1]), flush=True)
    write_json(out/'receipt.json', {'rows': rows, 'authoredMaterialColours': args.authored_colours,
        'softSourceReconstructionFeasibility': args.soft_feasibility,
        'newWeights': False, 'nativeAdmission': False,
        'visualReviewPending': True, 'motionQualified': False, 'fourMinuteProof': False})


if __name__ == '__main__':
    main()
