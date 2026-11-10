"""Private measured-background alpha check on actual moving-hand frames."""
import argparse, json, time
from pathlib import Path
import cv2, numpy as np
from PIL import Image, ImageDraw
from model_workers.adapters.moving_detail_alpha import measured_motion_trimap
from model_workers.adapters.temporal_alpha import source_motion_radius
from model_workers.common import sha, write_json
from python_media_worker.studio_subject_matte import CachedSubjectMatte
from python_media_worker.studio_vfx_plan import VfxFrameRenderer


def measured_alpha(rgb, background, observed, prior, hand, primary, motion, palette):
    """Fit only photographed mixtures near an independently tracked edge.

    Palette RGB is sampled from the owner's real foreground clicks, not output
    colour. The estimate changes alpha only; shared recovery computes final RGB.
    """
    _, domain = measured_motion_trimap(prior, hand, primary, rgb, background, observed, motion)
    depth = cv2.distanceTransform((hand >= 224).astype(np.uint8), cv2.DIST_L2, 5)
    eligible = domain & (motion > 4) & (depth < np.maximum(24, motion + 8))
    c = rgb.astype(np.float32); b = background.astype(np.float32); delta = c - b
    error = np.full(hand.shape, np.inf, np.float32)
    best = prior.astype(np.float32) / 255
    for colour in np.unique(np.asarray(palette, np.float32), axis=0):
        vector = colour - b; contrast = np.sum(vector * vector, axis=2)
        opacity = np.sum(delta * vector, axis=2) / np.maximum(contrast, 1)
        residual = np.sqrt(np.mean((delta - opacity[..., None] * vector) ** 2, axis=2))
        valid = (contrast > 48 ** 2) & (opacity >= 0) & (opacity <= 1)
        use = valid & (residual < error)
        best[use] = opacity[use]; error[use] = residual[use]
    # Reject poorly conditioned colours and any hypothesis which grows the
    # current neural matte. Known unrelated person/clothing stays exact.
    accepted = eligible & (error < 8) & (best < .85) & (best < prior / 255)
    result = prior.copy()
    result[accepted] = np.rint(best[accepted] * 255).astype(np.uint8)
    return result, accepted, error


def main():
    p = argparse.ArgumentParser(description=__doc__); p.add_argument('out', type=Path); p.add_argument('--verified-colours', action='store_true'); a = p.parse_args(); a.out.mkdir(exist_ok=False)
    import os
    write_json(a.out/'diagnostic-settings.json', {key:os.environ.get(key) for key in [
        'AUTOPROMOTE_PRIVATE_ALPHA_DATA_WEIGHT','AUTOPROMOTE_PRIVATE_RELEASE_MIXED_SEEDS',
        'AUTOPROMOTE_PRIVATE_COLOUR_CORE_RADIUS','AUTOPROMOTE_PRIVATE_MIXED_CONFIDENCE',
        'AUTOPROMOTE_PRIVATE_LOCALIZE_PHOTO_DATA']})
    private = Path('reports/background-replacement-20261101/private')
    work = Path('/tmp/autopromote-application-demo-FDokC2/subject-previews/608ba066-166e-49c1-ba79-b1c28940c569')
    job = Path('/tmp/autopromote-application-demo-FDokC2/model-jobs/18f335240ae4777cd864a862acd96d59d5cbd1d4452a637391956c98bdfa56cf/a59210fa-0254-4000-b1b6-0e92ac9535e8')
    guide = job / 'component_dependency'; data = json.loads((guide / 'manifest.json').read_text())
    cache = CachedSubjectMatte(work / 'matte', work / 'source.mp4'); background, observed = cache.observed_background
    spec = json.loads((work / 'spec.json').read_text())['spec']; plan = {'version': 1, 'source_sha256': cache.manifest['source_sha256'], 'matte_sha256': cache.artifact_sha256, 'effects': spec['scene']['effects']}
    palettes = {}
    for n in [1, 2]:
        selection = data['components'][n]['selection']; palette = []
        for prompt in [{'frameIndex': 0, 'points': selection['points']}, *selection.get('shotPrompts', [])]:
            image = np.asarray(Image.open(private / f"recovered-gesture-r180-20261105/rgb/rgb_{prompt['frameIndex']:04d}.png"))
            evidence = np.asarray(Image.open(guide / data['components'][n]['frames'][prompt['frameIndex']]['file']))
            interior = cv2.distanceTransform((evidence >= 224).astype(np.uint8), cv2.DIST_L2, 5)
            for point in prompt['points']:
                if point['label'] != 1: continue
                x, y = [min(s - 1, round(v * s)) for v, s in zip(point['position'], [1430, 1000])]
                core_radius = float(__import__('os').environ.get('AUTOPROMOTE_PRIVATE_COLOUR_CORE_RADIUS', '8'))
                if not 8 <= core_radius <= 32: raise ValueError('Private source-colour core outside bounds')
                if a.verified_colours and interior[y, x] < core_radius: continue
                palette.extend(image[y-1:y+2, x-1:x+2].reshape(-1, 3))
        palettes[n] = palette
    rows = []; started = time.monotonic()
    for index in [6, 10, 15, 23, 39, 47]:
        source = private / f'recovered-gesture-r180-20261105/rgb/rgb_{index:04d}.png'
        rgb = np.asarray(Image.open(source).convert('RGB')); prior = cache.frame(index); result = prior.copy()
        previous = np.asarray(Image.open(private / f'recovered-gesture-r180-20261105/rgb/rgb_{index-1:04d}.png'))
        motion = source_motion_radius(rgb, previous, 1)
        primary = np.asarray(Image.open(guide / data['components'][0]['frames'][index]['file']))
        for n in [1, 2]:
            hand = np.asarray(Image.open(guide / data['components'][n]['frames'][index]['file']))
            result, accepted, error = measured_alpha(rgb, background, observed, result, hand, primary, motion, palettes[n])
        Image.fromarray(result).save(a.out / f'alpha-{index:04d}.png')
        class Candidate:
            manifest = cache.manifest; artifact_sha256 = cache.artifact_sha256; observed_background = cache.observed_background
            def frame(self, _: int): return result
        baseline = VfxFrameRenderer(plan, cache, lambda _: private / 'replacement.png'); baseline.foreground_cache.root = None
        candidate = VfxFrameRenderer(plan, Candidate(), lambda _: private / 'replacement.png'); candidate.foreground_cache.root = None
        before = baseline.render(Image.fromarray(rgb), index); after = candidate.render(Image.fromarray(rgb), index)
        after.save(a.out / f'actual-{index:04d}.png')
        for side, box in [('left', (280, 230, 720, 730)), ('right', (1020, 150, 1430, 760))]:
            w, h = box[2]-box[0], box[3]-box[1]; sheet = Image.new('RGB', (w*3, h+24)); draw = ImageDraw.Draw(sheet)
            for n, (label, picture) in enumerate([('Exact source', Image.fromarray(rgb)), ('Current / observed colour recovery', before), ('Measured mixture alpha / same recovery', after)]):
                sheet.paste(picture.crop(box), (n*w, 24)); draw.text((n*w+3, 4), label, fill='white')
            sheet.save(a.out / f'{side}-{index:04d}.jpg', quality=98)
        rows.append({'frame': index, 'changedPixels': int(np.count_nonzero(result != prior)), 'gapAlpha': int(result[329,1250]), 'sourceSha256': sha(source), 'seconds': time.monotonic()-started}); print(json.dumps(rows[-1]), flush=True)
    write_json(a.out / 'receipt.json', {'rows': rows, 'registeredImplementationChanged': False, 'nativeAdmission': False, 'visualReviewPending': True, 'fourMinuteProof': False})


if __name__ == '__main__': main()
