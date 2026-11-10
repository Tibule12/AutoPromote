"""Offline real-footage review of moving-selection clipping and corrective clicks.

Uses the canonical tracker and compositor, existing pinned commercial checkpoints,
and the exact registered 224–226 second source frames. No frozen moving subject,
cropped RGB compositing, downloads, cloud inference or visual qualification.
"""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import socket
import subprocess
import time

import cv2
import numpy as np
from PIL import Image, ImageDraw
import torch
from transformers import VitMatteForImageMatting
from pymatting import estimate_foreground_ml

from model_workers.adapters.component_segmentation import ComponentVideoTracker
from model_workers.adapters.temporal_alpha import make_trimap
from python_media_worker.studio_vfx_plan import VfxFrameRenderer


def points(foreground, background):
    return [{'position': [x / 1430, y / 1000], 'label': label}
            for label, positions in [(1, foreground), (0, background)] for x, y in positions]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('output', type=Path)
    parser.add_argument('--frames', type=int, default=48)
    parser.add_argument('--resume', action='store_true')
    parser.add_argument('--mask-only', action='store_true')
    parser.add_argument('--fresh-objects', action='store_true')
    args = parser.parse_args()
    out = args.output.resolve()
    out.mkdir(mode=0o700, parents=True, exist_ok=args.resume)
    for name in ['masks', 'trimaps', 'alpha', 'composite', 'comparisons', 'components']:
        (out / name).mkdir(exist_ok=args.resume)
    started = time.monotonic()
    cv2.setNumThreads(1)
    torch.set_num_threads(4)
    torch.set_num_interop_threads(1)
    socket.socket.connect = lambda *a, **k: (_ for _ in ()).throw(RuntimeError('Offline inference only'))
    cache_root = Path('/home/tibule12/.cache/autopromote-model-runtime')
    registry = json.loads(Path('config/model-runtime/registry.v1.json').read_text())['models']
    sam = next(m for m in registry if m['id'] == 'sam21-multiobject-cpu-v2')
    vit = next(m for m in registry if m['id'] == 'vitmatte-small-cpu-v1')
    assert hashlib.file_digest((cache_root / 'vitmatte-small-pinned/model.safetensors').open('rb'), 'sha256').hexdigest() == vit['weights'][0]['sha256']
    # These are observed source-pixel clicks, not points copied between poses.
    hand_clicks = {
        0: [points([(228, 531), (180, 470), (272, 570)], [(120, 440), (320, 480), (350, 360)]),
            points([(1410, 590), (1385, 535)], [(1350, 490), (1300, 400)])],
        6: [points([(444, 441), (440, 360)], [(350, 350), (550, 300), (570, 420)]),
            points([(1190, 380), (1150, 290), (1294, 341)], [(1320, 250), (1080, 250), (1250, 200)])],
        12: [points([(515, 475), (485, 410), (558, 395), (609, 445), (604, 480)], [(480, 300), (620, 350), (680, 410)]),
             points([(1190, 450), (1250, 360), (1100, 380)], [(1260, 300), (1300, 430), (1020, 300)])],
        24: [points([(360, 510), (320, 425), (375, 400), (420, 431), (438, 470)], [(270, 360), (350, 399), (460, 350), (480, 460), (405, 395)]),
             points([(1230, 430), (1197, 282), (1167, 318), (1270, 285), (1370, 351), (1170, 399)],
                    [(1173, 285), (1235, 283), (1320, 340), (1380, 280), (1100, 250)])],
        36: [points([(397, 560), (360, 468), (410, 450), (457, 482), (480, 512)], [(270, 400), (500, 420), (440, 420)]),
             points([(1280, 500), (1185, 425), (1215, 367), (1280, 395), (1370, 440)], [(1330, 365), (1400, 350), (1150, 350)])]
    }
    body_box = [.07, .01, 1, 1]
    body_points = points([(850, 290), (820, 180), (740, 640), (360, 650), (1350, 650), (750, 900)],
                         [(90, 400), (500, 200), (1250, 200), (580, 300)])
    parameters = {'subjectId': 'speaker', 'initialBox': body_box, 'points': body_points,
                  'shotPrompts': [], 'components': []}
    for index in [0, 1]:
        box = [.09, .41, .26, .69] if index == 0 else [.94, .49, 1, .72]
        parameters['components'].append({'id': ['left-hand', 'right-hand'][index], 'box': box,
            'points': hand_clicks[0][index], 'propagate': True,
            'shotPrompts': [{'frameIndex': frame, 'points': clicks[index]} for frame, clicks in hand_clicks.items() if frame]})
    if args.fresh_objects:
        # Fingers belong to the person's selection: correcting only a duplicate
        # hand track cannot subtract an old false-positive in the person track.
        parameters['points'] = body_points + points([(228, 531), (1410, 590)], [])
        parameters['shotPrompts'] = []
        for frame, hands in hand_clicks.items():
            if not frame:
                continue
            foreground = [p for hand in hands for p in hand if p['label'] == 1]
            background = [p for hand in hands for p in hand if p['label'] == 0]
            if len(background) > 7:
                background = background[1:-1]
            keep = 16 - len(background) - 4
            # Both palms are always represented; remaining clicks describe
            # fingertips. Body clicks keep cap, face, pale fabric and lettering.
            palm = [next(p for p in hand if p['label'] == 1) for hand in hands]
            extra = [p for p in foreground if p not in palm]
            correction = points([(820, 180), (850, 300), (740, 670), (700, 615)], []) + palm + extra[:keep - 2] + background
            assert len(correction) <= 16
            parameters['shotPrompts'].append({'frameIndex': frame, 'box': body_box, 'points': correction})
        objects = [
            ('boom-and-stand', [.10, .72, .62, 1],
             [(200, 748), (600, 742), (450, 803), (190, 900)], [(250, 776), (600, 770), (140, 800), (230, 860)]),
            ('microphone', [.54, .48, .67, 1],
             [(850, 550), (850, 660), (850, 740), (850, 900)], [(790, 520), (940, 550), (930, 950)]),
            ('plant', [0, .76, .14, 1],
             [(35, 810), (50, 855), (40, 925)], [(140, 855), (100, 800), (135, 950)]),
            ('chair', [.87, .87, 1, 1],
             [(1330, 940), (1380, 940)], [(1400, 860), (1400, 995)])]
        parameters['components'] = [{'id': name, 'box': box, 'points': points(fg, bg),
                                     'shotPrompts': [], 'propagate': False} for name, box, fg, bg in objects]
    (out / 'parameters.json').write_text(json.dumps(parameters, indent=2))
    tracker = ComponentVideoTracker({'model': sam, 'request': {'parameters': parameters}},
                                    {'width': 1430, 'height': 1000}, cache_root / 'sam21-small-pinned')
    assert all(roi == (0, 0, 1430, 1000) for c, roi in zip(tracker.components, tracker.rois) if c.get('propagate', True))
    model = None if args.mask_only else VitMatteForImageMatting.from_pretrained(cache_root / 'vitmatte-small-pinned', local_files_only=True).eval()
    root = Path('reports/background-replacement-20261101/private')
    source = Path('/dev/shm/autopromote-background-reassessment-20261103/background-motion-224-226/source')
    old = cv2.VideoCapture(str(root / 'four-minute-r9/assembled/Four-minute repaired preview.mp4'))
    old.set(cv2.CAP_PROP_POS_FRAMES, 5376)
    previous = cv2.VideoCapture(str(root / 'four-minute-r9/assembled/Full alpha matte - lossless.mkv'))
    previous.set(cv2.CAP_PROP_POS_FRAMES, 5376)

    class Cache:
        manifest = {'width': 1430, 'height': 1000, 'frame_count': args.frames,
                    'fps': 24, 'fps_fraction': '24/1', 'source_sha256': '0' * 64}
        artifact_sha256 = '0' * 64
        directory = None

        def frame(self, index):
            return self.alpha

    matte_cache = Cache()
    scene = json.loads((root / 'fine-props-r8/native-scoped-final/final-project.autopromote.json').read_text())['snapshot']['subjectVfxScenes'][0]['scene']
    effects = [copy.deepcopy(e) for e in scene['effects'] if e['type'] in ['background_replace', 'foreground_grade']]
    for effect in effects:
        effect['start'], effect['end'] = 0, args.frames / 24
    renderer = VfxFrameRenderer({'version': 1, 'source_sha256': '0' * 64,
                                'matte_sha256': '0' * 64, 'effects': effects}, matte_cache,
                               lambda _: root / 'replacement.png')
    rows = []
    with torch.inference_mode():
        for index in range(args.frames):
            rgb = np.array(Image.open(source / f'{index:04d}.png'))
            union, planes = tracker.frame(rgb, index)
            for component, plane in enumerate(planes):
                Image.fromarray(plane).save(out / 'components' / f'{component}-{index:04d}.png')
            Image.fromarray(union).save(out / 'masks' / f'{index:04d}.png')
            if args.mask_only:
                (out / 'mask-progress.json').write_text(json.dumps({'frames': index + 1, 'target': args.frames,
                    'seconds': time.monotonic() - started, 'movingRois': tracker.rois}))
                print('ACTUAL_FULL_SOURCE_MASK', index, round(time.monotonic() - started, 1), flush=True)
                continue
            ok, prior_alpha = previous.read()
            assert ok
            # Preserve previously reviewed fixed equipment only, never an old
            # moving-hand alpha. Full-current RGB supplies every output pixel.
            prior_alpha = cv2.cvtColor(prior_alpha, cv2.COLOR_BGR2GRAY)
            equipment = np.zeros(union.shape, bool)
            equipment[725:818, 150:875] = True
            equipment[480:820, 790:930] = True
            equipment[800:, 795:855] = True
            equipment[800:, :600] = True
            if args.fresh_objects:
                person = (planes[0] >= 128).astype(np.uint8)
                fixed = (np.maximum.reduce(planes[1:]) >= 128).astype(np.uint8)
                inside = cv2.erode(person, np.ones((31, 31), np.uint8)) > 0
                inside |= cv2.erode(fixed, np.ones((5, 5), np.uint8)) > 0
                distance = cv2.distanceTransform(fixed, cv2.DIST_L2, 5)
                inside |= (distance >= cv2.dilate(distance, np.ones((3, 3), np.uint8)) - .01) & (distance >= 1) & (distance <= 12)
                trimap = np.full(union.shape, 128, np.uint8)
                trimap[cv2.dilate((union >= 128).astype(np.uint8), np.ones((31, 31), np.uint8)) == 0] = 0
                trimap[inside] = 255
            else:
                union[equipment] = np.maximum(union[equipment], prior_alpha[equipment])
                trimap = make_trimap((union >= 128).astype(np.uint8), 12, evidence=union)
            Image.fromarray(trimap).save(out / 'trimaps' / f'{index:04d}.png')
            pixels = torch.from_numpy(rgb.copy()).permute(2, 0, 1).float() / 127.5 - 1
            inputs = torch.cat((pixels, torch.from_numpy(trimap)[None].float() / 255), 0)[None]
            inputs = torch.nn.functional.pad(inputs, (0, 10, 0, 24))
            alpha = model(pixel_values=inputs).alphas[0, 0, :1000, :1430].numpy().clip(0, 1)
            alpha[trimap == 0] = 0
            alpha[trimap == 255] = 1
            values = np.rint(alpha * 255).astype(np.uint8)
            Image.fromarray(values).save(out / 'alpha' / f'{index:04d}.png')
            matte_cache.alpha = values
            foreground = estimate_foreground_ml(rgb.astype(np.float64) / 255, alpha.astype(np.float64))
            solid = (values == 0) | (values == 255)
            foreground[solid] = rgb[solid] / 255
            result = renderer.render(Image.fromarray(np.rint(foreground.clip(0, 1) * 255).astype(np.uint8)), index)
            result.save(out / 'composite' / f'{index:04d}.png')
            ok, old_bgr = old.read()
            assert ok
            sheet = Image.new('RGB', (1430 * 3, 650))
            box = (0, 100, 1430, 750)
            for offset, picture in enumerate([Image.fromarray(rgb), Image.fromarray(cv2.cvtColor(old_bgr, cv2.COLOR_BGR2RGB)), result]):
                sheet.paste(picture.crop(box), (1430 * offset, 0))
            ImageDraw.Draw(sheet).text((10, 5), f'{224 + index / 24:.3f}s — SOURCE / REJECTED / CURRENT TEST', fill='white')
            sheet.save(out / 'comparisons' / f'{index:04d}.jpg', quality=95)
            rows.append({'index': index, 'sourceFrame': 5376 + index,
                         'alphaSha256': hashlib.sha256(values.tobytes()).hexdigest()})
            (out / 'progress.json').write_text(json.dumps({'frames': len(rows), 'target': args.frames,
                                                         'seconds': time.monotonic() - started}))
            print('ACTUAL_FULL_SOURCE_TRACKING', index, round(time.monotonic() - started, 1), flush=True)
    old.release()
    previous.release()
    if args.mask_only:
        (out / 'mask-receipt.json').write_text(json.dumps({'frames': args.frames, 'sourceStartFrame': 5376,
            'fullSourceMovingInference': True, 'movingRois': tracker.rois, 'freshSamHz': 24,
            'visualPass': False, 'nativeStudioQualification': False}))
        return
    subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-framerate', '24', '-i', str(out / 'composite/%04d.png'),
                    '-i', str(root / 'motion-review-r11/Registered source - 224-226s.mp4'), '-map', '0:v:0', '-map', '1:a:0',
                    '-t', str(args.frames / 24), '-c:v', 'libx264', '-preset', 'fast', '-crf', '12', '-threads', '2',
                    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', str(out / 'Movement test.mp4')], check=True)
    (out / 'receipt.json').write_text(json.dumps({'frames': args.frames, 'sourceFrames': [5376, 5376 + args.frames - 1],
        'sourceRange': [224, 224 + args.frames / 24], 'models': [sam['id'], vit['id']],
        'fullSourceMovingInference': True, 'clickFrames': list(hand_clicks), 'freshSamHz': 24, 'freshVitMatteHz': 24,
        'originalPoseBoxNotReapplied': True, 'retainedFixedPropAlphaOnly': not args.fresh_objects,
        'allForegroundObjectsFreshlySelected': args.fresh_objects,
        'nativeStudioQualification': False, 'visualPass': False, 'rows': rows}, indent=2))


if __name__ == '__main__':
    main()
