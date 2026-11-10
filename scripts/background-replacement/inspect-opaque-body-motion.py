"""Review an internal shared-compositor candidate, never a native export claim."""
import argparse
import json
from pathlib import Path
import subprocess
import time

import numpy as np
from PIL import Image, ImageDraw

from model_workers.common import sha, write_json


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('candidate', type=Path)
    parser.add_argument('--composite-prefix', default='actual-composite')
    parser.add_argument('--alpha-prefix', default='alpha')
    parser.add_argument('--movie-name', default='private-body-interior-diagnostic.mp4')
    args = parser.parse_args()
    root = args.candidate
    deadline = time.monotonic()+900
    while True:
        try:
            receipt = json.loads((root/'receipt.json').read_text())
        except (OSError, json.JSONDecodeError):
            receipt = {}
        if len(receipt.get('rows', [])) == 48:
            break
        if time.monotonic() > deadline:
            raise RuntimeError('Bounded candidate continuation did not finish')
        time.sleep(2)
    assert receipt.get('opaqueBodyCoreOnly') or (receipt.get('trackedHandSourceFixedTiles')
        and receipt.get('onlySubtractsFromExistingAlpha') and receipt.get('opaqueBodyRecoveryFrom'))
    out = root/'encoded-review'
    out.mkdir(mode=0o700, exist_ok=False)
    assert Path(args.movie_name).name == args.movie_name and args.movie_name.endswith('.mp4')
    movie = out/args.movie_name
    subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-framerate', '24',
        '-i', str(root/f'{args.composite_prefix}-%04d.png'), '-frames:v', '48',
        '-an', '-c:v', 'libx264', '-threads', '1', '-preset', 'fast',
        '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(movie)],
        check=True, timeout=120)
    decoder = subprocess.Popen(['ffmpeg', '-nostdin', '-v', 'error', '-threads', '1',
        '-i', str(movie), '-map', '0:v:0', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'],
        stdout=subprocess.PIPE)
    private = Path('reports/background-replacement-20261101/private')
    rows = []
    try:
        for index in range(48):
            raw = decoder.stdout.read(1430*1000*3)
            assert len(raw) == 1430*1000*3
            picture = Image.frombytes('RGB', (1430, 1000), raw)
            source = Image.open(private/f'recovered-gesture-r180-20261105/rgb/rgb_{index:04d}.png').convert('RGB')
            if index % 3 == 0:
                page = Image.new('RGB', (2860, 3072))
            y = index % 3*1024
            page.paste(source, (0, y+24))
            page.paste(picture, (1430, y+24))
            draw = ImageDraw.Draw(page)
            draw.text((4, y+4), f'Actual source | {index}', fill='white')
            draw.text((1434, y+4), f'Decoded internal candidate | {index}', fill='white')
            if index % 3 == 2:
                page.save(out/f'whole-{index//3:02d}.jpg', quality=97)
            if index % 4 == 0:
                lower_page = Image.new('RGB', (1640, 856))
            ly = index % 4*214
            box = (430, 810, 1250, 1000)
            lower_page.paste(source.crop(box), (0, ly+24))
            lower_page.paste(picture.crop(box), (820, ly+24))
            draw = ImageDraw.Draw(lower_page)
            draw.text((4, ly+4), f'Actual source | {index}', fill='white')
            draw.text((824, ly+4), f'Decoded internal candidate | {index}', fill='white')
            if index % 4 == 3:
                lower_page.save(out/f'lower-{index//4:02d}.jpg', quality=98)
            rows.append({'frame': index, 'sourceSha256': sha(private/f'recovered-gesture-r180-20261105/rgb/rgb_{index:04d}.png'),
                         'rawCompositeSha256': sha(root/f'{args.composite_prefix}-{index:04d}.png'),
                         'alphaSha256': sha(root/f'{args.alpha_prefix}-{index:04d}.png')})
        assert not decoder.stdout.read(1) and decoder.wait() == 0
    finally:
        if decoder.poll() is None:
            decoder.kill()
            decoder.wait()
        decoder.stdout.close()
    write_json(out/'receipt.json', {'rows': rows, 'decodedFrames': 48,
        'movieSha256': sha(movie), 'actualSourceAndAlphaBound': True,
        'nativeExport': False, 'audioIncluded': False, 'internalDiagnosticOnly': True,
        'visualReviewPending': True, 'fourMinuteProof': False})
    print('ALL_48_CANDIDATE_FRAMES_DECODED_FOR_VISUAL_REVIEW', flush=True)


if __name__ == '__main__':
    main()
