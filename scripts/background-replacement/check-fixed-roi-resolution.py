"""Internal resolution/throughput comparison of the same pinned SAM weights.

No app configuration is changed and no quality conclusion follows from timing.
The current four-minute job remains independent of this comparison.
"""
import argparse
import copy
import gc
import json
from pathlib import Path
import socket
import time

import cv2
import numpy as np
from PIL import Image, ImageDraw
import torch
from transformers import Sam2VideoConfig, Sam2VideoModel

from model_workers.adapters.component_segmentation import ComponentVideoTracker
from model_workers.common import sha, write_json


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('out', type=Path)
    args = parser.parse_args()
    args.out.mkdir(exist_ok=False)
    private = Path('reports/background-replacement-20261101/private')
    directory = Path('/home/tibule12/.cache/autopromote-model-runtime/sam21-small-pinned')
    source = private / 'corrective-click-agreement-r66/striped-person-first-frame/actual-source.png'
    rgb = np.asarray(Image.open(source))
    snapshot = json.loads((private / 'fine-props-r8/native-scoped-final/final-project.autopromote.json').read_text())['snapshot']
    selected = json.loads(snapshot['subjectVfxScenes'][0]['maskJob']['selectionJson'])
    components = copy.deepcopy(selected['components'])
    for component in components:
        component['propagate'] = False
        component['shotPrompts'] = []
    params = {'subjectId': 'PRIVATE_RESOLUTION_REVIEW_PERSON', 'initialBox': selected['box'],
        'points': [{'position': point, 'label': label} for point, label in
            zip(selected['prompt']['points'], selected['prompt']['labels'])],
        'shotPrompts': [], 'components': components}
    definition = next(model for model in json.loads(Path('config/model-runtime/registry.v1.json').read_text())['models']
        if model['id'] == 'sam21-multiobject-cpu-v2')
    socket.socket.connect = lambda *a, **k: (_ for _ in ()).throw(RuntimeError('Local review networking disabled'))
    results = []
    for size in [512, 768, 1024]:
        config = Sam2VideoConfig.from_pretrained(directory, local_files_only=True)
        config.image_size = size
        config.prompt_encoder_config.image_size = size
        config.vision_config.backbone_config.image_size = [size, size]
        config.vision_config.backbone_feature_sizes = [[size // divisor] * 2 for divisor in [4, 8, 16]]
        config.memory_attention_rope_feat_sizes = [size // 16] * 2
        model = Sam2VideoModel.from_pretrained(directory, config=config, local_files_only=True).to('cuda').eval()
        tracker = ComponentVideoTracker({'model': definition, 'request': {'parameters': params}},
            {'width': 1430, 'height': 1000}, directory, model=model, device='cuda',
            refresh_fixed=True, offload_state=True)
        torch.cuda.synchronize()
        started = time.monotonic()
        _, planes = tracker.frame(rgb, 0)
        torch.cuda.synchronize()
        elapsed = time.monotonic() - started
        path = args.out / str(size)
        path.mkdir()
        for number, plane in enumerate(planes):
            Image.fromarray(plane).save(path / f'component-{number:02d}.png')
        results.append({'imageEncoderSide': size, 'frames': 1, 'objects': len(planes), 'seconds': elapsed,
            'sourceSha256': sha(source), 'weightsSha256': sha(directory / 'model.safetensors'),
            'configurationIsPrivateExperiment': size != 1024, 'visualPass': False})
        write_json(args.out / 'timing.json', results)
        print(json.dumps(results[-1]), flush=True)
        del tracker, model
        gc.collect()
        torch.cuda.empty_cache()
    sheet = Image.new('RGB', (1800, 1500))
    regions = [('Plant and stand', 4, (850, 440, 1430, 1000)),
               ('Microphone and boom', 1, (400, 400, 1100, 850)),
               ('Far stand', 2, (1200, 500, 1430, 1000))]
    for row, (title, number, box) in enumerate(regions):
        for col, size in enumerate([512, 768, 1024]):
            mask = np.asarray(Image.open(args.out / str(size) / f'component-{number:02d}.png'))
            image = Image.composite(Image.fromarray(rgb), Image.new('RGB', (1430, 1000), (90, 95, 100)),
                Image.fromarray((mask >= 128).astype(np.uint8) * 255))
            crop = image.crop(box)
            crop.thumbnail((600, 470))
            sheet.paste(crop, (col * 600, row * 500 + 25))
            ImageDraw.Draw(sheet).text((col * 600 + 5, row * 500 + 4), f'{title} | encoder {size}', fill='white')
    sheet.save(args.out / 'actual-mask-comparison.jpg', quality=97)


if __name__ == '__main__':
    main()
