"""Compare the larger licensed matte model on exact saved source trimaps.

Private diagnostic only: no admission, sidecar replacement or product default.
"""
import argparse, json, time
from pathlib import Path
import numpy as np
import torch
from PIL import Image, ImageDraw, ImageOps
from transformers import VitMatteForImageMatting
from model_workers.common import sha, write_json


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('out', type=Path)
    args = parser.parse_args()
    args.out.mkdir(exist_ok=False)
    private = Path('reports/background-replacement-20261101/private')
    job = Path('/tmp/autopromote-application-demo-FDokC2/model-jobs/18f335240ae4777cd864a862acd96d59d5cbd1d4452a637391956c98bdfa56cf/a59210fa-0254-4000-b1b6-0e92ac9535e8')
    model_dir = Path('/home/tibule12/.cache/autopromote-model-runtime/vitmatte-base-private-eval-20261106')
    provenance = json.loads((model_dir / 'provenance.json').read_text())
    expected = next(r['sha256'] for r in provenance['files'] if r['path'] == 'model.safetensors')
    assert sha(model_dir / 'model.safetensors') == expected
    torch.set_num_threads(2)
    model = VitMatteForImageMatting.from_pretrained(model_dir, local_files_only=True, use_safetensors=True).to('cuda').eval()
    background = ImageOps.fit(Image.open(private / 'replacement.png').convert('RGB'), (1430, 1000))
    rows = []; started = time.monotonic()
    for index in [6, 10, 15, 23, 39, 47]:
        source = private / f'recovered-gesture-r180-20261105/rgb/rgb_{index:04d}.png'
        rgb = np.asarray(Image.open(source).convert('RGB'))
        alpha = np.asarray(Image.open(job / f'outputs/subject_masks/matte_{index:04d}.png'))
        trimap = np.asarray(Image.open(job / f'outputs/trimaps/trimap_{index:04d}.png'))
        result = alpha.copy()
        for side, box in [('left', (280, 230, 720, 730)), ('right', (1020, 150, 1430, 760))]:
            x0, y0, x1, y1 = box; sl = np.s_[y0:y1, x0:x1]
            tri = trimap[sl]; local = rgb[sl]; h, w = tri.shape
            inp = torch.cat((torch.from_numpy(local.copy()).permute(2, 0, 1).float() / 127.5 - 1,
                             torch.from_numpy(tri.copy())[None].float() / 255), 0)[None].to('cuda')
            inp = torch.nn.functional.pad(inp, (0, (-w) % 32, 0, (-h) % 32), mode='replicate')
            with torch.inference_mode():
                inferred = model(pixel_values=inp).alphas[0, 0, :h, :w].cpu().numpy().clip(0, 1)
            inferred[tri == 0] = 0; inferred[tri == 255] = 1
            result[sl] = np.rint(inferred * 255).astype(np.uint8)
        Image.fromarray(result).save(args.out / f'alpha-{index:04d}.png')
        before = Image.composite(Image.fromarray(rgb), background, Image.fromarray(alpha))
        after = Image.composite(Image.fromarray(rgb), background, Image.fromarray(result))
        for side, box in [('left', (280, 230, 720, 730)), ('right', (1020, 150, 1430, 760))]:
            w, h = box[2] - box[0], box[3] - box[1]
            sheet = Image.new('RGB', (w * 3, h + 24)); draw = ImageDraw.Draw(sheet)
            for n, (label, picture) in enumerate([('Exact source', Image.fromarray(rgb)), ('Native small alpha', before), ('Base / same trimap', after)]):
                sheet.paste(picture.crop(box), (n * w, 24)); draw.text((n * w + 3, 4), label, fill='white')
            sheet.save(args.out / f'{side}-{index:04d}.jpg', quality=98)
        rows.append({'frame': index, 'sourceSha256': sha(source), 'blueGapPixelAlpha': int(result[329, 1250]), 'seconds': time.monotonic() - started})
        print(json.dumps(rows[-1]), flush=True)
    write_json(args.out / 'receipt.json', {'rows': rows, 'model': provenance, 'sameActualTrimaps': True, 'nativeAdmission': False, 'registeredModelChanged': False, 'fourMinuteProof': False, 'visualReviewPending': True})


if __name__ == '__main__':
    main()
