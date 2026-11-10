"""Review existing native colour-cleanup layers against the actual moving shot.

No new model, keyer or renderer: the plan is compiled by VfxFrameRenderer.
Both the prepared alpha and the complete canonical picture are retained.
"""
import argparse
import copy
import json
import os
from pathlib import Path
import subprocess
import cv2
import numpy as np
from PIL import Image
from model_workers.common import sha, write_json
from python_media_worker.studio_subject_matte import CachedSubjectMatte, mask_geometry
from python_media_worker.studio_vfx_plan import VfxFrameRenderer


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('input', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--white-gap', action='store_true')
    args = parser.parse_args()
    out = args.output.resolve()
    out.mkdir(parents=True, mode=0o700)
    for name in ['composite', 'alpha', 'prepared-cache']:
        (out / name).mkdir()
    os.environ['STUDIO_VFX_FOREGROUND_CACHE_DIR'] = str(out / 'prepared-cache')
    cv2.setNumThreads(1)
    source = args.input / 'registered-source-lossless.mkv'
    cache = CachedSubjectMatte(args.input / 'canonical-alpha/subject_masks', source)
    root = Path('reports/background-replacement-20261101/private')
    scene = json.loads((root / 'fine-props-r8/native-scoped-final/final-project.autopromote.json').read_text())['snapshot']['subjectVfxScenes'][0]['scene']
    effects = [copy.deepcopy(e) for e in scene['effects'] if e['type'] in ['background_replace', 'foreground_grade']]
    base = next(copy.deepcopy(e) for e in scene['effects'] if e['type'] == 'foreground_refine')
    decontaminate = {**base, 'id': 'recover-current-edge-colour', 'decontaminate': 1, 'edge_radius': 0,
                    'feather': 0, 'dark_max': 0, 'detail_box': [0, 0, 0, 0], 'clear_box': [0, 0, 0, 0],
                    'recover_box': [0, 0, 0, 0]}
    orange = {**base, 'id': 'remove-source-tv-orange', 'decontaminate': 0, 'edge_radius': 0,
              'choke': 0, 'feather': .15, 'dark_max': 0, 'clear_box': [0, 0, 0, 0], 'recover_box': [0, 0, 0, 0],
              'detail_box': [0, 0, 385 / 1430, .725], 'reject_hue': 23, 'reject_tolerance': 10,
              'reject_saturation': .7, 'reject_value': .82, 'reject_connected': True, 'after_holdout': True}
    effects += [orange]
    if args.white_gap:
        effects += [{**orange, 'id': 'remove-source-tv-bright-gap', 'detail_box': [300 / 1430, .33, 385 / 1430, .53],
                     'reject_hue': 90, 'reject_tolerance': 60, 'reject_saturation': 0, 'reject_value': .84}]
    effects += [decontaminate]
    plan = {'version': 1, 'source_sha256': sha(source), 'matte_sha256': cache.artifact_sha256, 'effects': effects}
    write_json(out / 'native-compositor-plan.json', plan)
    renderer = VfxFrameRenderer(plan, cache, lambda _: root / 'replacement.png')
    foreground_effects = [e for e in effects if e['type'] in ['foreground_refine', 'foreground_holdout']]
    source_frames = Path('/dev/shm/autopromote-background-reassessment-20261103/background-motion-224-226/source')
    rows, checks = [], []
    for index in range(48):
        frame = Image.open(source_frames / f'{index:04d}.png').convert('RGB')
        before = cache.frame(index)
        alpha = Image.fromarray(before)
        _, prepared = renderer.foreground_cache.prepare(frame, alpha, foreground_effects,
            lambda: renderer._prepare_foreground(frame, alpha, effects, 1430, 1000))
        values = np.array(prepared)
        file = f'matte_{index:04d}.png'
        prepared.save(out / 'alpha' / file)
        renderer.render(frame, index).save(out / 'composite' / f'{index:04d}.png')
        rows.append({'index': index, 'time': index / 24, 'file': file, 'sha256': sha(out / 'alpha' / file), **mask_geometry(values)})
        # Low-saturation bright foreground in the actual hand region includes
        # the ring. Report any removed opaque pixels for VISUAL review.
        hsv = np.array(frame.convert('HSV'))
        ring = (hsv[:, :, 1] < 80) & (hsv[:, :, 2] > 150) & (before >= 245)
        domain = np.zeros(before.shape, bool)
        domain[430:560, 300:430] = True
        ring &= domain
        checks.append({'index': index, 'brightOpaqueHandPixels': int(ring.sum()),
                       'removedBrightOpaqueHandPixels': int(np.count_nonzero(ring & (values.astype(np.int16) + 2 < before))),
                       'gapAlpha350399': int(values[399, 350])})
        print('ACTUAL_NATIVE_COLOUR_CLEANUP', index, flush=True)
    write_json(out / 'alpha/manifest.json', {**cache.manifest, 'frames': rows,
        'alpha_semantics': 'Canonical neural/video alpha followed by saved source-specific TV colour cleanup; not raw model alpha.',
        'foreground_correction_plan_sha256': sha(out / 'native-compositor-plan.json')})
    subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-framerate', '24', '-i', str(out / 'composite/%04d.png'),
                    '-ss', '224', '-i', '/home/tibule12/Videos/cam-combiner-5050c706-a6cb-48bc-ac43-8fa54f21bc1a.mp4',
                    '-map', '0:v:0', '-map', '1:a:0', '-t', '2', '-c:v', 'libx264', '-threads', '2', '-preset', 'fast',
                    '-crf', '12', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart',
                    str(out / 'Moving-shot replacement.mp4')], check=True)
    write_json(out / 'cleanup-checks.json', {'frames': 48, 'checks': checks, 'whiteGapLayer': args.white_gap,
        'normalStudioProjectExport': False, 'visualPass': False, 'canonicalRenderer': True,
        'previewSha256': sha(out / 'Moving-shot replacement.mp4')})


if __name__ == '__main__':
    main()
