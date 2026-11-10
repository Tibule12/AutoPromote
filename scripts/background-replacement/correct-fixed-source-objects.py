"""Correct the actual fixed-object selections in the same retained source shot.

The plant's thin branches get points on verified dark source pixels against the
visible pale TV panel. Background examples also include the TV's black bezel.
Only explicitly fixed objects reuse their first-frame mask, as in the adapter.
"""
import argparse
import copy
import json
from pathlib import Path
import cv2
import numpy as np
from PIL import Image
from model_workers.adapters.component_segmentation import ComponentVideoTracker
from model_workers.common import write_json, sha


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('moving', type=Path)
    parser.add_argument('fixed', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, mode=0o700)
    (args.output / 'components').mkdir()
    cv2.setNumThreads(1)
    params = copy.deepcopy(json.loads((args.moving / 'parameters.json').read_text()))
    params['components'] = copy.deepcopy(json.loads((args.fixed / 'parameters.json').read_text())['components'])
    source = Path('/dev/shm/autopromote-background-reassessment-20261103/background-motion-224-226/source/0000.png')
    rgb = np.array(Image.open(source))

    def labelled(fg, bg):
        return [{'position': [x / 1430, y / 1000], 'label': label}
                for label, group in [(1, fg), (0, bg)] for x, y in group]

    boom, mic, plant, chair = params['components']
    boom['points'].extend(labelled([(220, 950)], [(265, 930), (300, 880), (150, 900), (160, 980), (230, 880), (350, 880), (350, 920)]))
    mic['points'] = labelled([(850, 550), (850, 660), (850, 740)], [(790, 520), (940, 550), (930, 950)])
    foreground = [(25, 800), (30, 845), (50, 870), (157, 827), (159, 944), (75, 960)]
    region = rgb[805:855, 80:165]
    yy, xx = np.where(np.max(region, axis=2) < 120)
    candidates = np.column_stack((xx + 80, yy + 805))
    assert len(candidates) > 6
    # Annotation assistance only: every chosen point is an ACTUAL dark source
    # branch pixel in the inspected empty-panel region, never a generated edge.
    for _ in range(2):
        distances = np.min(np.sum((candidates[:, None] - np.array(foreground)[None]) ** 2, axis=2), axis=1)
        point = tuple(map(int, candidates[np.argmax(distances)]))
        foreground.append(point)
    plant['points'] = labelled(foreground, [(80, 770), (100, 800), (265, 930), (300, 880), (150, 900), (150, 980), (135, 920), (160, 890)])
    assert len(plant['points']) == 16
    write_json(args.output / 'parameters.json', params)
    write_json(args.output / 'source-click-rgb.json', {'sourceFrame': 5376, 'sourcePngSha256': sha(source),
        'plant': [{'position': point, 'rgb': rgb[point[1], point[0]].tolist()} for point in foreground]})
    sam = next(m for m in json.loads(Path('config/model-runtime/registry.v1.json').read_text())['models'] if m['id'] == 'sam21-multiobject-cpu-v2')
    tracker = ComponentVideoTracker({'model': sam, 'request': {'parameters': params}}, {'width': 1430, 'height': 1000},
                                    Path('/home/tibule12/.cache/autopromote-model-runtime/sam21-small-pinned'))
    _, planes = tracker.frame(rgb, 0)
    for number in range(1, 5):
        for index in range(48):
            Image.fromarray(planes[number]).save(args.output / 'components' / f'{number}-{index:04d}.png')
    write_json(args.output / 'mask-receipt.json', {'frames': 48, 'sourceStartFrame': 5376,
        'movingRois': tracker.rois, 'fixedObjectsOnly': True, 'firstFrameModelCalls': 4,
        'heldOnlyAsExplicitlyFixed': True, 'movingPersonNotFrozen': True,
        'visualPass': False, 'authenticatedStudioJob': False})
    print('ACTUAL_CORRECTED_FIXED_OBJECTS', flush=True)


if __name__ == '__main__':
    main()
