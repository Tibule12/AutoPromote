"""Compare soft moving-edge trimaps on retained actual SAM2 source masks."""
import argparse
import json
from pathlib import Path
import time
import cv2
import numpy as np
from PIL import Image, ImageDraw
import torch
from transformers import VitMatteForImageMatting
from pymatting import estimate_foreground_ml
from model_workers.adapters.temporal_alpha import make_trimap


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('tracked', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--indices', default='0,6')
    args = parser.parse_args()
    args.output.mkdir(mode=0o700, parents=True)
    cv2.setNumThreads(1)
    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    model = VitMatteForImageMatting.from_pretrained('/home/tibule12/.cache/autopromote-model-runtime/vitmatte-small-pinned', local_files_only=True).eval()
    source = Path('/dev/shm/autopromote-background-reassessment-20261103/background-motion-224-226/source')
    background = np.array(Image.open('reports/background-replacement-20261101/private/replacement.png').convert('RGB').resize((1430, 1000)))
    for index in map(int, args.indices.split(',')):
        rgb = np.array(Image.open(source / f'{index:04d}.png'))
        union = np.array(Image.open(args.tracked / 'masks' / f'{index:04d}.png'))
        hands = np.maximum(*[np.array(Image.open(args.tracked / 'components' / f'{n}-{index:04d}.png')) for n in [1, 2]])
        opaque = (union >= 128).astype(np.uint8)
        baseline = make_trimap(opaque, 12, evidence=union)
        for variant in ['hands-unknown', 'body-soft-core']:
            trimap = baseline.copy()
            if variant == 'hands-unknown':
                domain = cv2.dilate((hands > 24).astype(np.uint8), np.ones((31, 31), np.uint8)) > 0
                # A blurred finger can be translucent even well inside the
                # thresholded segmentation. It cannot be forced opaque there.
                core = cv2.erode((hands >= 224).astype(np.uint8), np.ones((49, 49), np.uint8)) > 0
                trimap[domain] = 128
                trimap[core] = 255
            else:
                trimap[:] = 128
                trimap[cv2.dilate(opaque, np.ones((31, 31), np.uint8)) == 0] = 0
                trimap[cv2.erode(opaque, np.ones((31, 31), np.uint8)) > 0] = 255
            pixels = torch.from_numpy(rgb.copy()).permute(2, 0, 1).float() / 127.5 - 1
            inputs = torch.cat((pixels, torch.from_numpy(trimap)[None].float() / 255), 0)[None]
            inputs = torch.nn.functional.pad(inputs, (0, 10, 0, 24))
            with torch.inference_mode():
                alpha = model(pixel_values=inputs).alphas[0, 0, :1000, :1430].numpy().clip(0, 1)
            alpha[trimap == 0] = 0
            alpha[trimap == 255] = 1
            fg = estimate_foreground_ml(rgb.astype(np.float64) / 255, alpha.astype(np.float64))
            result = np.rint(255 * (fg.clip(0, 1) * alpha[..., None] + background / 255 * (1 - alpha[..., None]))).astype(np.uint8)
            folder = args.output / variant
            folder.mkdir(exist_ok=True)
            Image.fromarray(np.rint(alpha * 255).astype(np.uint8)).save(folder / f'alpha-{index:04d}.png')
            Image.fromarray(trimap).save(folder / f'trimap-{index:04d}.png')
            Image.fromarray(result).save(folder / f'composite-{index:04d}.png')
            sheet = Image.new('RGB', (1430 * 2, 600))
            sheet.paste(Image.fromarray(rgb).crop((0, 150, 1430, 750)), (0, 0))
            sheet.paste(Image.fromarray(result).crop((0, 150, 1430, 750)), (1430, 0))
            ImageDraw.Draw(sheet).text((10, 5), f'{224 + index / 24:.3f} SOURCE / {variant} — diagnostic only', fill='white')
            sheet.save(folder / f'comparison-{index:04d}.jpg', quality=96)
            print('ACTUAL_SOFT_EDGE_ALPHA', index, variant, flush=True)


if __name__ == '__main__':
    main()
