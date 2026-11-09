"""Bounded colour-line matting probe; observed source background is required.

No unobserved/inpainted background can authorize a change. The result is an
explicit diagnostic, not an automatically qualified replacement pipeline.
"""
import argparse
from pathlib import Path
import cv2
import numpy as np
from PIL import Image


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('tracked', type=Path)
    parser.add_argument('observed', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--soft-domain', action='store_true')
    args = parser.parse_args()
    args.output.mkdir(parents=True, mode=0o700)
    cv2.setNumThreads(1)
    source = Path('/dev/shm/autopromote-background-reassessment-20261103/background-motion-224-226/source')
    photographed = np.array(Image.open(source / '0047.png')).astype(np.float32)
    valid = np.array(Image.open(args.observed / 'observed-background-domain.png')) > 0
    replacement = np.array(Image.open('reports/background-replacement-20261101/private/replacement.png').convert('RGB').resize((1430, 1000)))
    for index in [0, 6]:
        rgb = np.array(Image.open(source / f'{index:04d}.png')).astype(np.float32)
        alpha = np.array(Image.open(args.tracked / 'alpha' / f'{index:04d}.png')).astype(np.float32) / 255
        foreground = rgb.copy()
        union = np.array(Image.open(args.tracked / 'masks' / f'{index:04d}.png'))
        clear = (cv2.dilate((union > 24).astype(np.uint8), np.ones((71, 71), np.uint8)) == 0) & valid
        clear &= np.linalg.norm(rgb - photographed, axis=2) < 25
        offset = np.median((rgb - photographed)[clear], axis=0)
        background = np.clip(photographed + offset, 0, 255)
        for component in [1, 2]:
            hand = np.array(Image.open(args.tracked / 'components' / f'{component}-{index:04d}.png'))
            domain = (cv2.dilate((hand > 24).astype(np.uint8), np.ones((41, 41), np.uint8)) > 0) & valid
            y, x = np.where(domain)
            if not len(x):
                continue
            x0, y0, x1, y1 = int(x.min()), int(y.min()), int(x.max()) + 1, int(y.max()) + 1
            crop = np.s_[y0:y1, x0:x1]
            current, empty = rgb[crop], background[crop]
            distance = np.linalg.norm(current - empty, axis=2)
            interior = cv2.erode((hand[crop] > 224).astype(np.uint8), np.ones((13, 13), np.uint8)) > 0
            interior &= valid[crop]
            hsv = cv2.cvtColor(current.astype(np.uint8), cv2.COLOR_RGB2HSV)
            interior &= (hsv[:, :, 0] < 35) & (hsv[:, :, 1] > 65) & (hsv[:, :, 2] < 220)
            samples = current[interior]
            sample_distance = distance[interior]
            if len(samples) < 16:
                continue
            # The least mixed palm samples have the greatest observed-source
            # contrast. Blurred wall-coloured fingertips are not opaque seeds.
            samples = samples[sample_distance >= np.percentile(sample_distance, 65)]
            _, _, palette = cv2.kmeans(samples.astype(np.float32), min(12, len(samples)), None,
                (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, .1), 1, cv2.KMEANS_PP_CENTERS)
            vector = palette[:, None, None, :] - empty[None]
            delta = current - empty
            candidates = np.clip(np.sum(delta[None] * vector, axis=3) / np.maximum(np.sum(vector * vector, axis=3), 1), 0, 1)
            residual = np.mean((delta[None] - candidates[..., None] * vector) ** 2, axis=3)
            winner = np.argmin(residual, axis=0)
            a = np.take_along_axis(candidates, winner[None], axis=0)[0]
            error = np.sqrt(np.take_along_axis(residual, winner[None], axis=0)[0])
            # Source noise cannot become a faint brown wake on the replacement.
            a[distance < 7] = 0
            use = domain[crop] & (error < 10)
            weight = use.astype(np.float32)
            if args.soft_domain:
                # Clothing inside a dilated hand domain has its own foreground
                # colour; a skin palette cannot authorize its deletion.
                skin = (hsv[:, :, 0] < 35) & (hsv[:, :, 1] > 85) & (hsv[:, :, 2] < 225)
                eligible = skin | (distance < 12)
                confidence = np.clip((12 - error) / 5, 0, 1) * eligible
                observed_distance = cv2.distanceTransform(valid.astype(np.uint8), cv2.DIST_L2, 5)[crop]
                hand_distance = cv2.distanceTransform(domain[crop].astype(np.uint8), cv2.DIST_L2, 5)
                weight *= confidence * np.minimum(observed_distance / 25, 1) * np.minimum(hand_distance / 10, 1)
            alpha[crop][:] = alpha[crop] * (1 - weight) + a * weight
            recovered = (current - (1 - a[..., None]) * empty) / np.maximum(a[..., None], .02)
            recovered = np.clip(recovered, 0, 255)
            foreground[crop][:] = foreground[crop] * (1 - weight[..., None]) + recovered * weight[..., None]
            print('PHOTOGRAPHED_COLOUR_LINE', index, component, len(samples), int(use.sum()), offset.tolist(), flush=True)
        result = np.rint(foreground.clip(0, 255) * alpha[..., None] + replacement * (1 - alpha[..., None])).astype(np.uint8)
        Image.fromarray(np.rint(alpha * 255).astype(np.uint8)).save(args.output / f'alpha-{index:04d}.png')
        Image.fromarray(result).save(args.output / f'composite-{index:04d}.png')


if __name__ == '__main__':
    main()
