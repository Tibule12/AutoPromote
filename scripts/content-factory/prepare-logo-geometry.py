"""Trace the existing raster logo; keep its glyphs, holes and relative spacing.

This is CPU asset preparation, not image generation. No font is substituted.
The bounded tracer currently accepts the repository's dark-background logo.
"""
import argparse
from collections import defaultdict, deque
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


def simplify(points, tolerance=.55):
    """Ramer-Douglas-Peucker with subpixel error in original image units."""
    if len(points) < 3:
        return points
    p = np.asarray(points, dtype=float)
    delta = p[-1] - p[0]
    if np.dot(delta, delta) == 0:
        distance = np.linalg.norm(p - p[0], axis=1)
    else:
        offset = p - p[0]
        distance = np.abs(delta[0] * offset[:, 1] - delta[1] * offset[:, 0]) / np.linalg.norm(delta)
    index = int(np.argmax(distance))
    if distance[index] <= tolerance:
        return [points[0], points[-1]]
    return simplify(points[:index + 1], tolerance)[:-1] + simplify(points[index:], tolerance)


def trace(mask):
    edges = defaultdict(list)
    h, w = mask.shape
    for y, x in zip(*np.where(mask)):
        x, y = int(x), int(y)
        if y == 0 or not mask[y - 1, x]:
            edges[(x, y)].append((x + 1, y))
        if x == w - 1 or not mask[y, x + 1]:
            edges[(x + 1, y)].append((x + 1, y + 1))
        if y == h - 1 or not mask[y + 1, x]:
            edges[(x + 1, y + 1)].append((x, y + 1))
        if x == 0 or not mask[y, x - 1]:
            edges[(x, y + 1)].append((x, y))
    loops = []
    while edges:
        start = next(iter(edges))
        points = [start]
        current = start
        while True:
            options = edges[current]
            following = options.pop()
            if not options:
                del edges[current]
            current = following
            if current == start:
                break
            points.append(current)
        # Split the closed contour at the furthest point so RDP keeps its shape.
        anchor = int(np.argmax(np.linalg.norm(np.asarray(points) - points[0], axis=1)))
        loop = simplify(points[:anchor + 1])[:-1] + simplify(points[anchor:] + [points[0]])[:-1]
        if len(loop) >= 3:
            loops.append(loop)
    return loops


def prepare(source, output):
    rgb = np.asarray(Image.open(source).convert('RGB')).astype(int)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    white = (np.minimum(np.minimum(r, g), b) > 90) & (rgb.max(axis=2) - rgb.min(axis=2) < 45)
    violet = (b > 70) & (b > r * 1.2) & (b > g * 1.2)
    mask = white | violet
    visited = np.zeros(mask.shape, dtype=bool)
    parts = []
    for y, x in zip(*np.where(mask)):
        if visited[y, x]:
            continue
        queue = deque([(int(x), int(y))])
        visited[y, x] = True
        pixels = []
        while queue:
            px, py = queue.popleft()
            pixels.append((px, py))
            for nx, ny in [(px - 1, py), (px + 1, py), (px, py - 1), (px, py + 1)]:
                if 0 <= nx < mask.shape[1] and 0 <= ny < mask.shape[0] and mask[ny, nx] and not visited[ny, nx]:
                    visited[ny, nx] = True
                    queue.append((nx, ny))
        if len(pixels) < 35:
            continue
        component = np.zeros_like(mask)
        xs, ys = np.asarray(pixels).T
        component[ys, xs] = True
        color = np.median(rgb[ys, xs], axis=0).astype(int).tolist()
        parts.append({'bounds': [int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1)],
                      'kind': 'rocket' if np.mean(violet[ys, xs]) > .5 else 'wordmark',
                      'color': color, 'pixelArea': len(pixels), 'loops': trace(component)})
    parts.sort(key=lambda p: p['bounds'][0])
    if len([p for p in parts if p['kind'] == 'rocket']) != 1 or len(parts) != 13:
        raise ValueError(f'Unexpected actual-logo component count: {len(parts)}; review source rather than guessing')
    bounds = [min(p['bounds'][0] for p in parts), min(p['bounds'][1] for p in parts),
              max(p['bounds'][2] for p in parts), max(p['bounds'][3] for p in parts)]
    # Raster comparison uses the same pixel centers as the original threshold.
    reconstructed = Image.new('1', (mask.shape[1] * 2, mask.shape[0] * 2))
    draw = ImageDraw.Draw(reconstructed)
    for part in parts:
        for loop in sorted(part['loops'], key=len, reverse=True):
            area = sum(loop[i][0] * loop[(i + 1) % len(loop)][1] - loop[(i + 1) % len(loop)][0] * loop[i][1] for i in range(len(loop)))
            draw.polygon([(x * 2, y * 2) for x, y in loop], fill=1 if area > 0 else 0)
    rebuilt = np.asarray(reconstructed)[1::2, 1::2]
    kept = np.zeros_like(mask)
    for part in parts:
        x0, y0, x1, y1 = part['bounds']
        kept[y0:y1, x0:x1] |= mask[y0:y1, x0:x1]
    iou = float(np.sum(rebuilt & kept) / np.sum(rebuilt | kept))
    if iou < .965:
        raise ValueError(f'Logo contour fidelity failed: {iou:.4f}')
    output.parent.mkdir(parents=True, exist_ok=True)
    result = {'version': 1, 'sourceAsset': str(source),
              'sourceSha256': hashlib.file_digest(source.open('rb'), 'sha256').hexdigest(),
              'imageSize': [mask.shape[1], mask.shape[0]], 'bounds': bounds,
              'aspectRatio': (bounds[2] - bounds[0]) / (bounds[3] - bounds[1]),
              'uniformScalingOnly': True, 'fontSubstitution': False,
              'contourToleranceSourcePixels': .55, 'thresholdMaskIoU': iou, 'parts': parts}
    output.write_text(json.dumps(result, separators=(',', ':')))
    rebuilt_image = Image.new('RGB', (mask.shape[1], mask.shape[0]), '#060709')
    rebuilt_draw = ImageDraw.Draw(rebuilt_image)
    for part in parts:
        for loop in sorted(part['loops'], key=len, reverse=True):
            area = sum(loop[i][0] * loop[(i + 1) % len(loop)][1] - loop[(i + 1) % len(loop)][0] * loop[i][1] for i in range(len(loop)))
            rebuilt_draw.polygon(loop, fill=tuple(part['color']) if area > 0 else '#060709')
    rebuilt_image.crop(bounds).save(output.with_suffix('.png'))
    print(json.dumps({k: v for k, v in result.items() if k != 'parts'}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    prepare(args.source, args.output)
