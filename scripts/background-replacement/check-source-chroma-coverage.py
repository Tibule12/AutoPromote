"""Private 4:2:0 chroma-coverage diagnostic on actual moving source frames.

Opacity is unchanged. This is not an admitted model/compositor implementation;
real camera colour, chroma siting and source/foreground variation need review.
"""
from pathlib import Path
import copy
import json
import subprocess
import time
from types import SimpleNamespace

import cv2
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt

from model_workers.common import sha, write_json
from python_media_worker.studio_source_background import load_evidence
from python_media_worker.studio_vfx_plan import VfxFrameRenderer


def to_ycc(rgb):
    value = rgb.astype(np.float32)
    y = value @ np.array([.299, .587, .114], np.float32)
    return np.stack([y, (value[..., 2]-y)/1.772+128,
                     (value[..., 0]-y)/1.402+128], axis=-1)


def from_ycc(ycc):
    y, u, v = ycc[..., 0], ycc[..., 1]-128, ycc[..., 2]-128
    return np.stack([y+1.402*v, y-.344136*u-.714136*v, y+1.772*u], axis=-1)


def correct_chroma(rgb, foreground, alpha, background, support, raw_u, raw_v):
    h, w = alpha.shape
    a = alpha.astype(np.float32)/255
    small = (w//2, h//2)
    coverage = cv2.resize(a, small, interpolation=cv2.INTER_AREA)
    observed = cv2.resize(support.astype(np.float32), small, interpolation=cv2.INTER_AREA) >= .999
    b = cv2.resize(to_ycc(background)[..., 1:], small, interpolation=cv2.INTER_AREA)
    # Actual native limited-range BT.601 chroma, before RGB upsampling.
    current = (np.stack([raw_u, raw_v], axis=-1).astype(np.float32)-128)*255/224+128
    recovered = (current-(1-coverage[..., None])*b)/np.maximum(coverage[..., None], .01)
    valid = observed & (coverage > .15) & np.all((recovered >= 0) & (recovered <= 255), axis=2)
    if not valid.any():
        return foreground.copy(), np.zeros(alpha.shape, np.float32)
    _, nearest = distance_transform_edt(~valid, return_indices=True)
    recovered = recovered[nearest[0], nearest[1]]
    chroma = cv2.resize(recovered, (w, h), interpolation=cv2.INTER_LINEAR)
    coverage_up = cv2.resize(coverage, (w, h), interpolation=cv2.INTER_LINEAR)
    valid_up = cv2.resize(valid.astype(np.float32), (w, h), interpolation=cv2.INTER_LINEAR)
    near_edge = distance_transform_edt(a >= .999) < 4
    weight = valid_up*np.clip((coverage_up-.15)/.2, 0, 1)
    weight *= (coverage_up < .999) & near_edge & support & (alpha > 0)
    value = to_ycc(foreground)
    value[..., 1:] = value[..., 1:]*(1-weight[..., None])+chroma*weight[..., None]
    corrected = np.rint(from_ycc(value).clip(0, 255)).astype(np.uint8)
    corrected[weight == 0] = foreground[weight == 0]
    return corrected, weight


def main():
    private = Path('reports/background-replacement-20261101/private')
    out = private/'source-chroma-coverage-r375-20261108'
    out.mkdir(mode=0o700, exist_ok=False)
    (out/'implementation.py').write_bytes(Path(__file__).read_bytes())
    work = Path('/dev/shm/autopromote-fresh-bounded-pipeline-r360-20261107')
    directory = work/'alpha/subject_masks'
    manifest = json.loads((directory/'manifest.json').read_text())
    evidence = load_evidence(directory, manifest)
    source = private/'native-source-click-footprint-r312-20261107/retained-native-model-artifact/normalized_source.mp4'
    assert sha(source) == manifest['source_sha256']
    decoded = subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-threads', '1', '-i', str(source),
        '-map', '0:v:0', '-pix_fmt', 'yuv420p', '-f', 'rawvideo', 'pipe:1'],
        capture_output=True, check=True, timeout=60).stdout
    width, height = 1430, 1000
    luma_bytes, chroma_bytes = width*height, width*height//4
    frame_bytes = luma_bytes+2*chroma_bytes
    assert len(decoded) == frame_bytes*48
    effects = json.loads((private/'native-current-pipeline-r358-20261107/ready-for-inference.autopromote.json').read_text())['snapshot']['subjectVfxScenes'][0]['scene']['effects']
    rows = []
    started = time.monotonic()
    for index in [6, 15, 17, 47]:
        image = Image.open(work/f'alpha/rgb/rgb_{index:04d}.png').convert('RGB')
        alpha = Image.open(directory/manifest['frames'][index]['file']).convert('L')
        cache = SimpleNamespace(manifest=manifest, artifact_sha256=sha(work/'alpha/subject_masks.tar.gz'),
            observed_background=evidence, frame=lambda _: np.array(alpha))
        renderer = VfxFrameRenderer({'version': 1, 'source_sha256': manifest['source_sha256'],
            'matte_sha256': cache.artifact_sha256, 'effects': copy.deepcopy(effects)}, cache, lambda _: private/'replacement.png')
        renderer.foreground_cache.root = None
        f, a = renderer._prepare_foreground(image, alpha, effects, width, height)
        offset = index*frame_bytes+luma_bytes
        u = np.frombuffer(decoded, np.uint8, chroma_bytes, offset).reshape(height//2, width//2)
        v = np.frombuffer(decoded, np.uint8, chroma_bytes, offset+chroma_bytes).reshape(height//2, width//2)
        corrected, weight = correct_chroma(np.array(image), np.array(f), np.array(a), *evidence, u, v)
        f = Image.fromarray(corrected)
        renderer._prepare_foreground = lambda *unused, f=f, a=a: (f, a)
        result = renderer.render(image, index)
        result.save(out/f'actual-{index:04d}.png')
        Image.fromarray(np.rint(weight*255).astype(np.uint8)).save(out/f'weight-{index:04d}.png')
        before = Image.open(private/f'fresh-rendered-review-r361-20261107/actual-{index:04d}.png')
        for label, box in [('left', (280,240,700,720)), ('right', (1040,170,1430,760)), ('head', (640,40,1040,380))]:
            w, h = box[2]-box[0], box[3]-box[1]
            page = Image.new('RGB', (w*3, h+24))
            for n, (title, picture) in enumerate([('Source', image), ('Existing', before), ('Chroma-coverage diagnostic', result)]):
                page.paste(picture.crop(box), (n*w, 24))
                ImageDraw.Draw(page).text((n*w+2, 3), title, fill='white')
            page.save(out/f'{label}-{index:04d}.jpg', quality=98)
        rows.append({'frame': index, 'sourceSha256': sha(work/f'alpha/rgb/rgb_{index:04d}.png'),
            'effectiveAlphaSha256': sha(directory/manifest['frames'][index]['file']), 'alphaChanged': False,
            'modifiedForegroundPixels': int(np.count_nonzero(weight)), 'seconds': time.monotonic()-started})
        write_json(out/'receipt.json', {'rows': rows, 'actualNativeYuv420Chroma': True,
            'sourceColourSpaceAssumedBT601NeedsQualification': True, 'nativeAdmission': False,
            'fourMinuteProof': False, 'paidCloudInference': False, 'visualReviewPending': True})
        print(json.dumps(rows[-1]), flush=True)


if __name__ == '__main__':
    main()
