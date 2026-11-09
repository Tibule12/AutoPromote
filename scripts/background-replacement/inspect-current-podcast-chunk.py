"""Decode actual finished review media with frame-matched original-source pairs.

Produces private whole-frame contact pages and moving-edge detail pages, not a
visual pass or a customer delivery. Never infer acceptance from numeric checks.
"""
import argparse
import json
from pathlib import Path
import subprocess

import cv2
import numpy as np
from PIL import Image, ImageDraw

from model_workers.common import sha, write_json


def decoder(file, *, filter=None, count=None):
    command = ['ffmpeg', '-nostdin', '-v', 'error', '-threads', '1', '-i', str(file)]
    if filter is not None:
        command += ['-vf', filter]
    if count is not None:
        command += ['-frames:v', str(count)]
    return subprocess.Popen([*command, '-an', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], stdout=subprocess.PIPE)


def read(process, width, height):
    data = process.stdout.read(width * height * 3)
    if len(data) != width * height * 3:
        raise RuntimeError('Actual review source ended before its recorded frame clock')
    return np.frombuffer(data, np.uint8).reshape(height, width, 3).copy()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('chunk', type=Path)
    parser.add_argument('out', type=Path)
    args = parser.parse_args()
    args.out.mkdir(exist_ok=False)
    receipt = json.loads((args.chunk / 'receipt.json').read_text())
    picture = args.chunk / receipt['picture']['file']
    if sha(picture) != receipt['picture']['sha256']:
        raise ValueError('Rendered chunk changed')
    private = Path('reports/background-replacement-20261101/private')
    geometry = json.loads((private / 'full-rate-registration-20261104/smoothed-registration.json').read_text())
    first, count, angle = receipt['firstFrame'], receipt['frames'], receipt['angle']
    width, height = [1430, 1440][angle], 1000
    streams = []
    original = decoder(geometry['source'], filter=f'fps=24,trim=start_frame={first}:end_frame={first+count},setpts=PTS-STARTPTS', count=count)
    rendered = decoder(picture)
    alpha = decoder(args.chunk / 'alpha-lossless.mkv',
        filter=f'trim=start_frame={receipt["outputStartIndex"]}:end_frame={receipt["outputStartIndex"]+count},setpts=PTS-STARTPTS', count=count)
    streams += [original, rendered, alpha]
    regions = ([('Head', (300, 80, 790, 500)), ('Hands and torso', (240, 400, 860, 950)),
                ('Rig and couch', (750, 500, 1430, 1000)), ('Plant', (1030, 440, 1430, 900))] if angle == 0 else
               [('Head', (650, 20, 1050, 500)), ('Left hand', (180, 240, 700, 740)),
                ('Right hand', (1040, 200, 1440, 740)), ('Mic and lower clothing', (80, 680, 1250, 1000))])
    pages = {}
    records = []
    previous = None
    try:
        for local in range(count):
            absolute = first + local
            row = geometry['rows'][absolute]
            if row['angle'] != angle:
                raise ValueError('Review chunk crosses a camera boundary')
            raw = read(original, 1920, 1080)
            source = cv2.warpAffine(raw, np.asarray(row['smoothedMatrix']), (width, height), flags=cv2.INTER_LINEAR)
            current = read(rendered, 1430, 1000)
            values = read(alpha, width, height)[:, :, 0]
            source_image = Image.fromarray(source)
            current_image = Image.fromarray(current)
            if width != 1430:
                source_image = source_image.resize((1430, 1000), Image.Resampling.LANCZOS)
            page = local // 6
            if page not in pages:
                pages[page] = Image.new('RGB', (2145, 2072))
            canvas = pages[page]
            col, line = local % 3, (local % 6) // 3
            x, y = col * 715, line * 1036
            for offset, image, title in [(18, source_image, 'Original source'), (536, current_image, 'Actual current render')]:
                canvas.paste(image.resize((715, 500)), (x, y + offset))
                ImageDraw.Draw(canvas).text((x + 5, y + offset - 16), f'{title} | source frame {absolute} ({absolute/24:.6f}s)', fill='white')
            movement = 0 if previous is None else float(np.mean(np.abs(source.astype(float) - previous.astype(float))))
            records.append({'sourceFrame': absolute, 'localOutputFrame': local,
                'currentAlphaMean': float(values.mean()), 'currentAlphaZeroPixels': int((values == 0).sum()),
                'sourceMeanFrameDifference255': movement, 'visualPass': False})
            # Source-size crops at the most useful early/late/moving frames.
            if local in {0, count - 1, count // 2} or local % 6 == 0:
                for title, box in regions:
                    left, top, right, bottom = box
                    w, h = right - left, bottom - top
                    sheet = Image.new('RGB', (w * 3, h + 22))
                    fitted = current_image.resize((width, height), Image.Resampling.LANCZOS)
                    for col2, (image, label) in enumerate([(Image.fromarray(source), 'Source'), (fitted, 'Actual render'),
                                                          (Image.fromarray(values).convert('RGB'), 'Actual alpha')]):
                        sheet.paste(image.crop(box), (col2 * w, 22))
                        ImageDraw.Draw(sheet).text((col2 * w + 4, 3), f'{label} | {title} | {absolute}', fill='white')
                    sheet.save(args.out / f'frame-{absolute:04d}-{title.lower().replace(" ", "-")}.jpg', quality=97)
            previous = source
        for process in streams:
            if process.stdout.read(1) or process.wait() != 0:
                raise RuntimeError('Unexpected review frames or decoder failure')
        for page, canvas in pages.items():
            canvas.save(args.out / f'actual-source-render-page-{page:02d}.jpg', quality=96)
        write_json(args.out / 'decoded-review.json', {'firstFrame': first, 'framesDecoded': count,
            'sourceFramesMatchedExactlyOnce': True, 'wholeFramePages': len(pages),
            'pictureSha256': sha(picture), 'actualHumanVisualReviewCompleted': False,
            'nativeStudioQualification': False, 'creativePass': False, 'records': records})
    finally:
        for process in streams:
            if process.poll() is None:
                process.kill()
                process.wait()
            process.stdout.close()


if __name__ == '__main__':
    main()
