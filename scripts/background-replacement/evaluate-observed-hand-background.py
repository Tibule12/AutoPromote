"""Local matte probe using genuinely visible background in the SAME shot.

Only source frame 47's visually checked empty wall/curtain/TV regions qualify.
Its person is not an empty plate, so no alpha from that domain may be applied.
"""
import argparse
import hashlib
import json
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageDraw
import torch


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('tracked', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--indices', default='0,6')
    args = parser.parse_args()
    args.output.mkdir(mode=0o700, parents=True)
    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    cv2.setNumThreads(1)
    checkpoint = Path('/home/tibule12/.cache/autopromote-model-runtime/backgroundmattingv2-mit-eval-v1/model.pth')
    assert hashlib.file_digest(checkpoint.open('rb'), 'sha256').hexdigest() == '6d449e8a0445438491cf07c03a6e86f21df2b3aa2dc630d9430347fcb807aae4'
    model = torch.jit.load(str(checkpoint), map_location='cpu').eval()
    model.backbone_scale = .5
    model.refine_mode = 'full'
    source = Path('/dev/shm/autopromote-background-reassessment-20261103/background-motion-224-226/source')
    background = np.array(Image.open(source / '0047.png'))
    domain = Image.new('L', (1430, 1000))
    draw = ImageDraw.Draw(domain)
    draw.rectangle((0, 0, 600, 420), fill=255)
    draw.rectangle((0, 0, 400, 720), fill=255)
    draw.rectangle((1150, 0, 1429, 400), fill=255)
    draw.rectangle((1300, 0, 1429, 490), fill=255)
    domain.save(args.output / 'observed-background-domain.png')
    background_tensor = torch.from_numpy(background.copy()).permute(2, 0, 1)[None].float() / 255
    background_tensor = torch.nn.functional.pad(background_tensor, (0, 2, 0, 0), mode='replicate')
    replacement = np.array(Image.open('reports/background-replacement-20261101/private/replacement.png').convert('RGB').resize((1430, 1000)))
    for index in map(int, args.indices.split(',')):
        rgb = np.array(Image.open(source / f'{index:04d}.png'))
        pixels = torch.from_numpy(rgb.copy()).permute(2, 0, 1)[None].float() / 255
        pixels = torch.nn.functional.pad(pixels, (0, 2, 0, 0), mode='replicate')
        with torch.inference_mode():
            alpha, foreground, *_ = model(pixels, background_tensor)
        alpha = alpha[0, 0, :, :1430].numpy().clip(0, 1)
        foreground = foreground[0, :, :, :1430].permute(1, 2, 0).numpy().clip(0, 1)
        result = np.rint(255 * (foreground * alpha[..., None] + replacement / 255 * (1 - alpha[..., None]))).astype(np.uint8)
        # Show only valid observed-background areas; the remainder explicitly
        # shows original RGB and is not a full replacement qualification.
        valid = np.array(domain) > 0
        result[~valid] = rgb[~valid]
        Image.fromarray(np.rint(alpha * 255).astype(np.uint8)).save(args.output / f'alpha-{index:04d}.png')
        Image.fromarray(np.rint(foreground * 255).astype(np.uint8)).save(args.output / f'foreground-{index:04d}.png')
        Image.fromarray(result).save(args.output / f'composite-{index:04d}.png')
        print('ACTUAL_OBSERVED_BACKGROUND_PROBE', index, flush=True)
    (args.output / 'receipt.json').write_text(json.dumps({'observedBackgroundSourceFrame': 5423,
        'knownEmptyBackgroundOnly': True, 'model': 'BackgroundMattingV2 MIT publisher v1.0.0',
        'weightSha256': '6d449e8a0445438491cf07c03a6e86f21df2b3aa2dc630d9430347fcb807aae4',
        'fullShotQualification': False, 'visualPass': False}))


if __name__ == '__main__':
    main()
