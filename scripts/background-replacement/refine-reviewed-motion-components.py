"""Actual canonical CPU alpha refinement of the retained moving-shot tracks.

Private local file provenance is explicit; this does not fabricate an authenticated
Studio job or storage generation. Native lifecycle qualification is separate.
"""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

import cv2
import numpy as np
from PIL import Image
from pymatting import estimate_foreground_ml

from model_workers.common import sha, canonical, write_json, bundle_masks, blob, probe
from model_workers.adapters.cpu_matting import refine
from python_media_worker.studio_subject_matte import CachedSubjectMatte, mask_geometry, video_geometry
from python_media_worker.studio_vfx_plan import VfxFrameRenderer


def finish(out, vit):
    for index in range(48):
        with Image.open(out / 'composite' / f'{index:04d}.png') as image:
            assert image.size == (1430, 1000) and image.mode == 'RGB'
    master = '/home/tibule12/Videos/cam-combiner-5050c706-a6cb-48bc-ac43-8fa54f21bc1a.mp4'
    subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-framerate', '24', '-i', str(out / 'composite/%04d.png'),
                    '-ss', '224', '-i', master, '-map', '0:v:0', '-map', '1:a:0',
                    '-t', '2', '-c:v', 'libx264', '-preset', 'fast', '-crf', '12', '-threads', '2', '-pix_fmt', 'yuv420p',
                    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', str(out / 'Movement replacement review.mp4')], check=True)
    write_json(out / 'receipt.json', {'privateDirectCpuEvaluation': True, 'authenticatedStudioJob': False,
        'sourceMasterFrames': [5376, 5423], 'all48SourceRgbFramesLosslessVerified': True,
        'movingComponents': 3, 'separatelySelectedFixedObjects': 4, 'freshSamHz': 24, 'freshVitMatteHz': 24,
        'canonicalAlphaFunction': 'model_workers.adapters.cpu_matting.refine', 'modelVersion': vit['modelVersion'],
        'canonicalWholeFrameCompositor': True, 'previewSha256': sha(out / 'Movement replacement review.mp4'),
        'originalAudioSource': master, 'originalAudioIntervalSeconds': [224, 226],
        'visualPass': False, 'newFourMinuteRender': False, 'paidCloud': False})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('moving', type=Path)
    parser.add_argument('fixed', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--finish-existing', action='store_true')
    args = parser.parse_args()
    out = args.output.resolve()
    if args.finish_existing:
        finish(out, json.loads((out / 'private-refinement-spec.json').read_text())['model'])
        return
    out.mkdir(parents=True, mode=0o700)
    write_json(out / 'implementation-at-start.json', {name: sha(Path(name)) for name in [
        'model_workers/adapters/component_segmentation.py', 'model_workers/adapters/cpu_matting.py',
        'model_workers/adapters/temporal_alpha.py', 'model_workers/adapters/source_edge_alpha.py',
        'config/model-runtime/registry.v1.json']})
    cv2.setNumThreads(1)
    source_frames = Path('/dev/shm/autopromote-background-reassessment-20261103/background-motion-224-226/source')
    source = out / 'registered-source-lossless.mkv'
    subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-framerate', '24', '-i', str(source_frames / '%04d.png'),
                    '-frames:v', '48', '-an', '-c:v', 'ffv1', '-level', '3', '-threads', '2', '-pix_fmt', 'bgr0', str(source)], check=True)
    # Decode every pixel and frame: the matte must see the actual source images.
    decoder = cv2.VideoCapture(str(source))
    for index in range(48):
        ok, bgr = decoder.read()
        assert ok and np.array_equal(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB), np.array(Image.open(source_frames / f'{index:04d}.png')))
    assert not decoder.read()[0]
    decoder.release()
    source_hash = sha(source)
    params = json.loads((args.moving / 'parameters.json').read_text())
    fixed_params = json.loads((args.fixed / 'parameters.json').read_text())
    assert all(c['propagate'] is False for c in fixed_params['components'])
    params['components'].extend(fixed_params['components'])
    source_range = {'space': 'source', 'startTick': 0, 'endTick': 180000}
    request = {'projectId': 'private-local-motion-review-20261104', 'sourceAssetId': 'registered-224-226',
               'sourceSha256': source_hash, 'sourceRange': source_range, 'parameters': params}
    parent_dir = out / 'parent-masks'
    components_dir = out / 'components'
    parent_dir.mkdir()
    components_dir.mkdir()
    component_records = []
    selections = [{'id': params['subjectId'], 'box': params['initialBox'], 'points': params['points'],
                   'shotPrompts': params['shotPrompts'], 'propagate': True}, *params['components']]
    for number, selection in enumerate(selections):
        original, component = (args.moving, number) if number < 3 else (args.fixed, number - 2)
        rows = []
        for index in range(48):
            file = f'component_{number:02d}_{index:04d}.png'
            shutil.copyfile(original / 'components' / f'{component}-{index:04d}.png', components_dir / file)
            rows.append({'index': index, 'file': file, 'sha256': sha(components_dir / file)})
        roi = [0, 0, 1430, 1000] if number < 3 else json.loads((args.fixed / 'mask-receipt.json').read_text())['movingRois'][component]
        component_records.append({'selection': selection, 'roi': roi, 'frames': rows})
    manifest = {'version': 1, 'source_sha256': source_hash, 'frame_count': 48, 'components': component_records}
    write_json(components_dir / 'manifest.json', manifest)
    bundle_masks(components_dir, out / 'component_dependency.tar.gz')
    rows = []
    for index in range(48):
        union = np.maximum.reduce([np.array(Image.open(components_dir / c['frames'][index]['file'])) for c in component_records])
        file = f'matte_{index:04d}.png'
        Image.fromarray(union).save(parent_dir / file)
        rows.append({'index': index, 'time': index / 24, 'file': file, 'sha256': sha(parent_dir / file), **mask_geometry(union)})
    prompt = {'version': 1, 'source_sha256': source_hash,
              'points': [[p['position'][0] * 1430, p['position'][1] * 1000] for p in params['points']],
              'labels': [p['label'] for p in params['points']], 'shot_prompts': []}
    registry = json.loads(Path('config/model-runtime/registry.v1.json').read_text())['models']
    sam = next(m for m in registry if m['id'] == 'sam21-multiobject-cpu-v2')
    vit = next(m for m in registry if m['id'] == 'vitmatte-small-temporal-cpu-v2')
    write_json(parent_dir / 'manifest.json', {'version': 1, 'kind': 'source_bound_subject_matte', **video_geometry(source),
        'source_sha256': source_hash, 'prompt': prompt, 'prompt_sha256': hashlib.sha256(canonical(prompt).encode()).hexdigest(),
        'frames': rows, 'model': sam['checkpoint'], 'model_weights_sha256': sam['weights'][0]['sha256'], 'shot_cuts': []})
    cache = CachedSubjectMatte(parent_dir, source)
    generation = 'private-local-file-sha256:' + source_hash
    artifact_core = {'ownerUid': 'private-local-evaluation', **{k: request[k] for k in ['projectId', 'sourceAssetId', 'sourceSha256', 'sourceRange']},
                     'provenance': {'sourceGeneration': generation, 'executionKind': 'private_direct_cpu_evaluation'}}
    artifact = {**artifact_core, 'artifactHash': hashlib.sha256(canonical(artifact_core).encode()).hexdigest()}
    params['refinement'] = {'maskArtifactHash': artifact['artifactHash'], 'radius': 15, 'holdouts': [], 'colourComponentIds': ['plant', 'boom-and-stand', 'chair']}
    spec = {'ownerUid': 'private-local-evaluation', 'request': request, 'source': {'generation': generation}, 'model': vit,
            'componentDependency': {'artifact': artifact, 'file': blob(out / 'component_dependency.tar.gz')}}
    write_json(out / 'private-refinement-spec.json', spec)
    output = out / 'canonical-alpha'
    output.mkdir()
    refine(spec, source, probe(source), Path('/home/tibule12/.cache/autopromote-model-runtime/vitmatte-small-pinned'), output, cache, artifact)
    refined = CachedSubjectMatte(output / 'subject_masks', source)
    root = Path('reports/background-replacement-20261101/private')
    scene = json.loads((root / 'fine-props-r8/native-scoped-final/final-project.autopromote.json').read_text())['snapshot']['subjectVfxScenes'][0]['scene']
    effects = [copy.deepcopy(e) for e in scene['effects'] if e['type'] in ['background_replace', 'foreground_grade']]
    renderer = VfxFrameRenderer({'version': 1, 'source_sha256': source_hash, 'matte_sha256': refined.artifact_sha256, 'effects': effects}, refined,
                               lambda _: root / 'replacement.png')
    pictures = out / 'composite'
    pictures.mkdir()
    for index in range(48):
        rgb = np.array(Image.open(source_frames / f'{index:04d}.png'))
        alpha = refined.frame(index)
        foreground = estimate_foreground_ml(rgb.astype(np.float64) / 255, alpha.astype(np.float64) / 255).clip(0, 1)
        solid = (alpha == 0) | (alpha == 255)
        foreground[solid] = rgb[solid] / 255
        renderer.render(Image.fromarray(np.rint(foreground * 255).astype(np.uint8)), index).save(pictures / f'{index:04d}.png')
        print('ACTUAL_CANONICAL_MOTION_COMPOSITE', index, flush=True)
    finish(out, vit)


if __name__ == '__main__':
    main()
