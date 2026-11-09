"""One real source-frame test of an authored background-gap correction.

Uses the existing pinned model and shared compositor. No mask artifact is
edited, no result is admitted, and a single-frame check cannot qualify motion.
"""
import copy
import json
import time
from pathlib import Path
from types import SimpleNamespace

import cv2
import numpy as np
import torch
from PIL import Image, ImageDraw
from transformers import VitMatteForImageMatting

from model_workers.adapters.temporal_alpha import condition_trimap_clicks
from model_workers.common import sha, write_json
from python_media_worker.studio_subject_matte import CachedSubjectMatte
from python_media_worker.studio_vfx_plan import VfxFrameRenderer


def main():
    private = Path('reports/background-replacement-20261101/private')
    out = private / 'reviewed-finger-gap-r281-20261107'
    out.mkdir(mode=0o700, exist_ok=False)
    job = Path('/tmp/autopromote-application-demo-FDokC2/model-jobs/72d11d8677a384bf5e779d794978ec07f51e671c8759ebdaae6bd550ebd2ca67/a72eb85d-6a69-475c-96e3-9a82f934ff8c')
    work = Path('/tmp/autopromote-application-demo-FDokC2/subject-previews/0357ddba-d7bc-4d96-8fe1-b55bb7eab16d')
    source = private / 'recovered-gesture-r180-20261105/rgb/rgb_0015.png'
    rgb = np.asarray(Image.open(source).convert('RGB'))
    reference = np.asarray(Image.open(source.with_name('rgb_0000.png')).convert('RGB'))
    cache = CachedSubjectMatte(work / 'matte', work / 'source.mp4')
    prior = cache.frame(15)
    trimap = np.array(Image.open(job / 'outputs/trimaps/trimap_0015.png'))
    guide = job / 'component_dependency'
    manifest = json.loads((guide / 'manifest.json').read_text())
    corrected = copy.deepcopy(manifest)
    # Source-inspected gap between the moving fingers. This is a user-style
    # binary BG correction, not known ground-truth opacity at blurred pixels.
    for number in [0, 2]:
        selection = corrected['components'][number]['selection']
        prompts = selection.setdefault('shotPrompts', [])
        prompt = next((p for p in prompts if p['frameIndex'] == 15), None)
        if prompt is None:
            prompt = {'frameIndex': 15, 'points': []}
            prompts.append(prompt)
        prompt['points'].append({'position': [1250 / 1430, 329 / 1000], 'label': 0})
    components = [(c['selection'], np.array(Image.open(guide / c['frames'][15]['file'])))
                  for c in corrected['components']]
    conditioned = condition_trimap_clicks(trimap, rgb, reference, components, 15)
    assert conditioned[329, 1250] == 0
    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    model = VitMatteForImageMatting.from_pretrained(
        '/home/tibule12/.cache/autopromote-model-runtime/vitmatte-small-pinned',
        local_files_only=True, use_safetensors=True).eval()
    box = (1020, 150, 1430, 760)
    x0, y0, x1, y1 = box
    sl = np.s_[y0:y1, x0:x1]
    pictures = [Image.fromarray(rgb)]
    rows = []
    effects = json.loads((work / 'spec.json').read_text())['spec']['scene']['effects']
    started = time.monotonic()
    for label, tri in [('same-crop-no-new-click', trimap), ('reviewed-bg-click', conditioned)]:
        local = rgb[sl]
        t = tri[sl]
        h, w = t.shape
        inp = torch.cat((torch.from_numpy(local.copy()).permute(2, 0, 1).float() / 127.5 - 1,
                         torch.from_numpy(t.copy())[None].float() / 255), 0)[None]
        inp = torch.nn.functional.pad(inp, (0, (-w) % 32, 0, (-h) % 32), mode='replicate')
        with torch.inference_mode():
            prediction = model(pixel_values=inp).alphas[0, 0, :h, :w].numpy().clip(0, 1)
        prediction[t == 0] = 0
        prediction[t == 255] = 1
        alpha = prior.copy()
        alpha[sl] = np.rint(prediction * 255).astype(np.uint8)
        identity = __import__('hashlib').sha256(alpha.tobytes()).hexdigest()
        candidate = SimpleNamespace(manifest=cache.manifest, artifact_sha256=identity,
                                    observed_background=cache.observed_background,
                                    frame=lambda _: alpha)
        plan = {'version': 1, 'source_sha256': cache.manifest['source_sha256'],
                'matte_sha256': identity, 'effects': copy.deepcopy(effects)}
        renderer = VfxFrameRenderer(plan, candidate, lambda _: private / 'replacement.png')
        renderer.foreground_cache.root = None
        picture = renderer.render(Image.fromarray(rgb), 15)
        picture.save(out / f'{label}-actual.png')
        Image.fromarray(alpha).save(out / f'{label}-alpha.png')
        Image.fromarray(tri).save(out / f'{label}-trimap.png')
        pictures.append(picture)
        rows.append({'label': label, 'gapAlpha': int(alpha[329, 1250]),
                     'seconds': time.monotonic() - started})
    w, h = x1-x0, y1-y0
    sheet = Image.new('RGB', (w * 3, h + 24))
    for i, (label, picture) in enumerate(zip(['Actual source', *[r['label'] for r in rows]], pictures)):
        sheet.paste(picture.crop(box), (i*w, 24))
        ImageDraw.Draw(sheet).text((i*w+3, 4), label, fill='white')
    sheet.save(out / 'actual-source-gap-comparison.jpg', quality=98)
    write_json(out / 'receipt.json', {'rows': rows, 'sourceSha256': sha(source),
        'correction': {'frame': 15, 'point': [1250, 329], 'label': 0, 'components': [0, 2]},
        'nativeAdmission': False, 'visualReviewPending': True, 'motionQualified': False,
        'fourMinuteProof': False, 'registeredWeightsChanged': False})
    print(json.dumps(rows), flush=True)


if __name__ == '__main__':
    main()
