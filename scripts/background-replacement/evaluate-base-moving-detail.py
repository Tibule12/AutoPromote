"""Private, source-bound ViTMatte-base detail evaluation; never installs a model.

Actual source/independent selections/trimaps from the rejected native shot are
used without any generated pixels. Checkpoint loading is tensor-only. Results
must be reviewed before any registry or native project change.
"""
import argparse
import hashlib
import json
import time
from pathlib import Path

import cv2
import numpy as np
import torch
from PIL import Image, ImageDraw
from transformers import VitMatteConfig, VitMatteForImageMatting

from model_workers.adapters.moving_detail_alpha import (
    detail_trimap, foreground_colour_support, merge_detail_alpha,
)
from python_media_worker.studio_subject_matte import CachedSubjectMatte, sha256
from python_media_worker.studio_vfx_plan import VfxFrameRenderer


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('out', type=Path)
    p.add_argument('--indices', default='6,9,23,36')
    a = p.parse_args()
    a.out.mkdir(exist_ok=False)
    torch.set_num_threads(4)
    torch.set_num_interop_threads(1)
    cv2.setNumThreads(2)
    root = Path('/tmp/autopromote-application-demo-YU8K0a/model-jobs/46d71c74a26b1292737293505105011117c5c9978872589bb6fc82add8a5e95f/d021b00d-7f30-4a2c-a931-e49ed061fc2f')
    model_dir = Path('/dev/shm/autopromote-vitmatte-base-evaluation-20261104')
    lock = json.loads((model_dir/'source-lock.json').read_text())
    for row in lock['files']:
        with (model_dir/row['path']).open('rb') as stream:
            assert hashlib.file_digest(stream, 'sha256').hexdigest() == row['sha256']
    started = time.monotonic()
    config = VitMatteConfig.from_pretrained(model_dir, local_files_only=True)
    model = VitMatteForImageMatting(config).eval()
    state = torch.load(model_dir/'pytorch_model.bin', map_location='cpu', weights_only=True)
    model.load_state_dict(state, strict=True)
    del state
    print('BASE_MODEL_LOADED_TENSOR_ONLY', flush=True)
    guide = root/'component_dependency'
    manifest = json.loads((guide/'manifest.json').read_text())
    reference = np.asarray(Image.open(root/'outputs/observed_detail/photographed-reference.png'))
    observed = np.asarray(Image.open(root/'outputs/observed_detail/observed-support.png')) > 0
    work = Path('/tmp/autopromote-application-demo-YU8K0a/subject-previews/4e4e7769-e295-4fb5-8310-042cc31c281c')
    spec = json.loads((work/'spec.json').read_text())['spec']
    cache = CachedSubjectMatte(work/'matte', work/'source.mp4')
    assets = {v['assetId']: work/f'replacement-{i}.asset' for i,v in enumerate(spec['replacementAssets'])}
    renderer = VfxFrameRenderer({'version': 1, 'source_sha256': sha256(work/'source.mp4'),
        'matte_sha256': cache.artifact_sha256, 'effects': spec['scene']['effects']},
        cache, asset_resolver=assets.__getitem__)
    palettes = {}
    for component in manifest['components'][1:3]:
        selection = component['selection']; samples = []
        for prompt in [{'frameIndex': 0, 'points': selection.get('points', [])}, *selection.get('shotPrompts', [])]:
            picture = np.asarray(Image.open(root/f"outputs/rgb/rgb_{prompt['frameIndex']:04d}.png"))
            h,w = picture.shape[:2]
            for point in prompt['points']:
                if point['label'] != 1: continue
                x = min(w-1, round(point['position'][0]*w)); y = min(h-1, round(point['position'][1]*h))
                samples.extend(picture[max(0,y-1):min(h,y+2),max(0,x-1):min(w,x+2)].reshape(-1,3))
        palettes[selection['id']] = np.asarray(samples, np.float32)
    records = []
    frame_original = cache.frame
    for index in map(int, a.indices.split(',')):
        rgb = np.asarray(Image.open(root/f'outputs/rgb/rgb_{index:04d}.png'))
        prior = np.asarray(Image.open(root/f'outputs/subject_masks/matte_{index:04d}.png')).copy()
        base = np.asarray(Image.open(root/f'outputs/trimaps/trimap_{index:04d}.png'))
        union = np.asarray(Image.open(root/f'dependency/matte_{index:04d}.png'))
        for ci in [1,2]:
            c = manifest['components'][ci]
            hand = np.asarray(Image.open(guide/c['frames'][index]['file']))
            ys,xs = np.where(hand >= 128)
            if not len(xs): continue
            x0,y0 = max(0,int(xs.min())-55),max(0,int(ys.min())-55)
            x1,y1 = min(rgb.shape[1],int(xs.max())+56),min(rgb.shape[0],int(ys.max())+56)
            if max(x1-x0,y1-y0) > 1024: continue
            sl = np.s_[y0:y1,x0:x1]; local = rgb[sl]; h,w = local.shape[:2]
            background = reference[sl].astype(np.float32)
            tri,domain = detail_trimap(base[sl],hand[sl],union[sl],local,background,observed[sl])
            domain &= foreground_colour_support(local,background,palettes[c['selection']['id']])
            tri[~domain] = base[sl][~domain]
            inp = torch.cat((torch.from_numpy(local.copy()).permute(2,0,1).float()/127.5-1,
                torch.from_numpy(tri)[None].float()/255),0)[None]
            inp = torch.nn.functional.pad(inp,(0,(-w)%32,0,(-h)%32),mode='replicate')
            tile_started = time.monotonic()
            with torch.inference_mode():
                prediction = model(pixel_values=inp).alphas[0,0,:h,:w].numpy().clip(0,1)
            prediction[tri==0] = 0; prediction[tri==255] = 1
            prior[sl] = merge_detail_alpha(prior[sl],prediction,hand[sl],domain,observed[sl])
            Image.fromarray(np.rint(prediction*255).astype(np.uint8)).save(a.out/f'base-alpha-{ci}-{index:04d}.png')
            records.append({'frame':index,'component':ci,'crop':[x0,y0,x1,y1],
                'seconds':time.monotonic()-tile_started,'changedPixels':int(domain.sum())})
            print('BASE_TILE_COMPLETE', json.dumps(records[-1]), flush=True)
        Image.fromarray(prior).save(a.out/f'alpha-{index:04d}.png')
        cache.frame = lambda i, values=prior: values
        result = renderer.render(Image.fromarray(rgb),index)
        cache.frame = frame_original
        result.save(a.out/f'composite-{index:04d}.png')
        box = (1040,170,1430,760) if index in [9,36] else (280,280,540,660)
        w,h = box[2]-box[0],box[3]-box[1]
        sheet = Image.new('RGB',(w*3,h+24)); draw = ImageDraw.Draw(sheet)
        for j,(label,picture) in enumerate([('Actual source',Image.fromarray(rgb)),
            ('Actual native revision 3',Image.open(f'/dev/shm/autopromote-native-motion-review-r35-20261104/preview/{index:04d}.png')),
            ('Private base-model diagnostic',result)]):
            sheet.paste(picture.crop(box),(w*j,24)); draw.text((w*j,0),label,fill='white')
        sheet.save(a.out/f'comparison-{index:04d}.jpg',quality=97)
        print('BASE_ACTUAL_COMPOSITE_COMPLETE',index,flush=True)
    (a.out/'evaluation.json').write_text(json.dumps({'privateDiagnosticOnly':True,
        'registeredForProduct':False,'checkpoint':lock,'rows':records,
        'elapsedSeconds':time.monotonic()-started,'visualPass':False},indent=2)+'\n')


if __name__ == '__main__': main()
